# Phase 3: Master Dashboard — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** Web-based master dashboard để xem dữ liệu từ cloud_ tables, bao gồm overview tổng hợp, chi tiết từng quán, và báo cáo cross-agent.

---

## Overview

Phase 3 xây dựng một React SPA phục vụ role `master` — truy cập qua browser, không cần cài Electron. Dashboard đọc từ cloud_ tables (được sync lên từ Phase 2) và expose 4 API endpoints mới dưới `requireMaster` middleware.

**Nguyên tắc cốt lõi:**
- Read-only — master chỉ xem, không write vào cloud DB qua dashboard
- Manual refresh — không polling, không WebSocket
- Cùng auth system — JWT từ `POST /api/v1/auth/login`, role check ở server
- Cùng tech stack với Electron renderer — React + shadcn/ui + Tailwind + React Query

---

## Architecture

```
server/
├── dashboard/                  ← NEW: Vite React project
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx             (React Router v6, auth guard)
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Overview.tsx
│   │   │   ├── Agents.tsx
│   │   │   ├── AgentDetail.tsx
│   │   │   └── Reports.tsx
│   │   ├── components/
│   │   │   ├── NavBar.tsx
│   │   │   ├── TableGrid.tsx
│   │   │   └── RevenueChart.tsx
│   │   └── lib/
│   │       ├── api.ts          (fetch wrapper + 401 redirect)
│   │       └── auth.ts         (JWT localStorage helpers)
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── public/
│   └── dashboard/              ← Build output, served by Express
└── src/
    └── routes/
        └── master.ts           ← NEW: GET /api/v1/master/*
```

Express serve `server/public/dashboard/` tại `/dashboard`. Master truy cập `http://server:4000/dashboard`.

---

## Auth Flow

1. Master truy cập `/dashboard` → `App.tsx` check JWT trong localStorage
2. Nếu không có JWT hoặc expired → redirect `/dashboard/login`
3. Login form gọi `POST /api/v1/auth/login` (shared endpoint)
4. Nếu `role !== 'master'` → hiển thị "Access denied", không lưu token
5. Lưu JWT vào localStorage → redirect về `/dashboard/`
6. Mọi API call thêm `Authorization: Bearer <token>`
7. Response 401 → `api.ts` tự redirect về `/dashboard/login`

---

## API Endpoints

Tất cả endpoints dùng middleware stack: `authenticate → requireMaster`.

### `GET /api/v1/master/overview`

Tổng hợp tất cả quán.

**Response:**
```json
{
  "activeAgents": 3,
  "totalTablesPlaying": 23,
  "todayRevenue": 4200000,
  "todayInvoices": 47,
  "revenueByDay": [
    { "date": "2026-05-22", "total": 3800000 },
    { "date": "2026-05-23", "total": 4100000 }
  ]
}
```

**Queries:**
- `activeAgents`: COUNT DISTINCT `agent_id` từ `cloud_invoices` WHERE DATE = TODAY (quán có ít nhất 1 hóa đơn hôm nay)
- `totalTablesPlaying`: COUNT từ `cloud_tables` WHERE `status = 'playing'`
- `todayRevenue` / `todayInvoices`: SUM / COUNT từ `cloud_invoices` WHERE DATE = TODAY
- `revenueByDay`: GROUP BY DATE 7 ngày gần nhất từ `cloud_invoices`

---

### `GET /api/v1/master/agents`

Danh sách quán với stats hôm nay.

**Response:**
```json
[
  {
    "agentId": "uuid-1",
    "name": "Quán Bida A",
    "tablesPlaying": 3,
    "totalTables": 8,
    "todayRevenue": 1800000,
    "todayInvoices": 12
  }
]
```

**Query:** JOIN `agents` + `cloud_tables` (COUNT by status) + `cloud_invoices` (TODAY aggregates).

---

### `GET /api/v1/master/agents/:id`

Chi tiết một quán.

**Response:**
```json
{
  "agent": { "id": "uuid-1", "name": "Quán Bida A", "phone": "...", "address": "..." },
  "tables": [
    { "id": 1, "name": "Bàn 1", "status": "playing", "hourly_rate": 50000 }
  ],
  "recentInvoices": [
    { "invoice_number": "00047", "final_amount": 150000, "created_at": "2026-05-28T14:32:00Z" }
  ],
  "revenueByDay": [
    { "date": "2026-05-22", "total": 1200000 }
  ]
}
```

**Queries:**
- `agent`: từ `agents` table
- `tables`: `cloud_tables WHERE agent_id = $1 ORDER BY id`
- `recentInvoices`: `cloud_invoices WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10`
- `revenueByDay`: GROUP BY DATE 7 ngày gần nhất, `cloud_invoices WHERE agent_id = $1`

---

### `GET /api/v1/master/reports?from=YYYY-MM-DD&to=YYYY-MM-DD`

Báo cáo cross-agent với date range filter.

**Query params:** `from`, `to` (required, format `YYYY-MM-DD`)

