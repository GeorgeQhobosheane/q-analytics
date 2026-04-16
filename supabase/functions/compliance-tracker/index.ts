/**
 * Q Analytics — compliance-tracker Edge Function
 *
 * Runs every Monday at 08:00 UTC (scheduled via pg_cron — see migration
 * 20260412000003_compliance_tracker_cron.sql).
 *
 * Flow:
 *  1. Load all agency profiles from Supabase
 *  2. Fetch regulations published in the last 7 days from the Federal Register API
 *  3. For each (agency × regulation) pair, call Claude to evaluate relevance
 *  4. Persist relevant items to compliance_items (with auto-set overdue status)
 *  5. Insert notifications for high/critical urgency items
 *
 * Env vars required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               — auto-injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY  — set as secret
 *   ANTHROPIC_API_KEY          — set as secret
 *   CRON_SECRET                — shared with pg_cron for Authorization header
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

import type {
  Agency,
  AgencyProfile,
  Profile,
  FedRegDocument,
  FedRegResponse,
  ComplianceAnalysis,
  ComplianceItemRow,
  NotificationRow,
  RunSummary,
} from './types.ts'

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const CRON_SECRET               = Deno.env.get('CRON_SECRET') ?? ''

const MODEL           = 'claude-opus-4-6'
const MAX_TOKENS      = 1024
const CLAUDE_DELAY_MS = 600

const FEDREG_BASE = 'https://www.federalregister.gov/api/v1/documents.json'
const DOC_TYPES   = ['RULE', 'PROPOSED_RULE', 'NOTICE'] as const

// ── Singleton clients ────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Step 1: Load agencies ────────────────────────────────────────────────────

async function fetchAgencies(): Promise<Agency[]> {
  const [{ data: profiles, error: pErr }, { data: agencyProfiles, error: apErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, agency_name, contact_email, subscription_tier'),
      supabase
        .from('agency_profiles')
        .select('*'),
    ])

  if (pErr)  throw new Error(`profiles fetch failed: ${pErr.message}`)
  if (apErr) throw new Error(`agency_profiles fetch failed: ${apErr.message}`)

  const apMap = new Map<string, AgencyProfile>(
    (agencyProfiles ?? []).map((ap: AgencyProfile) => [ap.user_id, ap])
  )

  const agencies: Agency[] = []
  for (const profile of (profiles ?? []) as Profile[]) {
    const agencyProfile = apMap.get(profile.id)
    // Skip users who never completed onboarding
    if (!agencyProfile) continue
    agencies.push({ profile, agencyProfile })
  }

  return agencies
}

// ── Step 2: Fetch regulations from Federal Register ──────────────────────────

/** Returns "YYYY-MM-DD" for 7 days ago (UTC) */
function sevenDaysAgo(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Build the Federal Register query URL with manually percent-encoded brackets.
 * URLSearchParams collapses repeated keys, so array params like
 * conditions[type][] must be encoded by hand.
 */
function buildFedRegUrl(sinceDate: string): string {
  // Percent-encode brackets: [ → %5B, ] → %5D
  const typeParams = DOC_TYPES
    .map(t => `conditions%5Btype%5D%5B%5D=${encodeURIComponent(t)}`)
    .join('&')

  const dateParam =
    `conditions%5Bpublication_date%5D%5Bgte%5D=${encodeURIComponent(sinceDate)}`

  const fields = [
    'title', 'abstract', 'agency_names', 'document_number',
    'html_url', 'publication_date', 'type', 'effective_on', 'comment_date',
  ].map(f => `fields%5B%5D=${encodeURIComponent(f)}`).join('&')

  return `${FEDREG_BASE}?${typeParams}&${dateParam}&per_page=100&order=newest&${fields}`
}

async function fetchRegulations(): Promise<FedRegDocument[]> {
  const url = buildFedRegUrl(sevenDaysAgo())
  console.log('[compliance-tracker] Fetching:', url)

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`Federal Register HTTP ${res.status}: ${res.statusText}`)
  }

  const body: FedRegResponse = await res.json()

  if (body.count > 100) {
    console.warn(
      `[compliance-tracker] Federal Register returned count=${body.count} ` +
      `but only 100 results fetched. Pagination not implemented — some regulations may be missed.`
    )
  }

  console.log(`[compliance-tracker] ${body.results?.length ?? 0} regulations fetched`)
  return body.results ?? []
}

// ── Step 3: Deduplication check ──────────────────────────────────────────────

