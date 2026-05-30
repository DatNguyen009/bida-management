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
  it('formats seconds into HH:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00:00')
    expect(formatDuration(90)).toBe('00:01:30')
    expect(formatDuration(3600)).toBe('01:00:00')
    expect(formatDuration(5400)).toBe('01:30:00')
  })
})

describe('calcPlayAmount', () => {
  it('calculates play amount based on duration and rate', () => {
    expect(calcPlayAmount(90, 50000)).toBe(75000)
    expect(calcPlayAmount(150, 50000)).toBe(125000)
    expect(calcPlayAmount(30, 50000)).toBe(25000)
  })
})
