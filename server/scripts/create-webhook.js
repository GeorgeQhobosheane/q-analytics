/**
 * Creates a Stripe webhook endpoint and prints the signing secret.
 * Run once: node server/scripts/create-webhook.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const Stripe = require('stripe')

async function main() {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

  // Check for existing webhook endpoints to avoid duplicates
  const { data: existing } = await stripe.webhookEndpoints.list({ limit: 100 })
  const PROD_URL = 'https://q-analytics.vercel.app/api/stripe/webhook'
  const exists = existing.find(e => e.url === PROD_URL)

  let endpoint
  if (exists) {
    console.log('Webhook endpoint already exists:', exists.id)
    console.log('URL:', exists.url)
    console.log('\nNote: Stripe does not re-expose the signing secret after creation.')
    console.log('Delete and recreate if you need a new secret:')
    console.log(`  node -e "require('dotenv').config({path:'server/.env'}); require('stripe')(process.env.STRIPE_SECRET_KEY).webhookEndpoints.del('${exists.id}').then(()=>console.log('deleted'))"`)
    console.log('Then re-run this script.')
    return
  }

  endpoint = await stripe.webhookEndpoints.create({
    url: PROD_URL,
    enabled_events: [
      'checkout.session.completed',
      'customer.subscription.deleted',
      'customer.subscription.updated',
      'invoice.payment_failed',
    ],
    description: 'Q Analytics production webhook',
  })

  console.log('Webhook endpoint created!')
  console.log('ID: ', endpoint.id)
  console.log('URL:', endpoint.url)
  console.log('\n─────────────────────────────────────────────────────────')
  console.log('Add this to server/.env AND Vercel environment variables:')
  console.log('─────────────────────────────────────────────────────────')
  console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`)
  console.log('─────────────────────────────────────────────────────────')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
