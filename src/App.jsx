import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Account from './pages/Account'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Terms from './pages/Terms'

export default function App() {
  return (
    <ToastProvider>
    <AuthProvider>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/signup"   element={<Signup />} />
        <Route path="/privacy"  element={<PrivacyPolicy />} />
        <Route path="/terms"    element={<Terms />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
    </ToastProvider>
  )
}
