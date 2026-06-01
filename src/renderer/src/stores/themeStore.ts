import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppTheme = 'v1' | 'v2'

interface ThemeStore {
  theme: AppTheme
  setTheme: (t: AppTheme) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'v1',
      setTheme: (t) => set({ theme: t }),
    }),
    { name: 'bida-theme' }
  )
)
