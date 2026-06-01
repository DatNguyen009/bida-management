# Chương Trình Khuyến Mãi — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Overview

Xây dựng hệ thống khuyến mãi cho quán bida gồm 3 loại: voucher/mã giảm giá, khuyến mãi khung giờ, và khuyến mãi sự kiện/ngày đặc biệt. Các KM có thể stack (cộng dồn) với nhau và với discount thủ công + đổi điểm hiện có. Chủ quán quản lý tại trang Khuyến mãi riêng trong menu điều hướng.

## Architecture

```
Promotions Page (new)
  └── CRUD modal-glass (create/edit promotion)

Invoice Page (extended)
  ├── Auto-applied promotions (time_slot + event)
  ├── Voucher input (manual code entry)
  └── applyPromotions() → tính stack discount

Backend
  ├── electron/handlers/promotions.ts (new)
  └── DB: promotions table (new), invoices.promotions_applied JSONB (new col)
```

## Database Schema

### Bảng `promotions` (mới)

```sql
CREATE TABLE promotions (
  id             SERIAL PRIMARY KEY,
  agent_id       VARCHAR(50) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  type           VARCHAR(20) NOT NULL CHECK (type IN ('voucher','time_slot','event')),
  is_active      BOOLEAN DEFAULT TRUE,

  -- Giá trị giảm
  discount_type  VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  apply_to       VARCHAR(20) DEFAULT 'total' CHECK (apply_to IN ('total','play','items')),
  max_discount   DECIMAL(10,0) NULL,         -- trần giảm (chỉ dùng khi discount_type='percent')

  -- Voucher
  code           VARCHAR(50) NULL,           -- NULL nếu không phải voucher
  max_uses       INT NULL,                   -- NULL = không giới hạn
  used_count     INT DEFAULT 0,

  -- Time slot
  days_of_week   INT[] NULL,                 -- 1=T2 … 7=CN (PostgreSQL ISO)
  time_from      TIME NULL,
  time_to        TIME NULL,

  -- Event / ngày cụ thể
  valid_from     DATE NULL,
  valid_to       DATE NULL,

  created_at     TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT voucher_has_code CHECK (type <> 'voucher' OR code IS NOT NULL)
);

CREATE UNIQUE INDEX promotions_code_agent_idx ON promotions (agent_id, code)
  WHERE code IS NOT NULL;
```

### Thay đổi bảng `cloud_invoices`

```sql
ALTER TABLE cloud_invoices
  ADD COLUMN promotions_applied JSONB DEFAULT '[]'::jsonb;
  -- [{id, name, amount}]
```

## IPC Handlers (`promotions.ts`)

| Channel | Input | Output | Mô tả |
|---------|-------|--------|-------|
| `promotions:getAll` | — | `Promotion[]` | Toàn bộ danh sách |
| `promotions:getActive` | `now: string` | `Promotion[]` | KM time_slot + event đang hợp lệ |
| `promotions:validateVoucher` | `code: string` | `Promotion \| null` | Kiểm tra voucher hợp lệ và chưa hết lượt |
| `promotions:create` | `PromotionInput` | `Promotion` | Tạo mới |
| `promotions:update` | `id, PromotionInput` | `Promotion` | Cập nhật |
| `promotions:delete` | `id` | `void` | Xoá |
| `promotions:incrementUsed` | `id` | `void` | Tăng used_count sau checkout |

## Logic Áp Dụng KM

### Gom KM hợp lệ

`getActive(now)` trả về các KM auto (không cần mã):
- **time_slot**: `is_active = true` AND `days_of_week @> [ISODOW(now)]` AND `time_from ≤ TIME(now VN) ≤ time_to`
- **event**: `is_active = true` AND `valid_from ≤ DATE(now VN) ≤ valid_to`

`validateVoucher(code)` kiểm tra:
- `is_active = true` AND `code = $1` AND (`max_uses IS NULL` OR `used_count < max_uses`) AND (`valid_to IS NULL` OR `valid_to >= TODAY()`)

### Stack Discount (`applyPromotions`)

```typescript
function applyPromotions(
  promos: AppliedPromo[],
  playAmount: number,
  itemsAmount: number
): { items: AppliedPromoResult[]; totalDiscount: number } {
  let remaining = playAmount + itemsAmount
  const items: AppliedPromoResult[] = []

  // time_slot & event trước, voucher sau
  const sorted = [...promos].sort((a, b) =>
    a.type === 'voucher' ? 1 : b.type === 'voucher' ? -1 : 0
  )

  for (const p of sorted) {
    const base =
      p.apply_to === 'play'  ? playAmount  :
      p.apply_to === 'items' ? itemsAmount :
      remaining  // 'total': tính trên số còn lại sau KM trước

    let amount = p.discount_type === 'percent'
      ? base * p.discount_value / 100
      : p.discount_value

    if (p.max_discount) amount = Math.min(amount, p.max_discount)
    amount = Math.min(amount, remaining)  // không giảm âm

    remaining -= amount
    items.push({ id: p.id, name: p.name, amount: Math.round(amount) })
  }

  return { items, totalDiscount: items.reduce((s, i) => s + i.amount, 0) }
}
```

