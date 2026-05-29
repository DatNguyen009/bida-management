import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue(null),
}))

import * as db from '../../../src/main/db'
import {
  getAllProducts,
  createProduct,
  adjustStock,
  getStockHistory,
} from '../../../src/main/handlers/products'

describe('getAllProducts', () => {
  it('returns active products ordered by name', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', is_active: true }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getAllProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('is_active = TRUE'),
      [null]
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
      expect.stringContaining('INSERT INTO cloud_products'),
      expect.arrayContaining([input.name, input.price])
    )
    expect(result).toEqual(mockProduct)
  })
})

describe('adjustStock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs before_qty, after_qty and cost_price in transaction', async () => {
    const updatedProduct = { id: 1, stock_quantity: 30, name: 'Test' }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(updatedProduct)
      .mockResolvedValueOnce({ id: 1 })

    const result = await adjustStock(1, 'in', 10, 'Nhập kho test', 15000)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('stock_quantity + $1'),
      expect.arrayContaining([10, 1])
    )
    // afterQty=30, beforeQty=30-10=20
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO cloud_stock_transactions'),
      expect.arrayContaining([1, 'in', 10, 15000, 20, 30, 'Nhập kho test'])
    )
    expect(result).toEqual(updatedProduct)
  })

  it('accepts null cost_price', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 8 })
      .mockResolvedValueOnce({ id: 1 })

    await adjustStock(1, 'in', 3, 'Nhập không có giá', null)

    // afterQty=8, beforeQty=8-3=5
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO cloud_stock_transactions'),
      expect.arrayContaining([1, 'in', 3, null, 5, 8, 'Nhập không có giá'])
    )
  })

  it('returns null and skips transaction when product not found', async () => {
    vi.mocked(db.queryOne).mockResolvedValueOnce(null)

    const result = await adjustStock(999, 'in', 5, 'ghost', null)

    expect(result).toBeNull()
    expect(db.queryOne).toHaveBeenCalledTimes(1)
  })

  it('calculates before_qty correctly for out type', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 15 })
      .mockResolvedValueOnce({ id: 1 })

    await adjustStock(1, 'out', 5, 'Bán hàng', null)

    // afterQty=15, beforeQty=15+5=20 for 'out' type
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO cloud_stock_transactions'),
      expect.arrayContaining([1, 'out', 5, null, 20, 15, 'Bán hàng'])
    )
  })
})

describe('getStockHistory', () => {
  it('returns all transactions when no filter applied', async () => {
    const mockRows = [
      { id: 1, product_id: 1, product_name: 'Bia Tiger', type: 'in', quantity: 24, before_qty: 6, after_qty: 30, note: 'Nhập kho', created_at: '2026-05-29T10:00:00Z' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockRows)

    const result = await getStockHistory({})

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_stock_transactions'),
      expect.arrayContaining([null])
    )
    expect(result).toEqual(mockRows)
  })

  it('filters by productId when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getStockHistory({ productId: 5 })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([5])
    )
  })

  it('filters by date range when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getStockHistory({ fromDate: '2026-05-01', toDate: '2026-05-31' })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['2026-05-01', '2026-05-31'])
    )
  })
})
