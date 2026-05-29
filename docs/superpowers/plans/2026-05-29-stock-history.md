# Stock History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động xuất kho khi thanh toán hóa đơn và thêm trang "Lịch sử kho" để xem/đối chiếu giao dịch nhập xuất.

**Architecture:** Fix `createInvoice` để tự trừ kho + ghi `cloud_stock_transactions` sau khi tạo hóa đơn. Thêm `products:getStockHistory` handler. Trang `StockHistory.tsx` với filter sản phẩm + ngày.

**Tech Stack:** Electron IPC, React + @tanstack/react-query, PostgreSQL (`cloud_stock_transactions`, `cloud_products`, `cloud_order_items`)

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/main/handlers/invoices.ts` | MODIFY — thêm stock reduction sau khi tạo invoice |
| `src/main/handlers/products.ts` | MODIFY — thêm `getStockHistory` function + IPC handler |
| `src/preload/index.ts` | MODIFY — expose `products.getStockHistory` |
| `src/renderer/src/electron.d.ts` | MODIFY — thêm type cho `getStockHistory` |
| `src/renderer/src/types.ts` | MODIFY — thêm `StockTransaction` interface |
| `src/renderer/src/pages/StockHistory.tsx` | NEW — trang lịch sử kho |
| `src/renderer/src/App.tsx` | MODIFY — thêm nav + route |
| `tests/unit/handlers/invoices.test.ts` | MODIFY — thêm test stock reduction |
| `tests/unit/handlers/products.test.ts` | MODIFY — thêm test getStockHistory |

---

## Task 1: Fix createInvoice — tự động xuất kho

**Files:**
- Modify: `src/main/handlers/invoices.ts`
- Modify: `tests/unit/handlers/invoices.test.ts`

- [ ] **Step 1: Thêm failing test cho stock reduction**

Trong `tests/unit/handlers/invoices.test.ts`, thêm describe block mới sau describe hiện tại:

```typescript
describe('createInvoice stock reduction', () => {
  it('reduces stock for each order item after invoice created', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 200000 }
    const mockOrderItems = [
      { product_id: 10, quantity: 2, unit_price: 30000 },
      { product_id: 11, quantity: 1, unit_price: 50000 },
    ]

    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })         // getNextInvoiceNumber
      .mockResolvedValueOnce(mockInvoice)               // INSERT invoice
      .mockResolvedValueOnce({ id: 10, stock_quantity: 8 })  // UPDATE product 10
      .mockResolvedValueOnce({ id: 1 })                 // INSERT stock_transaction 10
      .mockResolvedValueOnce({ id: 11, stock_quantity: 4 })  // UPDATE product 11
      .mockResolvedValueOnce({ id: 2 })                 // INSERT stock_transaction 11

    vi.mocked(db.query)
      .mockResolvedValueOnce([])                        // customer update (no customer)
      .mockResolvedValueOnce(mockOrderItems)            // SELECT order items

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 75000,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 200000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(result).toEqual(mockInvoice)

    // Kiểm tra query order items
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_order_items'),
      expect.arrayContaining([1]) // sessionId
    )

    // Kiểm tra trừ kho product 10
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('stock_quantity - $1'),
      expect.arrayContaining([2, 10]) // quantity, productId
    )

    // Kiểm tra ghi log transaction
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_stock_transactions'),
      expect.arrayContaining([10, 'out', 2]) // productId, type, quantity
    )
  })

  it('skips stock reduction when no order items', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 125000 }

    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })
      .mockResolvedValueOnce(mockInvoice)

    vi.mocked(db.query)
      .mockResolvedValueOnce([])  // customer update
      .mockResolvedValueOnce([])  // empty order items

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 0,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 125000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(result).toEqual(mockInvoice)
    // queryOne called only for getNextInvoiceNumber + INSERT invoice = 2 times
    expect(db.queryOne).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Chạy test — expect FAIL**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test -- tests/unit/handlers/invoices.test.ts
```
Expected: mocks call count mismatch

- [ ] **Step 3: Implement stock reduction trong invoices.ts**

Thay thế toàn bộ nội dung `src/main/handlers/invoices.ts`:

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

  if (invoice) {
    const orderItems = await query<{ product_id: number; quantity: number; unit_price: number }>(
      'SELECT product_id, quantity, unit_price FROM cloud_order_items WHERE session_id = $1 AND agent_id = $2',
      [input.sessionId, agentId]
    )

    for (const item of orderItems) {
      const updated = await queryOne<{ stock_quantity: number }>(
        `UPDATE cloud_products SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND agent_id = $3 RETURNING stock_quantity`,
        [item.quantity, item.product_id, agentId]
      )
      if (!updated) continue

      const afterQty = updated.stock_quantity
      const beforeQty = afterQty + item.quantity

      await queryOne(
        `INSERT INTO cloud_stock_transactions
           (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [item.product_id, 'out', item.quantity, null, beforeQty, afterQty, `Hóa đơn #${invoiceNumber}`, agentId]
      )
    }
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

- [ ] **Step 4: Cập nhật test hiện tại cho createInvoice**

