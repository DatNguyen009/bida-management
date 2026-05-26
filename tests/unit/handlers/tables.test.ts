// tests/unit/handlers/tables.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../../src/main/db'
import { getAllTables, updateTableStatus } from '../../../src/main/handlers/tables'

describe('getAllTables', () => {
  it('returns all tables from database', async () => {
    const mockTables = [
      { id: 1, name: 'Bàn 1', status: 'idle', hourly_rate: 50000 },
      { id: 2, name: 'Bàn 2', status: 'playing', hourly_rate: 50000 },
    ]
    vi.mocked(db.query).mockResolvedValue(mockTables)

    const result = await getAllTables()

    expect(db.query).toHaveBeenCalledWith('SELECT * FROM tables ORDER BY id')
    expect(result).toEqual(mockTables)
  })
})

describe('updateTableStatus', () => {
  it('updates table status and returns updated table', async () => {
    const updated = { id: 1, name: 'Bàn 1', status: 'playing', hourly_rate: 50000 }
    vi.mocked(db.queryOne).mockResolvedValue(updated)

    const result = await updateTableStatus(1, 'playing')

    expect(db.queryOne).toHaveBeenCalledWith(
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
      ['playing', 1]
    )
    expect(result).toEqual(updated)
  })
})
