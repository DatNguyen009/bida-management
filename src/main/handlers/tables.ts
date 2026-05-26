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

export async function createTable(
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'INSERT INTO tables (name, hourly_rate) VALUES ($1, $2) RETURNING *',
    [name, hourlyRate]
  )
}

export async function updateTable(
  tableId: number,
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'UPDATE tables SET name = $1, hourly_rate = $2 WHERE id = $3 RETURNING *',
    [name, hourlyRate, tableId]
  )
}

export function registerTableHandlers() {
  ipcMain.handle('tables:getAll', () => getAllTables())
  ipcMain.handle(
    'tables:updateStatus',
    (_event, tableId: number, status: BidaTable['status']) =>
      updateTableStatus(tableId, status)
  )
  ipcMain.handle(
    'tables:create',
    (_event, name: string, hourlyRate: number) => createTable(name, hourlyRate)
  )
  ipcMain.handle(
    'tables:update',
    (_event, tableId: number, name: string, hourlyRate: number) =>
      updateTable(tableId, name, hourlyRate)
  )
}
