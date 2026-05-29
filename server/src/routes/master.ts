import { Router, Response } from 'express'
import { pool } from '../db'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { requireMaster } from '../middleware/requireMaster'

const router = Router()
router.use(authenticate, requireMaster)

function toDate(val: unknown): string {
  return val instanceof Date ? val.toISOString().slice(0, 10) : String(val)
}

router.get('/overview', async (_req: AuthRequest, res: Response) => {
  try {
    const [tablesRes, todayRes, agentsRes, byDayRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS count FROM cloud_tables WHERE status = 'playing'`),
      pool.query(`
        SELECT COUNT(*) AS today_invoices, COALESCE(SUM(final_amount), 0) AS today_revenue
        FROM cloud_invoices WHERE DATE(created_at) = CURRENT_DATE
      `),
      pool.query(`
        SELECT COUNT(DISTINCT agent_id) AS count FROM cloud_invoices
        WHERE DATE(created_at) = CURRENT_DATE
      `),
      pool.query(`
        SELECT DATE(created_at) AS date, COALESCE(SUM(final_amount), 0) AS total
        FROM cloud_invoices
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) ORDER BY date
      `),
    ])
    res.json({
      activeAgents: Number(agentsRes.rows[0].count),
      totalTablesPlaying: Number(tablesRes.rows[0].count),
      todayRevenue: Number(todayRes.rows[0].today_revenue),
      todayInvoices: Number(todayRes.rows[0].today_invoices),
      revenueByDay: byDayRes.rows.map((r) => ({ date: toDate(r.date), total: Number(r.total) })),
    })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/agents', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.id AS "agentId", a.name,
        COALESCE(t.tables_playing, 0)::int AS "tablesPlaying",
        COALESCE(t.total_tables, 0)::int AS "totalTables",
        COALESCE(i.today_revenue, 0) AS "todayRevenue",
        COALESCE(i.today_invoices, 0)::int AS "todayInvoices"
      FROM agents a
      LEFT JOIN (
        SELECT agent_id,
          COUNT(*) AS total_tables,
          COUNT(CASE WHEN status = 'playing' THEN 1 END) AS tables_playing
        FROM cloud_tables
        GROUP BY agent_id
      ) t ON t.agent_id = a.id
      LEFT JOIN (
        SELECT agent_id,
          SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN final_amount ELSE 0 END) AS today_revenue,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) AS today_invoices
        FROM cloud_invoices
        GROUP BY agent_id
      ) i ON i.agent_id = a.id
      ORDER BY COALESCE(i.today_revenue, 0) DESC
    `)
    res.json(rows.map((r) => ({ ...r, todayRevenue: Number(r.todayRevenue) })))
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/agents/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  try {
    const agentRes = await pool.query('SELECT id, name, phone, address FROM agents WHERE id = $1', [id])
    if (!agentRes.rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    const [tablesRes, invoicesRes, byDayRes] = await Promise.all([
      pool.query('SELECT id, name, status, hourly_rate FROM cloud_tables WHERE agent_id = $1 ORDER BY id', [id]),
      pool.query(
        'SELECT invoice_number, final_amount, created_at FROM cloud_invoices WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10',
        [id]
      ),
      pool.query(
        `SELECT DATE(created_at) AS date, SUM(final_amount) AS total
         FROM cloud_invoices
         WHERE agent_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(created_at) ORDER BY date`,
        [id]
      ),
    ])
    res.json({
      agent: agentRes.rows[0],
      tables: tablesRes.rows.map((r) => ({ ...r, hourly_rate: Number(r.hourly_rate) })),
      recentInvoices: invoicesRes.rows.map((r) => ({ ...r, final_amount: Number(r.final_amount) })),
      revenueByDay: byDayRes.rows.map((r) => ({ date: toDate(r.date), total: Number(r.total) })),
    })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/reports', async (req: AuthRequest, res: Response) => {
  const { from, to } = req.query
  if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
    res.status(400).json({ error: 'from and to query params are required' }); return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({ error: 'Invalid date format, use YYYY-MM-DD' }); return
  }
  const fromDt = new Date(from), toDt = new Date(to)
  if (isNaN(fromDt.getTime()) || isNaN(toDt.getTime())) {
    res.status(400).json({ error: 'Invalid date format, use YYYY-MM-DD' }); return
  }
  if (fromDt > toDt) {
    res.status(400).json({ error: 'from must be <= to' }); return
  }
  if ((toDt.getTime() - fromDt.getTime()) / 86_400_000 > 90) {
    res.status(400).json({ error: 'Date range cannot exceed 90 days' }); return
  }
  try {
    const [summaryRes, byAgentRes, byDayRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(final_amount), 0) AS "totalRevenue",
                COUNT(*) AS "totalInvoices",
                COALESCE(AVG(final_amount), 0) AS "avgInvoice"
         FROM cloud_invoices WHERE DATE(created_at) BETWEEN $1 AND $2`,
        [from, to]
      ),
      pool.query(
        `SELECT ci.agent_id AS "agentId", a.name,
                COALESCE(SUM(ci.final_amount), 0) AS revenue, COUNT(*) AS invoices
         FROM cloud_invoices ci JOIN agents a ON a.id = ci.agent_id
         WHERE DATE(ci.created_at) BETWEEN $1 AND $2
         GROUP BY ci.agent_id, a.name ORDER BY revenue DESC`,
        [from, to]
      ),
      pool.query(
        `SELECT DATE(created_at) AS date, SUM(final_amount) AS total
         FROM cloud_invoices WHERE DATE(created_at) BETWEEN $1 AND $2
         GROUP BY DATE(created_at) ORDER BY date`,
        [from, to]
      ),
    ])
    const s = summaryRes.rows[0]
    res.json({
      summary: { totalRevenue: Number(s.totalRevenue), totalInvoices: Number(s.totalInvoices), avgInvoice: Number(s.avgInvoice) },
      byAgent: byAgentRes.rows.map((r) => ({ ...r, revenue: Number(r.revenue), invoices: Number(r.invoices) })),
      byDay: byDayRes.rows.map((r) => ({ date: toDate(r.date), total: Number(r.total) })),
    })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
