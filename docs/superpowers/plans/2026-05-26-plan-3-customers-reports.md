# Bida Management — Plan 3: Customers + Reports + Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plan 1 và Plan 2 phải hoàn thành.

**Goal:** Thêm module quản lý khách hàng (CRUD, tích điểm, lịch sử), báo cáo doanh thu + thống kê bàn + cảnh báo tồn kho, và trang Cài đặt quán (thông tin, giá giờ, cấu hình máy in, loyalty).

**Architecture:** Thêm `electron/handlers/customers.ts` và `electron/handlers/reports.ts`. Trang Settings gọi `settings:set` IPC để lưu cấu hình. Dashboard tích hợp lookup khách hàng qua SĐT khi mở phiên.

**Tech Stack:** recharts (biểu đồ), React, shadcn/ui, PostgreSQL

---

## File Map

```
electron/handlers/
├── customers.ts         # IPC: customers:findByPhone, customers:create, customers:getAll, customers:update
└── reports.ts           # IPC: reports:revenue, reports:tableStats, reports:lowStock

src/pages/
├── Customers.tsx        # Danh sách + chi tiết khách hàng
├── Reports.tsx          # Doanh thu + biểu đồ + thống kê bàn
└── Settings.tsx         # Cài đặt quán + máy in + loyalty

tests/unit/handlers/
├── customers.test.ts
└── reports.test.ts
```

---

## Task 1: IPC handler cho Customers

**Files:**
- Create: `electron/handlers/customers.ts`
- Create: `tests/unit/handlers/customers.test.ts`
- Modify: `electron/main.ts`, `electron/preload.ts`, `src/electron.d.ts`, `src/types.ts`

- [ ] **Step 1: Thêm type Customer vào `src/types.ts`**

```ts
// thêm vào src/types.ts
export interface Customer {
  id: number
  name: string
  phone: string
  email: string | null
  total_visits: number
  total_spent: number
  points_balance: number
  notes: string | null
  created_at: string
}
```

- [ ] **Step 2: Viết failing tests**

```ts
// tests/unit/handlers/customers.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import {
  findCustomerByPhone,
  createCustomer,
  getAllCustomers,
} from '../../electron/handlers/customers'

describe('findCustomerByPhone', () => {
  it('returns customer when found', async () => {
    const mockCustomer = { id: 1, name: 'Nguyễn Văn A', phone: '0901234567' }
    vi.mocked(db.queryOne).mockResolvedValue(mockCustomer)

    const result = await findCustomerByPhone('0901234567')

    expect(db.queryOne).toHaveBeenCalledWith(
      'SELECT * FROM customers WHERE phone = $1',
      ['0901234567']
    )
    expect(result).toEqual(mockCustomer)
  })

  it('returns null when not found', async () => {
    vi.mocked(db.queryOne).mockResolvedValue(null)
    const result = await findCustomerByPhone('0000000000')
    expect(result).toBeNull()
  })
})

describe('createCustomer', () => {
  it('inserts a new customer and returns it', async () => {
    const input = { name: 'Nguyễn Văn B', phone: '0912345678', email: null, notes: null }
    const mockCustomer = { id: 2, ...input, total_visits: 0, points_balance: 0 }
    vi.mocked(db.queryOne).mockResolvedValue(mockCustomer)

    const result = await createCustomer(input)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO customers'),
      expect.arrayContaining([input.name, input.phone])
    )
    expect(result).toEqual(mockCustomer)
  })
})

describe('getAllCustomers', () => {
  it('returns customers ordered by total_spent descending', async () => {
    const mockCustomers = [
      { id: 1, name: 'VIP', total_spent: 1000000 },
      { id: 2, name: 'New', total_spent: 50000 },
    ]
    vi.mocked(db.query).mockResolvedValue(mockCustomers)

    const result = await getAllCustomers()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY total_spent DESC')
    )
    expect(result).toEqual(mockCustomers)
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/customers.test.ts
```

- [ ] **Step 4: Viết `electron/handlers/customers.ts`**

```ts
// electron/handlers/customers.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Customer } from '../../src/types'

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  return queryOne<Customer>('SELECT * FROM customers WHERE phone = $1', [phone])
}

export async function getAllCustomers(): Promise<Customer[]> {
  return query<Customer>('SELECT * FROM customers ORDER BY total_spent DESC')
}

export async function createCustomer(input: {
  name: string
  phone: string
  email: string | null
  notes: string | null
}): Promise<Customer | null> {
  return queryOne<Customer>(
    `INSERT INTO customers (name, phone, email, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.name, input.phone, input.email, input.notes]
  )
}

