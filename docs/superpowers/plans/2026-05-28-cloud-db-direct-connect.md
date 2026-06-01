# Cloud DB Direct Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ local PostgreSQL + sync queue, Electron app connect trực tiếp vào cloud DB (Render), filter mọi query theo `agent_id`.

**Architecture:** Electron app đọc `DATABASE_URL` từ env → connect Pool trực tiếp vào `bida_db` trên Render → mọi handler thêm `agent_id` filter → xoá toàn bộ sync code.

**Tech Stack:** pg (node-postgres), electron-vite env vars, Render PostgreSQL (cloud_* tables)

---

## File Structure

**Modified:**
- `src/main/db.ts` — hỗ trợ `DATABASE_URL` env var
- `src/main/handlers/tables.ts` — dùng `cloud_tables`, thêm `agent_id` filter
- `src/main/handlers/sessions.ts` — dùng `cloud_sessions`, thêm `agent_id` filter
- `src/main/handlers/products.ts` — dùng `cloud_products` + `cloud_stock_transactions`
- `src/main/handlers/customers.ts` — dùng `cloud_customers` + joins
- `src/main/handlers/invoices.ts` — dùng `cloud_invoices`, invoice number per-agent
- `src/main/handlers/orderItems.ts` — dùng `cloud_order_items`
- `src/main/handlers/reports.ts` — dùng `cloud_*` tables
- `src/main/handlers/settings.ts` — dùng `cloud_settings`, filter by `agent_id`
- `src/main/handlers/auth.ts` — xoá `backfillAgentId`
- `src/main/index.ts` — xoá sync imports
- `.env` — thêm `DATABASE_URL`

**Deleted:**
- `src/main/sync/worker.ts`
- `src/main/sync/network.ts`

---

### Task 1: Update db.ts — hỗ trợ DATABASE_URL

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Sửa `loadDbConfig` để đọc `DATABASE_URL`**

```typescript
// src/main/db.ts
import { Pool, types } from 'pg'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

types.setTypeParser(1700, (val: string) => parseFloat(val))

function createPool(): Pool {
  const url = process.env.DATABASE_URL
  if (url) {
    return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  }
  const configPath = path.join(app.getPath('userData'), 'db-config.json')
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return new Pool(cfg)
  }
  return new Pool({
    host: 'localhost',
    port: 5432,
    database: 'bida_db',
    user: process.env.PGUSER || '',
    password: process.env.PGPASSWORD || '',
  })
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) pool = createPool()
  return pool
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
```

- [ ] **Step 2: Thêm DATABASE_URL vào .env**

File `.env` ở root project:
```
VITE_API_URL=https://bida-management.onrender.com/api/v1
DATABASE_URL=postgresql://bida_db_user:PASSWORD@HOST.singapore-postgres.render.com/bida_db
```

*(Thay bằng External Database URL thực tế từ Render)*

- [ ] **Step 3: Commit**

```bash
git add src/main/db.ts .env
git commit -m "feat: support DATABASE_URL in db.ts for cloud connect"
```

---

### Task 2: Update tables.ts — cloud_tables + agent_id

**Files:**
- Modify: `src/main/handlers/tables.ts`

- [ ] **Step 1: Viết lại toàn bộ handler**

```typescript
// src/main/handlers/tables.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { BidaTable } from '../../renderer/src/types'

export async function getAllTables(): Promise<BidaTable[]> {
  const agentId = getAgentId()
  return query<BidaTable>(
    'SELECT * FROM cloud_tables WHERE agent_id = $1 ORDER BY id',
    [agentId]
  )
}

export async function updateTableStatus(
  tableId: number,
  status: BidaTable['status']
): Promise<BidaTable | null> {
  const agentId = getAgentId()
  return queryOne<BidaTable>(
    'UPDATE cloud_tables SET status = $1 WHERE id = $2 AND agent_id = $3 RETURNING *',
    [status, tableId, agentId]
  )
}

export async function createTable(name: string, hourlyRate: number): Promise<BidaTable | null> {
  const agentId = getAgentId()
  return queryOne<BidaTable>(
    'INSERT INTO cloud_tables (name, hourly_rate, agent_id) VALUES ($1, $2, $3) RETURNING *',
    [name, hourlyRate, agentId]
  )
}

export async function updateTable(
  tableId: number,
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  const agentId = getAgentId()
  return queryOne<BidaTable>(
    'UPDATE cloud_tables SET name = $1, hourly_rate = $2 WHERE id = $3 AND agent_id = $4 RETURNING *',
    [name, hourlyRate, tableId, agentId]
  )
}

export function registerTableHandlers() {
  ipcMain.handle('tables:getAll', () => getAllTables())
  ipcMain.handle('tables:updateStatus', (_e, tableId: number, status: BidaTable['status']) =>
    updateTableStatus(tableId, status)
  )
  ipcMain.handle('tables:create', (_e, name: string, hourlyRate: number) =>
    createTable(name, hourlyRate)
  )
  ipcMain.handle('tables:update', (_e, tableId: number, name: string, hourlyRate: number) =>
    updateTable(tableId, name, hourlyRate)
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/tables.ts
git commit -m "feat: tables handler uses cloud_tables with agent_id filter"
```

