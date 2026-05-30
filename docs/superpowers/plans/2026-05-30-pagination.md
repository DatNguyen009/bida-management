# Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm server-side pagination (20/50/100 dòng/trang) cho 3 trang: Hoá đơn, Sản phẩm, Kho hàng.

**Architecture:** Backend handlers trả `{ data, total }` thay vì `T[]`; shared `Pagination` component dùng chung; mỗi page thêm `page`/`pageSize` state và truyền vào query key + queryFn.

**Tech Stack:** React 18, TypeScript, TanStack Query, shadcn/ui (Select, Button), PostgreSQL LIMIT/OFFSET + COUNT(*)

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/renderer/src/types.ts` | Thêm `PageResult<T>` |
| `src/main/handlers/invoices.ts` | `InvoiceListInput` + page/pageSize, trả `PageResult` |
| `src/main/handlers/products.ts` | `getAllProducts` → `getProductPage`; `getStockHistory` + page/pageSize |
| `src/preload/index.ts` | Cập nhật 3 type signatures |
| `src/renderer/src/components/Pagination.tsx` | Component mới |
| `src/renderer/src/pages/InvoiceList.tsx` | Tích hợp pagination |
| `src/renderer/src/pages/Products.tsx` | Tích hợp pagination |
| `src/renderer/src/pages/StockHistory.tsx` | Tích hợp pagination |

---

## Task 1: PageResult type

**Files:**
- Modify: `src/renderer/src/types.ts`

- [ ] **Step 1: Thêm PageResult vào types.ts**

Mở `src/renderer/src/types.ts`, thêm vào cuối file (trước dòng cuối cùng hoặc sau export cuối):

```typescript
export interface PageResult<T> {
  data: T[]
  total: number
}
```

- [ ] **Step 2: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types.ts
git commit -m "feat: add PageResult generic type"
```

---

## Task 2: Backend — invoices handler

**Files:**
- Modify: `src/main/handlers/invoices.ts`

- [ ] **Step 1: Cập nhật InvoiceListInput**

Tìm:
```typescript
export interface InvoiceListInput {
  fromDate?: string
  toDate?: string
}
```

Thay bằng:
```typescript
export interface InvoiceListInput {
  fromDate?: string
  toDate?: string
  page: number
  pageSize: number
}
```

- [ ] **Step 2: Cập nhật getInvoiceList trả PageResult**

Tìm function `getInvoiceList`, thêm import type ở đầu file (sau các imports hiện có):

```typescript
import type { PageResult, InvoiceListRow } from '../../renderer/src/types'
```

Thay toàn bộ function `getInvoiceList`:

