// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { BidaTable } from '../renderer/src/types'

contextBridge.exposeInMainWorld('api', {
  tables: {
    getAll: (): Promise<BidaTable[]> =>
      ipcRenderer.invoke('tables:getAll'),
    updateStatus: (tableId: number, status: BidaTable['status']): Promise<BidaTable | null> =>
      ipcRenderer.invoke('tables:updateStatus', tableId, status),
  },
})