---

### Task 3: Update sessions.ts — cloud_sessions

**Files:**
- Modify: `src/main/handlers/sessions.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/sessions.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import { updateTableStatus } from './tables'
import type { Session } from '../../renderer/src/types'

export async function createSession(
  tableId: number,
  customerId: number | null
): Promise<Session | null> {
  const agentId = getAgentId()
  const session = await queryOne<Session>(
    'INSERT INTO cloud_sessions (table_id, customer_id, agent_id) VALUES ($1, $2, $3) RETURNING *',
    [tableId, customerId, agentId]
  )
  if (session) await updateTableStatus(tableId, 'playing')
  return session
}

export async function getActiveSessions(): Promise<
  (Session & { table_name: string; hourly_rate: number })[]
> {
  const agentId = getAgentId()
  return query(
    `SELECT s.*, t.name AS table_name, t.hourly_rate
     FROM cloud_sessions s
     JOIN cloud_tables t ON t.id = s.table_id
     WHERE s.status = 'open' AND s.agent_id = $1
     ORDER BY s.start_time`,
    [agentId]
  )
}

export async function closeSession(
  sessionId: number,
  playAmount: number
): Promise<Session | null> {
  const agentId = getAgentId()
  const session = await queryOne<Session>(
    'SELECT * FROM cloud_sessions WHERE id = $1 AND agent_id = $2',
    [sessionId, agentId]
  )
  if (!session) return null

  const endTime = new Date()
  const durationMinutes = Math.ceil(
    (endTime.getTime() - new Date(session.start_time).getTime()) / 60000
  )

  const closed = await queryOne<Session>(
    `UPDATE cloud_sessions
     SET status = 'closed', end_time = $1, duration_minutes = $2, play_amount = $3
     WHERE id = $4 AND status = 'open' AND agent_id = $5 RETURNING *`,
    [endTime.toISOString(), durationMinutes, playAmount, sessionId, agentId]
  )

  if (closed) await updateTableStatus(session.table_id, 'idle')
  return closed
}

export function registerSessionHandlers() {
  ipcMain.handle('sessions:create', (_e, tableId: number, customerId: number | null) =>
    createSession(tableId, customerId)
  )
  ipcMain.handle('sessions:getActive', () => getActiveSessions())
  ipcMain.handle('sessions:close', (_e, sessionId: number, playAmount: number) =>
    closeSession(sessionId, playAmount)
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/sessions.ts
git commit -m "feat: sessions handler uses cloud_sessions with agent_id filter"
```

---

### Task 4: Update products.ts — cloud_products

**Files:**
- Modify: `src/main/handlers/products.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/products.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Product } from '../../renderer/src/types'

interface StockTransaction { id: number }

export async function getAllProducts(): Promise<Product[]> {
  const agentId = getAgentId()
  return query<Product>(
    'SELECT * FROM cloud_products WHERE is_active = TRUE AND agent_id = $1 ORDER BY category, name',
    [agentId]
  )
}

export async function createProduct(input: {
  name: string
  category: Product['category']
  price: number
  unit: string
  min_stock_alert: number
}): Promise<Product | null> {
  const agentId = getAgentId()
  return queryOne<Product>(
    `INSERT INTO cloud_products (name, category, price, unit, min_stock_alert, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.name, input.category, input.price, input.unit, input.min_stock_alert, agentId]
  )
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'created_at'>>
): Promise<Product | null> {
  const agentId = getAgentId()
  const ALLOWED = new Set(['name', 'category', 'price', 'unit', 'min_stock_alert', 'is_active', 'stock_quantity'])
  const fields = Object.keys(input).filter((f) => ALLOWED.has(f))
  if (fields.length === 0) return null
  const values = fields.map((f) => (input as any)[f])
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Product>(
    `UPDATE cloud_products SET ${setClause} WHERE id = $${fields.length + 1} AND agent_id = $${fields.length + 2} RETURNING *`,
    [...values, id, agentId]
  )
}

