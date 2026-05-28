# Phase 3: Master Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng React SPA dashboard cho role master, được serve bởi Express, đọc dữ liệu từ cloud_ tables.

**Architecture:** 4 REST endpoints mới dưới `/api/v1/master/` (requireMaster) query cloud PostgreSQL. React SPA trong `server/dashboard/` được build ra `server/public/dashboard/` và serve bởi Express tại `/dashboard`. Auth qua JWT trong localStorage.

**Tech Stack:** Express + TypeScript (server), React 18 + Vite + TypeScript + Tailwind CSS + React Router v6 + React Query + recharts (dashboard), vitest + supertest (server tests).

---

## File Map

### Tạo mới
| File | Mục đích |
|------|---------|
| `server/tests/master.test.ts` | Integration tests cho 4 master endpoints |
| `server/src/routes/master.ts` | GET /master/overview, /agents, /agents/:id, /reports |
| `server/dashboard/package.json` | Dashboard Vite project dependencies |
| `server/dashboard/vite.config.ts` | Vite config: base=/dashboard/, proxy /api, outDir |
| `server/dashboard/tsconfig.json` | TypeScript config cho dashboard |
| `server/dashboard/tailwind.config.js` | Tailwind content paths |
| `server/dashboard/postcss.config.js` | PostCSS plugins |
| `server/dashboard/index.html` | HTML entry point |
| `server/dashboard/src/main.tsx` | React entry point + QueryClientProvider |
| `server/dashboard/src/index.css` | Tailwind directives |
| `server/dashboard/src/App.tsx` | React Router + auth guard |
| `server/dashboard/src/lib/auth.ts` | JWT localStorage helpers |
| `server/dashboard/src/lib/api.ts` | Fetch wrapper với auto 401 redirect |
| `server/dashboard/src/pages/Login.tsx` | Login form |
| `server/dashboard/src/components/NavBar.tsx` | Top navigation |
| `server/dashboard/src/components/TableGrid.tsx` | Grid bàn xanh/đỏ |
| `server/dashboard/src/components/RevenueChart.tsx` | recharts BarChart wrapper |
| `server/dashboard/src/pages/Overview.tsx` | KPI cards + chart |
| `server/dashboard/src/pages/Agents.tsx` | Danh sách quán |
| `server/dashboard/src/pages/AgentDetail.tsx` | Chi tiết quán |
| `server/dashboard/src/pages/Reports.tsx` | Date range + cross-agent báo cáo |

### Chỉnh sửa
| File | Thay đổi |
|------|---------|
| `server/src/index.ts` | Mount /master route + serve /dashboard static |
| `server/package.json` | Thêm dashboard:build script |

---

## Task 1: Master API route + tests

**Files:**
- Create: `server/tests/master.test.ts`
- Create: `server/src/routes/master.ts`

- [ ] **Step 1: Tạo server/tests/master.test.ts**

```typescript
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
```

- [ ] **Step 2: Chạy tests — xác nhận fail**

```bash
cd server && npm run test -- master 2>&1 | tail -10
```

Expected: FAIL — route chưa tồn tại, 404.

- [ ] **Step 3: Tạo server/src/routes/master.ts**

