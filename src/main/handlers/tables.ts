// src/main/handlers/tables.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { BidaTable } from '../../renderer/src/types'

export async function getAllTables(): Promise<BidaTable[]> {
  const agentId = getAgentId()
  return query<BidaTable>(
    'SELECT * FROM cloud_tables WHERE agent_id = $1 ORDER BY id',
    [agentId]
  )
}

export async function updateTableStatus(
  tableId: number,
  status: BidaTable['status']
): Promise<BidaTable | null> {
  const agentId = getAgentId()
  return queryOne<BidaTable>(
    'UPDATE cloud_tables SET status = $1 WHERE id = $2 AND agent_id = $3 RETURNING *',
    [status, tableId, agentId]
  )
}

export async function createTable(name: string, hourlyRate: number): Promise<BidaTable | null> {
  const agentId = getAgentId()
  return queryOne<BidaTable>(
    'INSERT INTO cloud_tables (name, hourly_rate, agent_id) VALUES ($1, $2, $3) RETURNING *',
    [name, hourlyRate, agentId]
  )
}

export async function updateTable(
  tableId: number,
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  const agentId = getAgentId()
  return queryOne<BidaTable>(
    'UPDATE cloud_tables SET name = $1, hourly_rate = $2 WHERE id = $3 AND agent_id = $4 RETURNING *',
    [name, hourlyRate, tableId, agentId]
  )
}

export function registerTableHandlers() {
  ipcMain.handle('tables:getAll', () => getAllTables())
  ipcMain.handle('tables:updateStatus', (_e, tableId: number, status: BidaTable['status']) =>
    updateTableStatus(tableId, status)
  )
  ipcMain.handle('tables:create', (_e, name: string, hourlyRate: number) =>
    createTable(name, hourlyRate)
  )
  ipcMain.handle('tables:update', (_e, tableId: number, name: string, hourlyRate: number) =>
    updateTable(tableId, name, hourlyRate)
  )
}
