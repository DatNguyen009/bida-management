# Bida Management — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khởi tạo Electron + React + PostgreSQL app với màn hình Dashboard bàn bida và quản lý phiên chơi cơ bản (mở/đóng bàn, tính giờ).

**Architecture:** Electron Main Process xử lý tất cả DB queries và print logic qua IPC handlers. Renderer (React + Vite) chỉ hiển thị UI và gọi `window.api.*`. PostgreSQL chạy local, kết nối qua `pg` driver trong Main Process.

**Tech Stack:** Electron 28+, React 18, Vite 5, TypeScript, Tailwind CSS, shadcn/ui, Zustand, @tanstack/react-query, pg (node-postgres), Vitest, Playwright

---

## File Map

```
bida/
├── electron/
│   ├── main.ts                    # Electron entry, BrowserWindow, IPC bootstrap
│   ├── preload.ts                 # contextBridge expose window.api
│   ├── db.ts                      # PostgreSQL pool singleton
│   └── handlers/
│       ├── tables.ts              # IPC: tables:getAll, tables:updateStatus
│       └── sessions.ts            # IPC: sessions:create, sessions:close, sessions:getActive
├── src/
│   ├── main.tsx                   # React entry
│   ├── App.tsx                    # Router + layout
│   ├── lib/
│   │   ├── ipc.ts                 # window.api type-safe wrappers
│   │   └── utils.ts               # formatCurrency, formatDuration
│   ├── stores/
│   │   └── sessionStore.ts        # Zustand: active sessions map
│   ├── pages/
│   │   └── Dashboard.tsx          # Grid bàn bida
│   └── components/
│       ├── TableCard.tsx          # Card một bàn (màu + timer)
│       ├── SessionTimer.tsx       # Đồng hồ đếm giờ realtime
│       └── OpenSessionModal.tsx   # Modal mở phiên mới
├── db/
│   └── schema.sql                 # DDL: tables, sessions (+ các bảng sau)
├── tests/
│   ├── unit/
│   │   ├── utils.test.ts          # formatCurrency, formatDuration, calcPlayAmount
│   │   └── handlers/
│   │       ├── tables.test.ts     # IPC handler logic
│   │       └── sessions.test.ts   # IPC handler logic
│   └── e2e/
│       └── dashboard.spec.ts      # Playwright: mở bàn → đóng bàn
├── package.json
├── vite.config.ts
├── electron-builder.config.ts
└── tsconfig.json
```

---

## Task 1: Khởi tạo project Electron + React + Vite + TypeScript

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `electron-builder.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Tạo project với electron-vite**

```bash
cd /Users/datnguyen/Documents/Freelance/bida
npm create @quick-start/electron@latest . -- --template react-ts
npm install
```

Kết quả: thư mục có `electron/`, `src/`, `package.json` với scripts `dev`, `build`, `dist`.

- [ ] **Step 2: Cài thêm dependencies**

```bash
npm install pg @tanstack/react-query zustand
npm install -D @types/pg vitest @vitest/coverage-v8 playwright
```

- [ ] **Step 3: Cài Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Cập nhật `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './electron/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

Cập nhật `src/index.css` (thay toàn bộ nội dung):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Cài shadcn/ui**

```bash
npx shadcn@latest init
```

Chọn: Default style, Zinc color, CSS variables = yes.

```bash
npx shadcn@latest add button card dialog badge input label select
```

- [ ] **Step 5: Thêm `vitest` config vào `vite.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Chạy dev để xác nhận**

```bash
npm run dev
```

Expected: Cửa sổ Electron mở với React app mặc định, không có lỗi console.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: init Electron + React + Vite + shadcn/ui + Tailwind"
```

---

## Task 2: Database schema và kết nối PostgreSQL

**Files:**
- Create: `db/schema.sql`
- Create: `electron/db.ts`

- [ ] **Step 1: Tạo PostgreSQL database**

```bash
createdb bida_db
```

- [ ] **Step 2: Viết `db/schema.sql`**

