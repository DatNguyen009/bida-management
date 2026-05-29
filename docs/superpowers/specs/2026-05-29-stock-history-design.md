# Stock History — Design Spec

**Date:** 2026-05-29
**Scope:** Tự động xuất kho khi thanh toán hóa đơn + trang lịch sử giao dịch kho

---

## 1. Tổng quan

Hai vấn đề cần giải quyết cùng nhau:

1. **Bug fix:** `createInvoice` hiện không trừ kho khi thanh toán. Cần tự động trừ `stock_quantity` và ghi `cloud_stock_transactions` cho từng sản phẩm trong đơn hàng.
2. **Tính năng mới:** Trang "Lịch sử kho" để xem và đối chiếu toàn bộ giao dịch nhập/xuất, lọc theo sản phẩm và khoảng ngày.

---

## 2. Fix createInvoice — tự động xuất kho

### Luồng hiện tại (sai)
```
createInvoice → tạo invoice record → cập nhật điểm khách → return
```

### Luồng sau fix
```
createInvoice
  → tạo invoice record
  → cập nhật điểm khách (nếu có)
  → query cloud_order_items WHERE session_id = input.sessionId
  → for each item:
      UPDATE cloud_products SET stock_quantity = stock_quantity - quantity WHERE id = product_id
      INSERT INTO cloud_stock_transactions (type='out', note='Hóa đơn #XXXXX', ...)
  → return invoice
```

### Chi tiết

**Query order items trong createInvoice:**
```sql
SELECT oi.product_id, oi.quantity, oi.unit_price
FROM cloud_order_items oi
WHERE oi.session_id = $1 AND oi.agent_id = $2
```

**Trừ kho và ghi log cho mỗi item:**
```sql
-- Trừ kho, lấy before/after qty
UPDATE cloud_products
SET stock_quantity = stock_quantity - $1
WHERE id = $2 AND agent_id = $3
RETURNING stock_quantity

-- Ghi log
INSERT INTO cloud_stock_transactions
  (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
VALUES ($1, 'out', $2, NULL, $3, $4, $5, $6)
```

**Note format:** `'Hóa đơn #00001'` (dùng `invoiceNumber` vừa tạo)

**Xử lý lỗi:** Nếu một item trừ kho thất bại (sản phẩm không tồn tại), bỏ qua và tiếp tục — invoice đã được tạo, không rollback.

---

## 3. Handler mới: products:getStockHistory

```typescript
// Input
interface StockHistoryInput {
  productId?: number    // undefined = tất cả sản phẩm
  fromDate?: string     // YYYY-MM-DD, undefined = không giới hạn
  toDate?: string       // YYYY-MM-DD, undefined = không giới hạn
}

// Output (mỗi row)
interface StockTransaction {
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

**Query:**
```sql
SELECT st.id, st.product_id, p.name AS product_name,
       st.type, st.quantity, st.before_qty, st.after_qty,
       st.note, st.created_at
FROM cloud_stock_transactions st
JOIN cloud_products p ON p.id = st.product_id
WHERE st.agent_id = $1
  AND ($2::int IS NULL OR st.product_id = $2)
  AND ($3::date IS NULL OR DATE(st.created_at) >= $3)
  AND ($4::date IS NULL OR DATE(st.created_at) <= $4)
ORDER BY st.created_at DESC
LIMIT 500
```

---

## 4. Trang StockHistory

**Route/Nav:** Thêm "Kho" vào navbar trong `App.tsx`, giữa "Sản phẩm" và "Khách hàng".

### Layout

```
Lịch sử kho
┌─────────────────────────────────────────────────────┐
│ [Sản phẩm: Tất cả ▾] [Từ: ____-__-__] [Đến: ____-__-__] [Lọc] │
└─────────────────────────────────────────────────────┘

Thời gian      Sản phẩm     Loại    SL    Trước  Sau    Ghi chú
29/05 10:15    Bia Tiger     Nhập   +24    6      30     Nhập kho tuần
29/05 09:00    Coca Cola     Xuất   -2     15     13     Hóa đơn #00001
```

### Hiển thị type
- `in` → badge xanh "Nhập"
- `out` → badge đỏ "Xuất"
- `adjust` → badge vàng "Điều chỉnh"

### Số lượng có dấu
- `in`/`adjust+` → `+24`
- `out` → `-2`

### Filter behavior
- Không chọn gì = hiện tất cả (tối đa 500 bản ghi gần nhất)
- `fromDate` default = đầu tháng hiện tại
- `toDate` default = hôm nay
- Bấm "Lọc" mới query lại (không auto-query khi thay đổi filter)

---

## 5. File Map

| File | Thay đổi |
|------|---------|
| `src/main/handlers/invoices.ts` | MODIFY — thêm stock reduction sau khi tạo invoice |
| `src/main/handlers/products.ts` | MODIFY — thêm `getStockHistory` function |
| `src/main/index.ts` | MODIFY — register handler mới (nếu cần) |
| `src/preload/index.ts` | MODIFY — expose `products.getStockHistory` |
| `src/renderer/src/electron.d.ts` | MODIFY — thêm type |
| `src/renderer/src/types.ts` | MODIFY — thêm `StockTransaction` type |
| `src/renderer/src/pages/StockHistory.tsx` | NEW — trang lịch sử kho |
| `src/renderer/src/App.tsx` | MODIFY — thêm nav + route |

---

## 6. Không trong scope

- Xuất kho thủ công (xảy ra tự động qua invoice)
- `type: 'adjust'` thủ công từ UI
- Export CSV/Excel
- Tổng giá trị nhập kho (cost_price) — không hiển thị trong bảng log
