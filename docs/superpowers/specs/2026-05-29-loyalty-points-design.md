# Loyalty Points — Design Spec

**Date:** 2026-05-29  
**Scope:** Tích điểm khách hàng trong Electron desktop app (quán bida)

---

## 1. Tổng quan

Cho phép nhân viên tra cứu / tạo khách hàng ngay tại màn hình thanh toán, dùng điểm tích lũy để giảm giá, và tự động cộng điểm sau khi thanh toán. Khách hàng là tùy chọn — không có khách vẫn in hóa đơn bình thường.

---

## 2. Luồng chính

```
[Invoice page]
  │
  ├── Nhập SĐT → Tìm
  │     ├── Tìm thấy → hiện tên + điểm hiện có
  │     │     └── Nhập số điểm muốn dùng (tùy chọn)
  │     ├── Không tìm thấy → nút [+ Tạo mới] → form nhanh (tên + SĐT)
  │     └── Bỏ qua → thanh toán không có khách
  │
  ├── Tính tổng: finalAmount = total - discount - (pointsRedeemed × vnd_per_point)
  ├── Tính điểm nhận: pointsEarned = floor(finalAmount / 10000) × points_per_10k_vnd
  │
  └── Thanh toán / In hóa đơn
        └── Cập nhật customer: points_balance, total_visits, total_spent
```

---

## 3. UI — Invoice Page

Thêm section **"Khách hàng"** ở đầu màn hình Invoice, trước phần đồ uống:

### 3.1 Trạng thái ban đầu
```
KHÁCH HÀNG (tùy chọn)
SĐT: [________________]  [Tìm]
```

### 3.2 Tìm thấy khách
```
✓ Nguyễn Văn A  •  SĐT: 0901234567        [✕ Xóa]
  Điểm hiện có: 120 điểm

  Dùng điểm:  [____]  điểm  (tối đa 120, tối thiểu 100)
  → Giảm:     12,000đ
  → Sau TT:   +5 điểm nhận, còn lại 25 điểm
```

### 3.3 Không tìm thấy
```
✗ Không tìm thấy SĐT "0912345678"
  [+ Tạo khách hàng mới]
```
Click tạo mới → inline form: Tên (bắt buộc) + SĐT (tự điền) → Lưu → chuyển sang trạng thái 3.2.

### 3.4 Validation điểm
- Không vượt quá `points_balance`
- Không nhỏ hơn `min_redeem_points` (nếu > 0)
- Giảm giá không vượt quá `finalAmount` (hóa đơn không âm)
- Nếu vi phạm → hiện lỗi inline, không block thanh toán (chỉ block nếu nhập sai)

---

## 4. Backend — IPC Handlers

### 4.1 Thêm mới: `loyalty:getSettings`
```typescript
// Đọc từ cloud_loyalty_settings WHERE agent_id = $1
// Trả về: { pointsPer10k: number, vndPerPoint: number, minRedeemPoints: number }
// Nếu chưa có row → trả về default { 1, 100, 100 }
```

### 4.2 Đã có, dùng lại
| Handler | Dùng cho |
|---------|----------|
| `customers:findByPhone` | Tra cứu khách theo SĐT |
| `customers:create` | Tạo khách mới nhanh |
| `invoices:create` | Tạo hóa đơn + cập nhật điểm (đã có logic) |

### 4.3 `invoices:create` — đã xử lý
Handler hiện tại đã:
- Trừ `points_redeemed`, cộng `points_earned` vào `points_balance`
- Tăng `total_visits + 1`
- Cộng `total_spent += final_amount`

Không cần sửa logic này.

---

## 5. Settings — Loyalty Config

Invoice hiện đọc loyalty settings từ `settings` key-value table. Sẽ chuyển sang đọc từ `cloud_loyalty_settings` qua handler `loyalty:getSettings`.

Settings page giữ nguyên UI, nhưng sẽ lưu vào `cloud_loyalty_settings` thay vì `settings` table (hoặc lưu cả hai để tương thích).

**Quyết định:** Lưu song song — `settings` key-value giữ nguyên cho Settings page, `loyalty:getSettings` đọc từ `cloud_loyalty_settings`. Settings page thêm handler `loyalty:saveSettings` để đồng bộ.

---

## 6. Customers Page — Cải thiện

### Hiện tại
- Danh sách khách, tìm kiếm, tạo mới

### Thêm vào
- **Panel chi tiết** (bên phải khi click): tên, SĐT, điểm, tổng lượt, tổng chi
- **Lịch sử hóa đơn** 20 gần nhất (dùng `customers:invoices` đã có)
- **Nút Sửa**: inline form chỉnh tên / email / ghi chú
- **Điều chỉnh điểm thủ công**: nhân viên có thể +/- điểm với lý do (dùng `customers:update`)

---

## 7. Preload / IPC Bridge

Thêm vào `preload/index.ts`:
```typescript
loyalty: {
  getSettings: (): Promise<LoyaltySettings> =>
    ipcRenderer.invoke('loyalty:getSettings'),
  saveSettings: (s: LoyaltySettings): Promise<void> =>
    ipcRenderer.invoke('loyalty:saveSettings', s),
}
```

---

## 8. Không nằm trong scope

- Push notification điểm cho khách
- App khách hàng (mobile)
- Hết hạn điểm
- Bậc thành viên (Gold/Silver/Bronze)

---

## 9. Thứ tự triển khai

1. Thêm `loyalty:getSettings` + `loyalty:saveSettings` handlers
2. Thêm vào preload bridge
3. Cập nhật Invoice page: customer lookup section + points input
4. Cập nhật Customers page: chi tiết panel + lịch sử
5. Cập nhật Settings page: lưu vào `cloud_loyalty_settings`
6. Tests
