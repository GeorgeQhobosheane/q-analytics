/**
 * One-time setup script: creates Stripe products and prices for Q Analytics.
 *
 * Run ONCE after adding your STRIPE_SECRET_KEY to server/.env:
 *   node server/scripts/setup-stripe.js
 *
 * Copy the Price IDs printed at the end into server/.env.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const Stripe = require('stripe')

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('ERROR: STRIPE_SECRET_KEY is not set in server/.env')
    process.exit(1)
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

  console.log('Creating Stripe products and prices for Q Analytics...\n')

  // ── Starter — $199 / month ──────────────────────────────────────────────────
  const starterProduct = await stripe.products.create({
    name:        'Q Analytics Starter',
    description: 'DocuMind AI document analysis, GrantRadar matching, ComplianceWatch monitoring, and BudgetLens insights — up to 5 users.',
    metadata:    { plan: 'starter' },
  })
  const starterPrice = await stripe.prices.create({
    product:    starterProduct.id,
    unit_amount: 19900,       // cents
    currency:   'usd',
    recurring:  { interval: 'month' },
    metadata:   { plan: 'starter' },
  })
  console.log(`Starter product: ${starterProduct.id}`)
  console.log(`Starter price:   ${starterPrice.id}  ($199/mo)`)

  // ── Pro — $499 / month ──────────────────────────────────────────────────────
  const proProduct = await stripe.products.create({
    name:        'Q Analytics Pro',
    description: 'Everything in Starter plus unlimited users, priority AI processing, advanced analytics, and dedicated support.',
    metadata:    { plan: 'pro' },
  })
  const proPrice = await stripe.prices.create({
    product:    proProduct.id,
    unit_amount: 49900,       // cents
    currency:   'usd',
    recurring:  { interval: 'month' },
    metadata:   { plan: 'pro' },
  })
  console.log(`\nPro product: ${proProduct.id}`)
  console.log(`Pro price:   ${proPrice.id}  ($499/mo)`)

  // ── Print env lines to copy ─────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────')
  console.log('Add these lines to server/.env:')
  console.log('─────────────────────────────────────────────────────────')
  console.log(`STRIPE_STARTER_PRICE_ID=${starterPrice.id}`)
  console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`)
  console.log('─────────────────────────────────────────────────────────')
  console.log('\nDone! Remember to also set STRIPE_WEBHOOK_SECRET after')
  console.log('creating a webhook endpoint in the Stripe Dashboard.')
}

main().catch(err => {
  console.error('Setup failed:', err.message)
  process.exit(1)
})
