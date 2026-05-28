import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { pool } from '../src/db'

vi.mock('../src/db', () => ({ pool: { query: vi.fn() } }))
vi.mock('../src/lib/jwt', () => ({ verifyAccessToken: vi.fn() }))

import { verifyAccessToken } from '../src/lib/jwt'

const MASTER = { accountId: 'acc-1', role: 'master', agentId: null }
const AGENT  = { accountId: 'acc-2', role: 'agent',  agentId: 'agent-uuid-1' }

describe('GET /api/v1/master/overview', () => {
  beforeEach(() => { vi.mocked(verifyAccessToken).mockReturnValue(MASTER as any) })

  it('401 nếu không có Authorization header', async () => {
    const res = await request(app).get('/api/v1/master/overview')
    expect(res.status).toBe(401)
  })

  it('403 nếu role là agent', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(AGENT as any)
    const res = await request(app).get('/api/v1/master/overview').set('Authorization', 'Bearer t')
    expect(res.status).toBe(403)
  })

  it('200 với data đúng shape', async () => {
    vi.mocked(pool).query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ today_invoices: '12', today_revenue: '2500000' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-05-28', total: '1200000' }] })
    const res = await request(app).get('/api/v1/master/overview').set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ activeAgents: 3, totalTablesPlaying: 5, todayRevenue: 2500000, todayInvoices: 12 })
    expect(res.body.revenueByDay).toHaveLength(1)
  })
})

describe('GET /api/v1/master/agents', () => {
  beforeEach(() => { vi.mocked(verifyAccessToken).mockReturnValue(MASTER as any) })

  it('200 trả về danh sách agents', async () => {
    vi.mocked(pool).query = vi.fn().mockResolvedValueOnce({
      rows: [{ agentId: 'uuid-1', name: 'Quán A', tablesPlaying: 3, totalTables: 8, todayRevenue: '1800000', todayInvoices: 12 }],
    })
    const res = await request(app).get('/api/v1/master/agents').set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].todayRevenue).toBe(1800000)
  })
})

describe('GET /api/v1/master/agents/:id', () => {
  beforeEach(() => { vi.mocked(verifyAccessToken).mockReturnValue(MASTER as any) })

  it('404 nếu agent không tồn tại', async () => {
    vi.mocked(pool).query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get('/api/v1/master/agents/nonexistent').set('Authorization', 'Bearer t')
    expect(res.status).toBe(404)
  })

  it('200 trả về chi tiết agent', async () => {
    vi.mocked(pool).query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', name: 'Quán A', phone: null, address: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bàn 1', status: 'idle', hourly_rate: 50000 }] })
      .mockResolvedValueOnce({ rows: [{ invoice_number: '00001', final_amount: '150000', created_at: '2026-05-28T10:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get('/api/v1/master/agents/uuid-1').set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.agent.name).toBe('Quán A')
    expect(res.body.tables).toHaveLength(1)
    expect(res.body.recentInvoices[0].final_amount).toBe(150000)
    expect(res.body.revenueByDay).toHaveLength(0)
  })
})

describe('GET /api/v1/master/reports', () => {
  beforeEach(() => { vi.mocked(verifyAccessToken).mockReturnValue(MASTER as any) })

  it('400 nếu thiếu from/to', async () => {
    const res = await request(app).get('/api/v1/master/reports').set('Authorization', 'Bearer t')
    expect(res.status).toBe(400)
  })

  it('400 nếu date format sai', async () => {
    const res = await request(app)
      .get('/api/v1/master/reports?from=not-a-date&to=2026-05-28')
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(400)
  })

  it('400 nếu from > to', async () => {
    const res = await request(app)
      .get('/api/v1/master/reports?from=2026-05-28&to=2026-05-01')
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(400)
  })

  it('400 nếu range > 90 ngày', async () => {
    const res = await request(app)
      .get('/api/v1/master/reports?from=2026-01-01&to=2026-12-31')
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(400)
  })

  it('200 với date range hợp lệ', async () => {
    vi.mocked(pool).query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ totalRevenue: '5000000', totalInvoices: '50', avgInvoice: '100000' }] })
      .mockResolvedValueOnce({ rows: [{ agentId: 'uuid-1', name: 'Quán A', revenue: '5000000', invoices: '50' }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-05-28', total: '1000000' }] })
    const res = await request(app)
      .get('/api/v1/master/reports?from=2026-05-01&to=2026-05-28')
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.summary.totalRevenue).toBe(5000000)
    expect(res.body.byAgent).toHaveLength(1)
    expect(res.body.byDay).toHaveLength(1)
  })
})
