// src/renderer/src/electron.d.ts
import type { BidaTable, Session } from './types'

declare global {
  interface Window {
    api: {
      tables: {
        getAll(): Promise<BidaTable[]>
        updateStatus(id: number, status: BidaTable['status']): Promise<BidaTable | null>
      }
    }
  }
}

export {}
