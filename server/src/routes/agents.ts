import { Router, Response } from 'express'
import { pool } from '../db'
import { hashPassword, generatePassword } from '../lib/password'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { requireMaster } from '../middleware/requireMaster'

export const agentsRouter = Router()
agentsRouter.use(authenticate, requireMaster)

agentsRouter.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.phone, a.address, a.status, a.created_at,
              ac.username, ac.status AS account_status, ac.last_login_at
       FROM agents a
       JOIN accounts ac ON ac.agent_id = a.id
       ORDER BY a.created_at DESC`
    )
    res.json(rows)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

agentsRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, phone, address, username } = req.body
  if (!name || !username) {
    res.status(400).json({ error: 'name and username required' })
    return
  }
  const password = generatePassword()
  const passwordHash = await hashPassword(password)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [agent] } = await client.query(
      'INSERT INTO agents (name, phone, address) VALUES ($1, $2, $3) RETURNING id',
      [name, phone ?? null, address ?? null]
    )
    await client.query(
      'INSERT INTO accounts (username, password_hash, role, agent_id) VALUES ($1, $2, $3, $4)',
      [username, passwordHash, 'agent', agent.id]
    )
    await client.query('COMMIT')
    res.status(201).json({ agentId: agent.id, username, password })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      res.status(409).json({ error: 'Username already exists' })
    } else {
      res.status(500).json({ error: 'Internal server error' })
    }
  } finally {
    client.release()
  }
})

agentsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.phone, a.address, a.status, a.created_at,
              ac.username, ac.status AS account_status, ac.last_login_at
       FROM agents a
       JOIN accounts ac ON ac.agent_id = a.id
       WHERE a.id = $1`,
      [req.params.id]
    )
    if (!rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    res.json(rows[0])
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

agentsRouter.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, phone, address, status } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE agents
       SET name    = COALESCE($1, name),
           phone   = COALESCE($2, phone),
           address = COALESCE($3, address),
           status  = COALESCE($4, status)
       WHERE id = $5 RETURNING id`,
      [name ?? null, phone ?? null, address ?? null, status ?? null, req.params.id]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    if (status) {
      await client.query('UPDATE accounts SET status = $1 WHERE agent_id = $2', [status, req.params.id])
    }
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

agentsRouter.post('/:id/reset-password', async (req: AuthRequest, res: Response) => {
  try {
    const password = generatePassword()
    const passwordHash = await hashPassword(password)
    const { rows } = await pool.query(
      'UPDATE accounts SET password_hash = $1 WHERE agent_id = $2 RETURNING id',
      [passwordHash, req.params.id]
    )
    if (!rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    await pool.query('DELETE FROM refresh_tokens WHERE account_id = $1', [rows[0].id])
    res.json({ password })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
