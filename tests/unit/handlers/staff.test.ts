import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue('agent-123'),
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  }
}))

import * as db from '../../../src/main/db'
import {
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
} from '../../../src/main/handlers/staff'

beforeEach(() => vi.clearAllMocks())

describe('getAllStaff', () => {
  it('returns all active staff for agent', async () => {
    const mock = [{ id: 1, username: 'nv1', allowed_screens: ['dashboard'], is_active: true, created_at: '2026-01-01' }]
    vi.mocked(db.query).mockResolvedValue(mock)

    const result = await getAllStaff()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM cloud_staff'),
      ['agent-123']
    )
    expect(result).toEqual(mock)
  })
})

describe('createStaff', () => {
  it('hashes password and inserts staff', async () => {
    const mock = { id: 2, username: 'nv2', allowed_screens: ['dashboard', 'invoices'], is_active: true, created_at: '2026-01-01' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await createStaff({ username: 'nv2', password: 'pass123', allowedScreens: ['dashboard', 'invoices'] })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_staff'),
      expect.arrayContaining(['nv2', 'hashed_password', 'agent-123'])
    )
    expect(result).toEqual(mock)
  })
})

describe('updateStaff', () => {
  it('updates allowed_screens without changing password when password not provided', async () => {
    const mock = { id: 1, username: 'nv1', allowed_screens: ['dashboard', 'reports'], is_active: true, created_at: '2026-01-01' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await updateStaff(1, { allowedScreens: ['dashboard', 'reports'] })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cloud_staff'),
      expect.arrayContaining([['dashboard', 'reports'], 1, 'agent-123'])
    )
    expect(result).toEqual(mock)
  })

  it('updates password_hash when password provided', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ id: 1, username: 'nv1', allowed_screens: [], is_active: true, created_at: '2026-01-01' })

    await updateStaff(1, { password: 'newpass', allowedScreens: [] })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('password_hash'),
      expect.arrayContaining(['hashed_password'])
    )
  })
})

describe('deleteStaff', () => {
  it('soft-deletes staff by setting is_active = false', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ id: 1 })

    await deleteStaff(1)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('is_active = FALSE'),
      expect.arrayContaining([1, 'agent-123'])
    )
  })
})
