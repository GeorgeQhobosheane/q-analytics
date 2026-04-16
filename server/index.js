require('dotenv').config()

const express    = require('express')
const cors       = require('cors')
const rateLimit  = require('express-rate-limit')
const askRouter         = require('./routes/ask')
const grantWriterRouter = require('./routes/grant-writer')
const budgetLensRouter  = require('./routes/budget-lens')
const { router: stripeRouter, webhookHandler } = require('./routes/stripe')

// ── Validate required env vars at startup ───────────────────────────────────
const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

const app  = express()
const PORT = process.env.PORT || 3001

// ── Stripe webhook — MUST be mounted before express.json() ──────────────────
// Stripe requires the raw request body for signature verification.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  webhookHandler,
)

// ── Middleware ───────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.CLIENT_URL,                    // production: https://qanalytics.io
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin on Vercel)
    if (!origin) return cb(null, true)
    // Allow any *.vercel.app subdomain (preview deployments)
    if (origin.endsWith('.vercel.app')) return cb(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods:     ['GET', 'POST'],
  credentials: true,
}))

app.use(express.json({ limit: '1mb' }))

// ── Rate limiting on the AI endpoint ────────────────────────────────────────
// 20 requests per user per minute to protect Claude API costs
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before asking again.' },
})

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use('/api/ask',          askLimiter, askRouter)
app.use('/api/grant-writer', askLimiter, grantWriterRouter)
app.use('/api/budget-lens',  askLimiter, budgetLensRouter)
app.use('/api/stripe',       stripeRouter)

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }))

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error.' })
})

// ── Export for Vercel serverless ─────────────────────────────────────────────
module.exports = app

// ── Local development: start HTTP server only when run directly ───────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Q Analytics API  →  http://localhost:${PORT}`)
    console.log(`DocuMind model   →  claude-sonnet-4-6`)
    console.log(`GrantWriter model→  claude-opus-4-6`)
  })
}
