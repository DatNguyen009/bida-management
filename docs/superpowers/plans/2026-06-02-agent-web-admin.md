# Agent Web Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng web portal cho agent (chủ quán) đăng nhập từ trình duyệt để quản lý quán bida với UI dark glass giống Electron app.

**Architecture:** Mở rộng `web-admin/` sẵn có thêm role `agent` với routing `/agent/*`. Server Express thêm `agentPortal.ts` route group với `authenticate + requireAgent` middleware. Build output deploy tại `server/public/agent-admin/` serve qua `/agent`.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind CSS + Zustand + Axios + Recharts, served từ Express (Render).

---

## File Map

| File | Action |
|------|--------|
| `server/src/routes/agentPortal.ts` | **Create** — tất cả API endpoints cho agent |
| `server/src/index.ts` | Modify — register route + serve static `/agent` |
| `web-admin/src/stores/authStore.ts` | Modify — thêm `role`, `agentId` fields |
| `web-admin/src/pages/LoginPage.tsx` | Modify — cho phép agent login, redirect đúng role |
| `web-admin/src/App.tsx` | Modify — thêm `RequireAgent` guard + `/agent/*` routes |
| `web-admin/src/index.css` | Modify — thêm dark glass CSS classes |
| `web-admin/src/components/AgentLayout.tsx` | **Create** — sidebar + topbar dark glass |
| `web-admin/src/pages/agent/AgentDashboardPage.tsx` | **Create** — grid bàn + poll 10s |
| `web-admin/src/pages/agent/AgentInvoicesPage.tsx` | **Create** — danh sách HD + detail panel |
| `web-admin/src/pages/agent/AgentReportsPage.tsx` | **Create** — stat cards + bar chart |
| `web-admin/src/pages/agent/AgentProductsPage.tsx` | **Create** — bảng + CRUD modal |
| `web-admin/src/pages/agent/AgentCategoriesPage.tsx` | **Create** — grid + CRUD modal |
| `web-admin/src/pages/agent/AgentStaffPage.tsx` | **Create** — bảng + CRUD modal |
| `web-admin/src/pages/agent/AgentPromotionsPage.tsx` | **Create** — bảng + CRUD modal |
| `web-admin/src/pages/agent/AgentSettingsPage.tsx` | **Create** — form cài đặt |
| `web-admin/package.json` | Modify — thêm `recharts` |

---

## Task 1: Server — agentPortal.ts (Read endpoints)

**Files:**
- Create: `server/src/routes/agentPortal.ts`

- [ ] **Step 1: Tạo file `server/src/routes/agentPortal.ts`**

```typescript
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
     LEFT JOIN categories cat ON cat.id = p.category_id AND cat.agent_id = $1
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
    `INSERT INTO cloud_products (agent_id, name, category_id, price, unit, min_stock_alert, product_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [agentId, name, category_id || null, price, unit || 'cái', min_stock_alert || 5, product_type || 'stock']
  )
  res.status(201).json(rows[0])
})

// PUT /agent/products/:id
router.put('/products/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, price, unit, min_stock_alert, is_active, category_id } = req.body
  const { rows } = await pool.query(
    `UPDATE cloud_products SET name=$3, price=$4, unit=$5, min_stock_alert=$6, is_active=$7, category_id=$8
     WHERE id=$1 AND agent_id=$2 RETURNING *`,
    [req.params.id, agentId, name, price, unit, min_stock_alert, is_active ?? true, category_id || null]
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
  const { rows } = await pool.query('SELECT * FROM categories WHERE agent_id=$1 ORDER BY name', [agentId])
  res.json(rows)
})

// POST /agent/categories
router.post('/categories', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, icon } = req.body
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const { rows } = await pool.query(
    'INSERT INTO categories (agent_id, name, icon) VALUES ($1,$2,$3) RETURNING *',
    [agentId, name, icon || '📦']
  )
  res.status(201).json(rows[0])
})

