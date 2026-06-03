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

// GET /agent/reports/tables
router.get('/reports/tables', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { fromDate, toDate } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT t.name AS table_name,
            COUNT(s.id) AS session_count,
            COALESCE(SUM(i.final_amount),0) AS total_revenue,
            COALESCE(AVG(s.duration_minutes),0) AS avg_duration_minutes
     FROM cloud_sessions s
     JOIN cloud_tables t ON t.id = s.table_id AND t.agent_id = $1
     JOIN cloud_invoices i ON i.session_id = s.id AND i.agent_id = $1
     WHERE s.agent_id = $1
       AND ($2::date IS NULL OR DATE(s.start_time ${VN}) >= $2)
       AND ($3::date IS NULL OR DATE(s.start_time ${VN}) <= $3)
     GROUP BY t.id, t.name
     ORDER BY total_revenue DESC`,
    [agentId, fromDate || null, toDate || null]
  )
  res.json(rows)
})

// GET /agent/reports/products
router.get('/reports/products', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { fromDate, toDate } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT p.name AS product_name,
            COALESCE(c.name, 'Khác') AS category_name,
            COALESCE(c.icon, '📦') AS category_icon,
            SUM(oi.quantity) AS total_qty,
            COALESCE(SUM(oi.subtotal),0) AS total_revenue
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id AND p.agent_id = $1
     LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = $1
     JOIN cloud_invoices i ON i.session_id = oi.session_id AND i.agent_id = $1
     WHERE oi.agent_id = $1
       AND ($2::date IS NULL OR DATE(i.created_at ${VN}) >= $2)
       AND ($3::date IS NULL OR DATE(i.created_at ${VN}) <= $3)
     GROUP BY p.id, p.name, c.name, c.icon
     ORDER BY total_revenue DESC
     LIMIT 50`,
    [agentId, fromDate || null, toDate || null]
  )
  res.json(rows)
})

// GET /agent/reports/staff
router.get('/reports/staff', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { fromDate, toDate } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT i.completed_by AS staff_name,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(i.final_amount),0) AS total_revenue,
            COALESCE(SUM(i.play_amount),0) AS play_revenue,
            COALESCE(SUM(i.items_amount),0) AS items_revenue
     FROM cloud_invoices i
     WHERE i.agent_id = $1
       AND i.completed_by IS NOT NULL
       AND ($2::date IS NULL OR DATE(i.created_at ${VN}) >= $2)
       AND ($3::date IS NULL OR DATE(i.created_at ${VN}) <= $3)
     GROUP BY i.completed_by
     ORDER BY total_revenue DESC`,
    [agentId, fromDate || null, toDate || null]
  )
  res.json(rows)
})

// GET /agent/reports/lowstock
router.get('/reports/lowstock', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.stock_quantity, p.min_stock_alert, p.unit,
            COALESCE(c.name, 'Khác') AS category_name,
            COALESCE(c.icon, '📦') AS category_icon
     FROM cloud_products p
     LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = $1
     WHERE p.agent_id = $1
       AND p.is_active = TRUE
       AND p.product_type = 'stock'
       AND p.stock_quantity <= p.min_stock_alert
     ORDER BY p.stock_quantity ASC`,
    [agentId]
  )
  res.json(rows)
})

