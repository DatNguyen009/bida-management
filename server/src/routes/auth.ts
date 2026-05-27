import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { verifyPassword } from '../lib/password'
import { signAccessToken, generateRefreshToken, hashToken } from '../lib/jwt'
import { authenticate, AuthRequest } from '../middleware/authenticate'

export const authRouter = Router()

authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' })
    return
  }
  if (password.length > 200) {
    res.status(401).json({ error: 'Sai thông tin đăng nhập' })
    return
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, password_hash, role, agent_id, status FROM accounts WHERE username = $1',
      [username]
    )
    const account = rows[0]
    if (!account || !(await verifyPassword(password, account.password_hash))) {
      res.status(401).json({ error: 'Sai thông tin đăng nhập' })
      return
    }
    if (account.status === 'suspended') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa' })
      return
    }
    const payload = { accountId: account.id, role: account.role, agentId: account.agent_id }
    const accessToken = signAccessToken(payload)
    const { raw, hash, expiresAt } = generateRefreshToken()
    await pool.query(
      'INSERT INTO refresh_tokens (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [account.id, hash, expiresAt]
    )
    await pool.query('UPDATE accounts SET last_login_at = NOW() WHERE id = $1', [account.id])
    res.json({ accessToken, refreshToken: raw, role: account.role, agentId: account.agent_id })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' })
    return
  }
  try {
    const { rows } = await pool.query(
      `SELECT rt.account_id, rt.expires_at, a.role, a.agent_id, a.status
       FROM refresh_tokens rt
       JOIN accounts a ON a.id = rt.account_id
       WHERE rt.token_hash = $1`,
      [hashToken(refreshToken)]
    )
    const row = rows[0]
    if (!row || new Date(row.expires_at) < new Date()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' })
      return
    }
    if (row.status === 'suspended') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa' })
      return
    }
    // Rotate refresh token: delete old, insert new
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)])
    const { raw: newRaw, hash: newHash, expiresAt: newExpiresAt } = generateRefreshToken()
    await pool.query(
      'INSERT INTO refresh_tokens (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [row.account_id, newHash, newExpiresAt]
    )
    const accessToken = signAccessToken({ accountId: row.account_id, role: row.role, agentId: row.agent_id })
    res.json({ accessToken, refreshToken: newRaw })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)])
  }
  res.json({ ok: true })
})

authRouter.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  res.json(req.account)
})
