/**
 * Q Analytics — grant-matcher Edge Function
 *
 * Runs every Monday at 09:00 UTC (scheduled via pg_cron — see migration
 * 20260412000002_grant_matcher_cron.sql).
 *
 * Flow:
 *  1. Load all agency profiles from Supabase
 *  2. Fetch recent posted grants from grants.gov (filtered by category)
 *  3. For each (agency × grant) pair, call Claude to score the fit
 *  4. Persist matches scored ≥ 7 to grant_matches
 *  5. Insert a notification row for every new match
 *  6. Email each agency their top-5 matches via Resend
 *
 * Env vars required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               — auto-injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY  — set as secret
 *   ANTHROPIC_API_KEY          — set as secret
 *   RESEND_API_KEY             — set as secret
 *   CRON_SECRET                — shared with pg_cron for Authorization header
 *   CLIENT_URL                 — frontend URL for email CTA (optional)
 *   EMAIL_FROM                 — Resend "from" address (optional)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

import type {
  Agency,
  AgencyProfile,
  Profile,
  GrantsGovOpportunity,
  GrantsGovResponse,
  GrantMatchResult,
  GrantMatchRow,
  NotificationRow,
  RunSummary,
  EmailMatch,
} from './types.ts'

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? ''
const CRON_SECRET               = Deno.env.get('CRON_SECRET') ?? ''
const CLIENT_URL                = Deno.env.get('CLIENT_URL') ?? 'https://app.q-analytics.gov'
const EMAIL_FROM                = Deno.env.get('EMAIL_FROM') ?? 'Q Analytics <grants@q-analytics.gov>'

const MODEL           = 'claude-opus-4-6'
const MAX_TOKENS      = 2048
const MIN_MATCH_SCORE = 7    // only persist matches at or above this score
const TOP_N_EMAIL     = 5    // max grants per email digest
const ROWS_PER_FETCH  = 25   // grants.gov rows per category request
const CLAUDE_DELAY_MS = 600  // ms between Claude calls to stay under rate limits

/**
 * Grants.gov funding category codes relevant to government / municipal / infrastructure.
 * CD  = Community Development
 * RD  = Regional Development
 * HL  = Housing
 * T   = Transportation (infrastructure)
 * ELT = Employment, Labor & Training (public-works adjacent)
 */
const FUNDING_CATEGORIES = ['CD', 'RD', 'HL', 'T', 'ELT'] as const

const GRANTS_GOV_SEARCH =
  'https://apply07.grants.gov/grantsOpportunities/resources/GET_OPPORTUNITIES_BY_FUNDING_CATEGORY'

// ── Singleton clients ────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Parse "MM/DD/YYYY" (grants.gov format) → "YYYY-MM-DD" */
function parseGrantsGovDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr.trim() === '') return null
  const parts = dateStr.trim().split('/')
  if (parts.length !== 3) return null
  const [mm, dd, yyyy] = parts
  if (!mm || !dd || !yyyy) return null
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

/** Normalise any date string Claude returns → "YYYY-MM-DD" (best-effort) */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim()
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  // Fall back to JS Date (handles "June 30, 2026" etc.)
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function formatDollars(n: number | null): string {
  if (n == null) return 'N/A'
  return '$' + n.toLocaleString('en-US')
}

