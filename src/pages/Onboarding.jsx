import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

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

const INITIAL = {
  agency_type: '', address: '', city: '', state: '', zip: '',
  population: '', department_focus: '', current_projects: '',
  contact_name: '', contact_title: '',
}

export default function Onboarding() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm]       = useState(INITIAL)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Ensure the profiles row exists before inserting agency_profiles.
      // The DB trigger normally creates it on signup, but if email confirmation
      // is enabled or the migration hasn't run, it may be missing.
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert(
          {
            id:           user.id,
            contact_email: user.email,
            agency_name:  user.user_metadata?.agency_name
                            || `${form.city} ${form.agency_type}`.trim()
                            || 'My Agency',
          },
          { onConflict: 'id', ignoreDuplicates: true }
        )
      if (profileErr) throw profileErr

      const { error: agencyErr } = await supabase.from('agency_profiles').insert({
        ...form,
        user_id:    user.id,
        population: form.population ? parseInt(form.population, 10) : null,
      })
      if (agencyErr) throw agencyErr

      await refreshProfile()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Failed to save profile.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-navy-900 px-6 py-5">
        <h1 className="text-2xl font-bold text-white">Q Analytics</h1>
        <p className="text-blue-300 text-sm mt-0.5">Agency Profile Setup</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-7">
            <h2 className="text-xl font-bold text-navy-900">Complete your agency profile</h2>
            <p className="text-gray-500 text-sm mt-1">
              This data personalizes your grant matches and compliance alerts.
              Profile setup is locked after first save.
            </p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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

            <Input
              label="Street address"
              type="text"
              placeholder="123 Main St"
              value={form.address}
              onChange={set('address')}
              required
            />

            {/* City / State / ZIP */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <Input
                  label="City"
                  type="text"
                  placeholder="Springfield"
                  value={form.city}
                  onChange={set('city')}
                  required
                />
              </div>
              <div className="col-span-1 space-y-1">
                <label className="block text-sm font-medium text-gray-700">State</label>
                <select
                  value={form.state}
                  onChange={set('state')}
                  required
                  className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Input
                  label="ZIP code"
                  type="text"
                  placeholder="62701"
                  value={form.zip}
                  onChange={set('zip')}
                  required
                  maxLength={10}
                />
              </div>
            </div>

            <Input
              label="Jurisdiction population"
              type="number"
              placeholder="50000"
              value={form.population}
              onChange={set('population')}
              min={0}
            />

            {/* Department focus */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Primary department focus</label>
              <select
                value={form.department_focus}
                onChange={set('department_focus')}
                required
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select department…</option>
                {DEPARTMENT_FOCUS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Current projects */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Current projects or strategic priorities
              </label>
              <textarea
                rows={3}
                placeholder="Describe active grants, infrastructure work, or key initiatives…"
                value={form.current_projects}
                onChange={set('current_projects')}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Primary contact name"
                type="text"
                placeholder="Jane Smith"
                value={form.contact_name}
                onChange={set('contact_name')}
                required
              />
              <Input
                label="Title / Role"
                type="text"
                placeholder="City Manager"
                value={form.contact_title}
                onChange={set('contact_title')}
                required
              />
            </div>

            <Button type="submit" loading={loading} size="lg" className="w-full mt-2">
              Save Profile & Continue to Dashboard
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
