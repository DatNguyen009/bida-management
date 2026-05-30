# Pagination Design

**Date:** 2026-05-30
**Scope:** Thêm server-side pagination + chọn số dòng hiển thị (20/50/100) cho 3 trang: Hoá đơn, Sản phẩm, Kho hàng.

---

## 1. Backend Pattern

Mỗi handler nhận thêm `page: number` và `pageSize: number`, trả về `{ data: T[], total: number }` thay vì `T[]`.

**Query pattern:**
```sql
-- Data query
SELECT ... FROM table WHERE ... ORDER BY ... LIMIT $pageSize OFFSET ($page - 1) * $pageSize

-- Count query (cùng filter, không LIMIT)
SELECT COUNT(*) FROM table WHERE ...
```

---

## 2. Handlers cần cập nhật

### `invoices:getList`

`InvoiceListInput` thêm 2 field:
```typescript
export interface InvoiceListInput {
  fromDate?: string
  toDate?: string
  page: number       // thêm mới
  pageSize: number   // thêm mới
}
```

`getInvoiceList` trả về `{ data: InvoiceListRow[], total: number }`.

Query hiện tại: `LIMIT 300` → thay bằng `LIMIT $pageSize OFFSET ($page-1)*$pageSize`.
Thêm COUNT query: `SELECT COUNT(*) FROM cloud_invoices WHERE agent_id=$1 AND date filter`.

### `products:getAll` → `products:getPage`

Đổi IPC channel từ `products:getAll` thành `products:getPage`, nhận `{ page, pageSize }`, trả `{ data: Product[], total: number }`.

Query hiện tại: `LIMIT 500` → thay bằng `LIMIT $pageSize OFFSET ($page-1)*$pageSize`.

### `products:getStockHistory`

`StockHistoryInput` thêm 2 field:
```typescript
export interface StockHistoryInput {
  productId?: number
  fromDate?: string
  toDate?: string
  page: number       // thêm mới
  pageSize: number   // thêm mới
}
```

Trả về `{ data: StockTransaction[], total: number }`.

---

## 3. Types

Thêm vào `src/renderer/src/types.ts`:
```typescript
export interface PageResult<T> {
  data: T[]
  total: number
}
```

---

## 4. Preload cập nhật

```typescript
// products:getAll → products:getPage
getPage: (input: { page: number; pageSize: number }): Promise<PageResult<Product>> =>
  ipcRenderer.invoke('products:getPage', input),

// invoices:getList trả PageResult
getList: (input: { fromDate?: string; toDate?: string; page: number; pageSize: number }):
  Promise<PageResult<InvoiceListRow>> =>
  ipcRenderer.invoke('invoices:getList', input),

// products:getStockHistory trả PageResult
getStockHistory: (input: { productId?: number; fromDate?: string; toDate?: string; page: number; pageSize: number }):
  Promise<PageResult<StockTransaction>> =>
  ipcRenderer.invoke('products:getStockHistory', input),
```

---

## 5. Component Pagination

**File:** `src/renderer/src/components/Pagination.tsx`

```
[Hiển thị: 20 ▼]   Tổng 247 kết quả   [← Trước]  Trang 3 / 13  [Sau →]
```

**Props:**
```typescript
interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]  // default: [20, 50, 100]
}
```

**Behavior:**
- Dropdown chọn số dòng: 20 / 50 / 100 (dùng shadcn `<Select>`)
- Nút "← Trước" disabled khi `page === 1`
- Nút "Sau →" disabled khi `page === totalPages`
- Hiển thị "Tổng X kết quả" và "Trang N / M"
- Khi `pageSize` thay đổi → caller reset `page = 1`

---

## 6. Tích hợp vào các trang

Pattern giống nhau cho cả 3 trang:

```typescript
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(20)

const { data } = useQuery({
  queryKey: ['resource', filters, page, pageSize],
  queryFn: () => window.api.resource.getPage({ ...filters, page, pageSize }),
})

// Hiển thị "X-Y trong Z kết quả" ở trên bảng
// <Pagination> ở dưới bảng
const handlePageSizeChange = (size: number) => {
  setPageSize(size)
  setPage(1)  // reset về trang 1
}
```

**InvoiceList.tsx:** Thêm `page`, `pageSize` state; cập nhật query key và queryFn; render `<Pagination>`.

**Products.tsx:** Thêm `page`, `pageSize` state; đổi `products:getAll` → `products:getPage`; render `<Pagination>`.

**StockHistory.tsx:** Thêm `page`, `pageSize` state; cập nhật query key và queryFn; render `<Pagination>`.

---

## 7. Files thay đổi

| File | Thay đổi |
|------|---------|
| `src/main/handlers/invoices.ts` | `InvoiceListInput` + page/pageSize, trả `PageResult` |
| `src/main/handlers/products.ts` | `getAllProducts` → `getProductPage`; `getStockHistory` + page/pageSize, cả hai trả `PageResult` |
| `src/preload/index.ts` | Cập nhật type signatures cho 3 endpoints |
| `src/renderer/src/types.ts` | Thêm `PageResult<T>` |
| `src/renderer/src/components/Pagination.tsx` | Component mới |
| `src/renderer/src/pages/InvoiceList.tsx` | Tích hợp pagination |
| `src/renderer/src/pages/Products.tsx` | Tích hợp pagination |
| `src/renderer/src/pages/StockHistory.tsx` | Tích hợp pagination |

---

## 8. Out of scope

- Nhớ page/pageSize sau khi navigate (reset về trang 1 khi vào lại trang)
- Pagination cho Customers page
- Tìm kiếm/filter kết hợp với pagination (filter hiện tại đã có, chỉ thêm page param)
