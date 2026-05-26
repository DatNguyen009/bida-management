import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../../src/main/db'
import { getRevenueReport, getTableStats, getLowStockProducts } from '../../../src/main/handlers/reports'

describe('getRevenueReport', () => {
  it('queries invoices between date range', async () => {
    const mockData = [
      { date: '2026-05-26', total: '500000', invoice_count: '3' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockData)

    const result = await getRevenueReport('2026-05-01', '2026-05-31')

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DATE(i.created_at)'),
      ['2026-05-01', '2026-05-31']
    )
    expect(result).toEqual(mockData)
  })
})

describe('getTableStats', () => {
  it('returns revenue grouped by table', async () => {
    const mockStats = [
      { table_name: 'Bàn 1', total_revenue: '1500000', session_count: '10' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockStats)

    const result = await getTableStats('2026-05-01', '2026-05-31')

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY t.id'),
      ['2026-05-01', '2026-05-31']
    )
    expect(result).toEqual(mockStats)
  })
})

describe('getLowStockProducts', () => {
  it('returns products where stock <= min alert', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', stock_quantity: 3, min_stock_alert: 5 }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getLowStockProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('stock_quantity <= min_stock_alert')
    )
    expect(result).toEqual(mockProducts)
  })
})
