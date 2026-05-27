import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
if (!ACCESS_SECRET || ACCESS_SECRET.length < 32) {
  throw new Error('JWT_ACCESS_SECRET env var must be set and at least 32 characters')
}

export interface TokenPayload {
  accountId: string
  role: 'master' | 'agent'
  agentId: string | null
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' })
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload
}

export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(40).toString('hex')
  const hash = hashToken(raw)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  return { raw, hash, expiresAt }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
