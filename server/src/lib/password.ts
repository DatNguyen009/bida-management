import bcrypt from 'bcrypt'
import { randomInt } from 'crypto'

const SALT_ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generatePassword(length = 12): string {
  if (length < 1) throw new Error('Password length must be at least 1')
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length }, () =>
    chars[randomInt(chars.length)]
  ).join('')
}
