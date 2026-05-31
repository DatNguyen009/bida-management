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
  it('returns active products with joined category fields', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', category_id: 1, category_name: 'Đồ uống', category_icon: '🥤', cost_price: 20000, is_active: true }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getAllProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN cloud_categories'),
      [null]
    )
    expect(result).toEqual(mockProducts)
  })
})

describe('createProduct', () => {
  it('inserts product with category_id and returns with category fields', async () => {
    const input = { name: 'Bia Tiger', category_id: 1, price: 30000, unit: 'lon', min_stock_alert: 10, product_type: 'stock' as const }
    const mockRow = { id: 1, name: 'Bia Tiger', category_id: 1, price: 30000, stock_quantity: 0, min_stock_alert: 10, unit: 'lon', is_active: true, product_type: 'stock', created_at: '2026-01-01' }
    const mockCat = { name: 'Đồ uống', icon: '🥤' }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(mockRow)
      .mockResolvedValueOnce(mockCat)

    const result = await createProduct(input)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO cloud_products'),
      expect.arrayContaining([input.name, 1, input.price])
    )
    expect(result).toMatchObject({ category_name: 'Đồ uống', category_icon: '🥤' })
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

  it('updates cost_price on product when type is "in" and costPrice provided', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 30, cost_price: 15000, name: 'Test' })
      .mockResolvedValueOnce({ id: 1 })

    await adjustStock(1, 'in', 10, 'Nhập kho', 15000)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('cost_price = $4'),
      expect.arrayContaining([10, 1, null, 15000])
    )
  })

  it('does not update cost_price when type is "out"', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 20, name: 'Test' })
      .mockResolvedValueOnce({ id: 1 })

    await adjustStock(1, 'out', 5, 'Bán', null)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining('cost_price = $4'),
      expect.arrayContaining([5, 1, null])
    )
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
      { id: 1, product_id: 1, product_name: 'Bia Tiger', type: 'in', quantity: 24, before_qty: 6, after_qty: 30, cost_price: 15000, note: 'Nhập kho', created_at: '2026-05-29T10:00:00Z' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockRows)

    const result = await getStockHistory({ page: 1, pageSize: 20 })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_stock_transactions'),
      expect.arrayContaining([null])
    )
    expect(result).toEqual({ data: mockRows, total: 0 })
  })

  it('filters by productId when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getStockHistory({ productId: 5, page: 1, pageSize: 20 })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([5])
    )
  })

  it('filters by date range when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getStockHistory({ fromDate: '2026-05-01', toDate: '2026-05-31', page: 1, pageSize: 20 })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['2026-05-01', '2026-05-31'])
    )
  })
})
