import { describe, it, expect } from 'vitest'
import { calcInvoice, calcPointsEarned, calcDiscountFromPoints } from '../../src/renderer/src/lib/invoiceCalc'

describe('calcInvoice', () => {
  it('calculates invoice totals correctly', () => {
    const result = calcInvoice({
      playAmount: 125000,
      itemsAmount: 90000,
      discount: 10000,
      pointsRedeemed: 0,
      vndPerPoint: 100,
    })
    expect(result.totalAmount).toBe(215000)
    expect(result.discountFromPoints).toBe(0)
    expect(result.finalAmount).toBe(205000)
  })

  it('applies points discount correctly', () => {
    const result = calcInvoice({
      playAmount: 100000,
      itemsAmount: 50000,
      discount: 0,
      pointsRedeemed: 100,
      vndPerPoint: 100,
    })
    expect(result.totalAmount).toBe(150000)
    expect(result.discountFromPoints).toBe(10000)
    expect(result.finalAmount).toBe(140000)
  })
})

describe('calcPointsEarned', () => {
  it('calculates points earned from final amount', () => {
    expect(calcPointsEarned(205000, 1)).toBe(20)
    expect(calcPointsEarned(9999, 1)).toBe(0)
    expect(calcPointsEarned(10000, 1)).toBe(1)
  })
})

describe('calcDiscountFromPoints', () => {
  it('calculates discount amount from points', () => {
    expect(calcDiscountFromPoints(100, 100)).toBe(10000)
    expect(calcDiscountFromPoints(0, 100)).toBe(0)
  })
})
