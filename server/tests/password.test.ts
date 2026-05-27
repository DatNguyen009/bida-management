import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generatePassword } from '../src/lib/password'

describe('password helpers', () => {
  it('hashPassword trả về bcrypt hash', async () => {
    const hash = await hashPassword('secret')
    expect(hash).toMatch(/^\$2b\$/)
  })

  it('verifyPassword trả về true với đúng password', async () => {
    const hash = await hashPassword('secret')
    expect(await verifyPassword('secret', hash)).toBe(true)
  })

  it('verifyPassword trả về false với sai password', async () => {
    const hash = await hashPassword('secret')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('generatePassword trả về đúng độ dài', () => {
    expect(generatePassword(12)).toHaveLength(12)
  })

  it('generatePassword chỉ dùng ký tự an toàn', () => {
    expect(generatePassword(50)).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/)
  })
})