// PUT /agent/categories/:id
router.put('/categories/:id', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { name, icon } = req.body
  const { rows } = await pool.query(
    'UPDATE categories SET name=$3, icon=$4 WHERE id=$1 AND agent_id=$2 RETURNING *',
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
  await pool.query('DELETE FROM categories WHERE id=$1 AND agent_id=$2', [req.params.id, agentId])
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
```

- [ ] **Step 2: Typecheck server**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd .. && git add server/src/routes/agentPortal.ts
git commit -m "feat: add agent portal API routes (tables, invoices, reports, products, categories, staff, promotions, settings)"
```

---

## Task 2: Server — Register route + serve static + build script

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/package.json`

- [ ] **Step 1: Register agentPortal route và static serving trong `server/src/index.ts`**

Thêm import (sau `import payosRouter`):
```typescript
import agentPortalRouter from './routes/agentPortal'
```

Thêm route registration (sau `app.use('/api/v1/payos', payosRouter)`):
```typescript
app.use('/api/v1/agent', agentPortalRouter)
```

Thêm static serving (sau khối dashboard static, trước catch-all 404):
```typescript
const agentAdminDir = path.join(__dirname, '../public/agent-admin')
app.use('/agent', express.static(agentAdminDir))
app.get('/agent/*', (_req, res) =>
  res.sendFile(path.join(agentAdminDir, 'index.html'))
)
```

- [ ] **Step 2: Thêm build script vào `server/package.json`**

Tìm `"scripts"`, thêm:
```json
"build:agent-admin": "cd ../web-admin && npm run build && mkdir -p ../server/public/agent-admin && cp -r dist/* ../server/public/agent-admin/"
```

- [ ] **Step 3: Tạo thư mục placeholder**

```bash
mkdir -p server/public/agent-admin
echo '{"placeholder":true}' > server/public/agent-admin/.gitkeep
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd server && npx tsc --noEmit && cd ..
git add server/src/index.ts server/package.json server/public/agent-admin/.gitkeep
git commit -m "feat: register agent portal route and static serving in Express"
```

---

## Task 3: web-admin — Dependencies + Glass CSS

**Files:**
- Modify: `web-admin/package.json`
- Modify: `web-admin/src/index.css`

- [ ] **Step 1: Install recharts**

```bash
cd web-admin && npm install recharts
```

Expected: `recharts` in `package.json` dependencies.

- [ ] **Step 2: Thêm dark glass CSS vào `web-admin/src/index.css`**

Append sau `@tailwind utilities;`:

```css
/* ─── Dark Glass Design System (matches Electron app) ─── */
body.agent-portal {
  background: #0f0e0f;
  color: #fff;
}

.glass-card {
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 16px;
}

.glass-sidebar {
  background: rgba(10,9,11,0.85);
  backdrop-filter: blur(40px) saturate(150%);
  -webkit-backdrop-filter: blur(40px) saturate(150%);
  border-right: 1px solid rgba(255,255,255,0.08);
}

.glass-topbar {
  background: rgba(15,14,15,0.80);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.glass-nav-active {
  background: rgba(212,175,55,0.15);
  border: 1px solid rgba(212,175,55,0.25);
}

.btn-gold {
  background: linear-gradient(135deg,#f0d060 0%,#d4af37 50%,#b8960c 100%);
  color: #0f0e0f;
  font-weight: 700;
  border: none;
  border-radius: 10px;
  padding: 8px 16px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}
.btn-gold:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,175,55,0.5); }
.btn-gold:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

.btn-glass {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.85);
  font-weight: 600;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-glass:hover { background: rgba(255,255,255,0.14); }
.btn-glass:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-danger {
  background: rgba(239,68,68,0.15);
  color: #fca5a5;
  font-weight: 600;
  border: 1px solid rgba(239,68,68,0.25);
  border-radius: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover { background: rgba(239,68,68,0.25); }

.modal-glass {
  background: rgba(14,12,16,0.92);
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
  color: #fff;
}

.input-glass {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px;
  color: #fff;
  padding: 10px 16px;
  font-size: 14px;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
}
.input-glass::placeholder { color: rgba(255,255,255,0.3); }
.input-glass:focus { border-color: rgba(212,175,55,0.6); box-shadow: 0 0 0 3px rgba(212,175,55,0.15); }

.gold-table-header {
  background: rgba(255,255,255,0.06);
  border-bottom: 2px solid #d4af37;
}
.gold-table-header th {
  color: #d4af37;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
  padding: 12px 16px;
  text-align: left;
}
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add web-admin/package.json web-admin/package-lock.json web-admin/src/index.css
git commit -m "feat: add recharts and dark glass CSS to web-admin"
```

---

## Task 4: web-admin — authStore + LoginPage + App.tsx routing

**Files:**
- Modify: `web-admin/src/stores/authStore.ts`
- Modify: `web-admin/src/pages/LoginPage.tsx`
- Modify: `web-admin/src/App.tsx`

- [ ] **Step 1: Cập nhật `web-admin/src/stores/authStore.ts`**

Thay toàn bộ file:

```typescript
import { create } from 'zustand'
import { api } from '../lib/api'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: string | null
  agentId: string | null
  setAuth: (accessToken: string, refreshToken: string, role: string, agentId: string | null) => void
  setAccessToken: (token: string) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('userRole'),
  agentId: localStorage.getItem('agentId'),
  setAuth: (accessToken, refreshToken, role, agentId) => {
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('userRole', role)
    if (agentId) localStorage.setItem('agentId', agentId)
    else localStorage.removeItem('agentId')
    set({ accessToken, refreshToken, role, agentId })
  },
  setAccessToken: (token) => set({ accessToken: token }),
  logout: async () => {
    const { refreshToken } = get()
    if (refreshToken) {
      try { await api.post('/auth/logout', { refreshToken }) } catch { /* ignore */ }
    }
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('userRole')
    localStorage.removeItem('agentId')
    set({ accessToken: null, refreshToken: null, role: null, agentId: null })
  },
}))
```

- [ ] **Step 2: Cập nhật `web-admin/src/pages/LoginPage.tsx`**

Thay toàn bộ file:

```tsx
import { useState, FormEvent } from 'react'
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${BASE_URL}/auth/login`, { username, password })
      if (data.role !== 'master' && data.role !== 'agent') {
        setError('Tài khoản không có quyền truy cập')
        return
      }
      setAuth(data.accessToken, data.refreshToken, data.role, data.agentId ?? null)
      navigate(data.role === 'agent' ? '/agent' : '/')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0e0f' }}>
      <form onSubmit={handleSubmit} className="modal-glass p-8 w-80 space-y-5">
        <div className="text-center">
          <div className="text-3xl mb-2">🎱</div>
          <h1 className="text-xl font-bold text-white">Bida Admin</h1>
          <p className="text-white/40 text-xs mt-1">Đăng nhập để quản lý</p>
        </div>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div>
          <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="input-glass" required autoFocus />
        </div>
        <div>
          <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Mật khẩu</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="input-glass" required />
        </div>
        <button type="submit" disabled={loading} className="btn-gold w-full">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Cập nhật `web-admin/src/App.tsx`**

Thay toàn bộ file:

```tsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { api } from './lib/api'
import LoginPage from './pages/LoginPage'
import AgentListPage from './pages/AgentListPage'
import AgentDetailPage from './pages/AgentDetailPage'
import AgentDashboardPage from './pages/agent/AgentDashboardPage'
import AgentInvoicesPage from './pages/agent/AgentInvoicesPage'
import AgentReportsPage from './pages/agent/AgentReportsPage'
import AgentProductsPage from './pages/agent/AgentProductsPage'
import AgentCategoriesPage from './pages/agent/AgentCategoriesPage'
import AgentStaffPage from './pages/agent/AgentStaffPage'
import AgentPromotionsPage from './pages/agent/AgentPromotionsPage'
import AgentSettingsPage from './pages/agent/AgentSettingsPage'

function useAuthGuard(requiredRole: string) {
  const { accessToken, refreshToken, role, setAccessToken, logout } = useAuthStore()
  const [checking, setChecking] = useState(!accessToken && !!refreshToken)

  useEffect(() => {
    if (!accessToken && refreshToken) {
      api.post('/auth/refresh', { refreshToken })
        .then(({ data }) => setAccessToken(data.accessToken))
        .catch(() => logout())
        .finally(() => setChecking(false))
    }
  }, [])

  return { checking, authed: !!accessToken && role === requiredRole }
}

