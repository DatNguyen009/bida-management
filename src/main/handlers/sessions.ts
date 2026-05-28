// src/main/handlers/sessions.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import { updateTableStatus } from './tables'
import type { Session } from '../../renderer/src/types'

export async function createSession(
  tableId: number,
  customerId: number | null
): Promise<Session | null> {
  const agentId = getAgentId()
  const session = await queryOne<Session>(
    'INSERT INTO cloud_sessions (table_id, customer_id, agent_id) VALUES ($1, $2, $3) RETURNING *',
    [tableId, customerId, agentId]
  )
  if (session) await updateTableStatus(tableId, 'playing')
  return session
}

export async function getActiveSessions(): Promise<
  (Session & { table_name: string; hourly_rate: number })[]
> {
  const agentId = getAgentId()
  return query(
    `SELECT s.*, t.name AS table_name, t.hourly_rate
     FROM cloud_sessions s
     JOIN cloud_tables t ON t.id = s.table_id
     WHERE s.status = 'open' AND s.agent_id = $1
     ORDER BY s.start_time`,
    [agentId]
  )
}

export async function closeSession(
  sessionId: number,
  playAmount: number
): Promise<Session | null> {
  const agentId = getAgentId()
  const session = await queryOne<Session>(
    'SELECT * FROM cloud_sessions WHERE id = $1 AND agent_id = $2',
    [sessionId, agentId]
  )
  if (!session) return null

  const endTime = new Date()
  const durationMinutes = Math.ceil(
    (endTime.getTime() - new Date(session.start_time).getTime()) / 60000
  )

  const closed = await queryOne<Session>(
    `UPDATE cloud_sessions
     SET status = 'closed', end_time = $1, duration_minutes = $2, play_amount = $3
     WHERE id = $4 AND status = 'open' AND agent_id = $5 RETURNING *`,
    [endTime.toISOString(), durationMinutes, playAmount, sessionId, agentId]
  )

  if (closed) await updateTableStatus(session.table_id, 'idle')
  return closed
}

export function registerSessionHandlers() {
  ipcMain.handle('sessions:create', (_e, tableId: number, customerId: number | null) =>
    createSession(tableId, customerId)
  )
  ipcMain.handle('sessions:getActive', () => getActiveSessions())
  ipcMain.handle('sessions:close', (_e, sessionId: number, playAmount: number) =>
    closeSession(sessionId, playAmount)
  )
}