export async function adjustStock(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note: string,
  costPrice: number | null = null
): Promise<Product | null> {
  const agentId = getAgentId()
  const operator = type === 'out' ? '-' : '+'
  const product = await queryOne<Product>(
    `UPDATE cloud_products SET stock_quantity = stock_quantity ${operator} $1
     WHERE id = $2 AND agent_id = $3 RETURNING *`,
    [quantity, productId, agentId]
  )
  if (!product) return null

  const afterQty = product.stock_quantity
  const beforeQty = type === 'out' ? afterQty + quantity : afterQty - quantity

  await queryOne<StockTransaction>(
    `INSERT INTO cloud_stock_transactions
       (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [productId, type, quantity, costPrice, beforeQty, afterQty, note, agentId]
  )

  return product
}

export function registerProductHandlers() {
  ipcMain.handle('products:getAll', () => getAllProducts())
  ipcMain.handle('products:create', (_e, input) => createProduct(input))
  ipcMain.handle('products:update', (_e, id: number, input) => updateProduct(id, input))
  ipcMain.handle('products:adjustStock',
    (_e, id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string, costPrice: number | null) =>
      adjustStock(id, type, qty, note, costPrice)
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/products.ts
git commit -m "feat: products handler uses cloud_products with agent_id filter"
```

---

### Task 5: Update customers.ts — cloud_customers

**Files:**
- Modify: `src/main/handlers/customers.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/customers.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Customer } from '../../renderer/src/types'

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const agentId = getAgentId()
  return queryOne<Customer>(
    'SELECT * FROM cloud_customers WHERE phone = $1 AND agent_id = $2',
    [phone, agentId]
  )
}

export async function getAllCustomers(): Promise<Customer[]> {
  const agentId = getAgentId()
  return query<Customer>(
    'SELECT * FROM cloud_customers WHERE agent_id = $1 ORDER BY total_spent DESC',
    [agentId]
  )
}

export async function createCustomer(input: {
  name: string
  phone: string
  email: string | null
  notes: string | null
}): Promise<Customer | null> {
  const agentId = getAgentId()
  return queryOne<Customer>(
    `INSERT INTO cloud_customers (name, phone, email, notes, agent_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.phone, input.email, input.notes, agentId]
  )
}

export async function updateCustomer(
  id: number,
  input: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'notes' | 'points_balance'>>
): Promise<Customer | null> {
  const agentId = getAgentId()
  const ALLOWED = new Set(['name', 'phone', 'email', 'notes', 'points_balance'])
  const fields = Object.keys(input).filter((f) => ALLOWED.has(f))
  if (fields.length === 0) return null
  const values = fields.map((f) => (input as any)[f])
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Customer>(
    `UPDATE cloud_customers SET ${setClause} WHERE id = $${fields.length + 1} AND agent_id = $${fields.length + 2} RETURNING *`,
    [...values, id, agentId]
  )
}

export async function getCustomerInvoices(customerId: number) {
  const agentId = getAgentId()
  return query(
    `SELECT i.*, s.start_time, t.name AS table_name
     FROM cloud_invoices i
     JOIN cloud_sessions s ON s.id = i.session_id
     JOIN cloud_tables t ON t.id = s.table_id
     WHERE s.customer_id = $1 AND i.agent_id = $2
     ORDER BY i.created_at DESC
     LIMIT 20`,
    [customerId, agentId]
  )
}

