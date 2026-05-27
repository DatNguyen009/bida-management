import { create } from 'zustand'
import { api } from '../lib/api'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  setAuth: (accessToken: string, refreshToken: string) => void
  setAccessToken: (token: string) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: localStorage.getItem('refreshToken'),
  setAuth: (accessToken, refreshToken) => {
    localStorage.setItem('refreshToken', refreshToken)
    set({ accessToken, refreshToken })
  },
  setAccessToken: (token) => set({ accessToken: token }),
  logout: async () => {
    const { refreshToken } = get()
    if (refreshToken) {
      try { await api.post('/auth/logout', { refreshToken }) } catch { /* ignore */ }
    }
    set({ accessToken: null, refreshToken: null })
    localStorage.removeItem('refreshToken')
  },
}))
