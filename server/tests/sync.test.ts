import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { pool } from '../src/db'

vi.mock('../src/db', () => ({ pool: { connect: vi.fn() } }))
vi.mock('../src/lib/jwt', () => ({ verifyAccessToken: vi.fn() }))

import { verifyAccessToken } from '../src/lib/jwt'

const AGENT = { accountId: 'acc-1', role: 'agent', agentId: 'agent-uuid-1' }
const MASTER = { accountId: 'acc-2', role: 'master', agentId: null }

describe('POST /api/v1/sync/batch', () => {
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockClient = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }
    vi.mocked(pool).connect = vi.fn().mockResolvedValue(mockClient)
    vi.mocked(verifyAccessToken).mockReturnValue(AGENT as any)
  })

  it('401 nếu không có Authorization header', async () => {
    const res = await request(app).post('/api/v1/sync/batch').send({ records: [{}] })
    expect(res.status).toBe(401)
  })

  it('403 nếu role là master', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(MASTER as any)
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({ records: [{ table: 'invoices', operation: 'insert', id: 1, payload: { id: 1 } }] })
    expect(res.status).toBe(403)
  })

  it('400 nếu records không tồn tại', async () => {
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({})
    expect(res.status).toBe(400)
  })

  it('400 nếu records là mảng rỗng', async () => {
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({ records: [] })
    expect(res.status).toBe(400)
  })

  it('400 nếu records > 100', async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({
      table: 'invoices', operation: 'insert', id: i, payload: { id: i },
    }))
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({ records })
    expect(res.status).toBe(400)
  })

  it('400 nếu table name không hợp lệ', async () => {
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({ records: [{ table: 'evil_table', operation: 'insert', id: 1, payload: {} }] })
    expect(res.status).toBe(400)
  })

  it('200 với insert operation — UPSERT và COMMIT', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // UPSERT
      .mockResolvedValueOnce({}) // COMMIT
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({
        records: [{ table: 'invoices', operation: 'insert', id: 42, payload: { id: 42, final_amount: 100000 } }],
      })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ synced: 1, failed: 0 })
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
  })

  it('200 với delete operation — gọi DELETE', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // DELETE
      .mockResolvedValueOnce({}) // COMMIT
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({ records: [{ table: 'order_items', operation: 'delete', id: 7, payload: {} }] })
    expect(res.status).toBe(200)
    const deleteSql: string = mockClient.query.mock.calls[1][0]
    expect(deleteSql).toContain('DELETE FROM cloud_order_items')
  })

  it('500 và ROLLBACK nếu transaction thất bại', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                    // BEGIN
      .mockRejectedValueOnce(new Error('DB error')) // UPSERT fails
    const res = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer token')
      .send({ records: [{ table: 'invoices', operation: 'insert', id: 1, payload: { id: 1 } }] })
    expect(res.status).toBe(500)
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    expect(mockClient.release).toHaveBeenCalled()
  })
})
