import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue(null),
}))

vi.mock('../../../src/main/handlers/printer', () => ({
  printInvoice: vi.fn().mockResolvedValue(undefined),
}))

import * as db from '../../../src/main/db'
import { createInvoice, getNextInvoiceNumber } from '../../../src/main/handlers/invoices'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getNextInvoiceNumber', () => {
  it('returns 00001 when no invoices exist', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ max_num: null })
    const result = await getNextInvoiceNumber()
    expect(result).toBe('00001')
  })

  it('returns next sequential number', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ max_num: '00042' })
    const result = await getNextInvoiceNumber()
    expect(result).toBe('00043')
  })
})

describe('createInvoice', () => {
  it('creates invoice record and returns it', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 200000 }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })
      .mockResolvedValueOnce(mockInvoice)
    vi.mocked(db.query)
      .mockResolvedValueOnce([])   // order items: empty (no customerId, so no customer query)

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 75000,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 200000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_invoices'),
      expect.any(Array)
    )
    expect(result).toEqual(mockInvoice)
  })
})

describe('createInvoice stock reduction', () => {
  it('reduces stock for each order item after invoice created', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 200000 }
    const mockOrderItems = [
      { product_id: 10, quantity: 2, unit_price: 30000 },
      { product_id: 11, quantity: 1, unit_price: 50000 },
    ]

    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })
      .mockResolvedValueOnce(mockInvoice)
      .mockResolvedValueOnce({ id: 10, stock_quantity: 8 })
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 11, stock_quantity: 4 })
      .mockResolvedValueOnce({ id: 2 })

    vi.mocked(db.query)
      .mockResolvedValueOnce(mockOrderItems)  // order items (no customerId, so no customer query)

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 75000,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 200000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(result).toEqual(mockInvoice)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_order_items'),
      expect.arrayContaining([1])
    )

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('stock_quantity - $1'),
      expect.arrayContaining([2, 10])
    )

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_stock_transactions'),
      expect.arrayContaining([10, 'out', 2])
    )
  })

  it('skips stock reduction when no order items', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 125000 }

    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })
      .mockResolvedValueOnce(mockInvoice)

    vi.mocked(db.query)
      .mockResolvedValueOnce([])  // order items: empty

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 0,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 125000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(result).toEqual(mockInvoice)
    expect(db.queryOne).toHaveBeenCalledTimes(2)
  })
})
