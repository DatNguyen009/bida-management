import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../../src/main/db'
import { addOrderItem, getOrderItems, removeOrderItem } from '../../../src/main/handlers/orderItems'

describe('addOrderItem', () => {
  it('inserts order item and returns with subtotal', async () => {
    const mockItem = { id: 1, session_id: 5, product_id: 3, quantity: 2, unit_price: 30000, subtotal: 60000 }
    vi.mocked(db.queryOne).mockResolvedValue(mockItem)

    const result = await addOrderItem(5, 3, 2, 30000)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO order_items'),
      [5, 3, 2, 30000, 60000]
    )
    expect(result).toEqual(mockItem)
  })
})

describe('getOrderItems', () => {
  it('returns order items with product name', async () => {
    const mockItems = [{ id: 1, product_name: 'Bia Tiger', quantity: 2, subtotal: 60000 }]
    vi.mocked(db.query).mockResolvedValue(mockItems)

    const result = await getOrderItems(5)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN products'),
      [5]
    )
    expect(result).toEqual(mockItems)
  })
})

describe('removeOrderItem', () => {
  it('deletes order item by id', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ id: 1 })

    await removeOrderItem(1)

    expect(db.queryOne).toHaveBeenCalledWith(
      'DELETE FROM order_items WHERE id = $1 RETURNING id',
      [1]
    )
  })
})