```sql
-- db/schema.sql

CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  hourly_rate DECIMAL(10,0) NOT NULL DEFAULT 50000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(100) NULL,
  total_visits INT DEFAULT 0,
  total_spent DECIMAL(12,0) DEFAULT 0,
  points_balance INT DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  table_id INT NOT NULL REFERENCES tables(id),
  customer_id INT NULL REFERENCES customers(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ NULL,
  duration_minutes INT NULL,
  play_amount DECIMAL(10,0) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'drink',
  price DECIMAL(10,0) NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  min_stock_alert INT NOT NULL DEFAULT 5,
  unit VARCHAR(20) NOT NULL DEFAULT 'cái',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal DECIMAL(10,0) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id SERIAL PRIMARY KEY,
  points_per_10k_vnd INT NOT NULL DEFAULT 1,
  vnd_per_point INT NOT NULL DEFAULT 100,
  min_redeem_points INT NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id),
  invoice_number VARCHAR(20) UNIQUE NOT NULL,
  play_amount DECIMAL(10,0) NOT NULL DEFAULT 0,
  items_amount DECIMAL(10,0) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,0) NOT NULL DEFAULT 0,
  discount DECIMAL(10,0) NOT NULL DEFAULT 0,
  points_redeemed INT NOT NULL DEFAULT 0,
  discount_from_points DECIMAL(10,0) NOT NULL DEFAULT 0,
  final_amount DECIMAL(10,0) NOT NULL,
  points_earned INT NOT NULL DEFAULT 0,
  printed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  type VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- Seed dữ liệu mặc định
INSERT INTO settings (key, value) VALUES
  ('shop_name', 'Quán Bida'),
  ('address', '123 Đường ABC, TP.HCM'),
  ('phone', '0901234567'),
  ('default_hourly_rate', '50000')
ON CONFLICT (key) DO NOTHING;

INSERT INTO loyalty_settings (points_per_10k_vnd, vnd_per_point, min_redeem_points)
SELECT 1, 100, 100
WHERE NOT EXISTS (SELECT 1 FROM loyalty_settings);

-- Seed 8 bàn mẫu
INSERT INTO tables (name, hourly_rate) VALUES
  ('Bàn 1', 50000), ('Bàn 2', 50000), ('Bàn 3', 50000), ('Bàn 4', 50000),
  ('Bàn 5', 60000), ('Bàn 6', 60000), ('Bàn 7', 70000), ('Bàn 8', 70000)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Chạy schema**

```bash
psql bida_db < db/schema.sql
```

Expected: Không có lỗi, tất cả bảng được tạo.

- [ ] **Step 4: Viết `electron/db.ts`**

```ts
// electron/db.ts
import { Pool } from 'pg'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface DbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

function loadDbConfig(): DbConfig {
  const configPath = path.join(app.getPath('userData'), 'db-config.json')
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
  return {
    host: 'localhost',
    port: 5432,
    database: 'bida_db',
    user: process.env.PGUSER || '',
    password: process.env.PGPASSWORD || '',
  }
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(loadDbConfig())
  }
  return pool
}

export async function query<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
```

- [ ] **Step 5: Test kết nối DB thủ công**

Thêm tạm vào `electron/main.ts` (sau khi app ready):
```ts
import { query } from './db'
// trong app.whenReady():
const tables = await query('SELECT * FROM tables')
console.log('DB connected, tables:', tables.length)
```

Chạy `npm run dev` và kiểm tra console output: `DB connected, tables: 8`.

- [ ] **Step 6: Xóa code test tạm, commit**

```bash
git add db/schema.sql electron/db.ts
git commit -m "feat: add PostgreSQL schema and db connection pool"
```

---

## Task 3: IPC handlers cho Tables

**Files:**
- Create: `electron/handlers/tables.ts`
- Create: `tests/unit/handlers/tables.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Định nghĩa types dùng chung**

Tạo `src/types.ts`:
```ts
// src/types.ts
export interface BidaTable {
  id: number
  name: string
  status: 'idle' | 'playing' | 'reserved'
  hourly_rate: number
  created_at: string
}

export interface Session {
  id: number
  table_id: number
  customer_id: number | null
  start_time: string
  end_time: string | null
  duration_minutes: number | null
  play_amount: number
  status: 'open' | 'closed'
}
```

- [ ] **Step 2: Viết failing test cho tables handler**

