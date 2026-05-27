import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { api } from './lib/api'
import LoginPage from './pages/LoginPage'
import AgentListPage from './pages/AgentListPage'
import AgentDetailPage from './pages/AgentDetailPage'

function RequireMaster({ children }: { children: React.ReactNode }) {
  const { accessToken, refreshToken, setAccessToken, logout } = useAuthStore()
  const [checking, setChecking] = useState(!accessToken && !!refreshToken)

  useEffect(() => {
    if (!accessToken && refreshToken) {
      api.post('/auth/refresh', { refreshToken })
        .then(({ data }) => setAccessToken(data.accessToken))
        .catch(() => logout())
        .finally(() => setChecking(false))
    }
  }, [])

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Đang tải...</div>
  }
  if (!accessToken) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireMaster><AgentListPage /></RequireMaster>} />
        <Route path="/agents/:id" element={<RequireMaster><AgentDetailPage /></RequireMaster>} />
      </Routes>
    </BrowserRouter>
  )
}