// GET /agent/products
router.get('/products', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { rows } = await pool.query(
    `SELECT p.*, cat.name AS category_name, cat.icon AS category_icon
     FROM cloud_products p
     LEFT JOIN cloud_categories cat ON cat.id = p.category_id AND cat.agent_id = $1
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
  const { rows } = await pool.query(
    `INSERT INTO cloud_products (agent_id, id, name, category_id, price, unit, min_stock_alert, product_type)
     SELECT $1, COALESCE(MAX(id),0)+1, $2, $3, $4, $5, $6, $7
     FROM cloud_products WHERE agent_id=$1
     RETURNING *`,
    [agentId, name, category_id || null, price, unit || 'cái', min_stock_alert || 5, product_type || 'stock']
  )
  res.status(201).json(rows[0])
})

// PUT /agent/products/:id
router.put('/products/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, price, unit, min_stock_alert, is_active, category_id } = req.body
  const { rows } = await pool.query(
    `UPDATE cloud_products SET name=$3, category_id=$4, price=$5, unit=$6, min_stock_alert=$7, is_active=$8
     WHERE id=$1 AND agent_id=$2 RETURNING *`,
    [req.params.id, agentId, name, category_id || null, price, unit, min_stock_alert, is_active ?? true]
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
  const [cloudRows, agentRow, loyaltyRow] = await Promise.all([
    pool.query('SELECT key, value FROM cloud_settings WHERE agent_id=$1', [agentId]),
    pool.query('SELECT name, phone, address FROM agents WHERE id=$1', [agentId]),
    pool.query('SELECT points_per_10k_vnd, vnd_per_point FROM cloud_loyalty_settings WHERE agent_id=$1 LIMIT 1', [agentId]),
  ])
  const rows: { key: string; value: string }[] = cloudRows.rows.filter(
    (r: { key: string }) => !['shop_name','address','phone'].includes(r.key)
  )
  const agent = agentRow.rows[0]
  if (agent) {
    rows.push({ key: 'shop_name', value: agent.name ?? '' })
    rows.push({ key: 'address', value: agent.address ?? '' })
    rows.push({ key: 'phone', value: agent.phone ?? '' })
  }
  const loyalty = loyaltyRow.rows[0]
  if (loyalty) {
    rows.push({ key: 'points_per_10k_vnd', value: String(loyalty.points_per_10k_vnd ?? 1) })
    rows.push({ key: 'vnd_per_point', value: String(loyalty.vnd_per_point ?? 100) })
  } else {
    rows.push({ key: 'points_per_10k_vnd', value: '1' })
    rows.push({ key: 'vnd_per_point', value: '100' })
  }
  res.json(rows)
})

// PUT /agent/settings
const AGENT_KEYS = new Set(['shop_name', 'address', 'phone'])
const LOYALTY_KEYS = new Set(['points_per_10k_vnd', 'vnd_per_point'])

router.put('/settings', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const updates: { key: string; value: string }[] = req.body
  if (!Array.isArray(updates) || !updates.length) { res.status(400).json({ error: 'Array of {key,value} required' }); return }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const { key, value } of updates) {
      if (AGENT_KEYS.has(key)) {
        const col = key === 'shop_name' ? 'name' : key
        await client.query(`UPDATE agents SET ${col}=$1 WHERE id=$2`, [value, agentId])
      } else if (LOYALTY_KEYS.has(key)) {
        await client.query(
          `INSERT INTO cloud_loyalty_settings (agent_id, ${key}) VALUES ($1,$2)
           ON CONFLICT (agent_id) DO UPDATE SET ${key}=$2`,
          [agentId, Number(value) || 0]
        )
      } else {
        await client.query(
          `INSERT INTO cloud_settings (agent_id, key, value) VALUES ($1,$2,$3)
           ON CONFLICT (agent_id, key) DO UPDATE SET value=$3`,
          [agentId, key, value]
        )
      }
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

// POST /agent/invoices/:id/edit-requests
router.post('/invoices/:id/edit-requests', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { requested_by, new_items, note } = req.body
  if (!requested_by || !Array.isArray(new_items)) {
    res.status(400).json({ error: 'requested_by and new_items required' }); return
  }

  const validItems = new_items.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false
    const i = item as Record<string, unknown>
    return typeof i.product_id === 'number' &&
      typeof i.quantity === 'number' && i.quantity > 0 &&
      typeof i.unit_price === 'number' && i.unit_price >= 0 &&
      typeof i.subtotal === 'number' && i.subtotal >= 0
  })
  if (!validItems) {
    res.status(400).json({ error: 'new_items must be array of {product_id, quantity, unit_price, subtotal}' }); return
  }

  const invoiceRow = await pool.query(
    `SELECT id, session_id FROM cloud_invoices
     WHERE id=$1 AND agent_id=$2
       AND DATE(created_at ${VN}) = CURRENT_DATE`,
    [req.params.id, agentId]
  )
  if (!invoiceRow.rows[0]) {
    res.status(404).json({ error: 'Hóa đơn không tồn tại hoặc không trong ngày hôm nay' }); return
  }

  const existing = await pool.query(
    `SELECT id FROM invoice_edit_requests
     WHERE invoice_id=$1 AND agent_id=$2 AND status='pending'`,
    [req.params.id, agentId]
  )
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Đã có yêu cầu chỉnh sửa đang chờ duyệt' }); return
  }

  const { session_id } = invoiceRow.rows[0]

  const oldItemsRow = await pool.query(
    `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id AND p.agent_id = $2
     WHERE oi.session_id=$1 AND oi.agent_id=$2`,
    [session_id, agentId]
  )

  const { rows } = await pool.query(
    `INSERT INTO invoice_edit_requests
       (agent_id, invoice_id, session_id, requested_by, old_items, new_items, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [agentId, req.params.id, session_id, requested_by, JSON.stringify(oldItemsRow.rows), JSON.stringify(new_items), note || null]
  )
  res.status(201).json(rows[0])
})

