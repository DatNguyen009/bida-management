import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue('agent-123'),
}))

import * as db from '../../../src/main/db'
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  ensureDefaultCategories,
} from '../../../src/main/handlers/categories'

beforeEach(() => vi.clearAllMocks())

describe('getAllCategories', () => {
  it('returns all categories for agent', async () => {
    const mock = [{ id: 1, name: 'Đồ uống', icon: '🥤' }]
    vi.mocked(db.query).mockResolvedValue(mock)

    const result = await getAllCategories()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM cloud_categories'),
      ['agent-123']
    )
    expect(result).toEqual(mock)
  })
})

describe('createCategory', () => {
  it('inserts and returns new category', async () => {
    const mock = { id: 2, name: 'Bia', icon: '🍺' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await createCategory({ name: 'Bia', icon: '🍺' })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_categories'),
      expect.arrayContaining(['Bia', '🍺', 'agent-123'])
    )
    expect(result).toEqual(mock)
  })
})

describe('updateCategory', () => {
  it('updates and returns category', async () => {
    const mock = { id: 1, name: 'Nước ngọt', icon: '🥤' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await updateCategory(1, { name: 'Nước ngọt', icon: '🥤' })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cloud_categories'),
      expect.arrayContaining(['Nước ngọt', '🥤', 1, 'agent-123'])
    )
    expect(result).toEqual(mock)
  })
})

describe('deleteCategory', () => {
  it('returns productCount and blocks delete when products exist', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '3' })

    const result = await deleteCategory(1)

    expect(result).toEqual({ success: false, productCount: 3 })
    expect(db.queryOne).toHaveBeenCalledTimes(1)
  })

  it('deletes and returns success when no products use it', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ id: 1 })

    const result = await deleteCategory(1)

    expect(result).toEqual({ success: true, productCount: 0 })
    expect(db.queryOne).toHaveBeenCalledTimes(2)
  })
})

describe('ensureDefaultCategories', () => {
  it('inserts 3 defaults if agent has no categories', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '0' })
    vi.mocked(db.query).mockResolvedValue([])

    await ensureDefaultCategories('agent-123')

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_categories'),
      expect.arrayContaining(['agent-123'])
    )
  })

  it('skips insert if agent already has categories', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '3' })

    await ensureDefaultCategories('agent-123')

    expect(db.query).not.toHaveBeenCalled()
  })
})
