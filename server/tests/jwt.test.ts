import { describe, it, expect, beforeAll } from 'vitest'
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } from '../src/lib/jwt'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

describe('jwt helpers', () => {
  it('sign + verify round-trips payload', () => {
    const payload = { accountId: 'abc', role: 'master' as const, agentId: null }
    const token = signAccessToken(payload)
    const decoded = verifyAccessToken(token)
    expect(decoded.accountId).toBe('abc')
    expect(decoded.role).toBe('master')
    expect(decoded.agentId).toBeNull()
  })

  it('verifyAccessToken throws với token không hợp lệ', () => {
    expect(() => verifyAccessToken('bad-token')).toThrow()
  })

  it('generateRefreshToken trả về raw 80 chars, hash 64 chars, expires tương lai', () => {
    const { raw, hash, expiresAt } = generateRefreshToken()
    expect(raw).toHaveLength(80)
    expect(hash).toHaveLength(64)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('hashToken là deterministic', () => {
    expect(hashToken('foo')).toBe(hashToken('foo'))
  })
})