**Thứ tự giảm trong Invoice:**
```
Tổng trước giảm
- KM tự động (time_slot / event)
- KM voucher
- Đổi điểm
- Discount thủ công
─────────────────
Tạm tính (trước VAT)
+ VAT
═════════════════
Thành tiền
```

## UI

### Trang Khuyến mãi (menu mới)

Thêm mục **Khuyến mãi** vào sidebar navigation, icon 🏷.

**Layout:**
- Header: tiêu đề + nút `+ Thêm KM`
- Tab filter: Tất cả / Voucher / Khung giờ / Sự kiện
- Bảng danh sách: Tên, Loại (badge), Giảm, Phạm vi, Trạng thái (toggle), Thao tác (Sửa / Xoá)
- Trạng thái active/inactive có thể toggle trực tiếp trên bảng

**Modal tạo/sửa (modal-glass):**

```
Tên chương trình: [___________]
Loại: [Voucher / Khung giờ / Sự kiện]  ← toggle tabs

─── Voucher ───
Mã code: [BIDA20]
Số lần dùng tối đa: [100]  (0 = không giới hạn)
Ngày hết hạn: [dd/mm/yyyy]  (tuỳ chọn)

─── Khung giờ ───
Ngày áp dụng: [☑T2 ☑T3 ☑T4 ☑T5 ☑T6 ☐T7 ☐CN]
Từ: [14:00]  Đến: [17:00]

─── Sự kiện ───
Từ ngày: [01/06/2026]  Đến ngày: [07/06/2026]

─── Chung (luôn hiển thị) ───
Loại giảm:  [% Phần trăm / Cố định đồng]
Giá trị: [20] %
Giảm tối đa: [200.000] đ  ← chỉ hiện khi %
Áp dụng vào: [Toàn đơn / Chỉ giờ chơi / Chỉ đồ uống]
Kích hoạt: [☑ Đang bật]

[Huỷ]  [+ Thêm / Lưu thay đổi]
```

### Invoice Page — Tích hợp KM

Thêm section **Khuyến mãi** giữa phần đồ uống và phần điểm:

```
┌─ Khuyến mãi ────────────────────────────────┐
│ 🏷 Happy Hour −20%           −40.000đ  [✕] │  ← tự động, không xoá được
│ 🏷 Tết 2026 −50.000đ cố định −50.000đ  [✕] │  ← tự động
│                                              │
│ Nhập mã:  [___________]  [Áp dụng]          │
└──────────────────────────────────────────────┘
```

- KM tự động (time_slot/event): hiển thị ngay khi vào màn hình Invoice, không có nút xoá
- KM voucher đã áp dụng: hiển thị kèm nút ✕ để bỏ
- Nếu không có KM nào: ẩn section (collapsed)
- Khi nhập mã sai / hết lượt: toast error

## Luồng Checkout (bổ sung)

1. Load Invoice → gọi `promotions:getActive(now)` → hiển thị KM tự động
2. Khách nhập mã → gọi `promotions:validateVoucher(code)` → thêm vào danh sách
3. Tính `applyPromotions(activePromos, playAmount, itemsAmount)` → tổng giảm KM
4. `finalAmount = total - promoDiscount - discountFromPoints - manualDiscount`
5. Thanh toán → `promotions:incrementUsed(id)` cho từng voucher đã dùng
6. Lưu `promotions_applied` JSON vào `cloud_invoices`

## Báo cáo

Không thêm tab mới trong Reports. Dữ liệu `promotions_applied` có thể dùng cho báo cáo sau. Phase này chỉ lưu trữ.

## Error Handling

| Tình huống | Xử lý |
|-----------|-------|
| Mã voucher không tồn tại | Toast: "Mã không hợp lệ" |
| Voucher hết lượt dùng | Toast: "Mã đã đạt giới hạn sử dụng" |
| Voucher hết hạn | Toast: "Mã đã hết hạn" |
| Giảm vượt tổng tiền | Clamp về 0, không báo lỗi |
| Tạo mã trùng | Toast: "Mã đã tồn tại" |

## File Changes

```
src/main/handlers/promotions.ts         (new)
src/main/index.ts                       (register handlers)
src/preload/index.ts                    (add promotions bridge)
src/renderer/src/electron.d.ts          (add types)
src/renderer/src/types.ts               (Promotion, AppliedPromo types)
src/renderer/src/lib/promoCalc.ts       (new — applyPromotions function)
src/renderer/src/pages/Promotions.tsx   (new page)
src/renderer/src/pages/Invoice.tsx      (add promo section)
src/renderer/src/App.tsx                (add route + nav item)
db/schema.sql                           (promotions table + invoice column)
```