function escapeHtml(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

// ── Step 2: Fetch grants from grants.gov ─────────────────────────────────────

async function fetchGrantsGov(): Promise<GrantsGovOpportunity[]> {
  const all: GrantsGovOpportunity[] = []
  const seen = new Set<number>()

  for (const category of FUNDING_CATEGORIES) {
    try {
      const params = new URLSearchParams({
        fundingCategory: category,
        oppStatuses:     'posted',
        rows:            String(ROWS_PER_FETCH),
        startRecord:     '0',
        sortBy:          'openDate|desc',
      })

      const res = await fetch(`${GRANTS_GOV_SEARCH}?${params}`, {
        headers: { 'Accept': 'application/json' },
        // 10-second timeout via AbortController
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        console.warn(`grants.gov HTTP ${res.status} for category ${category}`)
        continue
      }

      const body: GrantsGovResponse = await res.json()

      if (body.errorcode !== 0) {
        console.warn(`grants.gov errorcode ${body.errorcode} for category ${category}`)
        continue
      }

      let added = 0
      for (const opp of body.oppHits ?? []) {
        if (!seen.has(opp.id)) {
          seen.add(opp.id)
          all.push(opp)
          added++
        }
      }
      console.log(`grants.gov [${category}]: ${added} new of ${body.oppHits?.length ?? 0} returned`)
    } catch (err) {
      console.error(`grants.gov fetch error for category ${category}:`, err)
    }
  }

  return all
}

// ── Step 3: Claude evaluation ────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a government grant specialist for Q Analytics. ' +
  'Evaluate grant eligibility for government agencies precisely and factually. ' +
  'Return ONLY valid JSON — no markdown, no prose before or after.'

async function evaluateGrantFit(
  agency: Agency,
  grant: GrantsGovOpportunity,
): Promise<GrantMatchResult | null> {

  const profileJson = JSON.stringify({
    agency_name:      agency.profile.agency_name,
    agency_type:      agency.agencyProfile.agency_type,
    city:             agency.agencyProfile.city,
    state:            agency.agencyProfile.state,
    population:       agency.agencyProfile.population,
    department_focus: agency.agencyProfile.department_focus,
    current_projects: agency.agencyProfile.current_projects,
  }, null, 2)

  const grantJson = JSON.stringify({
    title:                  grant.title,
    funding_agency:         grant.agencyName,
    category:               grant.category,
    open_date:              grant.openDate,
    close_date:             grant.closeDate,
    award_floor_usd:        grant.awardFloor,
    award_ceiling_usd:      grant.awardCeiling,
    estimated_funding_usd:  grant.estimatedFunding,
    expected_awards:        grant.expectedNumberOfAwards,
    cost_sharing_required:  grant.costSharing,
    opportunity_number:     grant.number,
  }, null, 2)

  const userPrompt =
    `Given this agency profile:\n${profileJson}\n\n` +
    `And this grant opportunity:\n${grantJson}\n\n` +
    `Return JSON only:\n` +
    `{\n` +
    `  "match_score": <integer 1-10>,\n` +
    `  "qualify_reason": "<2 sentences on why this agency qualifies or does not>",\n` +
    `  "action_items": ["<step 1>", "<step 2>", "<step 3>"],\n` +
    `  "deadline": "<ISO date YYYY-MM-DD>",\n` +
    `  "estimated_amount": "<e.g. $100,000 – $500,000>"\n` +
    `}`

  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      thinking:   { type: 'adaptive' },
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    // Adaptive thinking may produce { type: 'thinking' } blocks before the text block
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.warn(`No text block returned for grant "${grant.title}"`)
      return null
    }

    // Strip any accidental markdown code fences
    const jsonStr = textBlock.text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const result: GrantMatchResult = JSON.parse(jsonStr)

    // Basic validation
    if (
      typeof result.match_score !== 'number' ||
      result.match_score < 1 ||
      result.match_score > 10 ||
      !result.qualify_reason ||
      !Array.isArray(result.action_items)
    ) {
      console.warn(`Invalid Claude response shape for grant "${grant.title}":`, result)
      return null
    }

    return result
  } catch (err) {
    console.error(`Claude evaluation failed for "${grant.title}":`, err)
    return null
  }
}

// ── Step 4: Deduplication check ───────────────────────────────────────────────

async function matchExists(agencyId: string, grantTitle: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('grant_matches')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .eq('grant_title', grantTitle)

  if (error) console.warn('matchExists query error:', error.message)
  return (count ?? 0) > 0
}

// ── Step 5: Persist grant match ───────────────────────────────────────────────