// GET /agent/edit-requests
router.get('/edit-requests', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { status } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT r.*, i.invoice_number
     FROM invoice_edit_requests r
     JOIN cloud_invoices i ON i.id = r.invoice_id AND i.agent_id = $1
     WHERE r.agent_id = $1
       AND ($2::varchar IS NULL OR r.status = $2)
     ORDER BY r.created_at DESC
     LIMIT 100`,
    [agentId, status || null]
  )
  res.json(rows)
})

// PUT /agent/edit-requests/:id/approve
router.put('/edit-requests/:id/approve', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const reviewed_by = req.body.reviewed_by ?? 'agent'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const reqRow = await client.query(
      `SELECT * FROM invoice_edit_requests WHERE id=$1 AND agent_id=$2 AND status='pending' FOR UPDATE`,
      [req.params.id, agentId]
    )
    if (!reqRow.rows[0]) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }); return
    }

    const editReq = reqRow.rows[0]
    const newItems: { product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[] = editReq.new_items
    const oldItems: { product_id: number; quantity: number }[] = editReq.old_items
    const sessionId: number = editReq.session_id
    const invoiceId: number = editReq.invoice_id

    // Bảo vệ: yêu cầu cũ có thể chứa item thiếu product_id (dữ liệu lỗi) — không cho approve để tránh INSERT null
    const invalidItem = newItems.some(i =>
      typeof i.product_id !== 'number' ||
      typeof i.quantity !== 'number' || i.quantity <= 0 ||
      typeof i.unit_price !== 'number' || i.unit_price < 0 ||
      typeof i.subtotal !== 'number' || i.subtotal < 0
    )
    if (invalidItem) {
      await client.query('ROLLBACK')
      res.status(422).json({ error: 'Yêu cầu chứa dữ liệu sản phẩm không hợp lệ, không thể duyệt. Vui lòng từ chối và tạo lại yêu cầu.' }); return
    }

    const allProductIds = new Set([...oldItems.map(i => i.product_id), ...newItems.map(i => i.product_id)])

    const maxStockTxIdRow = await client.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM cloud_stock_transactions WHERE agent_id=$1`,
      [agentId]
    )
    let nextStockTxId: number = maxStockTxIdRow.rows[0].max_id + 1

    for (const productId of allProductIds) {
      const oldQty = oldItems.find(i => i.product_id === productId)?.quantity ?? 0
      const newQty = newItems.find(i => i.product_id === productId)?.quantity ?? 0
      const diff = newQty - oldQty
      if (diff === 0) continue

      const prodRow = await client.query(
        `SELECT stock_quantity, product_type FROM cloud_products WHERE id=$1 AND agent_id=$2`,
        [productId, agentId]
      )
      if (!prodRow.rows[0] || prodRow.rows[0].product_type !== 'stock') continue

      const before = prodRow.rows[0].stock_quantity
      const after = before - diff
      await client.query(
        `UPDATE cloud_products SET stock_quantity=$1 WHERE id=$2 AND agent_id=$3`,
        [after, productId, agentId]
      )
      await client.query(
        `INSERT INTO cloud_stock_transactions
           (agent_id, id, product_id, type, quantity, before_qty, after_qty, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [agentId, nextStockTxId++, productId, diff > 0 ? 'out' : 'in', Math.abs(diff), before, after,
         `Sửa HĐ #${invoiceId} - yêu cầu ID ${editReq.id}`]
      )
    }

    await client.query(`DELETE FROM cloud_order_items WHERE session_id=$1 AND agent_id=$2`, [sessionId, agentId])

    // cloud_order_items có composite PK (agent_id, id) — phải tự generate id
    const maxIdRow = await client.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM cloud_order_items WHERE agent_id=$1`,
      [agentId]
    )
    let nextId: number = maxIdRow.rows[0].max_id + 1

    for (const item of newItems) {
      await client.query(
        `INSERT INTO cloud_order_items (agent_id, id, session_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [agentId, nextId++, sessionId, item.product_id, item.quantity, item.unit_price, item.subtotal]
      )
    }

    const newItemsAmount = newItems.reduce((sum, i) => sum + i.subtotal, 0)
    await client.query(
      `UPDATE cloud_invoices
       SET items_amount=$1,
           final_amount = play_amount + $1 - discount - discount_from_points
       WHERE id=$2 AND agent_id=$3`,
      [newItemsAmount, invoiceId, agentId]
    )

    await client.query(
      `UPDATE invoice_edit_requests
       SET status='approved', reviewed_by=$1, reviewed_at=NOW()
       WHERE id=$2`,
      [reviewed_by, editReq.id]
    )

    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
})

// PUT /agent/edit-requests/:id/reject
router.put('/edit-requests/:id/reject', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const reviewed_by = req.body.reviewed_by ?? 'agent'
  const { rows } = await pool.query(
    `UPDATE invoice_edit_requests
     SET status='rejected', reviewed_by=$1, reviewed_at=NOW()
     WHERE id=$2 AND agent_id=$3 AND status='pending'
     RETURNING id`,
    [reviewed_by, req.params.id, agentId]
  )
  if (!rows[0]) { res.status(404).json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }); return }
  res.json({ success: true })
})

export default router
