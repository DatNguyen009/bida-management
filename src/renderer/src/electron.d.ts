// src/renderer/src/electron.d.ts
import type { BidaTable, Session } from './types'

declare global {
  interface Window {
    api: {
      tables: {
        getAll(): Promise<BidaTable[]>
        updateStatus(id: number, status: BidaTable['status']): Promise<BidaTable | null>
      }
      sessions: {
        create(tableId: number, customerId: number | null): Promise<Session | null>
        getActive(): Promise<(Session & { table_name: string; hourly_rate: number })[]>
        close(sessionId: number, playAmount: number): Promise<Session | null>
      }
    }
  }
}

export {}
