import { useState } from 'react'
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function Login() {
  const { user, signIn }  = useAuth()
  const toast             = useToast()
  const navigate          = useNavigate()
  const location          = useLocation()
  const from              = location.state?.from?.pathname ?? '/dashboard'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Inline field validation
  const [emailTouched, setEmailTouched]   = useState(false)
  const [pwTouched, setPwTouched]         = useState(false)
  const emailErr = emailTouched && !email.includes('@') ? 'Enter a valid email address' : ''
  const pwErr    = pwTouched && password.length < 6    ? 'Password must be at least 6 characters' : ''

  // Forgot password
  const [forgotMode, setForgotMode]     = useState(false)
  const [resetEmail, setResetEmail]     = useState('')
  const [resetSent, setResetSent]       = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setEmailTouched(true)
    setPwTouched(true)
    if (emailErr || pwErr || !email || !password) return
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Failed to sign in.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!resetEmail.includes('@')) return
    setResetLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/dashboard`,
      })
      if (error) throw error
      setResetSent(true)
      toast.success('Password reset email sent')
    } catch (err) {
      toast.error(err.message ?? 'Failed to send reset email.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Q Analytics</h1>
          <p className="text-blue-300 text-sm mt-2">Government Intelligence Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* ── Forgot password mode ── */}
          {forgotMode ? (
            <>
              <button
                onClick={() => { setForgotMode(false); setResetSent(false) }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
              >
                ← Back to sign in
              </button>
              <h2 className="text-xl font-bold text-navy-900 mb-1">Reset password</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter your email and we'll send a reset link.
              </p>
              {resetSent ? (
                <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  Check your inbox — a reset link has been sent to <strong>{resetEmail}</strong>.
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="agency@gov.us"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                  <Button type="submit" loading={resetLoading} className="w-full">
                    Send Reset Link
                  </Button>
                </form>
              )}
            </>
          ) : (
            /* ── Sign in mode ── */
            <>
              <h2 className="text-xl font-bold text-navy-900 mb-1">Sign in</h2>
              <p className="text-gray-500 text-sm mb-6">Enter your agency credentials to continue</p>

              {error && (
                <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1">
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="agency@gov.us"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailTouched(true) }}
                    onBlur={() => setEmailTouched(true)}
                    required
                    autoComplete="email"
                  />
                  {emailErr && <p className="text-xs text-red-600 mt-1">{emailErr}</p>}
                </div>

                {/* Password with show/hide */}
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setPwTouched(true) }}
                      onBlur={() => setPwTouched(true)}
                      required
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg bg-white
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPw ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {pwErr && <p className="text-xs text-red-600 mt-1">{pwErr}</p>}
                </div>

                {/* Forgot password link */}
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setResetEmail(email) }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" loading={loading} className="w-full mt-2">
                  Sign In
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                Don't have an account?{' '}
                <Link to="/signup" className="text-blue-600 font-semibold hover:underline">
                  Register your agency
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
