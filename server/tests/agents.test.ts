import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

vi.mock('../src/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}))

import { pool } from '../src/db'
import { agentsRouter } from '../src/routes/agents'
import { signAccessToken } from '../src/lib/jwt'

const mockQuery = pool.query as ReturnType<typeof vi.fn>
const mockConnect = pool.connect as ReturnType<typeof vi.fn>

const masterToken = () => signAccessToken({ accountId: 'uid1', role: 'master', agentId: null })
const agentToken = () => signAccessToken({ accountId: 'uid2', role: 'agent', agentId: 'a1' })

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/agents', agentsRouter)
  return app
}

describe('GET /agents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 không có auth', async () => {
    const res = await request(makeApp()).get('/agents')
    expect(res.status).toBe(401)
  })

  it('403 với role agent', async () => {
    const res = await request(makeApp()).get('/agents').set('Authorization', `Bearer ${agentToken()}`)
    expect(res.status).toBe(403)
  })

  it('200 trả về danh sách agents cho master', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Quán ABC', username: 'quan_abc' }] })
    const res = await request(makeApp()).get('/agents').set('Authorization', `Bearer ${masterToken()}`)
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('Quán ABC')
  })
})

describe('POST /agents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 khi thiếu name', async () => {
    const res = await request(makeApp())
      .post('/agents').set('Authorization', `Bearer ${masterToken()}`).send({ username: 'x' })
    expect(res.status).toBe(400)
  })

  it('201 tạo agent và trả về generated password', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'new-id' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined),
      release: vi.fn()
    }
    mockConnect.mockResolvedValueOnce(client)
    const res = await request(makeApp())
      .post('/agents').set('Authorization', `Bearer ${masterToken()}`)
      .send({ name: 'Quán XYZ', username: 'quan_xyz' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('password')
    expect(res.body.username).toBe('quan_xyz')
  })

  it('409 khi username trùng', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'aid' }] })
        .mockRejectedValueOnce({ code: '23505' }),
      release: vi.fn()
    }
    mockConnect.mockResolvedValueOnce(client)
    const res = await request(makeApp())
      .post('/agents').set('Authorization', `Bearer ${masterToken()}`)
      .send({ name: 'Quán XYZ', username: 'quan_xyz' })
    expect(res.status).toBe(409)
  })
})

describe('PATCH /agents/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 suspend agent và sync account status', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)        // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'a1' }] }) // UPDATE agents
        .mockResolvedValueOnce({ rows: [] })     // UPDATE accounts
        .mockResolvedValueOnce(undefined),       // COMMIT
      release: vi.fn()
    }
    mockConnect.mockResolvedValueOnce(client)
    const res = await request(makeApp())
      .patch('/agents/a1').set('Authorization', `Bearer ${masterToken()}`)
      .send({ status: 'suspended' })
    expect(res.status).toBe(200)
    expect(client.query).toHaveBeenCalledTimes(4)
  })

  it('404 khi agent không tồn tại', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)    // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE agents returns nothing
        .mockResolvedValueOnce(undefined),   // ROLLBACK
      release: vi.fn()
    }
    mockConnect.mockResolvedValueOnce(client)
    const res = await request(makeApp())
      .patch('/agents/unknown').set('Authorization', `Bearer ${masterToken()}`)
      .send({ status: 'suspended' })
    expect(res.status).toBe(404)
  })
})

describe('POST /agents/:id/reset-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 trả về password mới và xóa refresh tokens', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'account-id' }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp())
      .post('/agents/a1/reset-password').set('Authorization', `Bearer ${masterToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('password')
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })
})
