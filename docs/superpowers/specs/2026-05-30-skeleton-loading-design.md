# Skeleton Loading Design

**Date:** 2026-05-30
**Scope:** Thêm skeleton loading state cho 3 trang: Hoá đơn, Sản phẩm, Kho hàng.

---

## 1. Components mới

### `src/renderer/src/components/ui/skeleton.tsx`
Animated pulse bar dùng Tailwind `animate-pulse`. Base component nhỏ, dùng để compose.

```tsx
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-[#1e3d23]/50', className)} />
}
```

### `src/renderer/src/components/TableSkeleton.tsx`
Wrapper render N dòng skeleton dạng bảng. Props: `rows` (số dòng, default 10), `cols` (số cột, default 4).

```
Props: { rows?: number; cols?: number }
```

Mỗi dòng là một row gồm `cols` ô skeleton có độ rộng ngẫu nhiên để trông tự nhiên.

---

## 2. Logic hiển thị

| State | Hiển thị |
|-------|---------|
| `isLoading` (chưa có data lần đầu) | `<TableSkeleton>` thay bảng |
| `isFetching` (refetch khi đổi trang/filter) | Giữ data cũ, nút Lọc disabled (đã có sẵn) |
| Có data | Bảng bình thường |

Dùng `isLoading` từ `useQuery` (chỉ `true` lần đầu chưa có cache), không dùng `isFetching` để tránh flicker khi chuyển trang.

---

## 3. Tích hợp

**InvoiceList.tsx:** Khi `isLoading` → render `<TableSkeleton rows={pageSize} cols={5} />` thay cho bảng hoá đơn.

**Products.tsx:** Khi `isLoading` → render `<TableSkeleton rows={pageSize} cols={4} />` thay cho bảng sản phẩm.

**StockHistory.tsx:** Khi `isLoading` → render `<TableSkeleton rows={pageSize} cols={5} />` thay cho bảng giao dịch kho.

---

## 4. Files thay đổi

| File | Thay đổi |
|------|---------|
| `src/renderer/src/components/ui/skeleton.tsx` | Tạo mới |
| `src/renderer/src/components/TableSkeleton.tsx` | Tạo mới |
| `src/renderer/src/pages/InvoiceList.tsx` | Thêm skeleton khi isLoading |
| `src/renderer/src/pages/Products.tsx` | Thêm skeleton khi isLoading |
| `src/renderer/src/pages/StockHistory.tsx` | Thêm skeleton khi isLoading |
