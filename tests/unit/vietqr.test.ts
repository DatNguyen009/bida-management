import { describe, it, expect } from 'vitest'
import { buildVietQRUrl, isBankConfigured } from '../../src/renderer/src/lib/vietqr'

describe('buildVietQRUrl', () => {
  it('builds correct VietQR URL', () => {
    const url = buildVietQRUrl({
      bankId: 'MB',
      bankAccount: '1234567890',
      bankAccountName: 'NGUYEN VAN A',
      amount: 150000,
      invoiceNumber: 'HD00123',
    })
    expect(url).toBe(
      'https://img.vietqr.io/image/MB-1234567890-compact2.png' +
      '?amount=150000&addInfo=HD00123&accountName=NGUYEN%20VAN%20A'
    )
  })

  it('encodes special characters in accountName', () => {
    const url = buildVietQRUrl({
      bankId: 'VCB',
      bankAccount: '9876543210',
      bankAccountName: 'TRAN THI B',
      amount: 200000,
      invoiceNumber: 'HD00456',
    })
    expect(url).toContain('accountName=TRAN%20THI%20B')
  })
})

describe('isBankConfigured', () => {
  it('returns true when all 3 fields are set', () => {
    expect(isBankConfigured('MB', '1234567890', 'NGUYEN VAN A')).toBe(true)
  })

  it('returns false when any field is empty', () => {
    expect(isBankConfigured('', '1234567890', 'NGUYEN VAN A')).toBe(false)
    expect(isBankConfigured('MB', '', 'NGUYEN VAN A')).toBe(false)
    expect(isBankConfigured('MB', '1234567890', '')).toBe(false)
  })
})