```ts
// tests/unit/handlers/tables.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock db module
vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import { getAllTables, updateTableStatus } from '../../electron/handlers/tables'

describe('getAllTables', () => {
  it('returns all tables from database', async () => {
    const mockTables = [
      { id: 1, name: 'Bàn 1', status: 'idle', hourly_rate: 50000 },
      { id: 2, name: 'Bàn 2', status: 'playing', hourly_rate: 50000 },
    ]
    vi.mocked(db.query).mockResolvedValue(mockTables)

    const result = await getAllTables()

    expect(db.query).toHaveBeenCalledWith('SELECT * FROM tables ORDER BY id')
    expect(result).toEqual(mockTables)
  })
})

describe('updateTableStatus', () => {
  it('updates table status and returns updated table', async () => {
    const updated = { id: 1, name: 'Bàn 1', status: 'playing', hourly_rate: 50000 }
    vi.mocked(db.queryOne).mockResolvedValue(updated)

    const result = await updateTableStatus(1, 'playing')

    expect(db.queryOne).toHaveBeenCalledWith(
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
      ['playing', 1]
    )
    expect(result).toEqual(updated)
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/tables.test.ts
```

Expected: FAIL — `getAllTables` not found.

- [ ] **Step 4: Viết `electron/handlers/tables.ts`**

```ts
// electron/handlers/tables.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { BidaTable } from '../../src/types'

export async function getAllTables(): Promise<BidaTable[]> {
  return query<BidaTable>('SELECT * FROM tables ORDER BY id')
}

export async function updateTableStatus(
  tableId: number,
  status: BidaTable['status']
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
    [status, tableId]
  )
}

export function registerTableHandlers() {
  ipcMain.handle('tables:getAll', () => getAllTables())

  ipcMain.handle(
    'tables:updateStatus',
    (_event, tableId: number, status: BidaTable['status']) =>
      updateTableStatus(tableId, status)
  )
}
```

- [ ] **Step 5: Chạy test để xác nhận pass**

```bash
npx vitest run tests/unit/handlers/tables.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Đăng ký handlers trong `electron/main.ts`**

```ts
// electron/main.ts — thêm vào phần imports và app.whenReady()
import { registerTableHandlers } from './handlers/tables'

// trong app.whenReady():
registerTableHandlers()
```

- [ ] **Step 7: Cập nhật `electron/preload.ts`**

```ts
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { BidaTable } from '../src/types'

contextBridge.exposeInMainWorld('api', {
  tables: {
    getAll: (): Promise<BidaTable[]> =>
      ipcRenderer.invoke('tables:getAll'),
    updateStatus: (tableId: number, status: BidaTable['status']): Promise<BidaTable | null> =>
      ipcRenderer.invoke('tables:updateStatus', tableId, status),
  },
})
```

- [ ] **Step 8: Thêm type declaration cho `window.api`**

Tạo `src/electron.d.ts`:
```ts
// src/electron.d.ts
import type { BidaTable, Session } from './types'

declare global {
  interface Window {
    api: {
      tables: {
        getAll(): Promise<BidaTable[]>
        updateStatus(id: number, status: BidaTable['status']): Promise<BidaTable | null>
      }
    }
  }
}

export {}
```

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/electron.d.ts electron/handlers/tables.ts \
        electron/main.ts electron/preload.ts \
        tests/unit/handlers/tables.test.ts
git commit -m "feat: add tables IPC handler with tests"
```

---

## Task 4: IPC handlers cho Sessions

**Files:**
- Create: `electron/handlers/sessions.ts`
- Create: `tests/unit/handlers/sessions.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/electron.d.ts`

- [ ] **Step 1: Viết failing tests**

