# Invoice List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang danh sách hóa đơn với filter ngày và panel chi tiết hiển thị các món đã order.

**Architecture:** Thêm `invoices:getList` và `invoices:getOrderItems` handlers, expose qua preload, tạo `InvoiceList.tsx` với danh sách + detail panel, thêm nav/route vào App.tsx.

**Tech Stack:** Electron IPC, React + @tanstack/react-query, PostgreSQL (`cloud_invoices`, `cloud_sessions`, `cloud_tables`, `cloud_customers`, `cloud_order_items`)

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/main/handlers/invoices.ts` | MODIFY — thêm `getInvoiceList`, `getInvoiceOrderItems` |
| `src/renderer/src/types.ts` | MODIFY — thêm `InvoiceListRow`, `InvoiceOrderItem` |
| `src/preload/index.ts` | MODIFY — expose 2 methods mới trong `invoices` block |
| `src/renderer/src/electron.d.ts` | MODIFY — thêm 2 method vào `invoices` type |
| `src/renderer/src/pages/InvoiceList.tsx` | NEW — trang danh sách + detail panel |
| `src/renderer/src/App.tsx` | MODIFY — nav + route |
| `tests/unit/handlers/invoices.test.ts` | MODIFY — thêm tests cho 2 handler mới |

---

## Task 1: Backend handlers + tests

**Files:**
- Modify: `src/main/handlers/invoices.ts`
- Modify: `tests/unit/handlers/invoices.test.ts`

- [ ] **Step 1: Thêm failing tests**

Thêm vào `tests/unit/handlers/invoices.test.ts` — cập nhật import và thêm 2 describe blocks:

```typescript
import { createInvoice, getNextInvoiceNumber, getInvoiceList, getInvoiceOrderItems } from '../../../src/main/handlers/invoices'
```

```typescript
describe('getInvoiceList', () => {
  it('returns invoices with table and customer info', async () => {
    const mockRows = [
      {
        id: 1, invoice_number: '00001', session_id: 1,
        play_amount: 125000, items_amount: 75000, final_amount: 200000,
        discount: 0, points_redeemed: 0, discount_from_points: 0,
        points_earned: 20, printed_at: null, created_at: '2026-05-29T22:30:00Z',
        table_name: 'Bàn 1', customer_name: 'Nguyễn A', customer_phone: '0901234567',
      }
    ]
    vi.mocked(db.query).mockResolvedValue(mockRows)

    const result = await getInvoiceList({})

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_invoices'),
      expect.arrayContaining([null])
    )
    expect(result).toEqual(mockRows)
  })

  it('filters by date range when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getInvoiceList({ fromDate: '2026-05-01', toDate: '2026-05-31' })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['2026-05-01', '2026-05-31'])
    )
  })
})

describe('getInvoiceOrderItems', () => {
  it('returns order items for a session', async () => {
    const mockItems = [
      { product_name: 'Bia Tiger', quantity: 2, unit_price: 30000, subtotal: 60000 }
    ]
    vi.mocked(db.query).mockResolvedValue(mockItems)

    const result = await getInvoiceOrderItems(1)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_order_items'),
      expect.arrayContaining([1])
    )
    expect(result).toEqual(mockItems)
  })
})
```

- [ ] **Step 2: Chạy tests — expect FAIL**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test -- tests/unit/handlers/invoices.test.ts
```
Expected: `getInvoiceList is not a function`

- [ ] **Step 3: Implement handlers trong invoices.ts**

Thêm vào `src/main/handlers/invoices.ts` (trước `registerInvoiceHandlers`):

```typescript
export interface InvoiceListInput {
  fromDate?: string
  toDate?: string
}

export async function getInvoiceList(input: InvoiceListInput) {
  const agentId = getAgentId()
  return query(
    `SELECT i.id, i.invoice_number, i.session_id,
            i.play_amount, i.items_amount, i.final_amount,
            i.discount, i.points_redeemed, i.discount_from_points,
            i.points_earned, i.printed_at, i.created_at,
            t.name AS table_name,
            c.name AS customer_name,
            c.phone AS customer_phone
     FROM cloud_invoices i
     LEFT JOIN cloud_sessions s ON s.id = i.session_id
     LEFT JOIN cloud_tables t ON t.id = s.table_id
     LEFT JOIN cloud_customers c ON c.id = s.customer_id
     WHERE i.agent_id = $1
       AND ($2::date IS NULL OR DATE(i.created_at) >= $2)
       AND ($3::date IS NULL OR DATE(i.created_at) <= $3)
     ORDER BY i.created_at DESC
     LIMIT 300`,
    [agentId, input.fromDate ?? null, input.toDate ?? null]
  )
}

export async function getInvoiceOrderItems(sessionId: number) {
  const agentId = getAgentId()
  return query(
    `SELECT p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id
     WHERE oi.session_id = $1 AND oi.agent_id = $2
     ORDER BY oi.created_at`,
    [sessionId, agentId]
  )
}
```

