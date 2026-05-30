# Invoice Payment Method Design

**Date:** 2026-05-30
**Scope:** Thêm lựa chọn phương thức thanh toán (Tiền mặt / Chuyển khoản) vào màn hình Invoice, tích hợp QR VietQR động, in QR lên hóa đơn nhiệt.

---

## 1. User Flow

Thay thế 2 nút "In hóa đơn / Lưu không in" bằng flow 2 bước:

**Bước 1 — Chọn phương thức:**
- Nút "Tiền mặt" và "Chuyển khoản" hiển thị song song
- Nút "Chuyển khoản" bị disable nếu chưa cấu hình tài khoản ngân hàng trong Settings (hiện tooltip hướng dẫn)

**Bước 2a — Tiền mặt:**
- Hiện 2 nút: "In hóa đơn" và "Lưu không in"
- Nút "← Quay lại" để đổi phương thức

**Bước 2b — Chuyển khoản:**
- Hiện QR VietQR động (số tiền đúng với `finalAmount`, nội dung = mã hóa đơn)
- Hiện thông tin: tên ngân hàng, số tài khoản, số tiền
- Nút "Đã nhận tiền + In hóa đơn" và "Đã nhận tiền, không in"
- Nút "← Quay lại" để đổi phương thức

---

## 2. QR VietQR

Sử dụng API ảnh công khai của VietQR — không cần backend, không cần API key:

```
https://img.vietqr.io/image/{BANK_ID}-{ACCOUNT_NO}-compact2.png
  ?amount={AMOUNT}
  &addInfo={INVOICE_NUMBER}
  &accountName={ACCOUNT_NAME}
```

- `BANK_ID`: mã ngân hàng theo chuẩn VietQR (vd: `MB`, `VCB`, `TCB`)
- `AMOUNT`: `finalAmount` của hóa đơn (VND)
- `addInfo`: mã hóa đơn (vd: `HD00123`) để dễ đối soát
- QR render bằng `<img src={url} />` — không cần thư viện thêm

---

## 3. Cấu hình Settings

Thêm 3 key mới vào bảng `settings`:

| Key | Mô tả | Bắt buộc |
|-----|-------|----------|
| `bank_id` | Mã ngân hàng VietQR (vd: `MB`) | Có |
| `bank_account` | Số tài khoản | Có |
| `bank_account_name` | Tên chủ tài khoản (IN HOA) | Có |

Nếu thiếu bất kỳ trường nào → nút "Chuyển khoản" disabled.

---

## 4. Database

Thêm cột vào `cloud_invoices`:

```sql
ALTER TABLE cloud_invoices
  ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';
-- allowed values: 'cash' | 'bank_transfer'
```

Cập nhật `db/schema.sql` để phản ánh thay đổi này.

---

## 5. Types

```typescript
// src/renderer/src/types.ts
interface Invoice {
  // ... existing fields
  payment_method: 'cash' | 'bank_transfer'
}

interface InvoiceCreateInput {
  // ... existing fields
  paymentMethod: 'cash' | 'bank_transfer'
}
```

---

## 6. In hóa đơn nhiệt (80mm)

Khi `paymentMethod === 'bank_transfer'`, `printer.ts` in thêm QR VietQR vào cuối hóa đơn:

```typescript
// node-thermal-printer hỗ trợ sẵn
printer.printQR(vietqrUrl, { cellSize: 6, correction: 'M', model: 2 })
```

In thêm dòng: "Chuyển khoản: {BANK_ID} - {ACCOUNT_NO}"

Khi `paymentMethod === 'cash'`, không in QR (giữ nguyên format hiện tại).

---

## 7. Files thay đổi

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm cột `payment_method` vào `cloud_invoices` |
| `src/renderer/src/types.ts` | Thêm `payment_method` vào `Invoice`, `paymentMethod` vào `InvoiceCreateInput` |
| `src/renderer/src/pages/Invoice.tsx` | Flow 2 bước, QR display, state `paymentMethod` + `step` |
| `src/renderer/src/pages/Settings.tsx` | 3 trường cấu hình ngân hàng |
| `src/main/handlers/invoices.ts` | Lưu `payment_method` vào INSERT query |
| `src/main/handlers/printer.ts` | In QR khi `bank_transfer` |

---

## 8. Out of scope

- Xác nhận thanh toán tự động qua webhook (Casso/SePay) — để dành cho phase sau
- Hỗ trợ nhiều tài khoản ngân hàng
- Lịch sử thống kê theo phương thức thanh toán (có thể thêm vào Reports sau)
