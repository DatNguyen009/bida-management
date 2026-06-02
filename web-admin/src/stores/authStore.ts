import { create } from 'zustand'
import { api } from '../lib/api'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: string | null
  agentId: string | null
  setAuth: (accessToken: string, refreshToken: string, role: string, agentId: string | null) => void
  setAccessToken: (token: string) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('userRole'),
  agentId: localStorage.getItem('agentId'),
  setAuth: (accessToken, refreshToken, role, agentId) => {
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('userRole', role)
    if (agentId) localStorage.setItem('agentId', agentId)
    else localStorage.removeItem('agentId')
    set({ accessToken, refreshToken, role, agentId })
  },
  setAccessToken: (token) => set({ accessToken: token }),
  logout: async () => {
    const { refreshToken } = get()
    if (refreshToken) {
      try { await api.post('/auth/logout', { refreshToken }) } catch { /* ignore */ }
    }
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('userRole')
    localStorage.removeItem('agentId')
    set({ accessToken: null, refreshToken: null, role: null, agentId: null })
  },
}))
