'use strict'

const express = require('express')
const router  = express.Router()

const AnthropicModule = require('@anthropic-ai/sdk')
const Anthropic = AnthropicModule.default ?? AnthropicModule

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Config ───────────────────────────────────────────────────────────────────
const MODEL               = 'claude-haiku-4-5-20251001'
const MAX_TOKENS_ANALYSIS = 2048
const MAX_TOKENS_CHAT     = 1024
const MAX_DATA_CHARS      = 80_000   // soft cap before sending to Claude

const SYSTEM_PROMPT =
  'You are a municipal budget analyst for Q Analytics. ' +
  'Analyze the provided budget data and answer questions clearly. ' +
  'Always cite specific line items and amounts. Provide actionable recommendations.'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Trim CSV data to stay within Claude token limits */
function truncateData(data) {
  if (data.length <= MAX_DATA_CHARS) return data
  const idx = data.lastIndexOf('\n', MAX_DATA_CHARS)
  return data.slice(0, idx > 0 ? idx : MAX_DATA_CHARS) +
    '\n[... data truncated for length — only first portion sent ...]'
}

// ── POST /api/budget-lens/analyze ─────────────────────────────────────────────
// Returns structured JSON with summary, charts data, and grant recommendations.
router.post('/analyze', async (req, res) => {
  const { data, filename } = req.body
  if (!data) return res.status(400).json({ error: 'data is required.' })

  const safeData = truncateData(data)

  const userPrompt =
    `You are analyzing a municipal budget file: "${filename ?? 'budget.csv'}".\n\n` +
    `Here is the budget data (CSV format):\n${safeData}\n\n` +
    `Return a JSON object with this EXACT structure. No markdown fences, no prose outside the JSON:\n` +
    `{\n` +
    `  "summary": ["<bullet 1 ≤25 words>", "<bullet 2 ≤25 words>", "<bullet 3 ≤25 words>"],\n` +
    `  "top_categories": [\n` +
    `    { "name": "<category name>", "amount": <plain number>, "percentage": <number 0-100> }\n` +
    `  ],\n` +
    `  "yoy_data": [\n` +
    `    { "category": "<name>", "prior": <plain number>, "current": <plain number> }\n` +
    `  ],\n` +
    `  "grant_opportunities": [\n` +
    `    { "name": "<grant program name>", "agency": "<issuing federal/state agency>", "estimated_amount": "<e.g. $100K–$500K>", "match_reason": "<1 sentence>" }\n` +
    `  ],\n` +
    `  "total_budget": <plain number or null>,\n` +
    `  "currency": "USD",\n` +
    `  "data_notes": "<1 sentence about data quality or notable structure>"\n` +
    `}\n\n` +
    `Rules:\n` +
    `- top_categories: exactly 5 items sorted by amount descending; identify the real categories from the data\n` +
    `- percentages in top_categories must sum to approximately 100\n` +
    `- yoy_data: include ONLY if multiple distinct fiscal years are clearly present in the data; set to null otherwise\n` +
    `- yoy_data items: use the same top categories for fair comparison\n` +
    `- grant_opportunities: 3 to 4 real federal or state grant programs that address the agency's spending gaps\n` +
    `- All monetary amounts must be plain integers or decimals — no commas, no $ signs, no quotes around numbers\n` +
    `- summary bullets must be actionable and specific to this budget`

  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS_ANALYSIS,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return res.status(500).json({ error: 'AI returned no text response.' })
    }

    // Strip accidental markdown fences
    const jsonStr = textBlock.text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const analysis = JSON.parse(jsonStr)
    res.json(analysis)
  } catch (err) {
    console.error('budget-lens analyze error:', err)
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'AI returned malformed JSON. Please try again.' })
    }
    if (err?.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Please wait a moment.' })
    }
    if (err?.status === 401 || err?.status === 403) {
      console.error('Anthropic auth error:', err.message)
      return res.status(500).json({ error: 'AI service authentication failed.' })
    }
    res.status(500).json({ error: err.message ?? 'Analysis failed.' })
  }
})

// ── POST /api/budget-lens/chat ────────────────────────────────────────────────
// SSE streaming: budget data stays in the first user message across turns.
router.post('/chat', async (req, res) => {
  const { data, question, history } = req.body
  if (!data || !question) {
    return res.status(400).json({ error: 'data and question are required.' })
  }

  const safeData  = truncateData(data)
  const histPairs = Array.isArray(history) ? history.slice(-4) : []  // last 4 Q&A pairs

  // Build message array: budget data is embedded in the first user message only,
  // avoiding expensive repetition on every turn while keeping full multi-turn context.
  let messages
  if (histPairs.length === 0) {
    messages = [{
      role:    'user',
      content: `Here is the budget data (CSV):\n\n${safeData}\n\n---\n\n${question}`,
    }]
  } else {
    messages = [
      {
        role:    'user',
        content: `Here is the budget data (CSV):\n\n${safeData}\n\n---\n\n${histPairs[0].question}`,
      },
      { role: 'assistant', content: histPairs[0].answer },
      ...histPairs.slice(1).flatMap(h => [
        { role: 'user',      content: h.question },
        { role: 'assistant', content: h.answer },
      ]),
      { role: 'user', content: question },
    ]
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = payload => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  req.on('close', () => { if (!res.writableEnded) res.end() })

  try {
    const stream = anthropic.messages.stream({
      model:      MODEL,
      max_tokens: MAX_TOKENS_CHAT,
      system:     SYSTEM_PROMPT,
      messages,
    })

    stream.on('text', text => send({ text }))
    stream.on('error', err => {
      console.error('budget-lens chat stream error:', err.message)
      send({ error: err.message })
      if (!res.writableEnded) res.end()
    })

    await stream.finalMessage()
    send({ done: true })
    res.end()
  } catch (err) {
    if (err?.status === 429) {
      send({ error: 'Rate limit reached. Please wait a moment and try again.' })
    } else if (err?.status === 401 || err?.status === 403) {
      console.error('Anthropic auth error:', err.message)
      send({ error: 'AI service authentication failed.' })
    } else if (err?.status >= 500) {
      send({ error: 'AI service temporarily unavailable. Please try again.' })
    } else {
      console.error('budget-lens chat unexpected error:', err)
      send({ error: err.message ?? 'Chat failed.' })
    }
    if (!res.writableEnded) res.end()
  }
})

module.exports = router
