// src/main/handlers/tables.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import { enqueue, syncWorker } from '../sync/worker'
import type { BidaTable } from '../../renderer/src/types'

export async function getAllTables(): Promise<BidaTable[]> {
  return query<BidaTable>('SELECT * FROM tables ORDER BY id')
}

export async function updateTableStatus(
  tableId: number,
  status: BidaTable['status']
): Promise<BidaTable | null> {
  const table = await queryOne<BidaTable>(
    'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
    [status, tableId]
  )
  if (table) {
    const agentId = getAgentId()
    if (agentId) {
      await enqueue('tables', table.id, 'update', table)
      syncWorker.flush()
    }
  }
  return table
}

export async function createTable(
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  const agentId = getAgentId()
  const table = await queryOne<BidaTable>(
    'INSERT INTO tables (name, hourly_rate, agent_id) VALUES ($1, $2, $3) RETURNING *',
    [name, hourlyRate, agentId]
  )
  if (table) {
    await enqueue('tables', table.id, 'insert', table)
    syncWorker.flush()
  }
  return table
}

export async function updateTable(
  tableId: number,
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  const table = await queryOne<BidaTable>(
    'UPDATE tables SET name = $1, hourly_rate = $2 WHERE id = $3 RETURNING *',
    [name, hourlyRate, tableId]
  )
  if (table) {
    await enqueue('tables', table.id, 'update', table)
    syncWorker.flush()
  }
  return table
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
