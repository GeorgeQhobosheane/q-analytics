import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from '../components/notifications/NotificationBell'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'

const TIER_VARIANT = {
  free: 'neutral', starter: 'info', pro: 'success', enterprise: 'navy',
}
const STATUS_VARIANT = {
  active: 'success', trialing: 'info', past_due: 'warning', canceled: 'danger', unpaid: 'danger',
}

export default function Account() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center
        justify-between px-4 lg:px-8">
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

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-5">
        {/* Agency overview */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-navy-900 mb-4">Agency Overview</h2>
          <dl className="space-y-3">
            {[
              ['Agency',             profile?.agency_name    ?? '—'],
              ['Contact email',      profile?.contact_email  ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-500">Subscription tier</dt>
              <dd>
                <Badge variant={TIER_VARIANT[profile?.subscription_tier] ?? 'neutral'}>
                  {profile?.subscription_tier ?? 'free'}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-500">Status</dt>
              <dd>
                <Badge variant={STATUS_VARIANT[profile?.subscription_status] ?? 'neutral'}>
                  {profile?.subscription_status ?? 'active'}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        {/* Billing */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-navy-900 mb-1">Billing</h2>
          <p className="text-sm text-gray-500 mb-4">
            Manage your subscription, upgrade your plan, or download invoices via the billing portal.
          </p>
          <Button variant="primary">Open Billing Portal</Button>
        </Card>

        {/* Upgrade prompt (only for free tier) */}
        {profile?.subscription_tier === 'free' && (
          <Card className="p-6 border-blue-200 bg-blue-50">
            <h2 className="text-base font-bold text-navy-900 mb-1">Upgrade to Pro</h2>
            <p className="text-sm text-gray-600 mb-4">
              Unlock unlimited document uploads, AI grant proposal drafting, and priority compliance alerts.
            </p>
            <Button variant="primary">View Plans</Button>
          </Card>
        )}

        {/* Sign out */}
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