```typescript
export async function getInvoiceList(input: InvoiceListInput): Promise<PageResult<InvoiceListRow>> {
  const agentId = getAgentId()
  const offset = (input.page - 1) * input.pageSize

  const [rows, countRows] = await Promise.all([
    query<InvoiceListRow>(
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
       LIMIT $4 OFFSET $5`,
      [agentId, input.fromDate ?? null, input.toDate ?? null, input.pageSize, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM cloud_invoices i
       WHERE i.agent_id = $1
         AND ($2::date IS NULL OR DATE(i.created_at) >= $2)
         AND ($3::date IS NULL OR DATE(i.created_at) <= $3)`,
      [agentId, input.fromDate ?? null, input.toDate ?? null]
    ),
  ])

  return { data: rows, total: parseInt(countRows[0]?.count ?? '0', 10) }
}
```

- [ ] **Step 3: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/invoices.ts
git commit -m "feat: add pagination to invoices:getList handler"
```

---

## Task 3: Backend — products handler

**Files:**
- Modify: `src/main/handlers/products.ts`

- [ ] **Step 1: Thêm import PageResult**

Ở đầu `src/main/handlers/products.ts`, thêm sau các imports hiện có:

```typescript
import type { PageResult, Product, StockTransaction } from '../../renderer/src/types'
```

- [ ] **Step 2: Thêm function getProductPage**

Thêm function mới sau `getAllProducts`:

```typescript
export async function getProductPage(input: { page: number; pageSize: number }): Promise<PageResult<Product>> {
  const agentId = getAgentId()
  const offset = (input.page - 1) * input.pageSize

  const [rows, countRows] = await Promise.all([
    query<Product>(
      'SELECT * FROM cloud_products WHERE is_active = TRUE AND agent_id = $1 ORDER BY category, name LIMIT $2 OFFSET $3',
      [agentId, input.pageSize, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM cloud_products WHERE is_active = TRUE AND agent_id = $1',
      [agentId]
    ),
  ])

  return { data: rows, total: parseInt(countRows[0]?.count ?? '0', 10) }
}
```

- [ ] **Step 3: Cập nhật StockHistoryInput và getStockHistory**

Tìm:
```typescript
export interface StockHistoryInput {
  productId?: number
  fromDate?: string
  toDate?: string
}
```

Thay bằng:
```typescript
export interface StockHistoryInput {
  productId?: number
  fromDate?: string
  toDate?: string
  page: number
  pageSize: number
}
```

Tìm function `getStockHistory`, thay toàn bộ bằng:

```typescript
export async function getStockHistory(input: StockHistoryInput): Promise<PageResult<StockTransaction>> {
  const agentId = getAgentId()
  const offset = (input.page - 1) * input.pageSize

  const [rows, countRows] = await Promise.all([
    query<StockTransaction>(
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
       LIMIT $5 OFFSET $6`,
      [agentId, input.productId ?? null, input.fromDate ?? null, input.toDate ?? null, input.pageSize, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM cloud_stock_transactions st
       WHERE st.agent_id = $1
         AND ($2::int IS NULL OR st.product_id = $2)
         AND ($3::date IS NULL OR DATE(st.created_at) >= $3)
         AND ($4::date IS NULL OR DATE(st.created_at) <= $4)`,
      [agentId, input.productId ?? null, input.fromDate ?? null, input.toDate ?? null]
    ),
  ])

  return { data: rows, total: parseInt(countRows[0]?.count ?? '0', 10) }
}
```

- [ ] **Step 4: Register handler products:getPage**

Trong `registerProductHandlers()`, thêm sau `ipcMain.handle('products:getAll', ...)`:

```typescript
ipcMain.handle('products:getPage', (_e, input: { page: number; pageSize: number }) => getProductPage(input))
```

- [ ] **Step 5: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/handlers/products.ts
git commit -m "feat: add pagination to products:getPage and products:getStockHistory handlers"
```

---

## Task 4: Preload — cập nhật type signatures

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Cập nhật import types**

Ở đầu `src/preload/index.ts`, tìm dòng import types, thêm `PageResult`:

```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, PageResult } from '../renderer/src/types'
```

- [ ] **Step 2: Cập nhật products.getAll → getPage**

Tìm trong block `products: {`:
```typescript
getAll: (): Promise<Product[]> =>
  ipcRenderer.invoke('products:getAll'),
```

Thêm sau dòng đó:
```typescript
getPage: (input: { page: number; pageSize: number }): Promise<PageResult<Product>> =>
  ipcRenderer.invoke('products:getPage', input),
```

(Giữ nguyên `getAll` vì StockHistory.tsx vẫn dùng để filter product name)

- [ ] **Step 3: Cập nhật invoices.getList**

Tìm:
```typescript
getList: (input: { fromDate?: string; toDate?: string }): Promise<InvoiceListRow[]> =>
  ipcRenderer.invoke('invoices:getList', input),
```

Thay bằng:
```typescript
getList: (input: { fromDate?: string; toDate?: string; page: number; pageSize: number }): Promise<PageResult<InvoiceListRow>> =>
  ipcRenderer.invoke('invoices:getList', input),
```

- [ ] **Step 4: Cập nhật products.getStockHistory**

Tìm:
```typescript
getStockHistory: (input: { productId?: number; fromDate?: string; toDate?: string }): Promise<StockTransaction[]> =>
  ipcRenderer.invoke('products:getStockHistory', input),
```

Thay bằng:
```typescript
getStockHistory: (input: { productId?: number; fromDate?: string; toDate?: string; page: number; pageSize: number }): Promise<PageResult<StockTransaction>> =>
  ipcRenderer.invoke('products:getStockHistory', input),
```

- [ ] **Step 5: Chạy typecheck**

```bash
npm run typecheck
```

Expected: Có thể có lỗi ở InvoiceList.tsx, Products.tsx, StockHistory.tsx vì chưa cập nhật — bình thường, sẽ fix ở Task 6-8.

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: update preload type signatures for paginated endpoints"
```

---

## Task 5: Component Pagination

**Files:**
- Create: `src/renderer/src/components/Pagination.tsx`

- [ ] **Step 1: Tạo component**

Tạo `src/renderer/src/components/Pagination.tsx`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [20, 50, 100] }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1e3d23]">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6b7280]">Hiển thị:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="w-20 h-7 bg-[#0a1a0d] border-[#1e3d23] text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0a1a0d] border-[#1e3d23]">
            {pageSizeOptions.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-white text-xs hover:bg-[#162a1a]">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-[#6b7280]">
          {total === 0 ? 'Không có kết quả' : `${from}–${to} / ${total}`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 border-[#1e3d23] text-[#6b7280] hover:bg-[#162a1a] disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Trước
        </Button>
        <span className="text-xs text-white px-2">
          Trang {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 border-[#1e3d23] text-[#6b7280] hover:bg-[#162a1a] disabled:opacity-30"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau →
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Pagination.tsx
git commit -m "feat: add Pagination component"
```

---

## Task 6: InvoiceList.tsx — tích hợp pagination

**Files:**
- Modify: `src/renderer/src/pages/InvoiceList.tsx`

- [ ] **Step 1: Thêm import Pagination**

Thêm sau dòng `import { Input } from '@/components/ui/input'`:

```typescript
import Pagination from '../components/Pagination'
```

- [ ] **Step 2: Thêm state page và pageSize**

Trong component, sau dòng `const [selected, setSelected] = useState<InvoiceListRow | null>(null)`, thêm:

```typescript
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(20)
```

- [ ] **Step 3: Cập nhật useQuery**

Tìm:
```typescript
const { data: invoices = [], isFetching } = useQuery({
  queryKey: ['invoiceList', appliedFilter],
  queryFn: () => window.api.invoices.getList({
    fromDate: appliedFilter.fromDate || undefined,
    toDate: appliedFilter.toDate || undefined,
  }),
})
```

Thay bằng:
```typescript
const { data: invoiceResult, isFetching } = useQuery({
  queryKey: ['invoiceList', appliedFilter, page, pageSize],
  queryFn: () => window.api.invoices.getList({
    fromDate: appliedFilter.fromDate || undefined,
    toDate: appliedFilter.toDate || undefined,
    page,
    pageSize,
  }),
})
const invoices = invoiceResult?.data ?? []
const invoiceTotal = invoiceResult?.total ?? 0
```

- [ ] **Step 4: Reset page khi filter thay đổi**

Tìm function `handleFilter`:
```typescript
const handleFilter = () => {
  setAppliedFilter({ fromDate, toDate })
  setSelected(null)
}
```

Thay bằng:
```typescript
const handleFilter = () => {
  setAppliedFilter({ fromDate, toDate })
  setSelected(null)
  setPage(1)
}
```

- [ ] **Step 5: Thêm Pagination vào JSX**

Tìm đoạn JSX cuối của bảng hoá đơn (sau `</table>` hoặc sau block hiển thị danh sách), thêm component Pagination. Tìm đoạn kết thúc `</div>` của phần danh sách invoices và thêm trước đó:

```tsx
<Pagination
  page={page}
  pageSize={pageSize}
  total={invoiceTotal}
  onPageChange={setPage}
  onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
/>
```

- [ ] **Step 6: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/InvoiceList.tsx
git commit -m "feat: add pagination to InvoiceList page"
```

---

## Task 7: Products.tsx — tích hợp pagination

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

- [ ] **Step 1: Thêm import Pagination**

Thêm sau các imports hiện có:

```typescript
import Pagination from '../components/Pagination'
```

- [ ] **Step 2: Thêm state page và pageSize**

Trong component, sau `const [stockCostPrice, setStockCostPrice] = useState<number | ''>('')`, thêm:

```typescript
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(20)
```

- [ ] **Step 3: Cập nhật useQuery products**

Tìm:
```typescript
const { data: products = [] } = useQuery({
  queryKey: ['products'],
  queryFn: () => api().products.getAll(),
})
```

Thay bằng:
```typescript
const { data: productResult } = useQuery({
  queryKey: ['products', page, pageSize],
  queryFn: () => api().products.getPage({ page, pageSize }),
})
const products = productResult?.data ?? []
const productTotal = productResult?.total ?? 0
```

- [ ] **Step 4: Cập nhật invalidateQueries**

Tất cả các chỗ `queryClient.invalidateQueries({ queryKey: ['products'] })` giữ nguyên — React Query sẽ invalidate tất cả queries có key bắt đầu bằng `['products']`.

- [ ] **Step 5: Thêm Pagination vào JSX**

Tìm cuối phần render bảng sản phẩm (trước `</div>` đóng của phần bảng chính), thêm:

```tsx
<Pagination
  page={page}
  pageSize={pageSize}
  total={productTotal}
  onPageChange={setPage}
  onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
/>
```

- [ ] **Step 6: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: add pagination to Products page"
```

---

## Task 8: StockHistory.tsx — tích hợp pagination

**Files:**
- Modify: `src/renderer/src/pages/StockHistory.tsx`

- [ ] **Step 1: Thêm import Pagination**

Thêm sau các imports hiện có:

```typescript
import Pagination from '../components/Pagination'
```

- [ ] **Step 2: Thêm state page và pageSize**

Trong component, sau `const [appliedFilter, setAppliedFilter] = useState({...})`, thêm:

```typescript
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(20)
```

- [ ] **Step 3: Cập nhật useQuery transactions**

Tìm:
```typescript
const { data: transactions = [], isFetching } = useQuery({
  queryKey: ['stockHistory', appliedFilter],
  queryFn: () => {
    const matchedProduct = appliedFilter.productFilter
      ? allProducts.find((p) =>
          p.name.toLowerCase().includes(appliedFilter.productFilter.toLowerCase())
        )
      : undefined
    return window.api.products.getStockHistory({
      productId: matchedProduct?.id,
      fromDate: appliedFilter.fromDate || undefined,
      toDate: appliedFilter.toDate || undefined,
    })
  },
```

Thay bằng:
```typescript
const { data: stockResult, isFetching } = useQuery({
  queryKey: ['stockHistory', appliedFilter, page, pageSize],
  queryFn: () => {
    const matchedProduct = appliedFilter.productFilter
      ? allProducts.find((p) =>
          p.name.toLowerCase().includes(appliedFilter.productFilter.toLowerCase())
        )
      : undefined
    return window.api.products.getStockHistory({
      productId: matchedProduct?.id,
      fromDate: appliedFilter.fromDate || undefined,
      toDate: appliedFilter.toDate || undefined,
      page,
      pageSize,
    })
  },
```

Sau useQuery, thêm:
```typescript
const transactions = stockResult?.data ?? []
const stockTotal = stockResult?.total ?? 0
```

- [ ] **Step 4: Reset page khi filter thay đổi**

Tìm function `handleFilter` (dòng ~53):

```typescript
const handleFilter = () => {
  setAppliedFilter({ productFilter, fromDate, toDate })
}
```

Thay bằng:

```typescript
const handleFilter = () => {
  setAppliedFilter({ productFilter, fromDate, toDate })
  setPage(1)
}
```

- [ ] **Step 5: Thêm Pagination vào JSX**

Tìm cuối phần bảng giao dịch kho, thêm:

```tsx
<Pagination
  page={page}
  pageSize={pageSize}
  total={stockTotal}
  onPageChange={setPage}
  onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
/>
```

- [ ] **Step 6: Chạy full typecheck và tests**

```bash
npm run typecheck && npm test
```

Expected: No TypeScript errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/StockHistory.tsx
git commit -m "feat: add pagination to StockHistory page"
```

---

## Task 9: Smoke test

- [ ] **Step 1: Chạy app**

```bash
npm run dev
```

- [ ] **Step 2: Test InvoiceList**

1. Vào trang Hóa đơn
2. Kiểm tra Pagination bar xuất hiện ở cuối danh sách
3. Dropdown chọn 20/50/100 hoạt động
4. Nút Trước/Sau chuyển trang đúng
5. Thay đổi filter ngày → trang reset về 1

- [ ] **Step 3: Test Products**

1. Vào trang Sản phẩm
2. Kiểm tra Pagination bar
3. Thêm/sửa sản phẩm xong → danh sách cập nhật đúng trang hiện tại

- [ ] **Step 4: Test StockHistory**

1. Vào trang Kho hàng
2. Kiểm tra Pagination bar
3. Filter theo sản phẩm/ngày → trang reset về 1

- [ ] **Step 5: Commit cuối nếu cần**

```bash
git add -A
git commit -m "feat: complete pagination for Invoice, Products, StockHistory"
```
