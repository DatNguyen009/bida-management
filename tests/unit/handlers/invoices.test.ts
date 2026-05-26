import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../../src/main/db'
import { createInvoice, getNextInvoiceNumber } from '../../../src/main/handlers/invoices'

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
    vi.mocked(db.query).mockResolvedValue([])

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 75000,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 200000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO invoices'),
      expect.any(Array)
    )
    expect(result).toEqual(mockInvoice)
  })
})