```ts
// tests/unit/handlers/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import {
  createSession,
  getActiveSessions,
  closeSession,
} from '../../electron/handlers/sessions'

describe('createSession', () => {
  it('creates a new session and sets table to playing', async () => {
    const mockSession = {
      id: 1, table_id: 2, customer_id: null,
      start_time: '2026-05-26T10:00:00Z', status: 'open', play_amount: 0
    }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(mockSession) // INSERT session
      .mockResolvedValueOnce({ id: 2, status: 'playing' }) // UPDATE table

    const result = await createSession(2, null)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO sessions (table_id, customer_id) VALUES ($1, $2) RETURNING *',
      [2, null]
    )
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
      ['playing', 2]
    )
    expect(result).toEqual(mockSession)
  })
})

describe('getActiveSessions', () => {
  it('returns all open sessions with table info', async () => {
    const mockSessions = [
      { id: 1, table_id: 2, table_name: 'Bàn 2', start_time: '2026-05-26T10:00:00Z' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockSessions)

    const result = await getActiveSessions()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("s.status = 'open'")
    )
    expect(result).toEqual(mockSessions)
  })
})

describe('closeSession', () => {
  it('calculates duration, updates session and sets table idle', async () => {
    const startTime = new Date(Date.now() - 90 * 60 * 1000).toISOString() // 90 phút trước
    const openSession = { id: 1, table_id: 3, start_time: startTime, status: 'open' }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(openSession)      // SELECT session
      .mockResolvedValueOnce({ ...openSession, status: 'closed', duration_minutes: 90, play_amount: 75000 }) // UPDATE session
      .mockResolvedValueOnce({ id: 3, status: 'idle' }) // UPDATE table

    const result = await closeSession(1, 75000)

    expect(result?.status).toBe('closed')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/sessions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Viết `electron/handlers/sessions.ts`**

```ts
// electron/handlers/sessions.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Session } from '../../src/types'

export async function createSession(
  tableId: number,
  customerId: number | null
): Promise<Session | null> {
  const session = await queryOne<Session>(
    'INSERT INTO sessions (table_id, customer_id) VALUES ($1, $2) RETURNING *',
    [tableId, customerId]
  )
  if (session) {
    await queryOne(
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
      ['playing', tableId]
    )
  }
  return session
}

export async function getActiveSessions(): Promise<
  (Session & { table_name: string; hourly_rate: number })[]
> {
  return query(
    `SELECT s.*, t.name AS table_name, t.hourly_rate
     FROM sessions s
     JOIN tables t ON t.id = s.table_id
     WHERE s.status = 'open'
     ORDER BY s.start_time`
  )
}

export async function closeSession(
  sessionId: number,
  playAmount: number
): Promise<Session | null> {
  const session = await queryOne<Session>(
    'SELECT * FROM sessions WHERE id = $1',
    [sessionId]
  )
  if (!session) return null

  const endTime = new Date()
  const startTime = new Date(session.start_time)
  const durationMinutes = Math.ceil(
    (endTime.getTime() - startTime.getTime()) / 60000
  )

  const closed = await queryOne<Session>(
    `UPDATE sessions
     SET status = 'closed', end_time = $1, duration_minutes = $2, play_amount = $3
     WHERE id = $4
     RETURNING *`,
    [endTime.toISOString(), durationMinutes, playAmount, sessionId]
  )

  if (closed) {
    await queryOne(
      "UPDATE tables SET status = 'idle' WHERE id = $1 RETURNING *",
      [session.table_id]
    )
  }
  return closed
}

