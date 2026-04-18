import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0
           011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532
           7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025
           10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542
           7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

export default function Signup() {
  const { user, signUp } = useAuth()
  const navigate         = useNavigate()

  const [form, setForm]       = useState({ agencyName: '', email: '', password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw]   = useState(false)
  const [showCf, setShowCf]   = useState(false)

  // Inline validation
  const [touched, setTouched] = useState({})
  const touch = field => setTouched(prev => ({ ...prev, [field]: true }))

  const errors = {
    agencyName: touched.agencyName && !form.agencyName.trim() ? 'Agency name is required' : '',
    email:      touched.email && !form.email.includes('@')    ? 'Enter a valid email address' : '',
    password:   touched.password && form.password.length < 8  ? 'Password must be at least 8 characters' : '',
    confirm:    touched.confirm && form.confirm !== form.password ? 'Passwords do not match' : '',
  }

  if (user) return <Navigate to="/dashboard" replace />

  const set = field => e => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    touch(field)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ agencyName: true, email: true, password: true, confirm: true })
    if (Object.values(errors).some(Boolean) || !form.agencyName || !form.email || !form.password || !form.confirm) return
    setError('')
    setLoading(true)
    try {
      await signUp(form.email, form.password, form.agencyName)
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Failed to create account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Q Analytics</h1>
          <p className="text-blue-300 text-sm mt-2">Government Intelligence Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-navy-900 mb-1">Register your agency</h2>
          <p className="text-gray-500 text-sm mb-6">Create your Q Analytics account</p>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Agency name */}
            <div className="space-y-1">
              <Input
                label="Agency name"
                type="text"
                placeholder="City of Springfield"
                value={form.agencyName}
                onChange={set('agencyName')}
                onBlur={() => touch('agencyName')}
                required
              />
              {errors.agencyName && <p className="text-xs text-red-600">{errors.agencyName}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Input
                label="Contact email"
                type="email"
                placeholder="contact@springfield.gov"
                value={form.email}
                onChange={set('email')}
                onBlur={() => touch('email')}
                required
              />
              {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={set('password')}
                  onBlur={() => touch('password')}
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Confirm password</label>
              <div className="relative">
                <input
                  type={showCf ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  onBlur={() => touch('confirm')}
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowCf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showCf} />
                </button>
              </div>
              {errors.confirm && <p className="text-xs text-red-600">{errors.confirm}</p>}
            </div>

            <Button type="submit" loading={loading} className="w-full mt-2">
              Create Account
            </Button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-5">
            By creating an account you agree to our{' '}
            <Link to="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
          </p>

          <p className="text-center text-sm text-gray-500 mt-3">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
