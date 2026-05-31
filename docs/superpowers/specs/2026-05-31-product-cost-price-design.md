# Product Cost Price Design

**Date:** 2026-05-31  
**Goal:** Thêm giá nhập (`cost_price`) vào sản phẩm: lưu trong DB, hiển thị trong danh sách, tự động cập nhật khi nhập kho có nhập giá.

---

## Data Model

Thêm cột vào `cloud_products`:
```sql
cost_price DECIMAL(10,0) NULL
```
NULL = chưa có giá nhập. Cập nhật mỗi khi nhập kho có điền giá.

---

## Changes

### `db/schema.sql`
Thêm `cost_price DECIMAL(10,0) NULL` vào bảng `products`, sau `price`.

### `src/renderer/src/types.ts`
Thêm `cost_price: number | null` vào `Product` interface.

### `src/main/handlers/products.ts`
1. Thêm `p.cost_price` vào SELECT của `getAllProducts` và `getProductPage`
2. Trong `adjustStock`: khi `type === 'in'` và `costPrice != null`, thêm `UPDATE cloud_products SET cost_price = $costPrice WHERE id = $productId`

### `src/renderer/src/pages/Products.tsx`
Trong bảng danh sách sản phẩm, thay cột **Giá** hiện tại bằng 2 cột:
- **Giá nhập** — `formatCurrency(p.cost_price)` hoặc `—` nếu null
- **Giá bán** — `formatCurrency(p.price)` (giữ nguyên logic hiện tại)

---

## Out of Scope
- Hiển thị cost_price trong form tạo/sửa sản phẩm
- Tính margin lợi nhuận
- Lịch sử thay đổi giá nhập