```typescript
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
        COUNT(CASE WHEN ct.status = 'playing' THEN 1 END)::int AS "tablesPlaying",
        COUNT(ct.id)::int AS "totalTables",
        COALESCE(SUM(CASE WHEN DATE(ci.created_at) = CURRENT_DATE THEN ci.final_amount ELSE 0 END), 0) AS "todayRevenue",
        COUNT(CASE WHEN DATE(ci.created_at) = CURRENT_DATE THEN 1 END)::int AS "todayInvoices"
      FROM agents a
      LEFT JOIN cloud_tables ct ON ct.agent_id = a.id
      LEFT JOIN cloud_invoices ci ON ci.agent_id = a.id
      GROUP BY a.id, a.name
      ORDER BY "todayRevenue" DESC
    `)
    res.json(rows.map((r) => ({ ...r, todayRevenue: Number(r.todayRevenue) })))
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/agents/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  try {
    const [agentRes, tablesRes, invoicesRes, byDayRes] = await Promise.all([
      pool.query('SELECT id, name, phone, address FROM agents WHERE id = $1', [id]),
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
    if (!agentRes.rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    res.json({
      agent: agentRes.rows[0],
      tables: tablesRes.rows,
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
  const fromDate = new Date(from), toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    res.status(400).json({ error: 'Invalid date format, use YYYY-MM-DD' }); return
  }
  if (fromDate > toDate) {
    res.status(400).json({ error: 'from must be <= to' }); return
  }
  if ((toDate.getTime() - fromDate.getTime()) / 86_400_000 > 90) {
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
```

- [ ] **Step 4: Chạy tests — xác nhận pass**

```bash
cd server && npm run test
```

Expected: tất cả tests pass (45 cũ + 11 mới = 56 passed).

- [ ] **Step 5: Commit**

```bash
git add server/tests/master.test.ts server/src/routes/master.ts
git commit -m "feat: add master API routes with tests (overview, agents, reports)"
```

---

## Task 2: Mount master route + dashboard static serving

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/package.json`

- [ ] **Step 1: Cập nhật server/src/index.ts**

Đọc file hiện tại. Thêm import và mount route **trước** dòng `app.use((_req, res) => res.status(404)...)`:

```typescript
import express from 'express'
import cors from 'cors'
import path from 'path'
import { rateLimit } from 'express-rate-limit'
import dotenv from 'dotenv'
import { authRouter } from './routes/auth'
import { agentsRouter } from './routes/agents'
import syncRouter from './routes/sync'
import masterRouter from './routes/master'

dotenv.config()

export const app = express()

app.use(cors({
  origin: process.env.WEB_ADMIN_URL ?? 'http://localhost:5174',
  credentials: true,
}))
app.use(express.json())

app.use('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }))
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }))

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/agents', agentsRouter)
app.use('/api/v1/sync', syncRouter)
app.use('/api/v1/master', masterRouter)

const dashboardDir = path.join(__dirname, '../public/dashboard')
app.use('/dashboard', express.static(dashboardDir))
app.get('/dashboard/*', (_req, res) =>
  res.sendFile(path.join(dashboardDir, 'index.html'))
)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT ?? 4000)
  app.listen(PORT, () => console.log(`Bida API server running on port ${PORT}`))
}
```

- [ ] **Step 2: Thêm dashboard:build script vào server/package.json**

Thêm vào `"scripts"`:
```json
"dashboard:build": "cd dashboard && npm run build"
```

- [ ] **Step 3: Chạy server tests — đảm bảo không phá gì**

```bash
cd server && npm run test
```

Expected: 56 passed (không có regression).

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts server/package.json
git commit -m "feat: mount master route and serve dashboard static files"
```

---

## Task 3: Dashboard Vite project scaffold

**Files:**
- Create: `server/dashboard/package.json`
- Create: `server/dashboard/vite.config.ts`
- Create: `server/dashboard/tsconfig.json`
- Create: `server/dashboard/tailwind.config.js`
- Create: `server/dashboard/postcss.config.js`
- Create: `server/dashboard/index.html`
- Create: `server/dashboard/src/main.tsx`
- Create: `server/dashboard/src/index.css`

- [ ] **Step 1: Tạo server/dashboard/package.json**

```json
{
  "name": "bida-dashboard",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.3.1"
  }
}
```

- [ ] **Step 2: Tạo server/dashboard/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  server: {
    port: 5175,
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    outDir: '../public/dashboard',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 3: Tạo server/dashboard/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Tạo server/dashboard/tailwind.config.js**

```javascript
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 5: Tạo server/dashboard/postcss.config.js**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 6: Tạo server/dashboard/index.html**

```html
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bida Master Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Tạo server/dashboard/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Tạo server/dashboard/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 9: Cài dependencies**

```bash
cd server/dashboard && npm install
```

Expected: `node_modules/` được tạo, không có lỗi.

- [ ] **Step 10: Commit**

```bash
git add server/dashboard/
git commit -m "feat: scaffold dashboard Vite project with React, Tailwind, recharts"
```

---

## Task 4: Auth infrastructure + App.tsx + Login.tsx

**Files:**
- Create: `server/dashboard/src/lib/auth.ts`
- Create: `server/dashboard/src/lib/api.ts`
- Create: `server/dashboard/src/App.tsx`
- Create: `server/dashboard/src/pages/Login.tsx`

- [ ] **Step 1: Tạo server/dashboard/src/lib/auth.ts**

```typescript
const KEY = 'master_token'
export const getToken = () => localStorage.getItem(KEY)
export const setToken = (t: string) => localStorage.setItem(KEY, t)
export const clearToken = () => localStorage.removeItem(KEY)
```

- [ ] **Step 2: Tạo server/dashboard/src/lib/api.ts**

```typescript
import { getToken, clearToken } from './auth'

const BASE = '/api/v1'

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (res.status === 401) {
    clearToken()
    window.location.href = '/dashboard/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}
```

- [ ] **Step 3: Tạo server/dashboard/src/App.tsx**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './lib/auth'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Agents from './pages/Agents'
import AgentDetail from './pages/AgentDetail'
import Reports from './pages/Reports'
import NavBar from './components/NavBar'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <NavBar />
              <main className="max-w-7xl mx-auto px-4 py-6">
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/agents" element={<Agents />} />
                  <Route path="/agents/:id" element={<AgentDetail />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Tạo server/dashboard/src/pages/Login.tsx**

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '../lib/auth'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.role !== 'master') throw new Error('Tài khoản không có quyền truy cập dashboard')
      setToken(data.accessToken)
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-900">Bida Master</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium">
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compile**

```bash
cd server/dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: không có lỗi (có thể có lỗi thiếu import cho Overview/Agents/AgentDetail/Reports — tạm thời tạo placeholder nếu cần).

Nếu có lỗi missing modules, tạo placeholder files tạm thời:

```bash
mkdir -p server/dashboard/src/pages server/dashboard/src/components
for f in Overview Agents AgentDetail Reports; do
  echo "export default function $f() { return <div>$f</div> }" > "server/dashboard/src/pages/$f.tsx"
done
echo "export default function NavBar() { return <nav>Nav</nav> }" > server/dashboard/src/components/NavBar.tsx
```

- [ ] **Step 6: Commit**

```bash
git add server/dashboard/src/
git commit -m "feat: add auth lib, App router, and Login page for dashboard"
```

---

## Task 5: Shared components

**Files:**
- Create: `server/dashboard/src/components/NavBar.tsx`
- Create: `server/dashboard/src/components/TableGrid.tsx`
- Create: `server/dashboard/src/components/RevenueChart.tsx`

- [ ] **Step 1: Tạo server/dashboard/src/components/NavBar.tsx**

```typescript
import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken } from '../lib/auth'

export default function NavBar() {
  const navigate = useNavigate()

  function logout() {
    clearToken()
    navigate('/login')
  }

  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <nav className="bg-white border-b border-gray-200 px-4 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-900 mr-4 text-lg">🎱 Bida Master</span>
          <NavLink to="/" end className={cls}>Overview</NavLink>
          <NavLink to="/agents" className={cls}>Quán</NavLink>
          <NavLink to="/reports" className={cls}>Báo cáo</NavLink>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100">
          Đăng xuất
        </button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Tạo server/dashboard/src/components/TableGrid.tsx**

```typescript
interface Table {
  id: number
  name: string
  status: string
}

export default function TableGrid({ tables }: { tables: Table[] }) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
      {tables.map((t) => (
        <div key={t.id}
          className={`rounded-lg p-3 text-center text-xs font-medium ${
            t.status === 'playing'
              ? 'bg-red-100 text-red-800 ring-1 ring-red-200'
              : 'bg-green-100 text-green-800 ring-1 ring-green-200'
          }`}>
          <div className="font-semibold">{t.name}</div>
          <div className="mt-1 opacity-80">{t.status === 'playing' ? 'Đang chơi' : 'Trống'}</div>
        </div>
      ))}
      {tables.length === 0 && (
        <div className="col-span-4 text-center text-gray-400 py-4 text-sm">Chưa có bàn nào.</div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Tạo server/dashboard/src/components/RevenueChart.tsx**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint { date: string; total: number }

function fmtDate(s: string) {
  const d = new Date(s)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

export default function RevenueChart({ data, color = '#3b82f6' }: { data: DataPoint[]; color?: string }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Chưa có dữ liệu.</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} width={45} />
        <Tooltip formatter={(v: number) => fmtVND(v)} labelFormatter={fmtDate} />
        <Bar dataKey="total" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: Verify TypeScript compile**

```bash
cd server/dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: không có lỗi trong components.

- [ ] **Step 5: Commit**

```bash
git add server/dashboard/src/components/
git commit -m "feat: add NavBar, TableGrid, RevenueChart shared components"
```

---

## Task 6: Overview page

**Files:**
- Create: `server/dashboard/src/pages/Overview.tsx`

- [ ] **Step 1: Tạo server/dashboard/src/pages/Overview.tsx**

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import RevenueChart from '../components/RevenueChart'

interface OverviewData {
  activeAgents: number
  totalTablesPlaying: number
  todayRevenue: number
  todayInvoices: number
  revenueByDay: { date: string; total: number }[]
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

export default function Overview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: () => apiFetch<OverviewData>('/master/overview'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">
          Làm mới
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Quán hoạt động hôm nay', value: data.activeAgents, color: 'text-green-600' },
              { label: 'Bàn đang chơi', value: data.totalTablesPlaying, color: 'text-red-500' },
              { label: 'Doanh thu hôm nay', value: fmtVND(data.todayRevenue), color: 'text-blue-600' },
              { label: 'Hóa đơn hôm nay', value: data.todayInvoices, color: 'text-purple-600' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-sm text-gray-500 mb-1">{kpi.label}</div>
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">
              Doanh thu 7 ngày — tất cả quán
            </h2>
            <RevenueChart data={data.revenueByDay} />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd server/dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: không có lỗi.

- [ ] **Step 3: Commit**

```bash
git add server/dashboard/src/pages/Overview.tsx
git commit -m "feat: add Overview page with KPI cards and 7-day revenue chart"
```

---

## Task 7: Agents + AgentDetail pages

**Files:**
- Create: `server/dashboard/src/pages/Agents.tsx`
- Create: `server/dashboard/src/pages/AgentDetail.tsx`

- [ ] **Step 1: Tạo server/dashboard/src/pages/Agents.tsx**

```typescript
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'

interface AgentSummary {
  agentId: string
  name: string
  tablesPlaying: number
  totalTables: number
  todayRevenue: number
  todayInvoices: number
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

export default function Agents() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiFetch<AgentSummary[]>('/master/agents'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách quán</h1>
        <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">Làm mới</button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(data ?? []).map((agent) => (
          <Link key={agent.agentId} to={`/agents/${agent.agentId}`}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all block">
            <div className="font-semibold text-gray-900 text-lg mb-3">{agent.name}</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-400 text-xs mb-1">Bàn đang chơi</div>
                <div className="font-semibold text-red-500">{agent.tablesPlaying} / {agent.totalTables}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">Doanh thu hôm nay</div>
                <div className="font-semibold text-green-600">{fmtVND(agent.todayRevenue)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">Hóa đơn</div>
                <div className="font-semibold text-blue-600">{agent.todayInvoices}</div>
              </div>
            </div>
          </Link>
        ))}
        {data?.length === 0 && (
          <p className="text-gray-400 col-span-2 text-center py-8">Chưa có quán nào.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tạo server/dashboard/src/pages/AgentDetail.tsx**

```typescript
import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import TableGrid from '../components/TableGrid'
import RevenueChart from '../components/RevenueChart'

interface AgentDetailData {
  agent: { id: string; name: string; phone: string | null; address: string | null }
  tables: { id: number; name: string; status: string; hourly_rate: number }[]
  recentInvoices: { invoice_number: string; final_amount: number; created_at: string }[]
  revenueByDay: { date: string; total: number }[]
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => apiFetch<AgentDetailData>(`/master/agents/${id}`),
  })

  if (isLoading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>
  if (isError || !data) return <div className="text-center py-12 text-red-500">Không tìm thấy quán.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/agents" className="text-sm text-blue-600 hover:underline">← Danh sách quán</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{data.agent.name}</h1>
          {data.agent.address && <p className="text-sm text-gray-500 mt-0.5">{data.agent.address}</p>}
        </div>
        <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">Làm mới</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Trạng thái bàn</h2>
        <TableGrid tables={data.tables} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Hóa đơn gần nhất</h2>
          <div className="space-y-2">
            {data.recentInvoices.map((inv) => (
              <div key={inv.invoice_number} className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-mono">HD#{inv.invoice_number}</span>
                <span className="text-gray-400">{fmtTime(inv.created_at)}</span>
                <span className="font-medium text-gray-900">{fmtVND(inv.final_amount)}</span>
              </div>
            ))}
            {data.recentInvoices.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">Chưa có hóa đơn hôm nay.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Doanh thu 7 ngày</h2>
          <RevenueChart data={data.revenueByDay} color="#10b981" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compile**

```bash
cd server/dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: không có lỗi.

- [ ] **Step 4: Commit**

```bash
git add server/dashboard/src/pages/Agents.tsx server/dashboard/src/pages/AgentDetail.tsx
git commit -m "feat: add Agents list and AgentDetail pages"
```

---

## Task 8: Reports page + build integration

**Files:**
- Create: `server/dashboard/src/pages/Reports.tsx`

- [ ] **Step 1: Tạo server/dashboard/src/pages/Reports.tsx**

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { apiFetch } from '../lib/api'

interface ReportsData {
  summary: { totalRevenue: number; totalInvoices: number; avgInvoice: number }
  byAgent: { agentId: string; name: string; revenue: number; invoices: number }[]
  byDay: { date: string; total: number }[]
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

function fmtDate(s: string) {
  const d = new Date(s)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function toISO(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export default function Reports() {
  const [from, setFrom] = useState(() => toISO(6))
  const [to, setTo] = useState(() => toISO(0))
  const [queryKey, setQueryKey] = useState(() => [from, to])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', ...queryKey],
    queryFn: () => apiFetch<ReportsData>(`/master/reports?from=${queryKey[0]}&to=${queryKey[1]}`),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Báo cáo</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Từ ngày</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Đến ngày</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setQueryKey([from, to])}
          className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          Xem báo cáo
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Tổng doanh thu', value: fmtVND(data.summary.totalRevenue) },
              { label: 'Tổng hóa đơn', value: data.summary.totalInvoices },
              { label: 'Trung bình / HĐ', value: fmtVND(Math.round(data.summary.avgInvoice)) },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-medium">{s.label}</div>
                <div className="text-xl font-bold text-gray-900">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">So sánh doanh thu giữa các quán</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byAgent} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v: number) => fmtVND(v)} />
                <Bar dataKey="revenue" name="Doanh thu" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Quán', 'Doanh thu', 'Hóa đơn', 'Trung bình/HĐ'].map((h) => (
                    <th key={h} className={`px-4 py-3 text-gray-600 font-medium ${h === 'Quán' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byAgent.map((a) => (
                  <tr key={a.agentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtVND(a.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{a.invoices}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {a.invoices > 0 ? fmtVND(Math.round(a.revenue / a.invoices)) : '—'}
                    </td>
                  </tr>
                ))}
                {data.byAgent.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu trong khoảng thời gian này.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compile toàn bộ dashboard**

```bash
cd server/dashboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: không có lỗi.

- [ ] **Step 3: Build dashboard**

```bash
cd server/dashboard && npm run build 2>&1 | tail -15
```

Expected: build thành công, output tại `server/public/dashboard/`.

Kiểm tra output:
```bash
ls server/public/dashboard/
```

Expected: `index.html`, `assets/` directory.

- [ ] **Step 4: Chạy server tests lần cuối**

```bash
cd server && npm run test
```

Expected: 56 passed, không có regression.

- [ ] **Step 5: Commit**

```bash
git add server/dashboard/src/pages/Reports.tsx server/public/dashboard/
git commit -m "feat: add Reports page and build dashboard to public/"
```

- [ ] **Step 6: Test thủ công end-to-end**

Khởi động server:
```bash
cd server && npm run dev
```

Mở browser tại `http://localhost:4000/dashboard`. Kiểm tra:
- Redirect về `/dashboard/login` nếu chưa đăng nhập ✓
- Đăng nhập bằng tài khoản master → chuyển về `/dashboard/` ✓
- Đăng nhập bằng tài khoản agent → thấy lỗi "Tài khoản không có quyền" ✓
- Tab Overview: KPI cards hiển thị ✓
- Tab Quán: danh sách quán ✓
- Click vào một quán: xem bàn + hóa đơn + chart ✓
- Tab Báo cáo: chọn date range → click "Xem báo cáo" → hiển thị data ✓
- Nút Đăng xuất: xóa token, redirect về login ✓