/** Dedup keyed on source_url (stable Federal Register permalink) */
async function complianceExists(agencyId: string, sourceUrl: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('compliance_items')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .eq('source_url', sourceUrl)

  if (error) console.warn('complianceExists query error:', error.message)
  return (count ?? 0) > 0
}

// ── Step 4: Claude evaluation ─────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a federal regulatory compliance specialist for Q Analytics. ' +
  'Evaluate whether a federal regulation requires action from the given government agency. ' +
  'Be precise and practical — only flag regulations that genuinely require this agency to act. ' +
  'Return ONLY valid JSON — no markdown, no prose before or after.'

async function evaluateRegulation(
  agency: Agency,
  doc: FedRegDocument,
): Promise<ComplianceAnalysis | null> {

  const agencyJson = JSON.stringify({
    agency_name:      agency.profile.agency_name,
    agency_type:      agency.agencyProfile.agency_type,
    city:             agency.agencyProfile.city,
    state:            agency.agencyProfile.state,
    population:       agency.agencyProfile.population,
    department_focus: agency.agencyProfile.department_focus,
    current_projects: agency.agencyProfile.current_projects,
  }, null, 2)

  const docJson = JSON.stringify({
    title:            doc.title,
    type:             doc.type,
    abstract:         doc.abstract,
    issuing_agencies: doc.agency_names,
    published:        doc.publication_date,
    effective_on:     doc.effective_on,
    comment_date:     doc.comment_date,
    url:              doc.html_url,
  }, null, 2)

  const userPrompt =
    `Given this government agency profile:\n${agencyJson}\n\n` +
    `And this federal regulation:\n${docJson}\n\n` +
    `Evaluate whether this regulation requires action from this specific agency. ` +
    `Return JSON only (no markdown fences):\n` +
    `{\n` +
    `  "relevant": <true|false>,\n` +
    `  "urgency": "<critical|high|medium|low>",\n` +
    `  "plain_english_summary": "<1 sentence: what this regulation requires in plain language>",\n` +
    `  "action_required": "<specific action this agency must take>",\n` +
    `  "deadline": "<YYYY-MM-DD or null>",\n` +
    `  "consequence_of_inaction": "<1 sentence: what happens if they do not act>"\n` +
    `}\n\n` +
    `If relevant is false, still return the full object with urgency "low" and brief placeholder text.`

  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      thinking:   { type: 'adaptive' },
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    // Adaptive thinking produces { type: 'thinking' } blocks; extract text block only
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.warn(`[compliance-tracker] No text block for "${doc.title}"`)
      return null
    }

    // Strip accidental markdown code fences
    const jsonStr = textBlock.text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const analysis: ComplianceAnalysis = JSON.parse(jsonStr)

    // Validate required fields
    if (
      typeof analysis.relevant !== 'boolean' ||
      !['critical', 'high', 'medium', 'low'].includes(analysis.urgency)
    ) {
      console.warn(`[compliance-tracker] Invalid Claude response for "${doc.title}":`, analysis)
      return null
    }

    return analysis
  } catch (err) {
    console.error(`[compliance-tracker] Claude evaluation failed for "${doc.title}":`, err)
    return null
  }
}

// ── Step 5: Format & resolve helpers ─────────────────────────────────────────

/**
 * Pack three Claude output fields into the single action_required text column.
 * Preserved as labeled sections for the dashboard to display clearly.
 */
function formatActionRequired(analysis: ComplianceAnalysis): string {
  return [
    `SUMMARY: ${analysis.plain_english_summary}`,
    `ACTION: ${analysis.action_required}`,
    `CONSEQUENCE: ${analysis.consequence_of_inaction}`,
  ].join('\n\n')
}

/**
 * Resolve the compliance deadline with a priority chain:
 * 1. Claude's deadline field (if valid ISO date)
 * 2. doc.effective_on for RULE type
 * 3. doc.comment_date for PROPOSED_RULE type
 * 4. null
 */
function resolveDeadline(analysis: ComplianceAnalysis, doc: FedRegDocument): string | null {
  const isIsoDate = (s: string | null): s is string =>
    s != null && /^\d{4}-\d{2}-\d{2}$/.test(s.trim())

  if (isIsoDate(analysis.deadline)) return analysis.deadline.trim()
  if (doc.type === 'RULE' && isIsoDate(doc.effective_on)) return doc.effective_on!
  if (doc.type === 'PROPOSED_RULE' && isIsoDate(doc.comment_date)) return doc.comment_date!
  return null
}

// ── Step 6: Persist compliance item ──────────────────────────────────────────

