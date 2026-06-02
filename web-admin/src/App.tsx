import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { api } from './lib/api'
import LoginPage from './pages/LoginPage'
import AgentListPage from './pages/AgentListPage'
import AgentDetailPage from './pages/AgentDetailPage'
import AgentDashboardPage from './pages/agent/AgentDashboardPage'
import AgentInvoicesPage from './pages/agent/AgentInvoicesPage'
import AgentReportsPage from './pages/agent/AgentReportsPage'
import AgentProductsPage from './pages/agent/AgentProductsPage'
import AgentCategoriesPage from './pages/agent/AgentCategoriesPage'
import AgentStaffPage from './pages/agent/AgentStaffPage'
import AgentPromotionsPage from './pages/agent/AgentPromotionsPage'
import AgentSettingsPage from './pages/agent/AgentSettingsPage'

function useAuthGuard(requiredRole: string) {
  const { accessToken, refreshToken, role, setAccessToken, logout } = useAuthStore()
  const [checking, setChecking] = useState(!accessToken && !!refreshToken)

  useEffect(() => {
    if (!accessToken && refreshToken) {
      api.post('/auth/refresh', { refreshToken })
        .then(({ data }) => setAccessToken(data.accessToken))
        .catch(() => logout())
        .finally(() => setChecking(false))
    }
  }, [])

  return { checking, authed: !!accessToken && role === requiredRole }
}

function RequireMaster({ children }: { children: React.ReactNode }) {
  const { checking, authed } = useAuthGuard('master')
  if (checking) return <Spinner />
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAgent({ children }: { children: React.ReactNode }) {
  const { checking, authed } = useAuthGuard('agent')
  if (checking) return <Spinner />
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0e0f' }}>
      <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireMaster><AgentListPage /></RequireMaster>} />
        <Route path="/agents/:id" element={<RequireMaster><AgentDetailPage /></RequireMaster>} />
        <Route path="/agent" element={<RequireAgent><AgentDashboardPage /></RequireAgent>} />
        <Route path="/agent/invoices" element={<RequireAgent><AgentInvoicesPage /></RequireAgent>} />
        <Route path="/agent/reports" element={<RequireAgent><AgentReportsPage /></RequireAgent>} />
        <Route path="/agent/products" element={<RequireAgent><AgentProductsPage /></RequireAgent>} />
        <Route path="/agent/categories" element={<RequireAgent><AgentCategoriesPage /></RequireAgent>} />
        <Route path="/agent/staff" element={<RequireAgent><AgentStaffPage /></RequireAgent>} />
        <Route path="/agent/promotions" element={<RequireAgent><AgentPromotionsPage /></RequireAgent>} />
        <Route path="/agent/settings" element={<RequireAgent><AgentSettingsPage /></RequireAgent>} />
      </Routes>
    </BrowserRouter>
  )
}