export function registerSessionHandlers() {
  ipcMain.handle(
    'sessions:create',
    (_event, tableId: number, customerId: number | null) =>
      createSession(tableId, customerId)
  )

  ipcMain.handle('sessions:getActive', () => getActiveSessions())

  ipcMain.handle(
    'sessions:close',
    (_event, sessionId: number, playAmount: number) =>
      closeSession(sessionId, playAmount)
  )
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run tests/unit/handlers/sessions.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Đăng ký session handlers trong `electron/main.ts`**

```ts
// thêm vào electron/main.ts
import { registerSessionHandlers } from './handlers/sessions'

// trong app.whenReady():
registerSessionHandlers()
```

- [ ] **Step 6: Mở rộng `electron/preload.ts`**

```ts
// thêm vào contextBridge.exposeInMainWorld('api', { ... })
sessions: {
  create: (tableId: number, customerId: number | null): Promise<Session | null> =>
    ipcRenderer.invoke('sessions:create', tableId, customerId),
  getActive: (): Promise<(Session & { table_name: string; hourly_rate: number })[]> =>
    ipcRenderer.invoke('sessions:getActive'),
  close: (sessionId: number, playAmount: number): Promise<Session | null> =>
    ipcRenderer.invoke('sessions:close', sessionId, playAmount),
},
```

- [ ] **Step 7: Cập nhật `src/electron.d.ts`**

```ts
// thêm vào interface Window.api
sessions: {
  create(tableId: number, customerId: number | null): Promise<Session | null>
  getActive(): Promise<(Session & { table_name: string; hourly_rate: number })[]>
  close(sessionId: number, playAmount: number): Promise<Session | null>
}
```

- [ ] **Step 8: Commit**

```bash
git add electron/handlers/sessions.ts electron/main.ts electron/preload.ts \
        src/electron.d.ts tests/unit/handlers/sessions.test.ts
git commit -m "feat: add sessions IPC handler with tests"
```

---

## Task 5: Utility functions

**Files:**
- Create: `src/lib/utils.ts`
- Create: `tests/unit/utils.test.ts`

- [ ] **Step 1: Viết failing tests**

```ts
// tests/unit/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDuration, calcPlayAmount } from '../../src/lib/utils'

describe('formatCurrency', () => {
  it('formats number as Vietnamese dong', () => {
    expect(formatCurrency(125000)).toBe('125,000đ')
    expect(formatCurrency(0)).toBe('0đ')
    expect(formatCurrency(1000000)).toBe('1,000,000đ')
  })
})

describe('formatDuration', () => {
  it('formats minutes into hours and minutes', () => {
    expect(formatDuration(90)).toBe('1 giờ 30 phút')
    expect(formatDuration(60)).toBe('1 giờ 0 phút')
    expect(formatDuration(45)).toBe('0 giờ 45 phút')
  })
})

describe('calcPlayAmount', () => {
  it('calculates play amount based on duration and rate', () => {
    // 90 phút x 50k/giờ = 75k (tính theo phút, không làm tròn lên giờ)
    expect(calcPlayAmount(90, 50000)).toBe(75000)
    // 150 phút x 50k/giờ = 125k
    expect(calcPlayAmount(150, 50000)).toBe(125000)
    // 30 phút x 50k/giờ = 25k
    expect(calcPlayAmount(30, 50000)).toBe(25000)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/utils.test.ts
```

- [ ] **Step 3: Viết `src/lib/utils.ts`**

```ts
// src/lib/utils.ts
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ'
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} giờ ${m} phút`
}

export function calcPlayAmount(durationMinutes: number, hourlyRate: number): number {
  return Math.round((durationMinutes / 60) * hourlyRate)
}