function RequireMaster({ children }: { children: React.ReactNode }) {
  const { checking, authed } = useAuthGuard('master')
  if (checking) return <Spinner />
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAgent({ children }: { children: React.ReactNode }) {
  const { checking, authed } = useAuthGuard('agent')
  if (checking) return <Spinner />
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0e0f' }}>
      <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireMaster><AgentListPage /></RequireMaster>} />
        <Route path="/agents/:id" element={<RequireMaster><AgentDetailPage /></RequireMaster>} />
        <Route path="/agent" element={<RequireAgent><AgentDashboardPage /></RequireAgent>} />
        <Route path="/agent/invoices" element={<RequireAgent><AgentInvoicesPage /></RequireAgent>} />
        <Route path="/agent/reports" element={<RequireAgent><AgentReportsPage /></RequireAgent>} />
        <Route path="/agent/products" element={<RequireAgent><AgentProductsPage /></RequireAgent>} />
        <Route path="/agent/categories" element={<RequireAgent><AgentCategoriesPage /></RequireAgent>} />
        <Route path="/agent/staff" element={<RequireAgent><AgentStaffPage /></RequireAgent>} />
        <Route path="/agent/promotions" element={<RequireAgent><AgentPromotionsPage /></RequireAgent>} />
        <Route path="/agent/settings" element={<RequireAgent><AgentSettingsPage /></RequireAgent>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Typecheck web-admin**

```bash
cd web-admin && npx tsc --noEmit
```

Expected: no errors (may need to create placeholder page files first — if import errors, create empty stubs)

- [ ] **Step 5: Tạo stubs cho tất cả agent pages (nếu chưa có)**

```bash
mkdir -p web-admin/src/pages/agent
for page in AgentDashboardPage AgentInvoicesPage AgentReportsPage AgentProductsPage AgentCategoriesPage AgentStaffPage AgentPromotionsPage AgentSettingsPage; do
  echo "export default function ${page}() { return <div className='text-white p-6'>${page}</div> }" > web-admin/src/pages/agent/${page}.tsx
done
```

- [ ] **Step 6: Commit**

```bash
cd .. && git add web-admin/src/stores/authStore.ts web-admin/src/pages/LoginPage.tsx web-admin/src/App.tsx web-admin/src/pages/agent/
git commit -m "feat: add agent role support, updated LoginPage, routing for agent portal"
```

---

## Task 5: web-admin — AgentLayout component

**Files:**
- Create: `web-admin/src/components/AgentLayout.tsx`

- [ ] **Step 1: Tạo `web-admin/src/components/AgentLayout.tsx`**

```tsx
import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const NAV_ITEMS = [
  { path: '/agent', label: 'Dashboard', icon: '🏠' },
  { path: '/agent/invoices', label: 'Hóa đơn', icon: '🧾' },
  { path: '/agent/reports', label: 'Báo cáo', icon: '📊' },
  { path: '/agent/products', label: 'Sản phẩm', icon: '📦' },
  { path: '/agent/categories', label: 'Danh mục', icon: '🗂' },
  { path: '/agent/promotions', label: 'Khuyến mãi', icon: '🏷' },
  { path: '/agent/staff', label: 'Nhân viên', icon: '👤' },
  { path: '/agent/settings', label: 'Cài đặt', icon: '⚙️' },
]

interface Props { children: ReactNode; title?: string }

export default function AgentLayout({ children, title }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, agentId } = useAuthStore()

  const isActive = (path: string) =>
    path === '/agent' ? location.pathname === '/agent' : location.pathname.startsWith(path)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f0e0f' }}>
      {/* Sidebar */}
      <aside className="glass-sidebar w-52 flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#f0d060,#c49a10)', boxShadow: '0 4px 12px rgba(212,175,55,0.4)' }}>
            🎱
          </div>
          <div>
            <div className="text-white font-extrabold text-sm leading-tight">Bida</div>
            <div className="text-white/50 text-[10px]">Web Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <button key={path} onClick={() => navigate(path)}
              className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2.5 transition-all
                ${isActive(path)
                  ? 'glass-nav-active text-white font-semibold'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                }`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${isActive(path) ? 'bg-white/15' : 'bg-white/[0.05]'}`}>
                {icon}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-3">
          <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs">Agent</p>
              <p className="text-white/30 text-[10px] truncate max-w-[120px]">{agentId?.slice(0,8)}...</p>
            </div>
            <button onClick={logout}
              className="text-white/30 hover:text-red-400 transition-colors text-sm px-2">↩</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="glass-topbar h-12 flex items-center px-6 gap-2 flex-shrink-0">
          <span className="text-white/40 text-xs">Agent Portal</span>
          {title && (<><span className="text-white/20 text-xs">/</span>
            <span className="text-white text-xs font-medium">{title}</span></>)}
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web-admin/src/components/AgentLayout.tsx
git commit -m "feat: add AgentLayout dark glass sidebar + topbar"
```

---

## Task 6: web-admin — AgentDashboardPage (bàn + polling)

**Files:**
- Modify: `web-admin/src/pages/agent/AgentDashboardPage.tsx`

- [ ] **Step 1: Viết `AgentDashboardPage.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface TableRow {
  id: number; name: string; status: string; hourly_rate: number
  session_id: number | null; start_time: string | null
}

function elapsed(startTime: string): string {
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

const STATUS_COLORS: Record<string, string> = {
  playing: 'bg-red-500/20 border-red-500/40 text-red-300',
  idle: 'bg-green-500/20 border-green-500/40 text-green-300',
  reserved: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
}
const STATUS_LABELS: Record<string, string> = {
  playing: 'Đang chơi', idle: 'Trống', reserved: 'Đặt trước'
}

export default function AgentDashboardPage() {
  const [tables, setTables] = useState<TableRow[]>([])
  const [tick, setTick] = useState(0)

  const fetchTables = useCallback(async () => {
    const { data } = await api.get('/agent/tables')
    setTables(data)
  }, [])

  useEffect(() => { fetchTables() }, [fetchTables])

  // Poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => { fetchTables(); setTick(t => t+1) }, 10_000)
    return () => clearInterval(interval)
  }, [fetchTables])

  // Tick every second to update elapsed timers
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t+1), 1000)
    return () => clearInterval(interval)
  }, [])

  const playing = tables.filter(t => t.status === 'playing').length
  const idle = tables.filter(t => t.status === 'idle').length

  return (
    <AgentLayout title="Dashboard">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Đang chơi', value: playing, color: 'text-red-400' },
          { label: 'Trống', value: idle, color: 'text-green-400' },
          { label: 'Tổng bàn', value: tables.length, color: 'text-[#d4af37]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-white/50 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Table grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {tables.map(table => (
          <div key={table.id} className={`glass-card p-4 border ${STATUS_COLORS[table.status] ?? 'border-white/10'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-sm">{table.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[table.status] ?? ''}`}>
                {STATUS_LABELS[table.status] ?? table.status}
              </span>
            </div>
            {table.status === 'playing' && table.start_time && (
              <p className="text-red-300 font-mono text-lg font-bold">{elapsed(table.start_time)}</p>
            )}
            <p className="text-white/30 text-xs mt-1">{(table.hourly_rate/1000).toFixed(0)}k/giờ</p>
          </div>
        ))}
      </div>
    </AgentLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web-admin/src/pages/agent/AgentDashboardPage.tsx