export function registerCustomerHandlers() {
  ipcMain.handle('customers:findByPhone', (_e, phone: string) => findCustomerByPhone(phone))
  ipcMain.handle('customers:getAll', () => getAllCustomers())
  ipcMain.handle('customers:create', (_e, input) => createCustomer(input))
  ipcMain.handle('customers:update', (_e, id: number, input) => updateCustomer(id, input))
  ipcMain.handle('customers:invoices', (_e, customerId: number) => getCustomerInvoices(customerId))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/customers.ts
git commit -m "feat: customers handler uses cloud_customers with agent_id filter"
```

---

### Task 6: Update orderItems.ts — cloud_order_items

**Files:**
- Modify: `src/main/handlers/orderItems.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/orderItems.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { OrderItem } from '../../renderer/src/types'

export async function addOrderItem(
  sessionId: number,
  productId: number,
  quantity: number,
  unitPrice: number
): Promise<OrderItem | null> {
  const agentId = getAgentId()
  const subtotal = quantity * unitPrice
  return queryOne<OrderItem>(
    `INSERT INTO cloud_order_items (session_id, product_id, quantity, unit_price, subtotal, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [sessionId, productId, quantity, unitPrice, subtotal, agentId]
  )
}

export async function getOrderItems(
  sessionId: number
): Promise<(OrderItem & { product_name: string })[]> {
  const agentId = getAgentId()
  return query(
    `SELECT oi.*, p.name AS product_name
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id
     WHERE oi.session_id = $1 AND oi.agent_id = $2
     ORDER BY oi.created_at`,
    [sessionId, agentId]
  )
}

export async function removeOrderItem(itemId: number): Promise<void> {
  const agentId = getAgentId()
  await queryOne(
    'DELETE FROM cloud_order_items WHERE id = $1 AND agent_id = $2 RETURNING id',
    [itemId, agentId]
  )
}

export async function getOrderTotal(sessionId: number): Promise<number> {
  const agentId = getAgentId()
  const result = await queryOne<{ total: string }>(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM cloud_order_items WHERE session_id = $1 AND agent_id = $2',
    [sessionId, agentId]
  )
  return Number(result?.total ?? 0)
}

export function registerOrderItemHandlers() {
  ipcMain.handle('orderItems:add',
    (_e, sessionId: number, productId: number, qty: number, price: number) =>
      addOrderItem(sessionId, productId, qty, price)
  )
  ipcMain.handle('orderItems:get', (_e, sessionId: number) => getOrderItems(sessionId))
  ipcMain.handle('orderItems:remove', (_e, itemId: number) => removeOrderItem(itemId))
  ipcMain.handle('orderItems:total', (_e, sessionId: number) => getOrderTotal(sessionId))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/orderItems.ts
git commit -m "feat: orderItems handler uses cloud_order_items with agent_id filter"
```

---

### Task 7: Update invoices.ts — cloud_invoices

**Files:**
- Modify: `src/main/handlers/invoices.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/invoices.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Invoice, InvoiceCreateInput } from '../../renderer/src/types'
import { printInvoice } from './printer'

export async function getNextInvoiceNumber(): Promise<string> {
  const agentId = getAgentId()
  const result = await queryOne<{ max_num: string | null }>(
    'SELECT MAX(invoice_number) AS max_num FROM cloud_invoices WHERE agent_id = $1',
    [agentId]
  )
  const maxNum = result?.max_num ? parseInt(result.max_num, 10) : 0
  return String(maxNum + 1).padStart(5, '0')
}

export async function createInvoice(input: InvoiceCreateInput): Promise<Invoice | null> {
  const agentId = getAgentId()
  const invoiceNumber = await getNextInvoiceNumber()

  const invoice = await queryOne<Invoice>(
    `INSERT INTO cloud_invoices
       (session_id, invoice_number, play_amount, items_amount, total_amount,
        discount, points_redeemed, discount_from_points, final_amount, points_earned, agent_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      input.sessionId, invoiceNumber,
      input.playAmount, input.itemsAmount,
      input.playAmount + input.itemsAmount,
      input.discount, input.pointsRedeemed, input.discountFromPoints,
      input.finalAmount, input.pointsEarned, agentId,
    ]
  )

  if (invoice && input.customerId) {
    await query(
      `UPDATE cloud_customers
       SET points_balance = points_balance + $1 - $2,
           total_visits = total_visits + 1,
           total_spent = total_spent + $3
       WHERE id = $4 AND agent_id = $5`,
      [input.pointsEarned, input.pointsRedeemed, input.finalAmount, input.customerId, agentId]
    )
  }

  return invoice
}

export async function printAndMarkInvoice(
  invoiceId: number,
  input: InvoiceCreateInput,
  invoiceNumber: string,
  printerPath: string
): Promise<void> {
  await printInvoice(input, invoiceNumber, printerPath)
  const agentId = getAgentId()
  await queryOne(
    'UPDATE cloud_invoices SET printed_at = NOW() WHERE id = $1 AND agent_id = $2 RETURNING id',
    [invoiceId, agentId]
  )
}

export function registerInvoiceHandlers() {
  ipcMain.handle('invoices:create', (_e, input: InvoiceCreateInput) => createInvoice(input))
  ipcMain.handle('invoices:print',
    (_e, invoiceId: number, input: InvoiceCreateInput, invoiceNumber: string, printerPath: string) =>
      printAndMarkInvoice(invoiceId, input, invoiceNumber, printerPath)
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/invoices.ts
git commit -m "feat: invoices handler uses cloud_invoices with agent_id filter"
```

---

### Task 8: Update reports.ts — cloud_* tables

**Files:**
- Modify: `src/main/handlers/reports.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/reports.ts
import { ipcMain } from 'electron'
import { query } from '../db'
import { getAgentId } from '../lib/authStore'

export async function getRevenueReport(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT DATE(i.created_at) AS date, SUM(i.final_amount) AS total, COUNT(*) AS invoice_count
     FROM cloud_invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2 AND i.agent_id = $3
     GROUP BY DATE(i.created_at) ORDER BY date`,
    [fromDate, toDate, agentId]
  )
}

export async function getRevenueSummary(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT SUM(i.final_amount) AS total_revenue, COUNT(*) AS total_invoices, AVG(i.final_amount) AS avg_invoice
     FROM cloud_invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2 AND i.agent_id = $3`,
    [fromDate, toDate, agentId]
  )
}

export async function getTableStats(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT t.name AS table_name, COUNT(s.id) AS session_count,
            SUM(i.final_amount) AS total_revenue, AVG(s.duration_minutes) AS avg_duration_minutes
     FROM cloud_sessions s
     JOIN cloud_tables t ON t.id = s.table_id
     JOIN cloud_invoices i ON i.session_id = s.id
     WHERE DATE(s.start_time) BETWEEN $1 AND $2 AND s.agent_id = $3
     GROUP BY t.id, t.name ORDER BY total_revenue DESC`,
    [fromDate, toDate, agentId]
  )
}

export async function getLowStockProducts() {
  const agentId = getAgentId()
  return query(
    `SELECT * FROM cloud_products
     WHERE is_active = TRUE AND stock_quantity <= min_stock_alert AND agent_id = $1
     ORDER BY stock_quantity ASC`,
    [agentId]
  )
}

export function registerReportHandlers() {
  ipcMain.handle('reports:revenue', (_e, from: string, to: string) => getRevenueReport(from, to))
  ipcMain.handle('reports:summary', (_e, from: string, to: string) => getRevenueSummary(from, to))
  ipcMain.handle('reports:tableStats', (_e, from: string, to: string) => getTableStats(from, to))
  ipcMain.handle('reports:lowStock', () => getLowStockProducts())
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/reports.ts
git commit -m "feat: reports handler uses cloud_* tables with agent_id filter"
```

---

### Task 9: Update settings.ts — cloud_settings

**Files:**
- Modify: `src/main/handlers/settings.ts`

- [ ] **Step 1: Viết lại handler**

```typescript
// src/main/handlers/settings.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', () => {
    const agentId = getAgentId()
    return query<{ key: string; value: string }>(
      'SELECT key, value FROM cloud_settings WHERE agent_id = $1',
      [agentId]
    )
  })

  ipcMain.handle('settings:set', async (_e, key: string, value: string) => {
    const agentId = getAgentId()
    return queryOne<{ key: string; value: string }>(
      `INSERT INTO cloud_settings (agent_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (agent_id, key) DO UPDATE SET value = EXCLUDED.value
       RETURNING key, value`,
      [agentId, key, value]
    )
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/settings.ts
git commit -m "feat: settings handler uses cloud_settings with agent_id filter"
```

---

### Task 10: Update auth.ts — xoá backfillAgentId

**Files:**
- Modify: `src/main/handlers/auth.ts`

- [ ] **Step 1: Xoá import `query` và function `backfillAgentId`**

Xoá toàn bộ function `backfillAgentId` và dòng gọi `await backfillAgentId(data.agentId)` trong `auth:login` handler. Xoá import `query` từ `../db` nếu không còn dùng.

```typescript
// src/main/handlers/auth.ts
import { ipcMain } from 'electron'
import { authStore, getAccessToken } from '../lib/authStore'

const API_BASE = process.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status })
  return data
}

function parseExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return (payload.exp ?? 0) * 1000
  } catch {
    return 0
  }
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    authStore.set('accessToken', data.accessToken)
    authStore.set('refreshToken', data.refreshToken)
    authStore.set('expiresAt', parseExpiry(data.accessToken))
    authStore.set('role', data.role)
    authStore.set('agentId', data.agentId)
    return { role: data.role, agentId: data.agentId }
  })

  ipcMain.handle('auth:logout', async () => {
    const refreshToken = authStore.get('refreshToken')
    const accessToken = getAccessToken()
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ refreshToken }),
      })
    } catch { /* logout locally even if server call fails */ }
    authStore.clear()
  })

  ipcMain.handle('auth:getSession', async () => {
    const refreshToken = authStore.get('refreshToken')
    if (!refreshToken) return null

    const accessToken = getAccessToken()
    const expiresAt = authStore.get('expiresAt')

    if (accessToken && expiresAt && Date.now() < expiresAt - 60_000) {
      return { role: authStore.get('role'), agentId: authStore.get('agentId') }
    }

    try {
      const data = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
      authStore.set('accessToken', data.accessToken)
      authStore.set('refreshToken', data.refreshToken)
      authStore.set('expiresAt', parseExpiry(data.accessToken))
      return { role: authStore.get('role'), agentId: authStore.get('agentId') }
    } catch {
      authStore.clear()
      return null
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/auth.ts
git commit -m "feat: remove backfillAgentId from auth handler (no local DB)"
```

---

### Task 11: Remove sync code, update index.ts

**Files:**
- Modify: `src/main/index.ts`
- Delete: `src/main/sync/worker.ts`
- Delete: `src/main/sync/network.ts`

- [ ] **Step 1: Xoá 2 file sync**

```bash
rm src/main/sync/worker.ts src/main/sync/network.ts
rmdir src/main/sync 2>/dev/null || true
```

- [ ] **Step 2: Xoá sync imports trong index.ts**

Xoá 2 dòng sau khỏi `src/main/index.ts`:
```typescript
import { syncWorker } from './sync/worker'       // XOÁ
import { startNetworkWatcher } from './sync/network'  // XOÁ
```

Và xoá 2 dòng gọi trong `app.whenReady()`:
```typescript
startNetworkWatcher()      // XOÁ
syncWorker.initialSync()   // XOÁ
```

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git rm src/main/sync/worker.ts src/main/sync/network.ts
git commit -m "feat: remove sync worker, app connects directly to cloud DB"
```

---

### Task 12: Build và test

**Files:**
- Modify: `.env`

- [ ] **Step 1: Thêm DATABASE_URL vào .env**

Thêm vào file `.env` ở root:
```
DATABASE_URL=postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build thành công, không có TypeScript errors.

- [ ] **Step 3: Chạy 2 instance test**

```bash
npx electron . --user-data-dir=/tmp/bida-qk &
npx electron . --user-data-dir=/tmp/bida-ata &
```

- [ ] **Step 4: Verify isolation**

- Đăng nhập `qk_admin` vào instance 1 → mở 1 bàn → chỉ thấy bàn của QK
- Đăng nhập `ata_admin` vào instance 2 → mở 1 bàn → chỉ thấy bàn của ATA
- Vào dashboard master `https://bida-management.onrender.com/dashboard/` → cả 2 agent hiển thị đúng

- [ ] **Step 5: Commit .env vào .gitignore, push code**

Đảm bảo `.env` có trong `.gitignore` (không push credentials lên GitHub):
```bash
echo ".env" >> .gitignore
git add .gitignore src/
git commit -m "chore: update gitignore, finalize cloud DB direct connect"
git push origin main
```

- [ ] **Step 6: Build installer**

```bash
npm run build:mac
```