export async function updateCustomer(
  id: number,
  input: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'notes' | 'points_balance'>>
): Promise<Customer | null> {
  const fields = Object.keys(input)
  const values = Object.values(input)
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Customer>(
    `UPDATE customers SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
}

export async function getCustomerInvoices(customerId: number) {
  return query(
    `SELECT i.*, s.start_time, t.name AS table_name
     FROM invoices i
     JOIN sessions s ON s.id = i.session_id
     JOIN tables t ON t.id = s.table_id
     WHERE s.customer_id = $1
     ORDER BY i.created_at DESC
     LIMIT 20`,
    [customerId]
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

- [ ] **Step 5: Chạy test**

```bash
npx vitest run tests/unit/handlers/customers.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Đăng ký và cập nhật preload**

`electron/main.ts`:
```ts
import { registerCustomerHandlers } from './handlers/customers'
// registerCustomerHandlers()
```

`electron/preload.ts` — thêm:
```ts
customers: {
  findByPhone: (phone: string): Promise<Customer | null> => ipcRenderer.invoke('customers:findByPhone', phone),
  getAll: (): Promise<Customer[]> => ipcRenderer.invoke('customers:getAll'),
  create: (input: { name: string; phone: string; email: string | null; notes: string | null }): Promise<Customer | null> =>
    ipcRenderer.invoke('customers:create', input),
  update: (id: number, input: Partial<Customer>): Promise<Customer | null> =>
    ipcRenderer.invoke('customers:update', id, input),
  invoices: (customerId: number): Promise<unknown[]> => ipcRenderer.invoke('customers:invoices', customerId),
},
```

Cập nhật `src/electron.d.ts` tương ứng.

- [ ] **Step 7: Cập nhật OpenSessionModal để lookup khách hàng**

```tsx
// src/components/OpenSessionModal.tsx — cập nhật handleConfirm:
const handleConfirm = async () => {
  setLoading(true)
  let customerId: number | null = null
  if (phone.trim()) {
    const existing = await window.api.customers.findByPhone(phone.trim())
    if (existing) {
      customerId = existing.id
    } else {
      // Hỏi tên để tạo mới
      const name = prompt('Khách hàng mới. Nhập tên:') ?? phone.trim()
      const newCustomer = await window.api.customers.create({
        name, phone: phone.trim(), email: null, notes: null,
      })
      customerId = newCustomer?.id ?? null
    }
  }
  await onConfirm(table!.id, customerId)
  setLoading(false)
  setPhone('')
}
```

> Lưu ý: `prompt()` hoạt động trong Electron renderer. Nếu muốn UX tốt hơn, thay bằng Dialog ở iteration sau.

- [ ] **Step 8: Commit**

```bash
git add electron/handlers/customers.ts electron/main.ts electron/preload.ts \
        src/electron.d.ts src/types.ts src/components/OpenSessionModal.tsx \
        tests/unit/handlers/customers.test.ts
git commit -m "feat: add customers handler with phone lookup and session linking"
```

---

## Task 2: IPC handler cho Reports

**Files:**
- Create: `electron/handlers/reports.ts`
- Create: `tests/unit/handlers/reports.test.ts`

- [ ] **Step 1: Viết failing tests**

```ts
// tests/unit/handlers/reports.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import { getRevenueReport, getTableStats, getLowStockProducts } from '../../electron/handlers/reports'

describe('getRevenueReport', () => {
  it('queries invoices between date range', async () => {
    const mockData = [
      { date: '2026-05-26', total: '500000', invoice_count: '3' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockData)

    const result = await getRevenueReport('2026-05-01', '2026-05-31')

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DATE(i.created_at)'),
      ['2026-05-01', '2026-05-31']
    )
    expect(result).toEqual(mockData)
  })
})

describe('getTableStats', () => {
  it('returns revenue grouped by table', async () => {
    const mockStats = [
      { table_name: 'Bàn 1', total_revenue: '1500000', session_count: '10' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockStats)

    const result = await getTableStats('2026-05-01', '2026-05-31')

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY t.id'),
      ['2026-05-01', '2026-05-31']
    )
    expect(result).toEqual(mockStats)
  })
})

describe('getLowStockProducts', () => {
  it('returns products where stock <= min alert', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', stock_quantity: 3, min_stock_alert: 5 }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getLowStockProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('stock_quantity <= min_stock_alert')
    )
    expect(result).toEqual(mockProducts)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/reports.test.ts
```

- [ ] **Step 3: Viết `electron/handlers/reports.ts`**

```ts
// electron/handlers/reports.ts
import { ipcMain } from 'electron'
import { query } from '../db'

export async function getRevenueReport(fromDate: string, toDate: string) {
  return query(
    `SELECT
       DATE(i.created_at) AS date,
       SUM(i.final_amount) AS total,
       COUNT(*) AS invoice_count
     FROM invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2
     GROUP BY DATE(i.created_at)
     ORDER BY date`,
    [fromDate, toDate]
  )
}

export async function getRevenueSummary(fromDate: string, toDate: string) {
  return query(
    `SELECT
       SUM(i.final_amount) AS total_revenue,
       COUNT(*) AS total_invoices,
       AVG(i.final_amount) AS avg_invoice
     FROM invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2`,
    [fromDate, toDate]
  )
}

export async function getTableStats(fromDate: string, toDate: string) {
  return query(
    `SELECT
       t.name AS table_name,
       COUNT(s.id) AS session_count,
       SUM(i.final_amount) AS total_revenue,
       AVG(s.duration_minutes) AS avg_duration_minutes
     FROM sessions s
     JOIN tables t ON t.id = s.table_id
     JOIN invoices i ON i.session_id = s.id
     WHERE DATE(s.start_time) BETWEEN $1 AND $2
     GROUP BY t.id, t.name
     ORDER BY total_revenue DESC`,
    [fromDate, toDate]
  )
}

export async function getLowStockProducts() {
  return query(
    `SELECT * FROM products
     WHERE is_active = TRUE AND stock_quantity <= min_stock_alert
     ORDER BY stock_quantity ASC`
  )
}

export function registerReportHandlers() {
  ipcMain.handle('reports:revenue', (_e, from: string, to: string) => getRevenueReport(from, to))
  ipcMain.handle('reports:summary', (_e, from: string, to: string) => getRevenueSummary(from, to))
  ipcMain.handle('reports:tableStats', (_e, from: string, to: string) => getTableStats(from, to))
  ipcMain.handle('reports:lowStock', () => getLowStockProducts())
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run tests/unit/handlers/reports.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Đăng ký và cập nhật preload**

`electron/main.ts`:
```ts
import { registerReportHandlers } from './handlers/reports'
// registerReportHandlers()
```

`electron/preload.ts` — thêm:
```ts
reports: {
  revenue: (from: string, to: string) => ipcRenderer.invoke('reports:revenue', from, to),
  summary: (from: string, to: string) => ipcRenderer.invoke('reports:summary', from, to),
  tableStats: (from: string, to: string) => ipcRenderer.invoke('reports:tableStats', from, to),
  lowStock: () => ipcRenderer.invoke('reports:lowStock'),
},
```

- [ ] **Step 6: Commit**

```bash
git add electron/handlers/reports.ts electron/main.ts electron/preload.ts \
        src/electron.d.ts tests/unit/handlers/reports.test.ts
git commit -m "feat: add reports handler with revenue, table stats, and low stock queries"
```

---

## Task 3: Trang Customers

**Files:**
- Create: `src/pages/Customers.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Cài recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Viết `src/pages/Customers.tsx`**

```tsx
// src/pages/Customers.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Customer } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api().customers.getAll(),
  })

  const { data: invoiceHistory = [] } = useQuery({
    queryKey: ['customers', selected?.id, 'invoices'],
    queryFn: () => selected ? api().customers.invoices(selected.id) : Promise.resolve([]),
    enabled: !!selected,
  })

  const createMutation = useMutation({
    mutationFn: () => api().customers.create({
      name: form.name, phone: form.phone,
      email: form.email || null, notes: form.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowCreate(false)
      setForm({ name: '', phone: '', email: '', notes: '' })
    },
  })

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  return (
    <div className="flex gap-6">
      {/* Left: customer list */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Khách hàng</h1>
          <Button onClick={() => setShowCreate(true)} className="bg-green-700 hover:bg-green-600">
            + Thêm khách hàng
          </Button>
        </div>

        <Input
          className="mb-4 bg-gray-800 border-gray-600"
          placeholder="Tìm theo tên hoặc SĐT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-2">
          {filtered.map((customer) => (
            <button
              key={customer.id}
              className={`w-full text-left p-4 rounded-xl border transition-all
                ${selected?.id === customer.id
                  ? 'bg-green-900 border-green-500'
                  : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}
              onClick={() => setSelected(customer)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-gray-400">{customer.phone}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-yellow-700 text-yellow-200 text-xs">
                    {customer.points_balance} điểm
                  </Badge>
                  <p className="text-xs text-gray-400 mt-1">{customer.total_visits} lần</p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-500 text-center py-8">Không tìm thấy khách hàng</p>
          )}
        </div>
      </div>

      {/* Right: customer detail */}
      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-gray-900 rounded-xl p-4 mb-4">
            <h2 className="text-lg font-bold mb-1">{selected.name}</h2>
            <p className="text-gray-400 text-sm">{selected.phone}</p>
            {selected.email && <p className="text-gray-400 text-sm">{selected.email}</p>}

            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-2xl font-bold text-yellow-400">{selected.points_balance}</p>
                <p className="text-xs text-gray-400">điểm</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-400">{selected.total_visits}</p>
                <p className="text-xs text-gray-400">lần đến</p>
              </div>
            </div>

            <div className="mt-3 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-400">Tổng chi tiêu</p>
              <p className="text-lg font-bold text-green-400">{formatCurrency(selected.total_spent)}</p>
            </div>

            {selected.notes && (
              <p className="mt-3 text-sm text-gray-400 italic">{selected.notes}</p>
            )}
          </div>

          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="font-semibold mb-3">Lịch sử hóa đơn</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(invoiceHistory as Array<{ id: number; invoice_number: string; final_amount: number; table_name: string; created_at: string }>).map((inv) => (
                <div key={inv.id} className="p-2 bg-gray-800 rounded text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">#{inv.invoice_number}</span>
                    <span className="text-green-400">{formatCurrency(inv.final_amount)}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {inv.table_name} — {new Date(inv.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              ))}
              {invoiceHistory.length === 0 && (
                <p className="text-gray-500 text-xs">Chưa có hóa đơn</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create customer modal */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Thêm khách hàng mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Tên *</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Số điện thoại *</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Ghi chú</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-gray-600">Huỷ</Button>
            <Button className="bg-green-700 hover:bg-green-600"
              disabled={!form.name || !form.phone}
              onClick={() => createMutation.mutate()}>
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Thêm navigation trong `App.tsx`**

```tsx
// Thêm vào nav:
<button onClick={() => setView({ page: 'customers' })} className="text-sm text-gray-300 hover:text-white">Khách hàng</button>

// Thêm View type:
| { page: 'customers' }

// Import và JSX:
import CustomersPage from './pages/Customers'
// {view.page === 'customers' && <CustomersPage />}
```

- [ ] **Step 4: Test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Trang Customers hiển thị danh sách
- [ ] Tìm kiếm theo tên/SĐT
- [ ] Click khách hàng → xem chi tiết + điểm + lịch sử
- [ ] Thêm khách hàng mới
- [ ] Mở phiên với SĐT → khách hàng được gắn vào session

- [ ] **Step 5: Commit**

```bash
git add src/pages/Customers.tsx src/App.tsx
git commit -m "feat: add Customers page with loyalty points and invoice history"
```

---

## Task 4: Trang Reports

**Files:**
- Create: `src/pages/Reports.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Viết `src/pages/Reports.tsx`**

```tsx
// src/pages/Reports.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'

type Period = 'today' | 'week' | 'month' | 'custom'

function getPeriodDates(period: Period, customFrom: string, customTo: string): [string, string] {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (period === 'today') return [fmt(today), fmt(today)]
  if (period === 'week') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    return [fmt(from), fmt(today)]
  }
  if (period === 'month') {
    return [`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, fmt(today)]
  }
  return [customFrom, customTo]
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [fromDate, toDate] = getPeriodDates(period, customFrom, customTo)

  const { data: revenueData = [] } = useQuery({
    queryKey: ['reports', 'revenue', fromDate, toDate],
    queryFn: () => api().reports.revenue(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  })

  const { data: summaryData = [] } = useQuery({
    queryKey: ['reports', 'summary', fromDate, toDate],
    queryFn: () => api().reports.summary(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  })

  const { data: tableStats = [] } = useQuery({
    queryKey: ['reports', 'tableStats', fromDate, toDate],
    queryFn: () => api().reports.tableStats(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  })

  const { data: lowStock = [] } = useQuery({
    queryKey: ['reports', 'lowStock'],
    queryFn: () => api().reports.lowStock(),
  })

  const summary = summaryData[0] as { total_revenue: string; total_invoices: string; avg_invoice: string } | undefined

  const chartData = (revenueData as Array<{ date: string; total: string; invoice_count: string }>).map((d) => ({
    date: new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    doanh_thu: Number(d.total),
    so_hd: Number(d.invoice_count),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Báo cáo</h1>
        {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
          <button key={p}
            className={`px-3 py-1 rounded-full text-sm border transition-all
              ${period === p ? 'bg-green-700 border-green-500 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}
            onClick={() => setPeriod(p)}>
            {p === 'today' ? 'Hôm nay' : p === 'week' ? '7 ngày' : p === 'month' ? 'Tháng này' : 'Tuỳ chọn'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-gray-400">→</span>
            <input type="date" className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">
            {summary ? formatCurrency(Number(summary.total_revenue)) : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Tổng doanh thu</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">
            {summary?.total_invoices ?? '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Số hóa đơn</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">
            {summary ? formatCurrency(Number(summary.avg_invoice)) : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Trung bình/HĐ</p>
        </div>
      </div>

      {/* Revenue chart */}
      {chartData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <h3 className="font-semibold mb-4">Doanh thu theo ngày</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
              <Bar dataKey="doanh_thu" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Table stats */}
        <div className="bg-gray-900 rounded-xl p-4">
          <h3 className="font-semibold mb-3">Thống kê bàn</h3>
          <div className="space-y-2">
            {(tableStats as Array<{ table_name: string; total_revenue: string; session_count: string; avg_duration_minutes: string }>).map((t, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                <div>
                  <p className="text-sm font-medium">{t.table_name}</p>
                  <p className="text-xs text-gray-400">{t.session_count} lần • TB {Math.round(Number(t.avg_duration_minutes))} phút</p>
                </div>
                <span className="text-green-400 text-sm">{formatCurrency(Number(t.total_revenue))}</span>
              </div>
            ))}
            {tableStats.length === 0 && <p className="text-gray-500 text-sm">Không có dữ liệu</p>}
          </div>
        </div>

        {/* Low stock alert */}
        <div className="bg-gray-900 rounded-xl p-4">
          <h3 className="font-semibold mb-3">
            Cảnh báo tồn kho
            {lowStock.length > 0 && (
              <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{lowStock.length}</span>
            )}
          </h3>
          <div className="space-y-2">
            {(lowStock as Array<{ id: number; name: string; stock_quantity: number; unit: string; min_stock_alert: number }>).map((p) => (
              <div key={p.id} className="flex justify-between items-center p-2 bg-red-900/30 border border-red-800 rounded">
                <span className="text-sm">{p.name}</span>
                <span className="text-red-400 text-sm font-medium">
                  {p.stock_quantity}/{p.min_stock_alert} {p.unit}
                </span>
              </div>
            ))}
            {lowStock.length === 0 && (
              <p className="text-green-400 text-sm">✓ Tồn kho ổn định</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Thêm navigation**

```tsx
// src/App.tsx
<button onClick={() => setView({ page: 'reports' })} className="text-sm text-gray-300 hover:text-white">Báo cáo</button>

// View type:
| { page: 'reports' }

import ReportsPage from './pages/Reports'
// {view.page === 'reports' && <ReportsPage />}
```

- [ ] **Step 3: Test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Báo cáo hôm nay / 7 ngày / tháng này
- [ ] Biểu đồ cột hiển thị doanh thu
- [ ] Thống kê bàn đúng
- [ ] Cảnh báo tồn kho hiển thị sản phẩm sắp hết

- [ ] **Step 4: Commit**

```bash
git add src/pages/Reports.tsx src/App.tsx
git commit -m "feat: add Reports page with revenue chart, table stats, and low stock alerts"
```

---

## Task 5: Trang Settings

**Files:**
- Create: `src/pages/Settings.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Viết `src/pages/Settings.tsx`**

```tsx
// src/pages/Settings.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SettingRow { key: string; value: string }

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api().settings.getAll() as Promise<SettingRow[]>,
  })

  const getVal = (key: string) => settings.find((s) => s.key === key)?.value ?? ''

  const [shopName, setShopName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultRate, setDefaultRate] = useState('')
  const [printerPath, setPrinterPath] = useState('')
  const [pointsPer10k, setPointsPer10k] = useState('')
  const [vndPerPoint, setVndPerPoint] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setShopName(getVal('shop_name'))
    setAddress(getVal('address'))
    setPhone(getVal('phone'))
    setDefaultRate(getVal('default_hourly_rate'))
    setPrinterPath(getVal('printer_path') || 'USB001')
    setPointsPer10k(getVal('points_per_10k') || '1')
    setVndPerPoint(getVal('vnd_per_point') || '100')
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pairs = [
        ['shop_name', shopName],
        ['address', address],
        ['phone', phone],
        ['default_hourly_rate', defaultRate],
        ['printer_path', printerPath],
        ['points_per_10k', pointsPer10k],
        ['vnd_per_point', vndPerPoint],
      ]
      for (const [key, value] of pairs) {
        await api().settings.set(key, value)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Cài đặt</h1>

      <div className="space-y-6">
        <section className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-green-400">Thông tin quán</h2>
          <div><Label>Tên quán</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={shopName}
              onChange={(e) => setShopName(e.target.value)} /></div>
          <div><Label>Địa chỉ</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={address}
              onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Số điện thoại</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={phone}
              onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Giá mặc định (đồng/giờ)</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={defaultRate}
              onChange={(e) => setDefaultRate(e.target.value)} /></div>
        </section>

        <section className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-blue-400">Máy in nhiệt</h2>
          <div>
            <Label>Đường dẫn máy in (USB / Serial)</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={printerPath}
              onChange={(e) => setPrinterPath(e.target.value)}
              placeholder="USB001 hoặc COM3" />
            <p className="text-xs text-gray-500 mt-1">Windows: USB001, COM3 — macOS/Linux: /dev/usb/lp0</p>
          </div>
        </section>

        <section className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-yellow-400">Tích điểm khách hàng</h2>
          <div><Label>Điểm nhận được khi chi 10.000đ</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={pointsPer10k}
              onChange={(e) => setPointsPer10k(e.target.value)} /></div>
          <div><Label>1 điểm = ? đồng giảm giá</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={vndPerPoint}
              onChange={(e) => setVndPerPoint(e.target.value)} /></div>
          <p className="text-xs text-gray-500">
            VD: Chi 200,000đ = {Math.floor(200000 / 10000) * Number(pointsPer10k || 1)} điểm.
            Đổi 100 điểm = {100 * Number(vndPerPoint || 100)}đ giảm giá.
          </p>
        </section>

        <Button
          className={`w-full ${saved ? 'bg-blue-600' : 'bg-green-700 hover:bg-green-600'}`}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saved ? '✓ Đã lưu' : saveMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Thêm navigation**

```tsx
// src/App.tsx
<button onClick={() => setView({ page: 'settings' })} className="text-sm text-gray-300 hover:text-white ml-auto">Cài đặt</button>

// View type:
| { page: 'settings' }

import SettingsPage from './pages/Settings'
// {view.page === 'settings' && <SettingsPage />}
```

- [ ] **Step 3: Test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Trang Settings load đúng giá trị từ DB
- [ ] Lưu → giá trị persist sau khi restart app
- [ ] Tên quán hiển thị trên hóa đơn khi in

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.tsx src/App.tsx
git commit -m "feat: add Settings page for shop info, printer config, and loyalty rules"
```

---

## Task 6: Tích hợp loyalty settings vào Invoice

**Files:**
- Modify: `src/pages/Invoice.tsx`

- [ ] **Step 1: Cập nhật `Invoice.tsx` để đọc loyalty settings từ DB**

Thay đoạn hardcode `VND_PER_POINT = 100` và `POINTS_PER_10K = 1`:

```tsx
// src/pages/Invoice.tsx — thêm queries:
const { data: loyaltySettings } = useQuery({
  queryKey: ['settings', 'loyalty'],
  queryFn: async () => {
    const all = await api().settings.getAll() as Array<{ key: string; value: string }>
    return {
      vndPerPoint: Number(all.find((s) => s.key === 'vnd_per_point')?.value ?? 100),
      pointsPer10k: Number(all.find((s) => s.key === 'points_per_10k')?.value ?? 1),
    }
  },
})

const VND_PER_POINT = loyaltySettings?.vndPerPoint ?? 100
const POINTS_PER_10K = loyaltySettings?.pointsPer10k ?? 1
```

- [ ] **Step 2: Tích hợp thông tin khách hàng vào Invoice**

Nếu session có customer_id, fetch thông tin khách hàng để hiển thị trên invoice và cho phép đổi điểm:

```tsx
// src/pages/Invoice.tsx — thêm query:
const { data: customer } = useQuery({
  queryKey: ['customer', session.customer_id],
  queryFn: () => session.customer_id
    ? window.api.customers.getAll().then((list) => list.find((c) => c.id === session.customer_id) ?? null)
    : Promise.resolve(null),
  enabled: !!session.customer_id,
})

// Hiển thị điểm hiện tại của khách:
{customer && (
  <p className="text-xs text-yellow-400">Điểm hiện tại: {customer.points_balance}</p>
)}

// Truyền vào invoiceInput:
customerName: customer?.name,
customerPhone: customer?.phone,
customerPoints: customer?.points_balance,
```

- [ ] **Step 3: Test thủ công**

```bash
npm run dev
```

Luồng:
- [ ] Mở bàn với SĐT khách
- [ ] Checkout → Invoice page hiển thị tên khách + điểm hiện tại
- [ ] Nhập điểm muốn đổi → giảm giá đúng
- [ ] In hóa đơn → khách hàng được cộng điểm sau khi lưu

- [ ] **Step 4: Commit**

```bash
git add src/pages/Invoice.tsx
git commit -m "feat: integrate loyalty settings and customer points into invoice"
```

---

## Task 7: Chạy toàn bộ tests và build cuối

- [ ] **Step 1: Chạy toàn bộ unit tests**

```bash
npx vitest run
```

Expected: PASS (≥ 25 tests).

- [ ] **Step 2: Build TypeScript**

```bash
npm run build
```

Expected: Không có lỗi.

- [ ] **Step 3: Smoke test toàn bộ ứng dụng**

```bash
npm run dev
```

Luồng đầy đủ end-to-end:
- [ ] Dashboard: grid bàn, màu trạng thái
- [ ] Mở bàn với SĐT → lookup khách hàng
- [ ] Session page: timer, thêm đồ uống
- [ ] Invoice page: preview, áp điểm, giảm giá
- [ ] In hóa đơn (hoặc lưu không in)
- [ ] Customers: xem điểm được cộng
- [ ] Products: kiểm tra tồn kho giảm sau order
- [ ] Reports: xem doanh thu + biểu đồ
- [ ] Settings: thay đổi tên quán → hiện trên invoice tiếp theo

- [ ] **Step 4: Package app**

```bash
npm run dist
```

Expected: File `.exe` (Windows) hoặc `.dmg` (macOS) được tạo trong `dist/`.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Plan 3 complete — Customers, Reports, Settings with full integration"
```

---

## Checklist Plan 3

- [ ] Customers CRUD + phone lookup + loyalty points
- [ ] Khách hàng được gắn vào session khi mở bàn
- [ ] Điểm tích lũy sau mỗi hóa đơn
- [ ] Reports: doanh thu ngày/tháng với biểu đồ recharts
- [ ] Reports: thống kê bàn + cảnh báo tồn kho
- [ ] Settings: tên quán, địa chỉ, giá giờ, máy in, loyalty rules
- [ ] Invoice tích hợp loyalty settings từ DB
- [ ] Toàn bộ app có thể package thành desktop app

---

## Tổng kết 3 Plans

| Plan | Nội dung | Kết quả |
|------|---------|---------|
| Plan 1 | Electron + React + PostgreSQL + Dashboard + Session | App chạy, bàn mở/đóng được |
| Plan 2 | Invoice + Print + Products + Inventory | In hóa đơn nhiệt, quản lý kho |
| Plan 3 | Customers + Loyalty + Reports + Settings | App hoàn chỉnh, có thể deploy |
