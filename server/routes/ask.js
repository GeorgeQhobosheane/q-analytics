'use strict'

const express   = require('express')
const router    = express.Router()
const pdfParse  = require('pdf-parse')
const { createClient } = require('@supabase/supabase-js')

// Anthropic SDK — CommonJS compatible
const AnthropicModule = require('@anthropic-ai/sdk')
const Anthropic = AnthropicModule.default ?? AnthropicModule

// ── Clients (singletons) ─────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role bypasses RLS; auth checked manually below
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Constants ────────────────────────────────────────────────────────────────
const MODEL             = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 2048
const MAX_CONTEXT_CHARS = 50_000   // max chars sent to Claude
const CHUNK_SIZE        = 3_000    // target chars per chunk
const TOP_K_CHUNKS      = 10       // max chunks to include after scoring

const SYSTEM_PROMPT =
  'You are a government document assistant for Q Analytics. ' +
  'Answer questions using ONLY the provided document text. ' +
  'Always cite the section or page where you found the answer. Be concise.'

// ── Stop words for keyword extraction ───────────────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can','this',
  'that','these','those','what','which','who','when','where','how','why',
  'not','no','it','its','from','as','if','about','into','than','there',
  'their','they','we','our','you','your','all','any','each','more','also',
])

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from a question for relevance scoring.
 */
function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

/**
 * Split extracted PDF text into overlapping chunks.
 * Tries paragraph boundaries first; falls back to character slicing.
 */
function splitIntoChunks(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50)
  const chunks = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length > CHUNK_SIZE) {
      if (current.trim()) chunks.push(current.trim())

      if (para.length > CHUNK_SIZE) {
        // Paragraph itself is too long — split by sentences
        const sentences = para.split(/(?<=[.!?])\s+/)
        let sub = ''
        for (const sentence of sentences) {
          if (sub.length + sentence.length > CHUNK_SIZE) {
            if (sub.trim()) chunks.push(sub.trim())
            sub = sentence
          } else {
            sub += (sub ? ' ' : '') + sentence
          }
        }
        current = sub
      } else {
        current = para
      }
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

/**
 * Score each chunk by keyword overlap with the question.
 * Returns them sorted by original document position.
 */
function selectRelevantChunks(chunks, question) {
  if (!chunks.length) return ''

  const allText = chunks.join('\n\n')

  // If everything fits, send it all
  if (allText.length <= MAX_CONTEXT_CHARS) return allText

  const keywords = extractKeywords(question)
  if (!keywords.length) {
    // No keywords — return first MAX_CONTEXT_CHARS of text
    return allText.slice(0, MAX_CONTEXT_CHARS)
  }

  const scored = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase()
    let score   = 0
    for (const kw of keywords) {
      const regex   = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
      const matches = lower.match(regex)
      if (matches) {
        // Weight longer/rarer words more
        score += matches.length * (kw.length > 5 ? 2 : 1)
      }
    }
    return { chunk, score, index }
  })

  // Take top-K chunks, re-sorted by document order for coherent reading
  const topChunks = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_CHUNKS)
    .sort((a, b) => a.index - b.index)

  let result = ''
  for (const { chunk } of topChunks) {
    if (result.length + chunk.length + 2 > MAX_CONTEXT_CHARS) break
    result += (result ? '\n\n' : '') + chunk
  }
  return result
}

// ── Route: POST /api/ask ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { user_id, document_id, question } = req.body

  // ── 1. Input validation ──────────────────────────────────────────────────
  if (!user_id || !document_id || !question) {
    return res.status(400).json({
      error: 'user_id, document_id, and question are all required.',
    })
  }
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question must be a non-empty string.' })
  }
  if (question.length > 2_000) {
    return res.status(400).json({ error: 'question must not exceed 2000 characters.' })
  }

  const cleanQuestion = question.trim()

  try {
    // ── 2. Fetch document metadata and verify ownership ────────────────────
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, file_path, file_name, uploaded_by')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return res.status(404).json({ error: 'Document not found.' })
    }
    if (doc.uploaded_by !== user_id) {
      return res.status(403).json({ error: 'Access denied.' })
    }

    // ── 3. Download PDF from Supabase Storage ──────────────────────────────
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.file_path)

    if (downloadError || !fileBlob) {
      console.error('Storage download error:', downloadError?.message)
      return res.status(500).json({
        error: 'Failed to retrieve the document from storage.',
      })
    }

    // ── 4. Extract text from PDF ───────────────────────────────────────────
    const arrayBuffer = await fileBlob.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)
    let   parsedPDF

    try {
      parsedPDF = await pdfParse(buffer, { max: 0 }) // max: 0 = all pages
    } catch (parseErr) {
      console.error('pdf-parse error:', parseErr.message)
      return res.status(422).json({
        error:
          'Could not extract text from this PDF. ' +
          'The file may be corrupted, password-protected, or a scanned image.',
      })
    }

    const rawText = parsedPDF.text?.trim() ?? ''
    if (!rawText) {
      return res.status(422).json({
        error:
          'No readable text found in this document. ' +
          'Scanned image PDFs are not supported — please upload a text-based PDF.',
      })
    }

    // ── 5. Chunk and select relevant context ───────────────────────────────
    const chunks       = splitIntoChunks(rawText)
    const contextText  = selectRelevantChunks(chunks, cleanQuestion)
    const wasChunked   = rawText.length > MAX_CONTEXT_CHARS

    // ── 6. Call Claude with prompt caching ────────────────────────────────
    //   Render order: system → messages (document text → question)
    //   Stable content (system + document) is cached; question is not.
    const claudeResponse = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },  // cache system prompt across turns
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              // Document text is stable — cache it so repeated questions on same doc are cheap
              text: [
                `<document name="${doc.file_name}">`,
                contextText,
                '</document>',
                wasChunked
                  ? '\n[Note: This is the most relevant portion of a larger document.]'
                  : '',
              ].join('\n'),
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              // Question changes every call — no cache_control here
              text: `Question: ${cleanQuestion}`,
            },
          ],
        },
      ],
    })

    const answer = claudeResponse.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    // ── 7. Persist conversation ────────────────────────────────────────────
    const { error: saveError } = await supabase
      .from('conversations')
      .insert({ user_id, document_id, question: cleanQuestion, answer })

    if (saveError) {
      // Non-fatal: log but don't fail the response
      console.error('Failed to save conversation:', saveError.message)
    }

    // ── 8. Return answer ───────────────────────────────────────────────────
    return res.json({
      answer,
      document_name: doc.file_name,
      pages:         parsedPDF.numpages ?? null,
      was_chunked:   wasChunked,
      usage: {
        input_tokens:                  claudeResponse.usage.input_tokens,
        output_tokens:                 claudeResponse.usage.output_tokens,
        cache_creation_input_tokens:   claudeResponse.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens:       claudeResponse.usage.cache_read_input_tokens      ?? 0,
      },
    })
  } catch (err) {
    // ── Anthropic API errors ─────────────────────────────────────────────
    if (err?.status === 429) {
      return res.status(429).json({
        error: 'AI service rate limit reached. Please try again in a moment.',
      })
    }
    if (err?.status === 401 || err?.status === 403) {
      console.error('Anthropic auth error:', err.message)
      return res.status(500).json({ error: 'AI service authentication failed.' })
    }
    if (err?.status >= 500) {
      return res.status(502).json({
        error: 'AI service is temporarily unavailable. Please try again.',
      })
    }

    console.error('Unexpected error in POST /api/ask:', err)
    return res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

module.exports = router
