// tests/unit/handlers/sessions.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../../src/main/db'
import {
  createSession,
  getActiveSessions,
  closeSession,
} from '../../../src/main/handlers/sessions'

describe('createSession', () => {
  it('creates a new session and sets table to playing', async () => {
    const mockSession = {
      id: 1, table_id: 2, customer_id: null,
      start_time: '2026-05-26T10:00:00Z', status: 'open', play_amount: 0
    }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce({ id: 2, status: 'playing' })

    const result = await createSession(2, null)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO sessions (table_id, customer_id) VALUES ($1, $2) RETURNING *',
      [2, null]
    )
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
      ['playing', 2]
    )
    expect(result).toEqual(mockSession)
  })
})

describe('getActiveSessions', () => {
  it('returns all open sessions with table info', async () => {
    const mockSessions = [
      { id: 1, table_id: 2, table_name: 'Bàn 2', start_time: '2026-05-26T10:00:00Z' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockSessions)

    const result = await getActiveSessions()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("s.status = 'open'")
    )
    expect(result).toEqual(mockSessions)
  })
})

describe('closeSession', () => {
  it('calculates duration, updates session and sets table idle', async () => {
    const startTime = new Date(Date.now() - 90 * 60 * 1000).toISOString()
    const openSession = { id: 1, table_id: 3, start_time: startTime, status: 'open' }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(openSession)
      .mockResolvedValueOnce({ ...openSession, status: 'closed', duration_minutes: 90, play_amount: 75000 })
      .mockResolvedValueOnce({ id: 3, status: 'idle' })

    const result = await closeSession(1, 75000)

    expect(result?.status).toBe('closed')
  })
})
