import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../../src/main/db'
import {
  getAllProducts,
  createProduct,
  adjustStock,
} from '../../../src/main/handlers/products'

describe('getAllProducts', () => {
  it('returns active products ordered by name', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', is_active: true }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getAllProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('is_active = TRUE')
    )
    expect(result).toEqual(mockProducts)
  })
})

describe('createProduct', () => {
  it('inserts a new product and returns it', async () => {
    const input = { name: 'Bia Tiger', category: 'drink' as const, price: 30000, unit: 'lon', min_stock_alert: 10 }
    const mockProduct = { id: 1, ...input, stock_quantity: 0, is_active: true }
    vi.mocked(db.queryOne).mockResolvedValue(mockProduct)

    const result = await createProduct(input)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO products'),
      expect.arrayContaining([input.name, input.price])
    )
    expect(result).toEqual(mockProduct)
  })
})

describe('adjustStock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs before_qty, after_qty and cost_price in transaction', async () => {
    const currentProduct = { id: 1, stock_quantity: 20 }
    const updatedProduct = { id: 1, stock_quantity: 30 }
    // queryOne is called twice: get current stock, then update
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(currentProduct)
      .mockResolvedValueOnce(updatedProduct)
    vi.mocked(db.query).mockResolvedValue([])

    const result = await adjustStock(1, 'in', 10, 'Nhập kho test', 15000)

    // Check stock update
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('stock_quantity + $1'),
      expect.arrayContaining([10, 1])
    )
    // Check transaction log has all info
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_transactions'),
      expect.arrayContaining([1, 'in', 10, 15000, 20, 30, 'Nhập kho test'])
    )
    expect(result).toEqual(updatedProduct)
  })

  it('accepts null cost_price', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 5 })
      .mockResolvedValueOnce({ id: 1, stock_quantity: 8 })
    vi.mocked(db.query).mockResolvedValue([])

    await adjustStock(1, 'in', 3, 'Nhập không có giá', null)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_transactions'),
      expect.arrayContaining([1, 'in', 3, null, 5, 8, 'Nhập không có giá'])
    )
  })
})
