# Skeleton Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị skeleton loading khi các trang Hoá đơn, Sản phẩm, Kho hàng đang tải data lần đầu.

**Architecture:** Tạo `Skeleton` base component và `TableSkeleton` wrapper, sau đó dùng `isLoading` từ `useQuery` để render skeleton thay cho bảng khi chưa có data.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (`animate-pulse`)

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/renderer/src/components/ui/skeleton.tsx` | Tạo mới — base animated bar |
| `src/renderer/src/components/TableSkeleton.tsx` | Tạo mới — N dòng skeleton dạng bảng |
| `src/renderer/src/pages/InvoiceList.tsx` | Thêm `isLoading`, render TableSkeleton |
| `src/renderer/src/pages/Products.tsx` | Thêm `isLoading`, render TableSkeleton |
| `src/renderer/src/pages/StockHistory.tsx` | Thêm `isLoading`, render TableSkeleton |

---

## Task 1: Skeleton components

**Files:**
- Create: `src/renderer/src/components/ui/skeleton.tsx`
- Create: `src/renderer/src/components/TableSkeleton.tsx`

- [ ] **Step 1: Tạo Skeleton base component**

Tạo `src/renderer/src/components/ui/skeleton.tsx`:

```tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[#1e3d23]/50 ${className}`} />
  )
}
```

- [ ] **Step 2: Tạo TableSkeleton component**

Tạo `src/renderer/src/components/TableSkeleton.tsx`:

```tsx
import { Skeleton } from './ui/skeleton'

const COL_WIDTHS = ['w-1/4', 'w-1/3', 'w-1/5', 'w-1/4', 'w-1/6']

interface Props {
  rows?: number
  cols?: number
}

export default function TableSkeleton({ rows = 10, cols = 4 }: Props) {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-lg bg-[#0d1f12]/40">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={`h-4 ${COL_WIDTHS[(i + j) % COL_WIDTHS.length]} flex-shrink-0`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/skeleton.tsx src/renderer/src/components/TableSkeleton.tsx
git commit -m "feat: add Skeleton and TableSkeleton components"
```

---

## Task 2: Tích hợp skeleton vào 3 trang

**Files:**
- Modify: `src/renderer/src/pages/InvoiceList.tsx`
- Modify: `src/renderer/src/pages/Products.tsx`
- Modify: `src/renderer/src/pages/StockHistory.tsx`

### InvoiceList.tsx

- [ ] **Step 1: Thêm import TableSkeleton**

Thêm sau dòng `import Pagination from '../components/Pagination'`:
```typescript
import TableSkeleton from '../components/TableSkeleton'
```

- [ ] **Step 2: Destructure isLoading từ useQuery**

Tìm:
```typescript
const { data: invoiceResult, isFetching } = useQuery({
```
Thay bằng:
```typescript
const { data: invoiceResult, isFetching, isLoading } = useQuery({
```

- [ ] **Step 3: Render skeleton khi isLoading**

Tìm block div chứa `<table className="w-full text-sm">` (dòng ~79), bao quanh bằng điều kiện:

```tsx
{isLoading ? (
  <TableSkeleton rows={pageSize} cols={5} />
) : (
  <table className="w-full text-sm">
    {/* ... toàn bộ nội dung table hiện tại ... */}
  </table>
)}
```

### Products.tsx

- [ ] **Step 4: Thêm import TableSkeleton**

Thêm sau dòng `import Pagination from '../components/Pagination'`:
```typescript
import TableSkeleton from '../components/TableSkeleton'
```

- [ ] **Step 5: Destructure isLoading từ useQuery**

Tìm:
```typescript
const { data: productResult } = useQuery({
```
Thay bằng:
```typescript
const { data: productResult, isLoading } = useQuery({
```

- [ ] **Step 6: Render skeleton khi isLoading**

Tìm đoạn `{products.map((p, i) => (` trong JSX (bảng sản phẩm). Bao phần bảng bằng điều kiện:

```tsx
{isLoading ? (
  <TableSkeleton rows={pageSize} cols={4} />
) : (
  <>
    {products.map((p, i) => (
      {/* ... rows hiện tại ... */}
    ))}
  </>
)}
```

### StockHistory.tsx

- [ ] **Step 7: Thêm import TableSkeleton**

Thêm sau dòng `import { Input } from '@/components/ui/input'`:
```typescript
import TableSkeleton from '../components/TableSkeleton'
```

- [ ] **Step 8: Destructure isLoading từ useQuery**

Tìm:
```typescript
const { data: stockResult, isFetching } = useQuery({
```
Thay bằng:
```typescript
const { data: stockResult, isFetching, isLoading } = useQuery({
```

- [ ] **Step 9: Render skeleton khi isLoading**

Tìm đoạn `{transactions.map((t, i) => (` trong JSX. Bao phần bảng bằng điều kiện:

```tsx
{isLoading ? (
  <TableSkeleton rows={pageSize} cols={5} />
) : (
  <>
    {transactions.map((t, i) => (
      {/* ... rows hiện tại ... */}
    ))}
    {transactions.length === 0 && !isFetching && (
      {/* ... empty state hiện tại ... */}
    )}
  </>
)}
```

- [ ] **Step 10: Chạy typecheck và tests**

```bash
npm run typecheck && npm test
```

Expected: No errors, 47 tests passed.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/pages/InvoiceList.tsx src/renderer/src/pages/Products.tsx src/renderer/src/pages/StockHistory.tsx
git commit -m "feat: add skeleton loading to InvoiceList, Products, StockHistory"
```