Thêm vào `registerInvoiceHandlers()`:

```typescript
ipcMain.handle('invoices:getList',
  (_e, input: InvoiceListInput) => getInvoiceList(input)
)
ipcMain.handle('invoices:getOrderItems',
  (_e, sessionId: number) => getInvoiceOrderItems(sessionId)
)
```

- [ ] **Step 4: Chạy tests — expect PASS**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test -- tests/unit/handlers/invoices.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 5: Full suite**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test
```
Expected: 43 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/main/handlers/invoices.ts tests/unit/handlers/invoices.test.ts && git commit -m "feat: add getInvoiceList and getInvoiceOrderItems handlers"
```

---

## Task 2: Types + preload + electron.d.ts

**Files:**
- Modify: `src/renderer/src/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Thêm types vào types.ts**

Thêm vào cuối `src/renderer/src/types.ts`:

```typescript
export interface InvoiceListRow {
  id: number
  invoice_number: string
  session_id: number
  play_amount: number
  items_amount: number
  final_amount: number
  discount: number
  points_redeemed: number
  discount_from_points: number
  points_earned: number
  printed_at: string | null
  created_at: string
  table_name: string | null
  customer_name: string | null
  customer_phone: string | null
}

export interface InvoiceOrderItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}
```

- [ ] **Step 2: Thêm vào preload/index.ts**

Cập nhật import để thêm `InvoiceListRow` và `InvoiceOrderItem`:

```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem } from '../renderer/src/types'
```

Thêm 2 method vào block `invoices` trong `contextBridge.exposeInMainWorld`:

```typescript
getList: (input: { fromDate?: string; toDate?: string }): Promise<InvoiceListRow[]> =>
  ipcRenderer.invoke('invoices:getList', input),
getOrderItems: (sessionId: number): Promise<InvoiceOrderItem[]> =>
  ipcRenderer.invoke('invoices:getOrderItems', sessionId),
