// src/main/handlers/tables.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { BidaTable } from '../../renderer/src/types'

export async function getAllTables(): Promise<BidaTable[]> {
  return query<BidaTable>('SELECT * FROM tables ORDER BY id')
}

export async function updateTableStatus(
  tableId: number,
  status: BidaTable['status']
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
    [status, tableId]
  )
}

export function registerTableHandlers() {
  ipcMain.handle('tables:getAll', () => getAllTables())

  ipcMain.handle(
    'tables:updateStatus',
    (_event, tableId: number, status: BidaTable['status']) =>
      updateTableStatus(tableId, status)
  )
}
