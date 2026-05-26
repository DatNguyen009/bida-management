import { create } from 'zustand'
import type { Session } from '../types'

interface SessionStore {
  activeSessions: Record<number, Session & { table_name: string; hourly_rate: number }>
  setActiveSessions: (sessions: (Session & { table_name: string; hourly_rate: number })[]) => void
  getSessionByTableId: (tableId: number) => (Session & { table_name: string; hourly_rate: number }) | undefined
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  activeSessions: {},
  setActiveSessions: (sessions) => {
    const map: SessionStore['activeSessions'] = {}
    sessions.forEach((s) => { map[s.table_id] = s })
    set({ activeSessions: map })
  },
  getSessionByTableId: (tableId) => get().activeSessions[tableId],
}))