async function saveGrantMatch(
  agency: Agency,
  grant: GrantsGovOpportunity,
  result: GrantMatchResult,
): Promise<string | null> {

  const deadlineIso =
    normalizeDate(result.deadline) ??
    parseGrantsGovDate(grant.closeDate) ??
    null

  const row: GrantMatchRow = {
    agency_id:     agency.profile.id,
    grant_title:   grant.title,
    amount_min:    grant.awardFloor   ?? null,
    amount_max:    grant.awardCeiling ?? null,
    deadline:      deadlineIso,
    match_score:   result.match_score,
    qualify_reason: result.qualify_reason,
    action_items:  JSON.stringify(result.action_items),
    source_url:    `https://www.grants.gov/web/grants/view-opportunity.html?oppId=${grant.id}`,
    status:        'new',
  }

  const { data, error } = await supabase
    .from('grant_matches')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error(`grant_matches insert failed for "${grant.title}":`, error.message)
    return null
  }

  return data?.id ?? null
}

// ── Step 6: Insert notification ───────────────────────────────────────────────

async function insertNotification(
  agency: Agency,
  grant: GrantsGovOpportunity,
  score: number,
): Promise<void> {
  const row: NotificationRow = {
    agency_id: agency.profile.id,
    type:      'grant_match',
    title:     `New Grant Match: ${grant.title}`,
    message:   `A ${grant.agencyName} grant scored ${score}/10 for your agency profile. Review it in GrantRadar before the deadline.`,
    read:      false,
  }

  const { error } = await supabase.from('notifications').insert(row)
  if (error) {
    console.error(
      `Notification insert failed for "${agency.profile.agency_name}":`,
      error.message,
    )
  }
}

// ── Step 7: Email via Resend ──────────────────────────────────────────────────