**Response:**
```json
{
  "summary": {
    "totalRevenue": 42000000,
    "totalInvoices": 420,
    "avgInvoice": 100000
  },
  "byAgent": [
    { "agentId": "uuid-1", "name": "Quán A", "revenue": 18000000, "invoices": 180 }
  ],
  "byDay": [
    { "date": "2026-05-01", "total": 1500000 }
  ]
}
```

**Validation:** `from` và `to` phải là valid dates, `from <= to`, max range 90 ngày.

---

## Frontend Pages

### `Login.tsx`
Form username + password. Gọi `POST /api/v1/auth/login`. Nếu `role !== 'master'` hiển thị lỗi "Tài khoản không có quyền truy cập dashboard". Lưu token vào localStorage.

### `Overview.tsx`
- 4 KPI cards: Quán hoạt động, Bàn đang chơi, Doanh thu hôm nay, Hóa đơn hôm nay
- Line chart doanh thu 7 ngày (tất cả quán gộp)
- Bảng xếp hạng quán theo doanh thu hôm nay (link sang `/dashboard/agents/:id`)

### `Agents.tsx`
Grid cards từng quán. Mỗi card: tên quán, `X/Y bàn đang chơi`, doanh thu hôm nay, số hóa đơn. Click → navigate sang AgentDetail.

### `AgentDetail.tsx`
3 sections:
1. **Grid bàn mini** — xanh = trống, đỏ = đang chơi (tên bàn)
2. **10 hóa đơn gần nhất** — số HĐ, giờ, số tiền
3. **Bar chart doanh thu 7 ngày** — dùng `RevenueChart`

### `Reports.tsx`
- Date range picker (2 input `date`, default: 7 ngày gần nhất)
- Nút "Xem báo cáo" → trigger query
- **Summary row:** tổng doanh thu, tổng hóa đơn, trung bình
- **Bar chart:** so sánh doanh thu từng quán trong range
- **Table:** từng quán, doanh thu, số hóa đơn, trung bình

---

## Shared Components

### `NavBar.tsx`
Top navigation: `Overview | Quán | Báo cáo` + nút **Logout** (xóa token, redirect login).  
Active tab highlight. Logo / tên app bên trái.

### `TableGrid.tsx`
Props: `tables: { id, name, status }[]`  
Render grid, màu nền theo status: `playing` = đỏ (`bg-red-500`), `idle` = xanh (`bg-green-500`).

### `RevenueChart.tsx`
Props: `data: { date: string; total: number }[]`, `color?: string`  
Recharts `BarChart` responsive. Format số tiền theo VND.

---

## Shared Libraries

### `lib/api.ts`
```typescript
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
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}
```

### `lib/auth.ts`
```typescript
const KEY = 'master_token'
export const getToken = () => localStorage.getItem(KEY)
export const setToken = (t: string) => localStorage.setItem(KEY, t)
export const clearToken = () => localStorage.removeItem(KEY)
```

---

## Server Changes

### `server/src/routes/master.ts` (NEW)
4 route handlers dùng `pool.query()` trực tiếp trên cloud DB.

### `server/src/index.ts` (MODIFY)
```typescript
import masterRouter from './routes/master'
app.use('/api/v1/master', masterRouter)
```

Express serve static dashboard:
```typescript
import path from 'path'
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')))
app.get('/dashboard/*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'))
)
```

### `server/package.json` (MODIFY)
Thêm script:
```json
"dashboard:dev": "cd dashboard && vite",
"dashboard:build": "cd dashboard && vite build --outDir ../public/dashboard"
```

---

## Testing

### Server tests (`server/tests/master.test.ts`)
Pattern giống `sync.test.ts`: mock `pool`, mock `verifyAccessToken`.

Tests cần cover:
- 401 nếu không có token
- 403 nếu role = agent
- 200 overview với data đúng shape
- 200 agents list
- 200 agent detail (404 nếu không tồn tại)
- 200 reports với date range hợp lệ
- 400 nếu `from` / `to` thiếu hoặc sai format
- 400 nếu range > 90 ngày

### Dashboard (no unit tests)
Manual testing: đăng nhập master, xem từng trang, verify data khớp DB.

---

## Build & Deploy

```bash
# Dev: chạy Express server + dashboard Vite dev server
cd server && npm run dev          # Express :4000
cd server && npm run dashboard:dev # Vite :5173 (proxy /api → :4000)

# Production build
cd server && npm run dashboard:build
# → output vào server/public/dashboard/
# → Express tự serve
```

Vite `vite.config.ts` trong dashboard:
```typescript
export default defineConfig({
  base: '/dashboard/',
  server: { proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: '../public/dashboard', emptyOutDir: true },
})
```

---

## Out of Scope (Phase 4+)

- Master sửa/xóa dữ liệu của agent
- Push notification khi quán có doanh thu bất thường
- Export báo cáo ra Excel/PDF
- Sync ngược chiều (cloud → local)
