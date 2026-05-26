import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDuration, calcPlayAmount } from '../../src/renderer/src/lib/utils'

describe('formatCurrency', () => {
  it('formats number as Vietnamese dong', () => {
    expect(formatCurrency(125000)).toBe('125,000đ')
    expect(formatCurrency(0)).toBe('0đ')
    expect(formatCurrency(1000000)).toBe('1,000,000đ')
  })
})

describe('formatDuration', () => {
  it('formats minutes into hours and minutes', () => {
    expect(formatDuration(90)).toBe('1 giờ 30 phút')
    expect(formatDuration(60)).toBe('1 giờ 0 phút')
    expect(formatDuration(45)).toBe('0 giờ 45 phút')
  })
})

describe('calcPlayAmount', () => {
  it('calculates play amount based on duration and rate', () => {
    expect(calcPlayAmount(90, 50000)).toBe(75000)
    expect(calcPlayAmount(150, 50000)).toBe(125000)
    expect(calcPlayAmount(30, 50000)).toBe(25000)
  })
})
