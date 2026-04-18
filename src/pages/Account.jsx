import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NotificationBell from '../components/notifications/NotificationBell'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

// ── Constants ────────────────────────────────────────────────────────────────

const AGENCY_TYPES = [
  'City Government', 'County Government', 'State Agency',
  'Special District', 'Regional Authority', 'Federal Agency',
  'Tribal Government', 'Other',
]

const DEPARTMENT_FOCUS = [
  'Public Safety', 'Public Works', 'Parks & Recreation',
  'Health & Human Services', 'Planning & Development',
  'Finance', 'Education', 'Transportation', 'Environmental Services', 'Other',
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const TIER_VARIANT   = { free: 'neutral', starter: 'info', pro: 'success', enterprise: 'navy' }
const STATUS_VARIANT = { active: 'success', trialing: 'info', past_due: 'warning', canceled: 'danger', unpaid: 'danger' }

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    tagline: 'Get started with grant discovery',
    features: [
      '5 grant matches / month',
      'Basic compliance alerts',
      '1 document upload / month',
      'Community support',
    ],
    planParam: null,
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$199',
    period: '/ month',
    tagline: 'For small municipalities & special districts',
    features: [
      'Unlimited grant matches',
      'AI proposal drafting (GrantWriter)',
      '10 document uploads / month',
      'Priority compliance alerts',
      'BudgetLens AI analysis',
      'Email & chat support',
    ],
    planParam: 'starter',
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$499',
    period: '/ month',
    tagline: 'For city governments & county agencies',
    features: [
      'Everything in Starter',
      'Unlimited document uploads',
      'DocuMind AI analysis',
      'Dedicated compliance monitoring',
      'Weekly regulatory digest emails',
      'Multi-department profiles',
      'Custom grant criteria',
      'Priority phone support',
    ],
    planParam: 'pro',
    highlight: true,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Account() {
  const { user, profile, refreshProfile, signOut } = useAuth()

  // Agency profile
  const [agencyProfile, setAgencyProfile] = useState(null)
  const [editing, setEditing]             = useState(false)
  const [form, setForm]                   = useState({})
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState('')
  const [saveSuccess, setSaveSuccess]     = useState(false)

  // Billing
  const [portalLoading, setPortalLoading]     = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(null) // plan key being loaded

  // Load agency profile
  useEffect(() => {
    if (!user) return
    supabase
      .from('agency_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setAgencyProfile(data)
        setForm({
          agency_type:       data.agency_type       ?? '',
          address:           data.address           ?? '',
          city:              data.city              ?? '',
          state:             data.state             ?? '',
          zip:               data.zip               ?? '',
          population:        data.population        ?? '',
          department_focus:  data.department_focus  ?? '',
          current_projects:  data.current_projects  ?? '',
          contact_name:      data.contact_name      ?? '',
          contact_title:     data.contact_title     ?? '',
        })
      })
  }, [user])

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const { error: agencyErr } = await supabase
        .from('agency_profiles')
        .update({
          ...form,
          population: form.population ? parseInt(form.population, 10) : null,
        })
        .eq('user_id', user.id)
      if (agencyErr) throw agencyErr

      // Sync agency_name in profiles
      const newName = `${form.city} ${form.agency_type}`.trim() || profile?.agency_name || 'My Agency'
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ agency_name: newName })
        .eq('id', user.id)
      if (profileErr) throw profileErr

      await refreshProfile()
      setAgencyProfile(prev => ({ ...prev, ...form }))
      setSaveSuccess(true)
      setEditing(false)
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true)
    try {
      const res  = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else throw new Error(data.error ?? 'Could not open billing portal.')
    } catch (err) {
      alert(err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  async function startCheckout(planParam) {
    setCheckoutLoading(planParam)
    try {
      const res  = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, email: user.email, plan: planParam }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else throw new Error(data.error ?? 'Could not start checkout.')
    } catch (err) {
      alert(err.message)
    } finally {
      setCheckoutLoading(null)
    }
  }

  const currentTier = profile?.subscription_tier ?? 'free'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-navy-900 hover:text-blue-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-navy-900">Account</h1>
        </div>
        <NotificationBell />
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-6">

        {/* ── Agency Profile ───────────────────────────────────────────────── */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-navy-900">Agency Profile</h2>
            {!editing && agencyProfile && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors"
              >
                Edit
              </button>
            )}
          </div>

          {saveSuccess && (
            <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              Profile updated successfully.
            </div>
          )}

          {!editing ? (
            /* ── Read view ── */
            <dl className="space-y-3">
              {[
                ['Agency name',         profile?.agency_name       ?? '—'],
                ['Agency type',         agencyProfile?.agency_type ?? '—'],
                ['Contact email',       profile?.contact_email     ?? '—'],
                ['Contact name',        agencyProfile?.contact_name  ?? '—'],
                ['Title / Role',        agencyProfile?.contact_title ?? '—'],
                ['Address',             [agencyProfile?.address, agencyProfile?.city, agencyProfile?.state, agencyProfile?.zip].filter(Boolean).join(', ') || '—'],
                ['Population',          agencyProfile?.population   ? Number(agencyProfile.population).toLocaleString() : '—'],
                ['Department focus',    agencyProfile?.department_focus ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
                  <dd className="text-sm font-semibold text-gray-900 text-right">{value}</dd>
                </div>
              ))}
              {agencyProfile?.current_projects && (
                <div className="pt-2 border-t border-gray-100">
                  <dt className="text-sm text-gray-500 mb-1">Current projects / priorities</dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-line">{agencyProfile.current_projects}</dd>
                </div>
              )}
            </dl>
          ) : (
            /* ── Edit form ── */
            <form onSubmit={handleSave} className="space-y-4">
              {saveError && (
                <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {saveError}
                </div>
              )}

              {/* Agency type */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Agency type</label>
                <select
                  value={form.agency_type}
                  onChange={set('agency_type')}
                  required
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select agency type…</option>
                  {AGENCY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <Input label="Street address" type="text" placeholder="123 Main St"
                value={form.address} onChange={set('address')} required />

              {/* City / State / ZIP */}
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <Input label="City" type="text" placeholder="Springfield"
                    value={form.city} onChange={set('city')} required />
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="block text-sm font-medium text-gray-700">State</label>
                  <select value={form.state} onChange={set('state')} required
                    className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Input label="ZIP code" type="text" placeholder="62701" maxLength={10}
                    value={form.zip} onChange={set('zip')} required />
                </div>
              </div>

              <Input label="Jurisdiction population" type="number" placeholder="50000"
                value={form.population} onChange={set('population')} min={0} />

              {/* Department focus */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Primary department focus</label>
                <select value={form.department_focus} onChange={set('department_focus')} required
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">Select department…</option>
                  {DEPARTMENT_FOCUS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <Input label="Primary contact name" type="text" placeholder="Jane Smith"
                  value={form.contact_name} onChange={set('contact_name')} required />
                <Input label="Title / Role" type="text" placeholder="City Manager"
                  value={form.contact_title} onChange={set('contact_title')} required />
              </div>

              {/* Current projects */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Current projects / priorities</label>
                <textarea rows={3} placeholder="Active grants, infrastructure work, key initiatives…"
                  value={form.current_projects} onChange={set('current_projects')}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="submit" loading={saving}>Save Changes</Button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setSaveError('') }}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200
                    rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Card>

        {/* ── Subscription ─────────────────────────────────────────────────── */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-navy-900">Subscription</h2>
            <div className="flex items-center gap-2">
              <Badge variant={TIER_VARIANT[currentTier] ?? 'neutral'}>
                {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
              </Badge>
              {profile?.subscription_status && profile.subscription_status !== 'active' && (
                <Badge variant={STATUS_VARIANT[profile.subscription_status] ?? 'neutral'}>
                  {profile.subscription_status.replace('_', ' ')}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Manage your subscription, update payment methods, or download invoices.
          </p>
          {currentTier !== 'free' ? (
            <Button
              variant="primary"
              loading={portalLoading}
              onClick={openBillingPortal}
            >
              Open Billing Portal
            </Button>
          ) : (
            <p className="text-xs text-gray-400">Upgrade below to manage billing.</p>
          )}
        </Card>

        {/* ── Plans ────────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-bold text-navy-900 mb-3">Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map(plan => {
              const isCurrent = currentTier === plan.key
              return (
                <div
                  key={plan.key}
                  className={`relative bg-white rounded-xl border p-5 flex flex-col ${
                    plan.highlight
                      ? 'border-blue-500 shadow-md'
                      : 'border-gray-200'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Plan header */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-bold text-navy-900">{plan.name}</h3>
                      {isCurrent && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50
                          px-2 py-0.5 rounded-full border border-green-200">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-2xl font-extrabold text-navy-900">{plan.price}</span>
                      <span className="text-xs text-gray-400">{plan.period}</span>
                    </div>
                    <p className="text-xs text-gray-500">{plan.tagline}</p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2">
                        <svg className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" fill="none"
                          stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                            d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs text-gray-600">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {isCurrent ? (
                    <div className="w-full py-2 text-center text-xs font-semibold text-gray-400
                      border border-gray-200 rounded-lg bg-gray-50">
                      Current plan
                    </div>
                  ) : plan.planParam ? (
                    <button
                      onClick={() => startCheckout(plan.planParam)}
                      disabled={checkoutLoading === plan.planParam}
                      className={`w-full py-2 text-xs font-bold rounded-lg transition-colors ${
                        plan.highlight
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-navy-900 hover:bg-navy-800 text-white'
                      } disabled:opacity-60`}
                    >
                      {checkoutLoading === plan.planParam ? 'Loading…' : `Upgrade to ${plan.name}`}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Sign Out ──────────────────────────────────────────────────────── */}
        <Card className="p-6 border-red-100">
          <h2 className="text-base font-bold text-red-700 mb-1">Sign Out</h2>
          <p className="text-sm text-gray-500 mb-4">
            You will be signed out of all Q Analytics sessions on this device.
          </p>
          <Button variant="danger" onClick={signOut}>Sign Out</Button>
        </Card>

      </main>
    </div>
  )
}
