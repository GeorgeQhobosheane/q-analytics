const express  = require('express')
const Stripe   = require('stripe')
const { createClient } = require('@supabase/supabase-js')

const stripe   = Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const router = express.Router()

// ── Price ID map ─────────────────────────────────────────────────────────────

const PLAN_PRICE = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro:     process.env.STRIPE_PRO_PRICE_ID,
}

// ── POST /api/stripe/create-checkout ────────────────────────────────────────
// Body: { user_id, email, plan: 'starter' | 'pro' }
// Returns: { url }  (Stripe-hosted checkout URL)

router.post('/create-checkout', async (req, res) => {
  try {
    const { user_id, email, plan } = req.body

    if (!user_id || !email || !plan) {
      return res.status(400).json({ error: 'Missing user_id, email, or plan.' })
    }
    if (!PLAN_PRICE[plan]) {
      return res.status(400).json({ error: `Unknown plan: ${plan}. Expected "starter" or "pro".` })
    }
    if (!PLAN_PRICE[plan].startsWith('price_')) {
      return res.status(500).json({ error: `Price ID not configured for plan: ${plan}. Run setup-stripe.js first.` })
    }

    // Reuse or create Stripe customer so payment methods are saved
    let customerId
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user_id)
      .single()

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: user_id },
      })
      customerId = customer.id
      // Persist immediately so we don't create duplicates on retry
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user_id)
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      client_reference_id: user_id,
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{ price: PLAN_PRICE[plan], quantity: 1 }],
      metadata:   { plan, supabase_user_id: user_id },
      success_url: `${process.env.CLIENT_URL}/dashboard?billing=success&plan=${plan}`,
      cancel_url:  `${process.env.CLIENT_URL}/dashboard?billing=canceled`,
      subscription_data: {
        metadata: { plan, supabase_user_id: user_id },
      },
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('create-checkout error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/stripe/portal ─────────────────────────────────────────────────
// Body: { user_id }
// Returns: { url }  (Stripe self-service billing portal URL)

router.post('/portal', async (req, res) => {
  try {
    const { user_id } = req.body
    if (!user_id) return res.status(400).json({ error: 'Missing user_id.' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user_id)
      .single()

    if (!profile?.stripe_customer_id) {
      return res.status(404).json({ error: 'No Stripe customer found for this user. Subscribe first.' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id,
      return_url: `${process.env.CLIENT_URL}/dashboard`,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('portal error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Webhook handler (exported separately for raw-body mounting) ───────────────
// Mounted in index.js BEFORE express.json() with express.raw({ type: 'application/json' })

async function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    await handleEvent(event)
    res.json({ received: true })
  } catch (err) {
    console.error(`Error handling event ${event.type}:`, err)
    res.status(500).json({ error: 'Webhook handler error.' })
  }
}

// ── Event dispatch ────────────────────────────────────────────────────────────

async function handleEvent(event) {
  switch (event.type) {

    // ── Checkout completed: user paid for a plan ──────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId  = session.client_reference_id || session.metadata?.supabase_user_id
      const plan    = session.metadata?.plan

      if (!userId || !plan) {
        console.warn('checkout.session.completed missing userId or plan:', session.id)
        break
      }

      await supabase.from('profiles').update({
        subscription_tier:     plan,           // 'starter' | 'pro'
        subscription_status:   'active',
        stripe_customer_id:    session.customer,
      }).eq('id', userId)

      console.log(`[Stripe] Activated ${plan} for user ${userId}`)
      break
    }

    // ── Subscription deleted: user canceled or payment permanently failed ─────
    case 'customer.subscription.deleted': {
      const sub        = event.data.object
      const customerId = sub.customer
      await updateByCustomer(customerId, {
        subscription_tier:   'free',
        subscription_status: 'canceled',
      })
      console.log(`[Stripe] Subscription canceled for customer ${customerId}`)
      break
    }

    // ── Subscription updated: plan change, status change ─────────────────────
    case 'customer.subscription.updated': {
      const sub        = event.data.object
      const customerId = sub.customer

      // Derive plan from price ID if metadata not present
      const priceId = sub.items?.data?.[0]?.price?.id
      let plan
      if      (priceId === process.env.STRIPE_PRO_PRICE_ID)     plan = 'pro'
      else if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = 'starter'

      const updates = { subscription_status: sub.status }
      if (plan) updates.subscription_tier = plan

      await updateByCustomer(customerId, updates)
      console.log(`[Stripe] Subscription updated for customer ${customerId}:`, updates)
      break
    }

    // ── Payment failed: mark past_due so UI can prompt the user ──────────────
    case 'invoice.payment_failed': {
      const invoice    = event.data.object
      const customerId = invoice.customer
      await updateByCustomer(customerId, { subscription_status: 'past_due' })
      console.log(`[Stripe] Payment failed for customer ${customerId}`)
      break
    }

    default:
      // Unhandled event — no action needed
      break
  }
}

// ── Helper: find profile by stripe_customer_id and update ───────────────────

async function updateByCustomer(customerId, fields) {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('stripe_customer_id', customerId)

  if (error) {
    console.error(`updateByCustomer(${customerId}) error:`, error)
    throw error
  }
}

module.exports = { router, webhookHandler }
