// server/src/routes/agentPortal.ts
import { Router, Response } from 'express'
import { pool } from '../db'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { requireAgent } from '../middleware/requireAgent'

const router = Router()
router.use(authenticate, requireAgent)

const VN = `+ INTERVAL '7 hours'`

// GET /agent/tables — danh sách bàn + active session
router.get('/tables', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.status, t.hourly_rate,
            s.id AS session_id, s.start_time, s.customer_id
     FROM cloud_tables t
     LEFT JOIN cloud_sessions s ON s.table_id = t.id AND s.status = 'open' AND s.agent_id = $1
     WHERE t.agent_id = $1
     ORDER BY t.name`,
    [agentId]
  )
  res.json(rows)
})

// GET /agent/invoices
router.get('/invoices', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Number(req.query.pageSize) || 20)
  const offset = (page - 1) * pageSize
  const { fromDate, toDate } = req.query as Record<string, string>

  const [rows, countRows] = await Promise.all([
    pool.query(
      `SELECT i.id, i.invoice_number, i.play_amount, i.items_amount, i.final_amount,
              i.discount, i.points_redeemed, i.discount_from_points, i.promotions_applied,
              i.payment_method, i.completed_by, i.created_at,
              t.name AS table_name,
              c.name AS customer_name, c.phone AS customer_phone
       FROM cloud_invoices i
       LEFT JOIN cloud_sessions s ON s.id = i.session_id
       LEFT JOIN cloud_tables t ON t.id = s.table_id
       LEFT JOIN cloud_customers c ON c.id = COALESCE(i.customer_id, s.customer_id)
       WHERE i.agent_id = $1
         AND ($2::date IS NULL OR DATE(i.created_at ${VN}) >= $2)
         AND ($3::date IS NULL OR DATE(i.created_at ${VN}) <= $3)
       ORDER BY i.created_at DESC
       LIMIT $4 OFFSET $5`,
      [agentId, fromDate || null, toDate || null, pageSize, offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM cloud_invoices i
       WHERE i.agent_id = $1
         AND ($2::date IS NULL OR DATE(i.created_at ${VN}) >= $2)
         AND ($3::date IS NULL OR DATE(i.created_at ${VN}) <= $3)`,
      [agentId, fromDate || null, toDate || null]
    ),
  ])
  res.json({ data: rows.rows, total: parseInt(countRows.rows[0].count, 10) })
})

// GET /agent/invoices/:id
router.get('/invoices/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const [invoiceRows, itemRows] = await Promise.all([
    pool.query(
      `SELECT i.*, t.name AS table_name, c.name AS customer_name, c.phone AS customer_phone
       FROM cloud_invoices i
       LEFT JOIN cloud_sessions s ON s.id = i.session_id
       LEFT JOIN cloud_tables t ON t.id = s.table_id
       LEFT JOIN cloud_customers c ON c.id = COALESCE(i.customer_id, s.customer_id)
       WHERE i.id = $1 AND i.agent_id = $2`,
      [req.params.id, agentId]
    ),
    pool.query(
      `SELECT oi.quantity, oi.unit_price, oi.subtotal, p.name AS product_name
       FROM cloud_order_items oi
       JOIN cloud_products p ON p.id = oi.product_id
       WHERE oi.session_id = (SELECT session_id FROM cloud_invoices WHERE id = $1 AND agent_id = $2)
         AND oi.agent_id = $2`,
      [req.params.id, agentId]
    ),
  ])
  if (!invoiceRows.rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ invoice: invoiceRows.rows[0], items: itemRows.rows })
})

// GET /agent/reports/summary
router.get('/reports/summary', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { fromDate, toDate } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(final_amount),0) AS total_revenue,
       COUNT(*) AS invoice_count,
       COALESCE(SUM(play_amount),0) AS play_revenue,
       COALESCE(SUM(items_amount),0) AS items_revenue
     FROM cloud_invoices
     WHERE agent_id = $1
       AND ($2::date IS NULL OR DATE(created_at ${VN}) >= $2)
       AND ($3::date IS NULL OR DATE(created_at ${VN}) <= $3)`,
    [agentId, fromDate || null, toDate || null]
  )
  res.json(rows[0])
})

// GET /agent/reports/revenue
router.get('/reports/revenue', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { fromDate, toDate } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT DATE(created_at ${VN}) AS date,
            COALESCE(SUM(final_amount),0) AS total,
            COUNT(*) AS count
     FROM cloud_invoices
     WHERE agent_id = $1
       AND DATE(created_at ${VN}) >= COALESCE($2::date, CURRENT_DATE - 6)
       AND DATE(created_at ${VN}) <= COALESCE($3::date, CURRENT_DATE)
     GROUP BY DATE(created_at ${VN})
     ORDER BY date`,
    [agentId, fromDate || null, toDate || null]
  )
  res.json(rows)
})