function buildEmailHtml(agency: Agency, matches: EmailMatch[]): string {
  const topMatches = matches
    .sort((a, b) => b.result.match_score - a.result.match_score)
    .slice(0, TOP_N_EMAIL)

  const tableRows = topMatches.map((m, i) => {
    const amountStr = m.grant.awardCeiling != null
      ? `${formatDollars(m.grant.awardFloor)} – ${formatDollars(m.grant.awardCeiling)}`
      : m.result.estimated_amount

    const deadline = normalizeDate(m.result.deadline)
      ?? parseGrantsGovDate(m.grant.closeDate)
      ?? m.result.deadline

    const grantUrl =
      `https://www.grants.gov/web/grants/view-opportunity.html?oppId=${m.grant.id}`

    const scoreColor = m.result.match_score >= 9
      ? '#15803d' : m.result.match_score >= 7
      ? '#1d4ed8' : '#92400e'

    return `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;vertical-align:top">
          <a href="${grantUrl}"
             style="color:#1d4ed8;font-weight:600;font-size:14px;
                    text-decoration:none;line-height:1.4">
            ${escapeHtml(m.grant.title)}
          </a><br>
          <span style="color:#64748b;font-size:12px;margin-top:3px;display:block">
            ${escapeHtml(m.grant.agencyName)} · #${escapeHtml(m.grant.number)}
          </span>
          <span style="color:#475569;font-size:12px;margin-top:6px;display:block;
                       line-height:1.5;font-style:italic">
            ${escapeHtml(m.result.qualify_reason)}
          </span>
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;
                   text-align:center;vertical-align:top;white-space:nowrap">
          <span style="display:inline-flex;align-items:center;justify-content:center;
                       width:42px;height:42px;border-radius:50%;
                       background:${scoreColor};color:#fff;
                       font-size:16px;font-weight:700">
            ${m.result.match_score}
          </span>
          <div style="color:#94a3b8;font-size:10px;margin-top:4px">/10</div>
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;
                   font-size:13px;color:#334155;vertical-align:top;white-space:nowrap">
          ${escapeHtml(amountStr)}
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;
                   font-size:13px;color:#334155;vertical-align:top;white-space:nowrap">
          ${escapeHtml(deadline ?? '—')}
        </td>
      </tr>`
  }).join('')

  const dashboardUrl =
    `${CLIENT_URL}/dashboard?tab=grantradar`

  const weekOf = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Grant Matches – ${weekOf}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

  <div style="max-width:700px;margin:40px auto 60px;
              background:#ffffff;border-radius:14px;
              overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

    <!-- ── Header ── -->
    <div style="background:linear-gradient(135deg,#0F1F3D 0%,#1e3a6e 100%);
                padding:32px 36px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;background:rgba(255,255,255,.15);
                    border-radius:8px;display:flex;align-items:center;
                    justify-content:center;font-size:18px">🎯</div>
        <div>
          <p style="margin:0;color:#94a3b8;font-size:12px;
                    text-transform:uppercase;letter-spacing:.08em">Q Analytics</p>
          <h1 style="margin:2px 0 0;color:#ffffff;font-size:20px;font-weight:700">
            GrantRadar Weekly Digest
          </h1>
        </div>
      </div>
      <p style="margin:16px 0 0;color:#93c5fd;font-size:14px">
        Week of ${weekOf} · ${escapeHtml(agency.profile.agency_name)}
      </p>
    </div>

    <!-- ── Summary bar ── -->
    <div style="background:#eff6ff;padding:16px 36px;
                border-bottom:1px solid #bfdbfe">
      <p style="margin:0;color:#1e40af;font-size:14px">
        🔍 We evaluated this week's posted grants and found
        <strong>${matches.length} match${matches.length !== 1 ? 'es' : ''}</strong>
        scoring ${MIN_MATCH_SCORE}+ for your agency profile.
        ${matches.length > TOP_N_EMAIL
          ? `Showing your top ${TOP_N_EMAIL} — view all in GrantRadar.`
          : ''}
      </p>
    </div>

    <!-- ── Match table ── -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 18px;text-align:left;font-size:11px;
                     color:#64748b;text-transform:uppercase;letter-spacing:.07em;
                     border-bottom:2px solid #e2e8f0;font-weight:600">
            Grant
          </th>
          <th style="padding:10px 18px;text-align:center;font-size:11px;
                     color:#64748b;text-transform:uppercase;letter-spacing:.07em;
                     border-bottom:2px solid #e2e8f0;font-weight:600">
            Score
          </th>
          <th style="padding:10px 18px;font-size:11px;
                     color:#64748b;text-transform:uppercase;letter-spacing:.07em;
                     border-bottom:2px solid #e2e8f0;font-weight:600">
            Amount
          </th>
          <th style="padding:10px 18px;font-size:11px;
                     color:#64748b;text-transform:uppercase;letter-spacing:.07em;
                     border-bottom:2px solid #e2e8f0;font-weight:600">
            Deadline
          </th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <!-- ── CTA ── -->
    <div style="padding:32px 36px;text-align:center;
                border-top:1px solid #e2e8f0">
      <a href="${dashboardUrl}"
         style="display:inline-block;background:#0F1F3D;color:#ffffff;
                padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;
                letter-spacing:.01em">
        View All Matches in GrantRadar →
      </a>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">
        Action items and eligibility details are available in your dashboard.
      </p>
    </div>

    <!-- ── Footer ── -->
    <div style="padding:20px 36px;background:#f8fafc;
                border-top:1px solid #e2e8f0">
      <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center">
        Q Analytics · Grant matching runs every Monday at 9 AM UTC<br>
        You're receiving this because you have an active Q Analytics account.<br>
        ${escapeHtml(agency.profile.agency_name)} ·
        ${escapeHtml(agency.profile.contact_email)}
      </p>
    </div>
  </div>
</body>
</html>`
}

async function sendEmail(agency: Agency, matches: EmailMatch[]): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email for', agency.profile.contact_email)
    return
  }
  if (matches.length === 0) return

  const weekOf = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const topScore = Math.max(...matches.map(m => m.result.match_score))

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    EMAIL_FROM,
      to:      [agency.profile.contact_email],
      subject: `${matches.length} New Grant Match${matches.length !== 1 ? 'es' : ''} — Top Score ${topScore}/10 · ${weekOf}`,
      html:    buildEmailHtml(agency, matches),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${res.status}: ${body}`)
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

