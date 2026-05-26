// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { BidaTable, Session } from '../renderer/src/types'

contextBridge.exposeInMainWorld('api', {
  tables: {
    getAll: (): Promise<BidaTable[]> =>
      ipcRenderer.invoke('tables:getAll'),
    updateStatus: (tableId: number, status: BidaTable['status']): Promise<BidaTable | null> =>
      ipcRenderer.invoke('tables:updateStatus', tableId, status),
  },
  sessions: {
    create: (tableId: number, customerId: number | null): Promise<Session | null> =>
      ipcRenderer.invoke('sessions:create', tableId, customerId),
    getActive: (): Promise<(Session & { table_name: string; hourly_rate: number })[]> =>
      ipcRenderer.invoke('sessions:getActive'),
    close: (sessionId: number, playAmount: number): Promise<Session | null> =>
      ipcRenderer.invoke('sessions:close', sessionId, playAmount),
  },
})
