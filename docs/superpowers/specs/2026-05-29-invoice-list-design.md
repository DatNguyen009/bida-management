# Invoice List — Design Spec

**Date:** 2026-05-29
**Scope:** Trang danh sách hóa đơn với filter ngày và panel chi tiết

---

## 1. Tổng quan

Trang "Hóa đơn" trong nav, hiển thị danh sách hóa đơn đã thanh toán với filter khoảng ngày. Click vào một hóa đơn hiện panel chi tiết bên phải gồm các món đã order.

---

## 2. Layout

### Danh sách

```
Hóa đơn
[Từ: ____-__-__]  [Đến: ____-__-__]  [Lọc]

#      Thời gian       Bàn     Khách hàng    Chơi      Đồ uống   Tổng      Điểm   In
00001  29/05 22:30    Bàn 1   Nguyễn A      125,000   75,000    200,000   +20    ✓
00002  29/05 21:00    Bàn 3   —             80,000    0         80,000    +8     —
```

- Filter default: `fromDate` = đầu tháng hiện tại, `toDate` = hôm nay
- Bấm "Lọc" mới query (không auto)
- LIMIT 300 bản ghi
- Dòng được highlight khi selected
- Khách hàng hiện "—" nếu không có

### Panel chi tiết (bên phải khi click)

```
HĐ #00001 — Bàn 1
29/05/2026 22:30
Khách: Nguyễn Văn A (0901234567)
─────────────────────────────────
Tiền chơi:               125,000đ
─────────────────────────────────
Bia Tiger         x2      60,000đ
Coca Cola         x1      15,000đ
─────────────────────────────────
Tổng cộng:               200,000đ
Giảm giá:                      0đ
Đổi điểm (20 điểm):            0đ
Thanh toán:              200,000đ
─────────────────────────────────
Điểm tích lũy:               +20
```

- Hiện ngay khi click, không cần thêm bước
- Nếu không có đồ uống, section đồ uống ẩn
- `printed_at` hiện "Đã in lúc HH:mm" hoặc "Chưa in"

---

## 3. Handlers mới

### `invoices:getList`

```typescript
interface InvoiceListInput {
  fromDate?: string  // YYYY-MM-DD
  toDate?: string    // YYYY-MM-DD
}

interface InvoiceListRow {
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
```

**Query:**
```sql
SELECT i.id, i.invoice_number, i.session_id,
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
LIMIT 300
```

### `invoices:getOrderItems`

```typescript
interface InvoiceOrderItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}
```

**Query:**
```sql
SELECT p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
FROM cloud_order_items oi
JOIN cloud_products p ON p.id = oi.product_id
WHERE oi.session_id = $1 AND oi.agent_id = $2
ORDER BY oi.created_at
```

---

## 4. File Map

| File | Thay đổi |
|------|---------|
| `src/main/handlers/invoices.ts` | MODIFY — thêm `getInvoiceList`, `getInvoiceOrderItems` |
| `src/preload/index.ts` | MODIFY — expose 2 methods mới |
| `src/renderer/src/electron.d.ts` | MODIFY — thêm types |
| `src/renderer/src/types.ts` | MODIFY — thêm `InvoiceListRow`, `InvoiceOrderItem` |
| `src/renderer/src/pages/InvoiceList.tsx` | NEW — trang danh sách hóa đơn |
| `src/renderer/src/App.tsx` | MODIFY — nav + route |

---

## 5. Nav

Thêm "Hóa đơn" vào navbar sau "Kho" và trước "Khách hàng":
```
🎱 Bida Manager | Sản phẩm | Kho | Hóa đơn | Khách hàng | Báo cáo | ... | Cài đặt | Đăng xuất
```

---

## 6. Không trong scope

- In lại hóa đơn từ danh sách
- Xóa / hủy hóa đơn
- Export CSV
- Tìm kiếm theo số HĐ