// GET /agent/products
router.get('/products', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query(
    `SELECT p.*, cat.name AS category_name, cat.icon AS category_icon
     FROM cloud_products p
     LEFT JOIN cloud_categories cat ON cat.name = p.category AND cat.agent_id = $1
     WHERE p.agent_id = $1 ORDER BY p.name`,
    [agentId]
  )
  res.json(rows)
})

// POST /agent/products
router.post('/products', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, category_id, price, unit, min_stock_alert, product_type } = req.body
  if (!name || !price) { res.status(400).json({ error: 'name and price required' }); return }
  const catName = category_id
    ? (await pool.query('SELECT name FROM cloud_categories WHERE id=$1 AND agent_id=$2', [category_id, agentId])).rows[0]?.name ?? ''
    : ''
  const { rows } = await pool.query(
    `INSERT INTO cloud_products (agent_id, id, name, category, price, unit, min_stock_alert)
     SELECT $1, COALESCE(MAX(id),0)+1, $2, $3, $4, $5, $6
     FROM cloud_products WHERE agent_id=$1
     RETURNING *`,
    [agentId, name, catName, price, unit || 'cái', min_stock_alert || 5]
  )
  res.status(201).json(rows[0])
})

// PUT /agent/products/:id
router.put('/products/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, price, unit, min_stock_alert, is_active, category_id } = req.body
  const catName = category_id
    ? (await pool.query('SELECT name FROM cloud_categories WHERE id=$1 AND agent_id=$2', [category_id, agentId])).rows[0]?.name ?? ''
    : ''
  const { rows } = await pool.query(
    `UPDATE cloud_products SET name=$3, category=$4, price=$5, unit=$6, min_stock_alert=$7, is_active=$8
     WHERE id=$1 AND agent_id=$2 RETURNING *`,
    [req.params.id, agentId, name, catName, price, unit, min_stock_alert, is_active ?? true]
  )
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  res.json(rows[0])
})

// DELETE /agent/products/:id
router.delete('/products/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  await pool.query('DELETE FROM cloud_products WHERE id=$1 AND agent_id=$2', [req.params.id, agentId])
  res.json({ success: true })
})

// GET /agent/categories
router.get('/categories', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query('SELECT * FROM cloud_categories WHERE agent_id=$1 ORDER BY name', [agentId])
  res.json(rows)
})

// POST /agent/categories
router.post('/categories', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, icon } = req.body
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const { rows } = await pool.query(
    'INSERT INTO cloud_categories (agent_id, name, icon) VALUES ($1,$2,$3) RETURNING *',
    [agentId, name, icon || '📦']
  )
  res.status(201).json(rows[0])
})

// PUT /agent/categories/:id
router.put('/categories/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, icon } = req.body
  const { rows } = await pool.query(
    'UPDATE cloud_categories SET name=$3, icon=$4 WHERE id=$1 AND agent_id=$2 RETURNING *',
    [req.params.id, agentId, name, icon || '📦']
  )
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  res.json(rows[0])
})

// DELETE /agent/categories/:id
router.delete('/categories/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query('SELECT COUNT(*) AS cnt FROM cloud_products WHERE category_id=$1 AND agent_id=$2', [req.params.id, agentId])
  if (parseInt(rows[0].cnt, 10) > 0) { res.status(409).json({ error: 'Danh mục đang được sử dụng' }); return }
  await pool.query('DELETE FROM cloud_categories WHERE id=$1 AND agent_id=$2', [req.params.id, agentId])
  res.json({ success: true })
})

// GET /agent/staff
router.get('/staff', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query(
    'SELECT id, username, allowed_screens, is_active, created_at FROM cloud_staff WHERE agent_id=$1 ORDER BY created_at',
    [agentId]
  )
  res.json(rows)
})