git commit -m "feat: AgentDashboardPage — table grid with 10s polling and elapsed timer"
```

---

## Task 7: web-admin — AgentInvoicesPage

**Files:**
- Modify: `web-admin/src/pages/agent/AgentInvoicesPage.tsx`

- [ ] **Step 1: Viết `AgentInvoicesPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface InvoiceRow {
  id: number; invoice_number: string; table_name: string | null
  play_amount: number; items_amount: number; final_amount: number
  payment_method: string; completed_by: string | null; created_at: string
  customer_name: string | null; customer_phone: string | null
  discount: number; points_redeemed: number; discount_from_points: number
  promotions_applied: { id: number; name: string; amount: number }[] | null
}
interface InvoiceDetail { invoice: InvoiceRow; items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[] }

function fmt(n: number) { return n.toLocaleString('vi-VN') + 'đ' }
function fmtDate(s: string) { return new Date(s).toLocaleString('vi-VN') }

export default function AgentInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selected, setSelected] = useState<InvoiceDetail | null>(null)
  const pageSize = 20

  async function fetchInvoices(p = page) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    const { data } = await api.get(`/agent/invoices?${params}`)
    setInvoices(data.data)
    setTotal(data.total)
  }

  useEffect(() => { fetchInvoices(1); setPage(1) }, [fromDate, toDate])

  async function openDetail(id: number) {
    const { data } = await api.get(`/agent/invoices/${id}`)
    setSelected(data)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AgentLayout title="Hóa đơn">
      {/* Filter */}
      <div className="flex gap-3 mb-4 items-center">
        <div className="flex items-center gap-2 glass-card px-3 py-2">
          <span className="text-white/40 text-xs">Từ</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-transparent text-white text-sm outline-none" />
        </div>
        <div className="flex items-center gap-2 glass-card px-3 py-2">
          <span className="text-white/40 text-xs">Đến</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-transparent text-white text-sm outline-none" />
        </div>
        <span className="text-white/40 text-xs ml-auto">{total} hóa đơn</span>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header">
            <tr><th>Số HĐ</th><th>Bàn</th><th>Khách</th><th>Tổng tiền</th><th>TT</th><th>Thời gian</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={inv.id} onClick={() => openDetail(inv.id)}
                className={`cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.04] transition-colors ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-[#d4af37] font-mono">#{inv.invoice_number}</td>
                <td className="px-4 py-3 text-white/80">{inv.table_name ?? '—'}</td>
                <td className="px-4 py-3 text-white/60 text-xs">{inv.customer_name ?? '—'}</td>
                <td className="px-4 py-3 text-white font-medium">{fmt(inv.final_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.payment_method==='cash'?'bg-green-500/20 text-green-300':'bg-blue-500/20 text-blue-300'}`}>
                    {inv.payment_method==='cash'?'Tiền mặt':'Chuyển khoản'}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/40 text-xs">{fmtDate(inv.created_at)}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">Không có hóa đơn</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-4">
        <button className="btn-glass text-xs px-3 py-1.5" disabled={page<=1} onClick={() => { setPage(p=>p-1); fetchInvoices(page-1) }}>←</button>
        <span className="text-white/50 text-xs self-center">Trang {page} / {totalPages}</span>
        <button className="btn-glass text-xs px-3 py-1.5" disabled={page>=totalPages} onClick={() => { setPage(p=>p+1); fetchInvoices(page+1) }}>→</button>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="modal-glass relative w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">HĐ #{selected.invoice.invoice_number}</h2>
              <button className="text-white/40 hover:text-white" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="space-y-2 text-sm mb-4">
              {[
                ['Bàn', selected.invoice.table_name ?? '—'],
                ['Khách', selected.invoice.customer_name ?? '—'],
                ['Tiền chơi', fmt(selected.invoice.play_amount)],
                ['Đồ uống', fmt(selected.invoice.items_amount)],
                ...(selected.invoice.discount > 0 ? [['Giảm giá', `-${fmt(selected.invoice.discount)}`]] : []),
                ...(selected.invoice.discount_from_points > 0 ? [['Đổi điểm', `-${fmt(selected.invoice.discount_from_points)}`]] : []),
                ['Thành tiền', fmt(selected.invoice.final_amount)],
                ['Thanh toán', selected.invoice.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'],
                ['Thời gian', fmtDate(selected.invoice.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-white/50">{k}</span>
                  <span className={k === 'Thành tiền' ? 'text-[#d4af37] font-bold' : 'text-white'}>{v}</span>
                </div>
              ))}
            </div>
            {selected.items.length > 0 && (
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Đồ uống</p>
                {selected.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-white/[0.05]">
                    <span className="text-white/70">{item.product_name} × {item.quantity}</span>
                    <span className="text-white">{fmt(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web-admin/src/pages/agent/AgentInvoicesPage.tsx
git commit -m "feat: AgentInvoicesPage — invoice list with filter, pagination, detail panel"
```

---

## Task 8: web-admin — AgentReportsPage

**Files:**
- Modify: `web-admin/src/pages/agent/AgentReportsPage.tsx`

- [ ] **Step 1: Viết `AgentReportsPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Summary { total_revenue: string; invoice_count: string; play_revenue: string; items_revenue: string }
interface RevenueDay { date: string; total: string; count: string }

function fmt(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : `${(n/1000).toFixed(0)}k` }
function fmtFull(n: number) { return Number(n).toLocaleString('vi-VN') + 'đ' }

const today = new Date().toISOString().slice(0, 10)
const sevenDaysAgo = new Date(Date.now() - 6*86400000).toISOString().slice(0, 10)

export default function AgentReportsPage() {
  const [fromDate, setFromDate] = useState(sevenDaysAgo)
  const [toDate, setToDate] = useState(today)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [revenue, setRevenue] = useState<RevenueDay[]>([])

  useEffect(() => {
    const params = `fromDate=${fromDate}&toDate=${toDate}`
    Promise.all([
      api.get(`/agent/reports/summary?${params}`),
      api.get(`/agent/reports/revenue?${params}`),
    ]).then(([s, r]) => { setSummary(s.data); setRevenue(r.data) })
  }, [fromDate, toDate])

  const chartData = revenue.map(r => ({
    date: new Date(r.date).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' }),
    'Doanh thu': Number(r.total),
  }))

  const stats = summary ? [
    { label: 'Doanh thu', value: fmtFull(Number(summary.total_revenue)), color: 'text-[#d4af37]' },
    { label: 'Số hóa đơn', value: summary.invoice_count, color: 'text-white' },
    { label: 'Tiền giờ', value: fmtFull(Number(summary.play_revenue)), color: 'text-blue-300' },
    { label: 'Đồ uống', value: fmtFull(Number(summary.items_revenue)), color: 'text-green-300' },
  ] : []

  return (
    <AgentLayout title="Báo cáo">
      {/* Date filter */}
      <div className="flex gap-3 mb-6">
        {[['Từ', fromDate, setFromDate], ['Đến', toDate, setToDate]].map(([label, val, setter]) => (
          <div key={String(label)} className="flex items-center gap-2 glass-card px-3 py-2">
            <span className="text-white/40 text-xs">{label}</span>
            <input type="date" value={String(val)} onChange={e => (setter as (v:string)=>void)(e.target.value)}
              className="bg-transparent text-white text-sm outline-none" />
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="glass-card p-4">
            <p className="text-white/40 text-xs mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="glass-card p-5">
        <p className="text-white/50 text-xs uppercase tracking-widest mb-4">Doanh thu theo ngày</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => [fmtFull(v), 'Doanh thu']}
              contentStyle={{ background: 'rgba(14,12,16,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff' }} />
            <Bar dataKey="Doanh thu" fill="#d4af37" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AgentLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web-admin/src/pages/agent/AgentReportsPage.tsx
git commit -m "feat: AgentReportsPage — summary stats + bar chart"
```

---

## Task 9: web-admin — AgentProductsPage + AgentCategoriesPage

**Files:**
- Modify: `web-admin/src/pages/agent/AgentProductsPage.tsx`
- Modify: `web-admin/src/pages/agent/AgentCategoriesPage.tsx`

- [ ] **Step 1: Viết `AgentProductsPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Product { id: number; name: string; category_name: string | null; category_icon: string | null; price: number; stock_quantity: number; unit: string; is_active: boolean; product_type: string }
interface Category { id: number; name: string; icon: string }

type Form = { name: string; category_id: string; price: string; unit: string; min_stock_alert: string; product_type: string; is_active: boolean }
const BLANK: Form = { name: '', category_id: '', price: '', unit: 'cái', min_stock_alert: '5', product_type: 'stock', is_active: true }

export default function AgentProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [error, setError] = useState('')

  async function load() {
    const [p, c] = await Promise.all([api.get('/agent/products'), api.get('/agent/categories')])
    setProducts(p.data); setCategories(c.data)
  }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(BLANK); setSelected(null); setModal('create'); setError('') }
  function openEdit(p: Product) {
    setForm({ name: p.name, category_id: String(p.category_name ? categories.find(c => c.name === p.category_name)?.id ?? '' : ''), price: String(p.price), unit: p.unit, min_stock_alert: '5', product_type: p.product_type, is_active: p.is_active })
    setSelected(p); setModal('edit'); setError('')
  }

  async function save() {
    const body = { name: form.name, category_id: form.category_id ? Number(form.category_id) : null, price: Number(form.price), unit: form.unit, min_stock_alert: Number(form.min_stock_alert), product_type: form.product_type, is_active: form.is_active }
    try {
      if (modal === 'create') await api.post('/agent/products', body)
      else if (selected) await api.put(`/agent/products/${selected.id}`, body)
      await load(); setModal(null)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Lỗi') }
  }

  async function del(id: number) {
    if (!confirm('Xoá sản phẩm này?')) return
    await api.delete(`/agent/products/${id}`); load()
  }

  return (
    <AgentLayout title="Sản phẩm">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm sản phẩm</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header">
            <tr><th>Tên</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th className="text-right pr-4">Thao tác</th></tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-white/90 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-white/50 text-xs">{p.category_icon} {p.category_name ?? '—'}</td>
                <td className="px-4 py-3 text-white">{p.price.toLocaleString('vi-VN')}đ</td>
                <td className="px-4 py-3 text-white/70">{p.stock_quantity} {p.unit}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active?'bg-green-500/20 text-green-300':'bg-white/10 text-white/40'}`}>{p.is_active?'Hoạt động':'Ẩn'}</span></td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(p)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => del(p.id)}>Xoá</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">Chưa có sản phẩm</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-white font-bold">{modal === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {[['Tên sản phẩm', 'name', 'text'], ['Giá (đồng)', 'price', 'number'], ['Đơn vị', 'unit', 'text']].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">{label}</label>
                <input type={type} className="input-glass" value={(form as any)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Danh mục</label>
              <select className="input-glass" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Không có —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-yellow-500" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <span className="text-white/80 text-sm">Đang hoạt động</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={!form.name || !form.price}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
```

- [ ] **Step 2: Viết `AgentCategoriesPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Category { id: number; name: string; icon: string }

export default function AgentCategoriesPage() {
  const [cats, setCats] = useState<Category[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Category | null>(null)
  const [name, setName] = useState(''); const [icon, setIcon] = useState('📦')
  const [error, setError] = useState('')

  async function load() { const { data } = await api.get('/agent/categories'); setCats(data) }
  useEffect(() => { load() }, [])

  function openCreate() { setName(''); setIcon('📦'); setSelected(null); setModal('create'); setError('') }
  function openEdit(c: Category) { setName(c.name); setIcon(c.icon); setSelected(c); setModal('edit'); setError('') }

  async function save() {
    try {
      if (modal === 'create') await api.post('/agent/categories', { name, icon })
      else if (selected) await api.put(`/agent/categories/${selected.id}`, { name, icon })
      await load(); setModal(null)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Lỗi') }
  }

  async function del(id: number) {
    try { await api.delete(`/agent/categories/${id}`); load() }
    catch (e: any) { alert(e.response?.data?.error ?? 'Không thể xoá') }
  }

  return (
    <AgentLayout title="Danh mục">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm danh mục</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cats.map(c => (
          <div key={c.id} className="glass-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{c.icon}</span>
              <span className="text-white font-medium text-sm">{c.name}</span>
            </div>
            <div className="flex gap-1">
              <button className="btn-glass text-xs" onClick={() => openEdit(c)}>✏️</button>
              <button className="btn-danger text-xs" onClick={() => del(c.id)}>✕</button>
            </div>
          </div>
        ))}
        {cats.length === 0 && <p className="col-span-4 text-center text-white/30 py-10">Chưa có danh mục</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-xs mx-4 p-6 space-y-4">
            <h2 className="text-white font-bold">{modal === 'create' ? 'Thêm danh mục' : 'Sửa danh mục'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Icon (emoji)</label>
              <input className="input-glass" value={icon} onChange={e => setIcon(e.target.value)} maxLength={4} />
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Tên danh mục</label>
              <input className="input-glass" value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={!name}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/pages/agent/AgentProductsPage.tsx web-admin/src/pages/agent/AgentCategoriesPage.tsx
git commit -m "feat: AgentProductsPage and AgentCategoriesPage with CRUD modals"
```

---

## Task 10: web-admin — AgentStaffPage + AgentPromotionsPage + AgentSettingsPage

**Files:**
- Modify: `web-admin/src/pages/agent/AgentStaffPage.tsx`
- Modify: `web-admin/src/pages/agent/AgentPromotionsPage.tsx`
- Modify: `web-admin/src/pages/agent/AgentSettingsPage.tsx`

- [ ] **Step 1: Viết `AgentStaffPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Staff { id: number; username: string; allowed_screens: string[]; is_active: boolean; created_at: string }

const SCREENS = [
  { key: 'dashboard', label: '🏠 Dashboard' }, { key: 'products', label: '📦 Sản phẩm' },
  { key: 'stock', label: '🏪 Kho' }, { key: 'invoices', label: '🧾 Hóa đơn' },
  { key: 'customers', label: '👥 Khách hàng' }, { key: 'reports', label: '📊 Báo cáo' },
  { key: 'settings', label: '⚙️ Cài đặt' }, { key: 'promotions', label: '🏷 Khuyến mãi' },
]

type Form = { username: string; password: string; allowedScreens: string[]; is_active: boolean }
const BLANK: Form = { username: '', password: '', allowedScreens: [], is_active: true }

export default function AgentStaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Staff | null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [error, setError] = useState('')

  async function load() { const { data } = await api.get('/agent/staff'); setStaff(data) }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(BLANK); setSelected(null); setModal('create'); setError('') }
  function openEdit(s: Staff) { setForm({ username: s.username, password: '', allowedScreens: s.allowed_screens, is_active: s.is_active }); setSelected(s); setModal('edit'); setError('') }

  function toggleScreen(key: string) {
    const screens = form.allowedScreens.includes(key) ? form.allowedScreens.filter(s => s !== key) : [...form.allowedScreens, key]
    setForm({ ...form, allowedScreens: screens })
  }

  async function save() {
    const body: any = { allowedScreens: form.allowedScreens, is_active: form.is_active }
    if (modal === 'create') { body.username = form.username; body.password = form.password }
    else if (form.password) body.password = form.password
    try {
      if (modal === 'create') await api.post('/agent/staff', body)
      else if (selected) await api.put(`/agent/staff/${selected.id}`, body)
      await load(); setModal(null)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Lỗi') }
  }

  async function del(id: number) {
    if (!confirm('Xoá nhân viên này?')) return
    await api.delete(`/agent/staff/${id}`); load()
  }

  return (
    <AgentLayout title="Nhân viên">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm nhân viên</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header"><tr><th>Username</th><th>Màn hình</th><th>Trạng thái</th><th className="text-right pr-4">Thao tác</th></tr></thead>
          <tbody>
            {staff.map((s, i) => (
              <tr key={s.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-white font-medium">{s.username}</td>
                <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{s.allowed_screens.slice(0,3).map(sc => <span key={sc} className="bg-yellow-500/20 text-yellow-300 text-[10px] px-1.5 py-0.5 rounded-full">{SCREENS.find(x=>x.key===sc)?.label.split(' ')[0] ?? sc}</span>)}{s.allowed_screens.length > 3 && <span className="text-white/40 text-xs">+{s.allowed_screens.length-3}</span>}</div></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active?'bg-green-500/20 text-green-300':'bg-white/10 text-white/40'}`}>{s.is_active?'Hoạt động':'Tạm khoá'}</span></td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(s)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => del(s.id)}>Xoá</button>
                </td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-white/30">Chưa có nhân viên</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-sm mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-white font-bold">{modal==='create'?'Thêm nhân viên':'Sửa nhân viên'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {modal === 'create' && (
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Username</label>
                <input className="input-glass" value={form.username} onChange={e => setForm({...form, username: e.target.value})} autoFocus />
              </div>
            )}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">{modal==='edit'?'Mật khẩu mới (để trống = không đổi)':'Mật khẩu'}</label>
              <input type="password" className="input-glass" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Màn hình được phép</label>
              <div className="space-y-2">
                {SCREENS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-yellow-500" checked={form.allowedScreens.includes(key)} onChange={() => toggleScreen(key)} />
                    <span className="text-white/80 text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-yellow-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <span className="text-white/80 text-sm">Đang hoạt động</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={modal==='create'&&(!form.username||!form.password)}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
```

- [ ] **Step 2: Viết `AgentPromotionsPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Promo { id: number; name: string; type: string; discount_type: string; discount_value: number; apply_to: string; max_discount: number | null; code: string | null; max_uses: number | null; used_count: number; days_of_week: number[] | null; time_from: string | null; time_to: string | null; valid_from: string | null; valid_to: string | null; is_active: boolean }

const TYPE_LABELS: Record<string, string> = { voucher: 'Voucher', time_slot: 'Khung giờ', event: 'Sự kiện' }
const TYPE_COLORS: Record<string, string> = { voucher: 'bg-purple-500/20 text-purple-300', time_slot: 'bg-blue-500/20 text-blue-300', event: 'bg-amber-500/20 text-amber-300' }
const DAY_LABELS = ['T2','T3','T4','T5','T6','T7','CN']

type Form = { name: string; type: 'voucher'|'time_slot'|'event'; discount_type: 'percent'|'fixed'; discount_value: string; apply_to: string; max_discount: string; code: string; max_uses: string; valid_to: string; days_of_week: number[]; time_from: string; time_to: string; valid_from: string; is_active: boolean }
const BLANK: Form = { name: '', type: 'time_slot', discount_type: 'percent', discount_value: '10', apply_to: 'total', max_discount: '', code: '', max_uses: '0', valid_to: '', days_of_week: [1,2,3,4,5], time_from: '14:00', time_to: '17:00', valid_from: '', is_active: true }

export default function AgentPromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([])
  const [modal, setModal] = useState<'create'|'edit'|null>(null)
  const [selected, setSelected] = useState<Promo|null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [error, setError] = useState('')

  async function load() { const { data } = await api.get('/agent/promotions'); setPromos(data) }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(BLANK); setSelected(null); setModal('create'); setError('') }
  function openEdit(p: Promo) {
    setForm({ name: p.name, type: p.type as any, discount_type: p.discount_type as any, discount_value: String(p.discount_value), apply_to: p.apply_to, max_discount: p.max_discount ? String(p.max_discount) : '', code: p.code ?? '', max_uses: p.max_uses ? String(p.max_uses) : '0', valid_to: p.valid_to ?? '', days_of_week: p.days_of_week ?? [1,2,3,4,5], time_from: p.time_from ?? '14:00', time_to: p.time_to ?? '17:00', valid_from: p.valid_from ?? '', is_active: p.is_active })
    setSelected(p); setModal('edit'); setError('')
  }

  function toggleDay(d: number) { const days = form.days_of_week.includes(d) ? form.days_of_week.filter(x=>x!==d) : [...form.days_of_week, d].sort(); setForm({...form, days_of_week: days}) }

  function buildInput() {
    return {
      name: form.name, type: form.type, discount_type: form.discount_type, discount_value: Number(form.discount_value),
      apply_to: form.apply_to, max_discount: form.max_discount ? Number(form.max_discount) : null,
      code: form.type==='voucher' ? form.code.toUpperCase() : null,
      max_uses: form.type==='voucher' ? (Number(form.max_uses)||null) : null,
      days_of_week: form.type==='time_slot' ? form.days_of_week : null,
      time_from: form.type==='time_slot' ? form.time_from : null,
      time_to: form.type==='time_slot' ? form.time_to : null,
      valid_from: form.type==='event' ? form.valid_from : null,
      valid_to: (form.type==='event' ? form.valid_to : null) || (form.type==='voucher' && form.valid_to ? form.valid_to : null),
      is_active: form.is_active,
    }
  }

  async function save() {
    try {
      if (modal==='create') await api.post('/agent/promotions', buildInput())
      else if (selected) await api.put(`/agent/promotions/${selected.id}`, buildInput())
      await load(); setModal(null)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Lỗi') }
  }

  async function toggle(p: Promo) { await api.put(`/agent/promotions/${p.id}`, { is_active: !p.is_active }); load() }
  async function del(id: number) { if (!confirm('Xoá?')) return; await api.delete(`/agent/promotions/${id}`); load() }

  const canSave = form.name && Number(form.discount_value) > 0 && (form.type !== 'voucher' || form.code) && (form.type !== 'time_slot' || form.days_of_week.length > 0) && (form.type !== 'event' || (form.valid_from && form.valid_to))

  return (
    <AgentLayout title="Khuyến mãi">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm KM</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header"><tr><th>Tên</th><th>Loại</th><th>Giảm</th><th>Chi tiết</th><th className="text-center">Bật/Tắt</th><th className="text-right pr-4">Thao tác</th></tr></thead>
          <tbody>
            {promos.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-white/90 font-medium">{p.name}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[p.type]??''}`}>{TYPE_LABELS[p.type]}</span></td>
                <td className="px-4 py-3 text-white/80">{p.discount_type==='percent'?`${p.discount_value}%`:`${Number(p.discount_value).toLocaleString('vi-VN')}đ`}</td>
                <td className="px-4 py-3 text-white/50 text-xs">
                  {p.type==='voucher'&&`${p.code} · ${p.max_uses?`${p.used_count}/${p.max_uses}lượt`:'Không giới hạn'}`}
                  {p.type==='time_slot'&&p.days_of_week&&`${p.days_of_week.map(d=>DAY_LABELS[d-1]).join(',')} ${p.time_from?.slice(0,5)}–${p.time_to?.slice(0,5)}`}
                  {p.type==='event'&&`${p.valid_from}→${p.valid_to}`}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggle(p)} className={`w-10 h-5 rounded-full relative transition-colors ${p.is_active?'bg-yellow-500':'bg-white/20'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.is_active?'left-5':'left-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(p)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => del(p.id)}>Xoá</button>
                </td>
              </tr>
            ))}
            {promos.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">Chưa có khuyến mãi</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-bold">{modal==='create'?'Thêm KM':'Sửa KM'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Tên</label>
              <input className="input-glass" value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus />
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại</label>
              <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                {(['time_slot','voucher','event'] as const).map(t => (
                  <button key={t} className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.type===t?'bg-yellow-500 text-black font-bold':'text-white/60 hover:text-white'}`} onClick={() => setForm({...form, type: t})}>{TYPE_LABELS[t]}</button>
                ))}
              </div>
            </div>
            {form.type==='voucher' && (
              <><div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Mã code</label><input className="input-glass uppercase" value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="VD: BIDA20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Số lần dùng (0=∞)</label><input type="number" className="input-glass" value={form.max_uses} onChange={e => setForm({...form, max_uses: e.target.value})} /></div>
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Ngày HH</label><input type="date" className="input-glass" value={form.valid_to} onChange={e => setForm({...form, valid_to: e.target.value})} /></div>
              </div></>
            )}
            {form.type==='time_slot' && (
              <><div><label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ngày áp dụng</label>
                <div className="flex gap-1">{DAY_LABELS.map((l,i) => { const d=i+1; const on=form.days_of_week.includes(d); return <button key={d} className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${on?'bg-yellow-500 text-black border-yellow-500 font-bold':'border-white/10 text-white/50'}`} onClick={() => toggleDay(d)}>{l}</button> })}</div></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Từ</label><input type="time" className="input-glass" value={form.time_from} onChange={e => setForm({...form, time_from: e.target.value})} /></div>
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Đến</label><input type="time" className="input-glass" value={form.time_to} onChange={e => setForm({...form, time_to: e.target.value})} /></div>
              </div></>
            )}
            {form.type==='event' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Từ ngày</label><input type="date" className="input-glass" value={form.valid_from} onChange={e => setForm({...form, valid_from: e.target.value})} /></div>
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Đến ngày</label><input type="date" className="input-glass" value={form.valid_to} onChange={e => setForm({...form, valid_to: e.target.value})} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Loại giảm</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['percent','fixed'] as const).map(t => <button key={t} className={`flex-1 py-1.5 text-xs rounded-md ${form.discount_type===t?'bg-yellow-500 text-black font-bold':'text-white/60'}`} onClick={() => setForm({...form, discount_type: t})}>{t==='percent'?'%':'Cố định'}</button>)}
                </div>
              </div>
              <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Giá trị</label><input type="number" className="input-glass" value={form.discount_value} onChange={e => setForm({...form, discount_value: e.target.value})} /></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-yellow-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <span className="text-white/80 text-sm">Kích hoạt</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={!canSave}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
```

- [ ] **Step 3: Viết `AgentSettingsPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import AgentLayout from '../../components/AgentLayout'

const VITE_API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'
const SERVER_URL = VITE_API.replace('/api/v1', '')

interface Setting { key: string; value: string }

const KEYS = ['shop_name','address','phone','default_hourly_rate','vat_rate','bank_id','bank_account','bank_account_name','payos_client_id','payos_api_key','payos_checksum_key']

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { agentId } = useAuthStore()

  useEffect(() => {
    api.get('/agent/settings').then(({ data }: { data: Setting[] }) => {
      const map: Record<string, string> = {}
      data.forEach(s => { map[s.key] = s.value })
      setSettings(map)
    })
  }, [])

  function set(key: string, value: string) { setSettings(prev => ({ ...prev, [key]: value })) }

  async function save() {
    setSaving(true)
    const updates = KEYS.map(k => ({ key: k, value: settings[k] ?? '' }))
    await api.put('/agent/settings', updates)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const webhookUrl = agentId ? `${SERVER_URL}/api/v1/payos/webhook/${agentId}` : ''

  function Field({ label, k, type = 'text' }: { label: string; k: string; type?: string }) {
    return (
      <div>
        <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">{label}</label>
        <input type={type} className="input-glass" value={settings[k] ?? ''} onChange={e => set(k, e.target.value)} />
      </div>
    )
  }

  return (
    <AgentLayout title="Cài đặt">
      <div className="max-w-2xl space-y-4">
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Thông tin quán</h2>
          <Field label="Tên quán" k="shop_name" />
          <Field label="Địa chỉ" k="address" />
          <Field label="Số điện thoại" k="phone" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giá mặc định (đ/giờ)" k="default_hourly_rate" type="number" />
            <Field label="VAT (%)" k="vat_rate" type="number" />
          </div>
        </section>

        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">VietQR</h2>
          <Field label="Mã ngân hàng" k="bank_id" />
          <Field label="Số tài khoản" k="bank_account" />
          <Field label="Tên chủ tài khoản" k="bank_account_name" />
        </section>

        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">PayOS</h2>
          <p className="text-white/40 text-xs">Đăng ký miễn phí tại payos.vn</p>
          {webhookUrl && (
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Webhook URL (dán vào PayOS dashboard)</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#d4af37] font-mono break-all">{webhookUrl}</code>
                <button className="btn-glass text-xs px-3 flex-shrink-0" onClick={() => navigator.clipboard.writeText(webhookUrl)}>Copy</button>
              </div>
            </div>
          )}
          <Field label="Client ID" k="payos_client_id" />
          <Field label="API Key" k="payos_api_key" />
          <Field label="Checksum Key" k="payos_checksum_key" />
        </section>

        <button className="btn-gold w-full" onClick={save} disabled={saving}>
          {saving ? 'Đang lưu...' : saved ? '✓ Đã lưu' : 'Lưu cài đặt'}
        </button>
      </div>
    </AgentLayout>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/pages/agent/AgentStaffPage.tsx web-admin/src/pages/agent/AgentPromotionsPage.tsx web-admin/src/pages/agent/AgentSettingsPage.tsx
git commit -m "feat: AgentStaffPage, AgentPromotionsPage, AgentSettingsPage with CRUD"
```

---

## Task 11: Build + Deploy

**Files:**
- `server/public/agent-admin/` (built output)

- [ ] **Step 1: Cập nhật vite.config.ts cho web-admin để build với base path đúng**

Mở `web-admin/vite.config.ts`, thêm `base: '/agent/'`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  base: '/agent/',
})
```

- [ ] **Step 2: Typecheck web-admin**

```bash
cd web-admin && npx tsc --noEmit 2>&1 | grep error | head -20
```

Fix bất kỳ TypeScript error nào trước khi build.

- [ ] **Step 3: Build web-admin**

```bash
npm run build
```

Expected: `dist/` folder được tạo ra.

- [ ] **Step 4: Copy sang server**

```bash
mkdir -p ../server/public/agent-admin
cp -r dist/* ../server/public/agent-admin/
```

- [ ] **Step 5: Typecheck server**

```bash
cd ../server && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit + push**

```bash
cd ..
git add web-admin/ server/public/agent-admin/ server/src/routes/ server/src/index.ts server/package.json
git commit -m "feat: agent web admin portal — complete with all 8 screens, dark glass UI"
git push origin main
```

Expected output:
```
To https://github.com/DatNguyen009/bida-management.git
   ... main -> main
```

- [ ] **Step 7: Trigger Render deploy + verify**

Sau khi Render deploy xong, truy cập:
```
https://bida-management.onrender.com/agent
```

Expected: LoginPage dark glass hiện ra. Đăng nhập bằng tài khoản agent → vào Dashboard bàn.