async function run(): Promise<RunSummary> {
  const summary: RunSummary = {
    agenciesProcessed: 0,
    grantsEvaluated:   0,
    matchesSaved:      0,
    emailsSent:        0,
    errors:            [],
  }

  console.log('[grant-matcher] Run started', new Date().toISOString())

  // ── 1. Load agency data ──────────────────────────────────────────────────
  let agencies: Agency[]
  try {
    agencies = await fetchAgencies()
    console.log(`[grant-matcher] ${agencies.length} agency profiles loaded`)
  } catch (err) {
    summary.errors.push(`fetchAgencies: ${err}`)
    return summary
  }
  if (agencies.length === 0) {
    console.log('[grant-matcher] No agencies — exiting')
    return summary
  }

  // ── 2. Fetch grants from grants.gov ──────────────────────────────────────
  let grants: GrantsGovOpportunity[]
  try {
    grants = await fetchGrantsGov()
    console.log(`[grant-matcher] ${grants.length} unique grants fetched`)
  } catch (err) {
    summary.errors.push(`fetchGrantsGov: ${err}`)
    return summary
  }
  if (grants.length === 0) {
    console.log('[grant-matcher] No grants returned — exiting')
    return summary
  }

  // ── 3–6. Evaluate each agency against every grant ────────────────────────
  for (const agency of agencies) {
    summary.agenciesProcessed++
    const agencyMatches: EmailMatch[] = []

    console.log(`[grant-matcher] Processing: ${agency.profile.agency_name}`)

    for (const grant of grants) {
      // Skip if this grant is already saved for this agency (weekly deduplication)
      const exists = await matchExists(agency.profile.id, grant.title)
      if (exists) continue

      // Call Claude
      const result = await evaluateGrantFit(agency, grant)
      summary.grantsEvaluated++

      // Throttle to stay within Claude API rate limits
      await sleep(CLAUDE_DELAY_MS)

      if (!result) {
        summary.errors.push(`Null result: ${agency.profile.agency_name} × ${grant.title}`)
        continue
      }

      // Only save high-scoring matches
      if (result.match_score < MIN_MATCH_SCORE) continue

      // Persist match
      const matchId = await saveGrantMatch(agency, grant, result)
      if (!matchId) {
        summary.errors.push(`Save failed: ${agency.profile.agency_name} × ${grant.title}`)
        continue
      }
      summary.matchesSaved++

      // Notification row
      await insertNotification(agency, grant, result.match_score)

      agencyMatches.push({ grant, result })
    }

    // Email digest for this agency
    if (agencyMatches.length > 0) {
      try {
        await sendEmail(agency, agencyMatches)
        summary.emailsSent++
        console.log(
          `[grant-matcher] Email sent → ${agency.profile.contact_email}` +
          ` (${agencyMatches.length} match${agencyMatches.length !== 1 ? 'es' : ''})`
        )
      } catch (err) {
        const msg = `sendEmail(${agency.profile.contact_email}): ${err}`
        summary.errors.push(msg)
        console.error('[grant-matcher]', msg)
      }
    }
  }

  console.log('[grant-matcher] Run complete', JSON.stringify(summary))
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
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    // Constant-time comparison is ideal; for server-side this is acceptable
    if (token !== CRON_SECRET) {
      return json({ error: 'Unauthorized' }, 401)
    }
  }

  try {
    const summary = await run()
    return json({ ok: true, summary })
  } catch (err) {
    console.error('[grant-matcher] Fatal error:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
