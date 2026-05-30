# Session Order Management Design

**Date:** 2026-05-30
**Scope:** Thêm gọi món (thêm/xoá sản phẩm) ngay từ màn hình Session đang chơi; fix upsert khi thêm sản phẩm trùng.

---

## 1. Vấn đề hiện tại

- Session page chỉ có đồng hồ + nút thanh toán, không có chỗ gọi món.
- `addOrderItem` luôn INSERT row mới → sản phẩm trùng tạo duplicate thay vì cộng dồn.

---

## 2. Fix Backend: Upsert thay vì Insert

### DB Migration

Thêm unique constraint vào `cloud_order_items` (production DB):

```sql
ALTER TABLE cloud_order_items
  ADD CONSTRAINT uq_order_items_session_product_agent
  UNIQUE (session_id, product_id, agent_id);
```

Cập nhật `db/schema.sql` tương ứng.

### Handler `addOrderItem`

Đổi INSERT thành upsert:

```sql
INSERT INTO cloud_order_items (session_id, product_id, quantity, unit_price, subtotal, agent_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (session_id, product_id, agent_id)
DO UPDATE SET
  quantity = cloud_order_items.quantity + EXCLUDED.quantity,
  subtotal = cloud_order_items.subtotal + EXCLUDED.subtotal
RETURNING *
```

Fix này áp dụng cho cả Session và Invoice.

---

## 3. Session Page — Thêm Order Management

**Layout:** Danh sách đồ uống ngay dưới đồng hồ, trên nút thanh toán.

```
[Đồng hồ + tiền giờ]

Đồ uống / thức ăn          [+ Gọi]
─────────────────────────────────
Bia Tiger x2       60,000đ    ✕
Nước suối x1       10,000đ    ✕
─────────────────────────────────
Tổng đồ uống: 70,000đ

[Kết thúc & Thanh toán — 220,000đ]
```

**Components tái sử dụng từ Invoice.tsx:**
- `OrderList` — hiển thị danh sách, nút ✕ xoá
- `ProductPicker` — modal chọn sản phẩm

**Data (tái sử dụng IPC đã có):**
- `orderItems:get(sessionId)` — load danh sách
- `orderItems:add(sessionId, productId, qty, price)` — thêm món
- `orderItems:remove(itemId)` — xoá món

---

## 4. Files thay đổi

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm unique constraint vào `order_items` |
| `src/main/handlers/orderItems.ts` | Đổi INSERT → upsert ON CONFLICT |
| `src/renderer/src/pages/Session.tsx` | Thêm order query + mutations + UI |

---

## 5. Out of scope

- Hiển thị tổng tạm tính (giờ + đồ uống) trong Session — giữ nguyên, chỉ hiện tổng giờ
- Sửa số lượng từng món inline (chỉ thêm mới hoặc xoá cả dòng)
