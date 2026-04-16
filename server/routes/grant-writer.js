'use strict'

const express = require('express')
const router  = express.Router()
const { createClient } = require('@supabase/supabase-js')

const AnthropicModule = require('@anthropic-ai/sdk')
const Anthropic = AnthropicModule.default ?? AnthropicModule

// ── Singleton clients ────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Config ───────────────────────────────────────────────────────────────────
const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 4096

const SYSTEM_PROMPT =
  'You are a professional government grant writer for Q Analytics. ' +
  'Write clear, compelling, and fully compliant grant applications. ' +
  'Use formal language appropriate for federal and state government grants. ' +
  'Output ONLY the section content between the exact markers provided — ' +
  'no preamble, no commentary outside the markers.'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a numeric dollar value → "$1,234,567" or null */
function fmt(v) {
  return v != null ? `$${Number(v).toLocaleString('en-US')}` : null
}

/** Build "$min – $max" funding range string */
function amountRange(min, max) {
  if (fmt(min) && fmt(max)) return `${fmt(min)} – ${fmt(max)}`
  return fmt(min) ?? fmt(max) ?? 'Not specified'
}

// ── Route: POST /api/grant-writer ────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { user_id, grant_id } = req.body

  // ── 1. Validate input ────────────────────────────────────────────────────
  if (!user_id || !grant_id) {
    return res.status(400).json({ error: 'user_id and grant_id are required.' })
  }

  // ── 2. Fetch all data before committing to SSE ───────────────────────────
  //   If any query fails we can still return a normal HTTP error response.
  const [
    { data: grant,   error: grantErr   },
    { data: profile, error: profileErr },
    { data: agency,  error: agencyErr  },
  ] = await Promise.all([
    supabase
      .from('grant_matches')
      .select('*')
      .eq('id', grant_id)
      .eq('agency_id', user_id)   // ownership check
      .single(),
    supabase
      .from('profiles')
      .select('id, agency_name, contact_email')
      .eq('id', user_id)
      .single(),
    supabase
      .from('agency_profiles')
      .select('*')
      .eq('user_id', user_id)
      .single(),
  ])

  if (grantErr || !grant) {
    return res.status(404).json({ error: 'Grant not found or access denied.' })
  }
  if (profileErr || !profile) {
    return res.status(404).json({ error: 'Profile not found.' })
  }
  if (agencyErr || !agency) {
    return res.status(404).json({
      error: 'Agency profile not found. Please complete onboarding first.',
    })
  }

  // ── 3. Build prompt ──────────────────────────────────────────────────────
  let actionItems = []
  try {
    actionItems = JSON.parse(grant.action_items || '[]')
  } catch {
    actionItems = grant.action_items ? [grant.action_items] : []
  }

  const agencyJson = JSON.stringify({
    agency_name:      profile.agency_name,
    contact_email:    profile.contact_email,
    agency_type:      agency.agency_type,
    address:          agency.address,
    city:             agency.city,
    state:            agency.state,
    zip:              agency.zip,
    population:       agency.population,
    department_focus: agency.department_focus,
    current_projects: agency.current_projects,
    contact_name:     agency.contact_name,
    contact_title:    agency.contact_title,
  }, null, 2)

  const grantJson = JSON.stringify({
    title:           grant.grant_title,
    funding_range:   amountRange(grant.amount_min, grant.amount_max),
    deadline:        grant.deadline,
    why_we_qualify:  grant.qualify_reason,
    action_items:    actionItems,
    source:          grant.source_url,
  }, null, 2)

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const userPrompt =
    `You are a professional government grant writer for Q Analytics.\n\n` +
    `Today's date: ${today}\n\n` +
    `AGENCY DETAILS:\n${agencyJson}\n\n` +
    `GRANT REQUIREMENTS:\n${grantJson}\n\n` +
    `Write a complete, professional grant application. ` +
    `Wrap each section with its EXACT start/end markers. ` +
    `Do not write anything outside the markers.\n\n` +

    `[COVER_LETTER_START]\n` +
    `Write a formal cover letter on agency letterhead. Include:\n` +
    `• Agency name and full address header at the top\n` +
    `• Date line (${today})\n` +
    `• Formal salutation to the grant program officer\n` +
    `• Compelling opening paragraph stating the purpose and funding amount requested\n` +
    `• Body paragraph explaining why this agency qualifies and the project's impact\n` +
    `• Professional closing\n` +
    `• Signature block: contact_name, contact_title, agency_name, address, phone placeholder, email\n` +
    `[COVER_LETTER_END]\n\n` +

    `[EXEC_SUMMARY_START]\n` +
    `Write a 1-page executive summary including:\n` +
    `• Project name and total funding requested\n` +
    `• Brief agency description and mission\n` +
    `• Project overview and primary goals\n` +
    `• Expected measurable outcomes\n` +
    `• Project period (propose realistic 12–24 month timeline)\n` +
    `[EXEC_SUMMARY_END]\n\n` +

    `[PROJECT_NARRATIVE_START]\n` +
    `Write a 2-page project narrative with these sections:\n` +
    `1. STATEMENT OF NEED — data-driven case for why the problem exists\n` +
    `2. PROJECT DESCRIPTION AND OBJECTIVES — specific, measurable objectives\n` +
    `3. IMPLEMENTATION PLAN — month-by-month timeline with milestones\n` +
    `4. ORGANIZATIONAL CAPACITY — agency qualifications and past performance\n` +
    `5. EVALUATION PLAN — how success will be measured\n` +
    `6. SUSTAINABILITY — how the project continues after grant period\n` +
    `[PROJECT_NARRATIVE_END]\n\n` +

    `[BUDGET_START]\n` +
    `Write a detailed budget justification. For each category include specific line items, ` +
    `quantities, unit costs, and a justification sentence. Categories:\n` +
    `A. Personnel (salaries and wages)\n` +
    `B. Fringe Benefits\n` +
    `C. Travel\n` +
    `D. Equipment\n` +
    `E. Supplies\n` +
    `F. Contractual / Consultants\n` +
    `G. Other Direct Costs\n` +
    `H. Indirect Costs\n` +
    `End with a TOTAL PROJECT COST summary table that sums to the requested amount.\n` +
    `[BUDGET_END]\n\n` +

    `[SIGNATURE_START]\n` +
    `Write the authorized representative certification block including:\n` +
    `• Certification statement ("I certify that the information in this application is accurate...")\n` +
    `• Signature line for authorized representative\n` +
    `• Printed name and title fields\n` +
    `• Agency name\n` +
    `• Full agency address\n` +
    `• Phone and email fields\n` +
    `• Date line\n` +
    `[SIGNATURE_END]`

  // ── 4. Switch to SSE and stream Claude ──────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (payload) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
  }

  // Cleanly handle client disconnect
  req.on('close', () => {
    if (!res.writableEnded) res.end()
  })

  try {
    const stream = anthropic.messages.stream({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    // `.on('text')` fires only for text content deltas — thinking blocks are
    // filtered out automatically by the SDK event system.
    stream.on('text', (text) => send({ text }))

    stream.on('error', (err) => {
      console.error('Claude stream error:', err.message)
      send({ error: err.message })
      if (!res.writableEnded) res.end()
    })

    // Wait for the full stream to complete, then signal done
    await stream.finalMessage()
    send({ done: true })
    res.end()

  } catch (err) {
    // Anthropic API errors
    if (err?.status === 429) {
      send({ error: 'AI rate limit reached. Please wait a moment and try again.' })
    } else if (err?.status === 401 || err?.status === 403) {
      console.error('Anthropic auth error:', err.message)
      send({ error: 'AI service authentication failed.' })
    } else if (err?.status >= 500) {
      send({ error: 'AI service temporarily unavailable. Please try again.' })
    } else {
      console.error('grant-writer unexpected error:', err)
      send({ error: err.message ?? 'Proposal generation failed.' })
    }
    if (!res.writableEnded) res.end()
  }
})

module.exports = router