export function elapsedMinutes(startTime: string): number {
  return Math.floor((Date.now() - new Date(startTime).getTime()) / 60000)
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run tests/unit/utils.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts tests/unit/utils.test.ts
git commit -m "feat: add utility functions with tests"
```

---

## Task 6: IPC helper và React Query setup

**Files:**
- Create: `src/lib/ipc.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Viết `src/lib/ipc.ts`**

```ts
// src/lib/ipc.ts
// Re-export window.api với type safety, dùng trong React components
export const api = () => window.api
```

- [ ] **Step 2: Cập nhật `src/main.tsx` để wrap QueryClient**

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5000, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 3: Viết `src/App.tsx` với routing**

```tsx
// src/App.tsx
import { useState } from 'react'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <span className="text-xl font-bold text-green-400">🎱 Bida Manager</span>
      </nav>
      <main className="p-6">
        <Dashboard />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ipc.ts src/main.tsx src/App.tsx
git commit -m "feat: setup React Query provider and app layout"
```

---

## Task 7: Component TableCard

**Files:**
- Create: `src/components/TableCard.tsx`
- Create: `src/components/SessionTimer.tsx`
- Create: `src/stores/sessionStore.ts`

- [ ] **Step 1: Viết `src/stores/sessionStore.ts`**

```ts
// src/stores/sessionStore.ts
import { create } from 'zustand'
import type { Session } from '../types'

interface SessionStore {
  activeSessions: Record<number, Session & { table_name: string; hourly_rate: number }>
  setActiveSessions: (sessions: (Session & { table_name: string; hourly_rate: number })[]) => void
  getSessionByTableId: (tableId: number) => (Session & { table_name: string; hourly_rate: number }) | undefined
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  activeSessions: {},
  setActiveSessions: (sessions) => {
    const map: SessionStore['activeSessions'] = {}
    sessions.forEach((s) => { map[s.table_id] = s })
    set({ activeSessions: map })
  },
  getSessionByTableId: (tableId) => get().activeSessions[tableId],
}))
```

- [ ] **Step 2: Viết `src/components/SessionTimer.tsx`**

```tsx
// src/components/SessionTimer.tsx
import { useEffect, useState } from 'react'
import { elapsedMinutes, formatDuration, calcPlayAmount, formatCurrency } from '../lib/utils'

interface Props {
  startTime: string
  hourlyRate: number
}

export default function SessionTimer({ startTime, hourlyRate }: Props) {
  const [minutes, setMinutes] = useState(() => elapsedMinutes(startTime))

  useEffect(() => {
    const timer = setInterval(() => {
      setMinutes(elapsedMinutes(startTime))
    }, 60000)
    return () => clearInterval(timer)
  }, [startTime])

  const amount = calcPlayAmount(minutes, hourlyRate)

  return (
    <div className="text-center">
      <p className="text-lg font-mono text-yellow-400">{formatDuration(minutes)}</p>
      <p className="text-sm text-green-400">{formatCurrency(amount)}</p>
    </div>
  )
}
```

- [ ] **Step 3: Viết `src/components/TableCard.tsx`**

```tsx
// src/components/TableCard.tsx
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import SessionTimer from './SessionTimer'
import { formatCurrency } from '../lib/utils'

interface Props {
  table: BidaTable
  onOpen: (table: BidaTable) => void
  onView: (tableId: number) => void
}

const STATUS_COLORS = {
  idle: 'bg-green-900 border-green-500 hover:bg-green-800',
  playing: 'bg-red-900 border-red-500 hover:bg-red-800',
  reserved: 'bg-yellow-900 border-yellow-500 hover:bg-yellow-800',
} as const

const STATUS_LABELS = {
  idle: 'Trống',
  playing: 'Đang chơi',
  reserved: 'Đã đặt',
} as const

export default function TableCard({ table, onOpen, onView }: Props) {
  const session = useSessionStore((s) => s.getSessionByTableId(table.id))

  return (
    <button
      className={`
        relative w-full rounded-xl border-2 p-4 text-left transition-all
        ${STATUS_COLORS[table.status]}
      `}
      onClick={() => table.status === 'idle' ? onOpen(table) : onView(table.id)}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-lg font-bold">{table.name}</span>
        <span className={`text-xs px-2 py-1 rounded-full font-medium
          ${table.status === 'idle' ? 'bg-green-500' :
            table.status === 'playing' ? 'bg-red-500' : 'bg-yellow-500'} text-white`}>
          {STATUS_LABELS[table.status]}
        </span>
      </div>

      {table.status === 'idle' && (
        <p className="text-sm text-gray-400">{formatCurrency(table.hourly_rate)}/giờ</p>
      )}

      {table.status === 'playing' && session && (
        <SessionTimer
          startTime={session.start_time}
          hourlyRate={session.hourly_rate}
        />
      )}
    </button>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/sessionStore.ts src/components/SessionTimer.tsx \
        src/components/TableCard.tsx
git commit -m "feat: add TableCard and SessionTimer components"
```

---

## Task 8: Modal mở phiên và Dashboard page

**Files:**
- Create: `src/components/OpenSessionModal.tsx`
- Create: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Viết `src/components/OpenSessionModal.tsx`**

```tsx
// src/components/OpenSessionModal.tsx
import { useState } from 'react'
import type { BidaTable } from '../types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '../lib/utils'

interface Props {
  table: BidaTable | null
  onConfirm: (tableId: number, customerPhone: string | null) => Promise<void>
  onClose: () => void
}

export default function OpenSessionModal({ table, onConfirm, onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  if (!table) return null

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm(table.id, phone.trim() || null)
    setLoading(false)
    setPhone('')
  }

  return (
    <Dialog open={!!table} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Mở phiên chơi — {table.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-400">
            Giá: <span className="text-white">{formatCurrency(table.hourly_rate)}/giờ</span>
          </p>
          <div>
            <Label htmlFor="phone">Số điện thoại khách (không bắt buộc)</Label>
            <Input
              id="phone"
              className="mt-1 bg-gray-800 border-gray-600"
              placeholder="0901234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Huỷ
          </Button>
          <Button onClick={handleConfirm} disabled={loading}
            className="bg-green-600 hover:bg-green-700">
            {loading ? 'Đang mở...' : 'Bắt đầu chơi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Viết `src/pages/Dashboard.tsx`**

```tsx
// src/pages/Dashboard.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import TableCard from '../components/TableCard'
import OpenSessionModal from '../components/OpenSessionModal'
import { api } from '../lib/ipc'

export default function Dashboard() {
  const queryClient = useQueryClient()
  const setActiveSessions = useSessionStore((s) => s.setActiveSessions)
  const [selectedTable, setSelectedTable] = useState<BidaTable | null>(null)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api().tables.getAll(),
    refetchInterval: 30000,
  })

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
    refetchInterval: 60000,
  })

  useEffect(() => {
    setActiveSessions(activeSessions)
  }, [activeSessions, setActiveSessions])

  const openSessionMutation = useMutation({
    mutationFn: ({ tableId, phone }: { tableId: number; phone: string | null }) =>
      api().sessions.create(tableId, null), // TODO Plan 3: lookup customer by phone
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      setSelectedTable(null)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Đang tải...</p>
      </div>
    )
  }

  const idleCount = tables.filter((t) => t.status === 'idle').length
  const playingCount = tables.filter((t) => t.status === 'playing').length

  return (
    <div>
      <div className="flex items-center gap-6 mb-6">
        <h1 className="text-2xl font-bold">Quản lý bàn</h1>
        <span className="text-sm text-green-400">{idleCount} bàn trống</span>
        <span className="text-sm text-red-400">{playingCount} bàn đang chơi</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onOpen={setSelectedTable}
            onView={(id) => console.log('View session for table', id)} // TODO Plan 1 Task 9
          />
        ))}
      </div>

      <OpenSessionModal
        table={selectedTable}
        onConfirm={async (tableId, phone) => {
          await openSessionMutation.mutateAsync({ tableId, phone })
        }}
        onClose={() => setSelectedTable(null)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Chạy app để test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Grid bàn hiển thị đúng
- [ ] Click bàn trống → modal mở lên
- [ ] Xác nhận → bàn chuyển màu đỏ "Đang chơi"
- [ ] Timer hiển thị và đếm giờ

- [ ] **Step 4: Commit**

```bash
git add src/components/OpenSessionModal.tsx src/pages/Dashboard.tsx
git commit -m "feat: add Dashboard with table grid and open session flow"
```

---

## Task 9: Trang chi tiết phiên (Session page)

**Files:**
- Create: `src/pages/Session.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Viết `src/pages/Session.tsx`**

```tsx
// src/pages/Session.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { formatCurrency, calcPlayAmount, elapsedMinutes, formatDuration } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import type { Session as SessionType } from '../types'

interface Props {
  tableId: number
  onBack: () => void
  onCheckout: (session: SessionType & { table_name: string; hourly_rate: number }, playAmount: number) => void
}

export default function SessionPage({ tableId, onBack, onCheckout }: Props) {
  const queryClient = useQueryClient()
  const [minutes, setMinutes] = useState(0)

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
  })

  const session = sessions.find((s) => s.table_id === tableId)

  useEffect(() => {
    if (!session) return
    setMinutes(elapsedMinutes(session.start_time))
    const timer = setInterval(() => {
      setMinutes(elapsedMinutes(session.start_time))
    }, 30000)
    return () => clearInterval(timer)
  }, [session?.start_time])

  if (!session) {
    return (
      <div className="p-6">
        <Button variant="outline" onClick={onBack}>← Quay lại</Button>
        <p className="mt-4 text-gray-400">Không tìm thấy phiên chơi.</p>
      </div>
    )
  }

  const playAmount = calcPlayAmount(minutes, session.hourly_rate)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={onBack} className="border-gray-600">
          ← Quay lại
        </Button>
        <h1 className="text-2xl font-bold">{session.table_name}</h1>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 mb-4 text-center">
        <p className="text-gray-400 mb-1">Thời gian chơi</p>
        <p className="text-5xl font-mono font-bold text-yellow-400">
          {formatDuration(minutes)}
        </p>
        <p className="text-2xl text-green-400 mt-2">{formatCurrency(playAmount)}</p>
        <p className="text-xs text-gray-500 mt-1">
          {formatCurrency(session.hourly_rate)}/giờ
        </p>
      </div>

      <div className="flex gap-4">
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700 py-6 text-lg"
          onClick={() => onCheckout(session, playAmount)}
        >
          Kết thúc & Thanh toán
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật `src/App.tsx` để có navigation**

