# Stock History Cost Price Display Design

**Date:** 2026-05-31  
**Goal:** Hiển thị giá nhập (`cost_price`) trong trang Lịch sử kho. Data đã có sẵn trong DB, chỉ cần expose qua query và hiện trong UI.

---

## Changes

### 1. `src/renderer/src/types.ts`
Thêm `cost_price: number | null` vào `StockTransaction` interface.

### 2. `src/main/handlers/products.ts`
Thêm `st.cost_price` vào SELECT của `getStockHistory`.

### 3. `src/renderer/src/pages/StockHistory.tsx`
Thêm cột "Giá nhập" vào bảng — hiển thị `formatCurrency(tx.cost_price)` nếu có, hiện `—` nếu null.

---

## Out of Scope
- Thêm giá nhập mặc định vào sản phẩm
- Tính margin lợi nhuận