Test cũ `'creates invoice record and returns it'` cần mock thêm `db.query` cho order items query. Cập nhật test đó:

```typescript
describe('createInvoice', () => {
  it('creates invoice record and returns it', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 200000 }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })
      .mockResolvedValueOnce(mockInvoice)
    vi.mocked(db.query)
      .mockResolvedValueOnce([])   // customer update (no customerId)
      .mockResolvedValueOnce([])   // empty order items

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 75000,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 200000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_invoices'),
      expect.any(Array)
    )
    expect(result).toEqual(mockInvoice)
  })
})
```

- [ ] **Step 5: Chạy tests — expect PASS**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test -- tests/unit/handlers/invoices.test.ts
```
Expected: tất cả tests trong file pass (5 tests).

- [ ] **Step 6: Chạy full suite**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test
```
Expected: 35 passed (không tăng vì chỉ sửa test cũ + thêm 2 mới = vẫn 35+2 = 37).

- [ ] **Step 7: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/main/handlers/invoices.ts tests/unit/handlers/invoices.test.ts && git commit -m "fix: auto-reduce stock and log transactions on invoice creation"
```

---

## Task 2: getStockHistory handler + types + preload

**Files:**
- Modify: `src/main/handlers/products.ts`
- Modify: `src/renderer/src/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`
- Modify: `tests/unit/handlers/products.test.ts`

- [ ] **Step 1: Thêm StockTransaction type vào types.ts**

Thêm vào cuối `src/renderer/src/types.ts`:

```typescript
export interface StockTransaction {
  id: number
  product_id: number
  product_name: string
  type: 'in' | 'out' | 'adjust'
  quantity: number
  before_qty: number
  after_qty: number
  note: string | null
  created_at: string
}
```

- [ ] **Step 2: Thêm failing test cho getStockHistory**

Thêm vào `tests/unit/handlers/products.test.ts`, trong phần imports thêm `getStockHistory`:

```typescript
import {
  getAllProducts,
  createProduct,
  adjustStock,
  getStockHistory,
} from '../../../src/main/handlers/products'
```

Thêm describe block mới:

```typescript
describe('getStockHistory', () => {
  it('returns all transactions when no filter applied', async () => {
    const mockRows = [
      { id: 1, product_id: 1, product_name: 'Bia Tiger', type: 'in', quantity: 24, before_qty: 6, after_qty: 30, note: 'Nhập kho', created_at: '2026-05-29T10:00:00Z' }
    ]
    vi.mocked(db.query).mockResolvedValue(mockRows)

    const result = await getStockHistory({})

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('cloud_stock_transactions'),
      expect.arrayContaining([null]) // agentId = null in test
    )
    expect(result).toEqual(mockRows)
  })

  it('filters by productId when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getStockHistory({ productId: 5 })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([5])
    )
  })

  it('filters by date range when provided', async () => {
    vi.mocked(db.query).mockResolvedValue([])

    await getStockHistory({ fromDate: '2026-05-01', toDate: '2026-05-31' })

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['2026-05-01', '2026-05-31'])
    )
  })
})
```

- [ ] **Step 3: Chạy test — expect FAIL**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test -- tests/unit/handlers/products.test.ts
```
Expected: `getStockHistory is not a function`

- [ ] **Step 4: Implement getStockHistory trong products.ts**

Thêm function và IPC handler vào `src/main/handlers/products.ts`:

```typescript
export interface StockHistoryInput {
  productId?: number
  fromDate?: string
  toDate?: string
}

export async function getStockHistory(input: StockHistoryInput) {
  const agentId = getAgentId()
  return query(
    `SELECT st.id, st.product_id, p.name AS product_name,
            st.type, st.quantity, st.before_qty, st.after_qty,
            st.note, st.created_at
     FROM cloud_stock_transactions st
     JOIN cloud_products p ON p.id = st.product_id
     WHERE st.agent_id = $1
       AND ($2::int IS NULL OR st.product_id = $2)
       AND ($3::date IS NULL OR DATE(st.created_at) >= $3)
       AND ($4::date IS NULL OR DATE(st.created_at) <= $4)
     ORDER BY st.created_at DESC
     LIMIT 500`,
    [agentId, input.productId ?? null, input.fromDate ?? null, input.toDate ?? null]
  )
}
```

Thêm vào `registerProductHandlers()`:

```typescript
ipcMain.handle('products:getStockHistory',
  (_e, input: StockHistoryInput) => getStockHistory(input)
)
```

- [ ] **Step 5: Chạy tests — expect PASS**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test -- tests/unit/handlers/products.test.ts
```
Expected: tất cả 9 tests pass.

- [ ] **Step 6: Thêm getStockHistory vào preload**

Trong `src/preload/index.ts`, thêm import `StockTransaction` và `StockHistoryInput`:

```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction } from '../renderer/src/types'
```

Thêm `getStockHistory` vào block `products`:

```typescript
getStockHistory: (input: { productId?: number; fromDate?: string; toDate?: string }): Promise<StockTransaction[]> =>
  ipcRenderer.invoke('products:getStockHistory', input),
