import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

vi.mock('../src/db', () => ({
  pool: { query: vi.fn() }
}))

import { pool } from '../src/db'
import { authRouter } from '../src/routes/auth'
import { hashPassword } from '../src/lib/password'
import { generateRefreshToken } from '../src/lib/jwt'

const mockQuery = pool.query as ReturnType<typeof vi.fn>

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRouter)
  return app
}

describe('POST /auth/login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 khi thiếu body', async () => {
    const res = await request(makeApp()).post('/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('401 khi username không tồn tại', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'x', password: 'y' })
    expect(res.status).toBe(401)
  })

  it('401 khi sai password', async () => {
    const hash = await hashPassword('correct')
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uid1', password_hash: hash, role: 'master', agent_id: null, status: 'active' }]
    })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'master', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('403 khi account bị suspended', async () => {
    const hash = await hashPassword('pass')
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uid1', password_hash: hash, role: 'agent', agent_id: 'a1', status: 'suspended' }]
    })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'agent1', password: 'pass' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Tài khoản đã bị khóa')
  })

  it('200 với accessToken + refreshToken khi login thành công', async () => {
    const hash = await hashPassword('pass')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'uid1', password_hash: hash, role: 'master', agent_id: null, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'master', password: 'pass' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body.role).toBe('master')
  })
})

describe('POST /auth/refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 khi thiếu refreshToken', async () => {
    const res = await request(makeApp()).post('/auth/refresh').send({})
    expect(res.status).toBe(400)
  })

  it('401 khi token không tồn tại trong DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp()).post('/auth/refresh').send({ refreshToken: 'bad' })
    expect(res.status).toBe(401)
  })

  it('200 với accessToken và refreshToken mới cho refresh token hợp lệ', async () => {
    const { raw } = generateRefreshToken()
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          account_id: 'uid1',
          expires_at: new Date(Date.now() + 1_000_000),
          role: 'master',
          agent_id: null,
          status: 'active'
        }]
      })
      .mockResolvedValueOnce({ rows: [] }) // DELETE old token
      .mockResolvedValueOnce({ rows: [] }) // INSERT new token
    const res = await request(makeApp()).post('/auth/refresh').send({ refreshToken: raw })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
  })
})

describe('POST /auth/logout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 khi không có Authorization header', async () => {
    const res = await request(makeApp()).post('/auth/logout').send({})
    expect(res.status).toBe(401)
  })

  it('200 khi có valid token', async () => {
    const hash = await hashPassword('pass')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'uid1', password_hash: hash, role: 'master', agent_id: null, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { body: { accessToken, refreshToken } } = await request(makeApp())
      .post('/auth/login').send({ username: 'master', password: 'pass' })

    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