```

- [ ] **Step 3: Thêm vào electron.d.ts**

Cập nhật import để thêm `InvoiceListRow` và `InvoiceOrderItem`:

```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem } from './types'
```

Thêm 2 method vào block `invoices` trong `Window.api`:

```typescript
getList(input: { fromDate?: string; toDate?: string }): Promise<InvoiceListRow[]>
getOrderItems(sessionId: number): Promise<InvoiceOrderItem[]>
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/types.ts src/preload/index.ts src/renderer/src/electron.d.ts && git commit -m "feat: add InvoiceListRow and InvoiceOrderItem types to preload bridge"
```

---

## Task 3: InvoiceList page + nav

**Files:**
- Create: `src/renderer/src/pages/InvoiceList.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Tạo InvoiceList.tsx**

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { InvoiceListRow, InvoiceOrderItem } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '../lib/utils'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function InvoiceListPage() {
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [appliedFilter, setAppliedFilter] = useState({ fromDate: firstOfMonth(), toDate: today() })
  const [selected, setSelected] = useState<InvoiceListRow | null>(null)

  const { data: invoices = [], isFetching } = useQuery({
    queryKey: ['invoiceList', appliedFilter],
    queryFn: () => window.api.invoices.getList({
      fromDate: appliedFilter.fromDate || undefined,
      toDate: appliedFilter.toDate || undefined,
    }),
  })

  const { data: orderItems = [] } = useQuery({
    queryKey: ['invoiceOrderItems', selected?.session_id],
    queryFn: () => selected
      ? window.api.invoices.getOrderItems(selected.session_id)
      : Promise.resolve([] as InvoiceOrderItem[]),
    enabled: !!selected,
  })

  const handleFilter = () => {
    setAppliedFilter({ fromDate, toDate })
    setSelected(null)
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <h1 className="text-2xl font-bold w-full">Hóa đơn</h1>
          <div>
            <p className="text-xs text-gray-400 mb-1">Từ ngày</p>
            <Input type="date" className="bg-gray-800 border-gray-600 w-40"
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Đến ngày</p>
            <Input type="date" className="bg-gray-800 border-gray-600 w-40"
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700"
            onClick={handleFilter} disabled={isFetching}>
            {isFetching ? 'Đang tải...' : 'Lọc'}
          </Button>
        </div>

        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Thời gian</th>
                <th className="text-left p-3">Bàn</th>
                <th className="text-left p-3">Khách hàng</th>
                <th className="text-right p-3">Chơi</th>
                <th className="text-right p-3">Đồ uống</th>
                <th className="text-right p-3">Tổng</th>
                <th className="text-right p-3">Điểm</th>
                <th className="text-center p-3">In</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={`border-b border-gray-800 cursor-pointer transition-colors
                    ${selected?.id === inv.id ? 'bg-blue-900' : 'hover:bg-gray-800'}`}
                  onClick={() => setSelected(inv)}
                >
                  <td className="p-3 font-mono text-gray-400">{inv.invoice_number}</td>
                  <td className="p-3 whitespace-nowrap">{formatDateTime(inv.created_at)}</td>
                  <td className="p-3">{inv.table_name ?? '—'}</td>
                  <td className="p-3">{inv.customer_name ?? '—'}</td>
                  <td className="p-3 text-right">{formatCurrency(inv.play_amount)}</td>
                  <td className="p-3 text-right">{formatCurrency(inv.items_amount)}</td>
                  <td className="p-3 text-right font-semibold text-green-400">{formatCurrency(inv.final_amount)}</td>
                  <td className="p-3 text-right text-yellow-400">+{inv.points_earned}</td>
                  <td className="p-3 text-center">{inv.printed_at ? '✓' : '—'}</td>
                </tr>
              ))}
              {invoices.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    Không có hóa đơn nào trong khoảng thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {invoices.length === 300 && (
          <p className="text-xs text-gray-500 mt-2 text-center">Hiển thị tối đa 300 hóa đơn gần nhất</p>
        )}
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-gray-900 rounded-xl p-4 sticky top-0">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-lg">HĐ #{selected.invoice_number}</p>
                <p className="text-sm text-gray-400">{selected.table_name ?? '—'}</p>
                <p className="text-xs text-gray-500">{formatDateTime(selected.created_at)}</p>
              </div>
              <button className="text-gray-500 hover:text-gray-300"
                onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.customer_name && (
              <div className="mb-3 p-2 bg-gray-800 rounded text-sm">
                <p className="font-medium">{selected.customer_name}</p>
                <p className="text-gray-400 text-xs">{selected.customer_phone}</p>
              </div>
            )}

            <div className="space-y-1 text-sm border-t border-gray-700 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Tiền chơi</span>
                <span>{formatCurrency(selected.play_amount)}</span>
              </div>

              {orderItems.length > 0 && (
                <div className="pt-1 pb-1">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-300 py-0.5">
                      <span>{item.product_name} x{item.quantity}</span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-700 pt-1 space-y-1">
                {selected.discount > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Giảm giá</span>
                    <span>-{formatCurrency(selected.discount)}</span>
                  </div>
                )}
                {selected.discount_from_points > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Đổi điểm ({selected.points_redeemed}đ)</span>
                    <span>-{formatCurrency(selected.discount_from_points)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-green-400 text-base pt-1">
                  <span>Thanh toán</span>
                  <span>{formatCurrency(selected.final_amount)}</span>
                </div>
                {selected.points_earned > 0 && (
                  <div className="flex justify-between text-yellow-400 text-xs">
                    <span>Điểm tích lũy</span>
                    <span>+{selected.points_earned}</span>
                  </div>
                )}
              </div>
            </div>

            {selected.printed_at && (
              <p className="text-xs text-gray-500 mt-3 text-center">
                Đã in lúc {new Date(selected.printed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật App.tsx**

Thêm import:
```typescript
import InvoiceListPage from './pages/InvoiceList'
```

Thêm vào `type View`:
```typescript
| { page: 'invoices' }
```

Thêm nav button sau "Kho" và trước "Khách hàng":
```tsx
<button onClick={() => setView({ page: 'invoices' })} className="text-sm text-white hover:text-gray-200">Hóa đơn</button>
```

Thêm route trong `<main>`:
```tsx
{view.page === 'invoices' && <InvoiceListPage />}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Full tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test
```
Expected: 43 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/pages/InvoiceList.tsx src/renderer/src/App.tsx && git commit -m "feat: add InvoiceList page and nav link"
```

---

## Task 4: Final build + push

- [ ] **Step 1: Build**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run build
```
Expected: 3 bundles build thành công.

- [ ] **Step 2: Push**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git push
```