```

- [ ] **Step 7: Thêm type vào electron.d.ts**

Trong `src/renderer/src/electron.d.ts`, thêm import `StockTransaction` và thêm method vào `products`:

```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction } from './types'
```

```typescript
// Trong products block:
getStockHistory(input: { productId?: number; fromDate?: string; toDate?: string }): Promise<StockTransaction[]>
```

- [ ] **Step 8: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/main/handlers/products.ts src/renderer/src/types.ts src/preload/index.ts src/renderer/src/electron.d.ts tests/unit/handlers/products.test.ts && git commit -m "feat: add getStockHistory handler, type, and preload bridge"
```

---

## Task 3: StockHistory page + nav

**Files:**
- Create: `src/renderer/src/pages/StockHistory.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Tạo StockHistory.tsx**

Tạo `src/renderer/src/pages/StockHistory.tsx`:

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { StockTransaction } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

export default function StockHistoryPage() {
  const [productFilter, setProductFilter] = useState('')
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [appliedFilter, setAppliedFilter] = useState({
    productFilter: '',
    fromDate: firstOfMonth(),
    toDate: today(),
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => window.api.products.getAll(),
  })

  const { data: transactions = [], isFetching } = useQuery({
    queryKey: ['stockHistory', appliedFilter],
    queryFn: () => {
      const matchedProduct = allProducts.find(
        (p) => p.name.toLowerCase().includes(appliedFilter.productFilter.toLowerCase())
      )
      return window.api.products.getStockHistory({
        productId: appliedFilter.productFilter && matchedProduct ? matchedProduct.id : undefined,
        fromDate: appliedFilter.fromDate || undefined,
        toDate: appliedFilter.toDate || undefined,
      })
    },
    enabled: allProducts.length > 0 || appliedFilter.productFilter === '',
  })

  const handleFilter = () => {
    setAppliedFilter({ productFilter, fromDate, toDate })
  }

  const typeBadge = (type: StockTransaction['type']) => {
    if (type === 'in') return <Badge className="bg-green-700 text-green-100 text-xs">Nhập</Badge>
    if (type === 'out') return <Badge className="bg-red-700 text-red-100 text-xs">Xuất</Badge>
    return <Badge className="bg-yellow-700 text-yellow-100 text-xs">Điều chỉnh</Badge>
  }

  const qtyDisplay = (type: StockTransaction['type'], qty: number) => {
    if (type === 'out') return <span className="text-red-400">−{qty}</span>
    return <span className="text-green-400">+{qty}</span>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Lịch sử kho</h1>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <p className="text-xs text-gray-400 mb-1">Sản phẩm</p>
          <Input
            className="bg-gray-800 border-gray-600 w-48"
            placeholder="Tìm tên sản phẩm..."
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Từ ngày</p>
          <Input
            type="date"
            className="bg-gray-800 border-gray-600 w-40"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Đến ngày</p>
          <Input
            type="date"
            className="bg-gray-800 border-gray-600 w-40"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={handleFilter}
          disabled={isFetching}
        >
          {isFetching ? 'Đang tải...' : 'Lọc'}
        </Button>
      </div>

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left p-3">Thời gian</th>
              <th className="text-left p-3">Sản phẩm</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-right p-3">Số lượng</th>
              <th className="text-right p-3">Trước</th>
              <th className="text-right p-3">Sau</th>
              <th className="text-left p-3">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="p-3 text-gray-400 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                <td className="p-3 font-medium">{t.product_name}</td>
                <td className="p-3">{typeBadge(t.type)}</td>
                <td className="p-3 text-right font-mono">{qtyDisplay(t.type, t.quantity)}</td>
                <td className="p-3 text-right text-gray-400">{t.before_qty}</td>
                <td className="p-3 text-right">{t.after_qty}</td>
                <td className="p-3 text-gray-400 text-xs">{t.note ?? '—'}</td>
              </tr>
            ))}
            {transactions.length === 0 && !isFetching && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  Không có giao dịch nào trong khoảng thời gian này
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {transactions.length === 500 && (
        <p className="text-xs text-gray-500 mt-2 text-center">Hiển thị tối đa 500 bản ghi gần nhất</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Thêm nav + route vào App.tsx**

Trong `src/renderer/src/App.tsx`:

1. Thêm import:
```typescript
import StockHistoryPage from './pages/StockHistory'
```

2. Thêm vào `type View`:
```typescript
| { page: 'stock' }
```

3. Thêm nav button **sau** "Sản phẩm" và **trước** "Khách hàng":
```tsx
<button onClick={() => setView({ page: 'stock' })} className="text-sm text-white hover:text-gray-200">Kho</button>
```

4. Thêm route trong `<main>`:
```tsx
{view.page === 'stock' && <StockHistoryPage />}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Chạy full test suite**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test
```
Expected: 37+ passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/pages/StockHistory.tsx src/renderer/src/App.tsx && git commit -m "feat: add StockHistory page and nav link"
```

---

## Task 4: Final build + push

- [ ] **Step 1: Build production**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run build
```
Expected: 3 bundles build thành công, no errors.

- [ ] **Step 2: Push**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git push
```
