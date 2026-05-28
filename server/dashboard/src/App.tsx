import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './lib/auth'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Agents from './pages/Agents'
import AgentDetail from './pages/AgentDetail'
import Reports from './pages/Reports'
import NavBar from './components/NavBar'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <NavBar />
              <main className="max-w-7xl mx-auto px-4 py-6">
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/agents" element={<Agents />} />
                  <Route path="/agents/:id" element={<AgentDetail />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