async function saveComplianceItem(
  agency: Agency,
  doc: FedRegDocument,
  analysis: ComplianceAnalysis,
): Promise<string | null> {

  const deadline = resolveDeadline(analysis, doc)
  const today    = new Date().toISOString().slice(0, 10)
  const status: 'pending' | 'overdue' =
    deadline && deadline < today ? 'overdue' : 'pending'

  const row: ComplianceItemRow = {
    agency_id:         agency.profile.id,
    regulation_title:  doc.title,
    action_required:   formatActionRequired(analysis),
    deadline,
    urgency:           analysis.urgency,
    status,
    source_url:        doc.html_url,
  }

  const { data, error } = await supabase
    .from('compliance_items')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error(
      `[compliance-tracker] compliance_items insert failed for "${doc.title}":`,
      error.message,
    )
    return null
  }

  return data?.id ?? null
}

// ── Step 7: Insert notification (high/critical only) ─────────────────────────

async function insertNotification(
  agency: Agency,
  doc: FedRegDocument,
  analysis: ComplianceAnalysis,
): Promise<void> {
  const row: NotificationRow = {
    agency_id: agency.profile.id,
    type:      'compliance_alert',
    title:     `${analysis.urgency === 'critical' ? 'CRITICAL' : 'High Priority'} Compliance Alert: ${doc.title}`,
    message:   analysis.plain_english_summary,
    read:      false,
  }

  const { error } = await supabase.from('notifications').insert(row)
  if (error) {
    console.error(
      `[compliance-tracker] Notification insert failed for "${agency.profile.agency_name}":`,
      error.message,
    )
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

async function run(): Promise<RunSummary> {
  const summary: RunSummary = {
    agenciesProcessed:    0,
    regulationsEvaluated: 0,
    itemsSaved:           0,
    notificationsSent:    0,
    errors:               [],
  }

  console.log('[compliance-tracker] Run started', new Date().toISOString())

  // ── 1. Load agency data ──────────────────────────────────────────────────
  let agencies: Agency[]
  try {
    agencies = await fetchAgencies()
    console.log(`[compliance-tracker] ${agencies.length} agency profiles loaded`)
  } catch (err) {
    summary.errors.push(`fetchAgencies: ${err}`)
    return summary
  }
  if (agencies.length === 0) {
    console.log('[compliance-tracker] No agencies — exiting')
    return summary
  }

  // ── 2. Fetch regulations from Federal Register ───────────────────────────
  let regulations: FedRegDocument[]
  try {
    regulations = await fetchRegulations()
    console.log(`[compliance-tracker] ${regulations.length} regulations fetched`)
  } catch (err) {
    summary.errors.push(`fetchRegulations: ${err}`)
    return summary
  }
  if (regulations.length === 0) {
    console.log('[compliance-tracker] No regulations returned — exiting')
    return summary
  }

  // ── 3–7. Evaluate each agency against every regulation ───────────────────
  for (const agency of agencies) {
    summary.agenciesProcessed++
    console.log(`[compliance-tracker] Processing: ${agency.profile.agency_name}`)

    for (const doc of regulations) {
      // Skip if this regulation is already saved for this agency
      const exists = await complianceExists(agency.profile.id, doc.html_url)
      if (exists) continue

      // Call Claude
      const analysis = await evaluateRegulation(agency, doc)
      summary.regulationsEvaluated++

      // Throttle to stay within Claude API rate limits
      await sleep(CLAUDE_DELAY_MS)

      if (!analysis) {
        summary.errors.push(`Null result: ${agency.profile.agency_name} × ${doc.title}`)
        continue
      }

      // Skip regulations Claude determined are not relevant to this agency
      if (!analysis.relevant) continue

      // Persist compliance item
      const itemId = await saveComplianceItem(agency, doc, analysis)
      if (!itemId) {
        summary.errors.push(`Save failed: ${agency.profile.agency_name} × ${doc.title}`)
        continue
      }
      summary.itemsSaved++

      // Insert notification for high/critical urgency items only
      if (analysis.urgency === 'high' || analysis.urgency === 'critical') {
        await insertNotification(agency, doc, analysis)
        summary.notificationsSent++
      }
    }
  }

  console.log('[compliance-tracker] Run complete', JSON.stringify(summary))
  return summary
}

// ── Edge Function entry point ─────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  // Only POST is accepted (pg_cron sends POST)
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Validate cron secret — prevents unauthorized external triggers
  if (CRON_SECRET) {
    const auth  = req.headers.get('Authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (token !== CRON_SECRET) {
      return json({ error: 'Unauthorized' }, 401)
    }
  }

  try {
    const summary = await run()
    return json({ ok: true, summary })
  } catch (err) {
    console.error('[compliance-tracker] Fatal error:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