// POST /agent/staff
router.post('/staff', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { username, password, allowedScreens } = req.body
  if (!username || !password) { res.status(400).json({ error: 'username and password required' }); return }
  const bcrypt = await import('bcrypt')
  const hash = await bcrypt.hash(password, 10)
  try {
    const { rows } = await pool.query(
      `INSERT INTO cloud_staff (agent_id, username, password_hash, allowed_screens)
       VALUES ($1,$2,$3,$4) RETURNING id, username, allowed_screens, is_active, created_at`,
      [agentId, username, hash, allowedScreens || []]
    )
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' }); return }
    throw err
  }
})

// PUT /agent/staff/:id
router.put('/staff/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { password, allowedScreens, is_active } = req.body
  let query: string
  let params: unknown[]
  if (password) {
    const bcrypt = await import('bcrypt')
    const hash = await bcrypt.hash(password, 10)
    query = `UPDATE cloud_staff SET password_hash=$3, allowed_screens=$4, is_active=$5
             WHERE id=$1 AND agent_id=$2 RETURNING id, username, allowed_screens, is_active, created_at`
    params = [req.params.id, agentId, hash, allowedScreens || [], is_active ?? true]
  } else {
    query = `UPDATE cloud_staff SET allowed_screens=$3, is_active=$4
             WHERE id=$1 AND agent_id=$2 RETURNING id, username, allowed_screens, is_active, created_at`
    params = [req.params.id, agentId, allowedScreens || [], is_active ?? true]
  }
  const { rows } = await pool.query(query, params)
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  res.json(rows[0])
})

// DELETE /agent/staff/:id
router.delete('/staff/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  await pool.query('DELETE FROM cloud_staff WHERE id=$1 AND agent_id=$2', [req.params.id, agentId])
  res.json({ success: true })
})

// GET /agent/promotions
router.get('/promotions', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query('SELECT * FROM promotions WHERE agent_id=$1 ORDER BY created_at DESC', [agentId])
  res.json(rows)
})

// POST /agent/promotions
router.post('/promotions', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, type, discount_type, discount_value, apply_to, max_discount, code, max_uses, days_of_week, time_from, time_to, valid_from, valid_to, is_active } = req.body
  try {
    const { rows } = await pool.query(
      `INSERT INTO promotions (agent_id,name,type,discount_type,discount_value,apply_to,max_discount,code,max_uses,days_of_week,time_from,time_to,valid_from,valid_to,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [agentId, name, type, discount_type, discount_value, apply_to||'total', max_discount||null, code||null, max_uses||null, days_of_week||null, time_from||null, time_to||null, valid_from||null, valid_to||null, is_active??true]
    )
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: 'Mã đã tồn tại' }); return }
    throw err
  }
})

// PUT /agent/promotions/:id
router.put('/promotions/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const ALLOWED = new Set(['name','discount_type','discount_value','apply_to','max_discount','code','max_uses','days_of_week','time_from','time_to','valid_from','valid_to','is_active'])
  const entries = Object.entries(req.body).filter(([k]) => ALLOWED.has(k))
  if (!entries.length) { res.status(400).json({ error: 'No valid fields' }); return }
  const fields = entries.map(([k], i) => `${k}=$${i+3}`).join(',')
  const values = entries.map(([,v]) => v)
  const { rows } = await pool.query(
    `UPDATE promotions SET ${fields} WHERE id=$1 AND agent_id=$2 RETURNING *`,
    [req.params.id, agentId, ...values]
  )
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  res.json(rows[0])
})

// DELETE /agent/promotions/:id
router.delete('/promotions/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  await pool.query('DELETE FROM promotions WHERE id=$1 AND agent_id=$2', [req.params.id, agentId])
  res.json({ success: true })
})

// GET /agent/settings
router.get('/settings', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query('SELECT key, value FROM cloud_settings WHERE agent_id=$1', [agentId])
  res.json(rows)
})

// PUT /agent/settings
router.put('/settings', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const updates: { key: string; value: string }[] = req.body
  if (!Array.isArray(updates) || !updates.length) { res.status(400).json({ error: 'Array of {key,value} required' }); return }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const { key, value } of updates) {
      await client.query(
        `INSERT INTO cloud_settings (agent_id, key, value) VALUES ($1,$2,$3)
         ON CONFLICT (agent_id, key) DO UPDATE SET value=$3`,
        [agentId, key, value]
      )
    }
    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

export default router
