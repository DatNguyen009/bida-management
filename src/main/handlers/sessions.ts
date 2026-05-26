// src/main/handlers/sessions.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Session } from '../../renderer/src/types'

export async function createSession(
  tableId: number,
  customerId: number | null
): Promise<Session | null> {
  const session = await queryOne<Session>(
    'INSERT INTO sessions (table_id, customer_id) VALUES ($1, $2) RETURNING *',
    [tableId, customerId]
  )
  if (session) {
    await queryOne(
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
      ['playing', tableId]
    )
  }
  return session
}

export async function getActiveSessions(): Promise<
  (Session & { table_name: string; hourly_rate: number })[]
> {
  return query(
    `SELECT s.*, t.name AS table_name, t.hourly_rate
     FROM sessions s
     JOIN tables t ON t.id = s.table_id
     WHERE s.status = 'open'
     ORDER BY s.start_time`
  )
}

export async function closeSession(
  sessionId: number,
  playAmount: number
): Promise<Session | null> {
  const session = await queryOne<Session>(
    'SELECT * FROM sessions WHERE id = $1',
    [sessionId]
  )
  if (!session) return null

  const endTime = new Date()
  const startTime = new Date(session.start_time)
  const durationMinutes = Math.ceil(
    (endTime.getTime() - startTime.getTime()) / 60000
  )

  const closed = await queryOne<Session>(
    `UPDATE sessions
     SET status = 'closed', end_time = $1, duration_minutes = $2, play_amount = $3
     WHERE id = $4
     RETURNING *`,
    [endTime.toISOString(), durationMinutes, playAmount, sessionId]
  )

  if (closed) {
    await queryOne(
      "UPDATE tables SET status = 'idle' WHERE id = $1 RETURNING *",
      [session.table_id]
    )
  }
  return closed
}

export function registerSessionHandlers() {
  ipcMain.handle(
    'sessions:create',
    (_event, tableId: number, customerId: number | null) =>
      createSession(tableId, customerId)
  )

  ipcMain.handle('sessions:getActive', () => getActiveSessions())

  ipcMain.handle(
    'sessions:close',
    (_event, sessionId: number, playAmount: number) =>
      closeSession(sessionId, playAmount)
  )
}