```tsx
// src/App.tsx
import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/Session'
import type { Session } from './types'

type View =
  | { page: 'dashboard' }
  | { page: 'session'; tableId: number }

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' })

  const handleCheckout = (
    session: Session & { table_name: string; hourly_rate: number },
    playAmount: number
  ) => {
    // TODO Plan 2: navigate to Invoice page
    console.log('Checkout session', session.id, 'play amount:', playAmount)
    setView({ page: 'dashboard' })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <button
          className="text-xl font-bold text-green-400"
          onClick={() => setView({ page: 'dashboard' })}
        >
          🎱 Bida Manager
        </button>
      </nav>
      <main className="p-6">
        {view.page === 'dashboard' && (
          <Dashboard
            onViewSession={(tableId) => setView({ page: 'session', tableId })}
          />
        )}
        {view.page === 'session' && (
          <SessionPage
            tableId={view.tableId}
            onBack={() => setView({ page: 'dashboard' })}
            onCheckout={handleCheckout}
          />
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Cập nhật `Dashboard.tsx` để nhận prop `onViewSession`**

Thay `onView={(id) => console.log(...)}` bằng `onView={onViewSession}`, và thêm prop:
```tsx
interface Props {
  onViewSession: (tableId: number) => void
}
export default function Dashboard({ onViewSession }: Props) {
```

- [ ] **Step 4: Test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Click bàn đang chơi → chuyển sang trang Session
- [ ] Timer chạy, tiền tính đúng
- [ ] Nút "Quay lại" về Dashboard
- [ ] Nút "Kết thúc & Thanh toán" → về Dashboard (sẽ mở Invoice ở Plan 2)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Session.tsx src/App.tsx src/pages/Dashboard.tsx
git commit -m "feat: add Session detail page with timer and checkout trigger"
```

---

## Task 10: E2E test cơ bản

**Files:**
- Create: `tests/e2e/dashboard.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Tạo `playwright.config.ts`**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    // Playwright Electron support
  },
  timeout: 30000,
})
```

- [ ] **Step 2: Viết E2E test**

```ts
// tests/e2e/dashboard.spec.ts
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

test('dashboard loads and shows tables', async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Kiểm tra có ít nhất 1 bàn trống
  const tableCards = window.locator('[data-testid="table-card"]')
  await expect(tableCards.first()).toBeVisible()

  await app.close()
})
```

> **Lưu ý:** E2E test cần build trước (`npm run build`). Thêm `data-testid="table-card"` vào `TableCard.tsx`.

- [ ] **Step 3: Thêm `data-testid` vào TableCard**

```tsx
// TableCard.tsx — thêm vào <button>:
data-testid="table-card"
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ playwright.config.ts src/components/TableCard.tsx
git commit -m "test: add E2E test scaffold for dashboard"
```

---

## Task 11: Chạy toàn bộ tests

- [ ] **Step 1: Chạy unit tests**

```bash
npx vitest run
```

Expected: All tests PASS (≥ 12 tests).

- [ ] **Step 2: Build app**

```bash
npm run build
```

Expected: Không có lỗi TypeScript.

- [ ] **Step 3: Final manual smoke test**

```bash
npm run dev
```

Kiểm tra toàn bộ luồng:
- [ ] App khởi động, hiển thị grid bàn
- [ ] Mở phiên → bàn đổi màu đỏ
- [ ] Xem chi tiết phiên → timer chạy
- [ ] Quay lại Dashboard

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Plan 1 complete — Foundation with dashboard and session management"
```

---

## Checklist Plan 1

- [ ] Electron + React + Vite + TypeScript khởi động thành công
- [ ] PostgreSQL schema được tạo với seed data
- [ ] IPC: tables:getAll, tables:updateStatus
- [ ] IPC: sessions:create, sessions:getActive, sessions:close
- [ ] Dashboard hiển thị grid bàn với màu trạng thái
- [ ] Mở phiên mới qua modal
- [ ] Trang Session với timer realtime
- [ ] Unit tests pass
- [ ] Build TypeScript không có lỗi

**Tiếp theo:** Xem Plan 2 tại `docs/superpowers/plans/2026-05-26-plan-2-invoice-products.md`
