# PayOS Integration — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Overview

Tích hợp PayOS làm cổng thanh toán VietQR động cho quán bida. Khách quét QR → chuyển khoản → hóa đơn tự động đóng không cần nhân viên bấm thêm. Sử dụng Server-Sent Events (SSE) để push thông báo real-time từ server về Electron app.

## Architecture

```
Electron App (Renderer)
  └── Invoice.tsx
        ├── [Thanh toán PayOS] → IPC → Main → POST /api/v1/payos/create-link
        │   ← {orderCode, qrCode (base64), expiredAt}
        ├── Hiển thị QR + countdown
        ├── EventSource → GET /api/v1/payos/events/:orderCode (SSE)
        └── SSE {type:'PAID'} → tự động checkoutMutation → đóng bàn

Express Server (Render — bida-management.onrender.com)
  ├── POST /api/v1/payos/create-link   — tạo link PayOS, lưu payos_orders
  ├── POST /api/v1/payos/webhook       — nhận callback PayOS, verify HMAC, push SSE
  ├── GET  /api/v1/payos/events/:code  — SSE stream, giữ connection
  └── POST /api/v1/payos/cancel/:code  — huỷ link PayOS

Cloud PostgreSQL
  └── payos_orders table (mới)
```

## PayOS Credentials & Config

Chủ quán đăng ký tài khoản PayOS tại payos.vn (miễn phí), lấy 3 thông tin:
- **Client ID**
- **API Key**
- **Checksum Key**

Lưu vào bảng `settings` với keys: `payos_client_id`, `payos_api_key`, `payos_checksum_key`.

Server đọc từ DB khi khởi tạo PayOS SDK instance (hoặc đọc per-request nếu multi-agent).

## Database Schema

### Bảng `payos_orders` (mới)

```sql
CREATE TABLE payos_orders (
  id           SERIAL PRIMARY KEY,
  order_code   BIGINT UNIQUE NOT NULL,
  agent_id     VARCHAR(50) NOT NULL,
  session_id   INT REFERENCES sessions(id) NULL,
  amount       DECIMAL(10,0) NOT NULL,
  status       VARCHAR(20) DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','PAID','CANCELLED','EXPIRED')),
  checkout_url TEXT NULL,
  qr_code      TEXT NULL,        -- base64 QR image từ PayOS
  description  TEXT NULL,        -- "Bida {tableName} - HD#{orderCode}"
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  paid_at      TIMESTAMPTZ NULL,
  expires_at   TIMESTAMPTZ NULL  -- created_at + 15 phút
);

CREATE INDEX payos_orders_agent_idx ON payos_orders (agent_id, created_at DESC);
CREATE INDEX payos_orders_session_idx ON payos_orders (session_id);
```

## Server API (`server/src/routes/payos.ts`)

### POST `/api/v1/payos/create-link`

**Auth:** Bearer token (existing auth middleware)

**Request body:**
```json
{
  "agentId": "string",
  "sessionId": 123,
  "amount": 150000,
  "tableName": "Bàn 1",
  "orderItems": [{ "name": "Nước ngọt", "quantity": 2, "price": 15000 }]
}
```

**Logic:**
1. Đọc `payos_client_id`, `payos_api_key`, `payos_checksum_key` từ settings của agentId
2. Sinh `orderCode` = timestamp milliseconds (BIGINT, unique đủ)
3. Gọi `payos.createPaymentLink({ orderCode, amount, description, items, returnUrl, cancelUrl })`
4. Lưu vào `payos_orders`
5. Trả về `{ orderCode, qrCode, checkoutUrl, expiredAt }`

**Response:**
```json
{
  "orderCode": 1717200000123,
  "qrCode": "data:image/png;base64,...",
  "checkoutUrl": "https://pay.payos.vn/web/...",
  "expiredAt": "2026-06-01T10:15:00Z"
}
```

---

### POST `/api/v1/payos/webhook`

**Auth:** HMAC signature verify bằng PayOS SDK (`payos.verifyPaymentWebhookData`)

**Logic:**
1. Verify webhook data — nếu sai signature → trả 400
2. Nếu `data.code === '00'` (thành công): update `payos_orders.status = 'PAID'`, `paid_at = NOW()`
3. Nếu `data.code === '01'` (huỷ): update status = `CANCELLED`
4. Push SSE event tới tất cả client đang subscribe `orderCode` này
5. Trả `{ success: true }`

---

### GET `/api/v1/payos/events/:orderCode`

**Auth:** Bearer token

**Protocol:** Server-Sent Events

Server giữ connection mở. Khi có sự kiện (từ webhook), gửi:
```
data: {"type":"PAID","orderCode":1717200000123}

```
hoặc:
```
data: {"type":"CANCELLED","orderCode":1717200000123}

```

Gửi heartbeat mỗi 30 giây để Render không drop connection:
```
: heartbeat

```

Khi client disconnect → server dọn dẹp listener.

---

### POST `/api/v1/payos/cancel/:orderCode`

**Auth:** Bearer token

**Logic:**
1. Gọi `payos.cancelPaymentLink(orderCode, 'Huỷ bởi nhân viên')`
2. Update `payos_orders.status = 'CANCELLED'`
3. Push SSE event `CANCELLED`
4. Trả `{ success: true }`

## Electron IPC — Main Process

Thêm vào `src/main/handlers/payos.ts`:

```typescript
// Tạo PayOS link — gọi API server với JWT token
ipcMain.handle('payos:createLink', async (_e, input) => {
  const token = authStore.get('token')
  const res = await fetch(`${API_URL}/payos/create-link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('PayOS create link failed')
  return res.json()
})

// Huỷ PayOS link
ipcMain.handle('payos:cancelLink', async (_e, orderCode: number) => {
  const token = authStore.get('token')
  const res = await fetch(`${API_URL}/payos/cancel/${orderCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
})
```

SSE: Renderer mở `EventSource` trực tiếp — không qua IPC. URL = `${API_URL}/payos/events/${orderCode}` với header Authorization (dùng `fetch` + `ReadableStream` thay vì `EventSource` native vì native không support custom headers).

## UI — Invoice.tsx

### Mở rộng PaymentStep

```typescript
type PaymentStep = 'select' | 'cash' | 'bank' | 'payos'
```

### Màn hình chọn thanh toán — thêm nút PayOS

Nút thứ 3 trong bước `select`:
```
[💵 Tiền mặt]   [🏦 Chuyển khoản]   [📱 PayOS QR]
```

### Màn hình `payos` — QR + countdown + SSE

```
┌─ Thanh toán PayOS ──────────────────────────┐
│                                              │
│          [QR IMAGE — 200×200]               │
│                                              │
│   Quét mã QR để thanh toán                 │
│   Số tiền: 150.000đ                         │
│   Mã đơn: #1717200000123                    │
│                                              │
│   ⏱ Hết hạn sau: 14:32                     │
│                                              │
│   ● Đang chờ xác nhận...   (pulse anim)    │
│                                              │
│   [Tạo lại QR]    [Quay lại]               │
└──────────────────────────────────────────────┘
```

**States:**
- `loading` — đang gọi API tạo link
- `waiting` — hiển thị QR, SSE đang chờ
- `paid` — toast + auto checkout (không hiện lâu)
- `expired` — hiện "Hết hạn", nút Tạo lại QR
- `cancelled` — sau khi bấm Tạo lại hoặc SSE CANCELLED

**SSE listener (fetch + ReadableStream):**
```typescript
const controller = new AbortController()
const res = await fetch(`${API_URL}/payos/events/${orderCode}`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: controller.signal,
})
const reader = res.body!.getReader()
// parse lines, tìm "data: {...}", JSON.parse, handle type
```

Khi `type === 'PAID'`:
1. `toast.success('Thanh toán PayOS thành công!')`
2. Gọi `checkoutMutation.mutate()` (luồng checkout hiện có)
3. `onComplete()` → về Dashboard

Khi `type === 'CANCELLED'` hoặc countdown hết:
1. Set state `expired`
2. Hiện nút Tạo lại QR

## Settings.tsx — PayOS Credentials

Thêm section mới trong tab Settings:

```
─── PayOS ─────────────────────────────────────
Client ID:     [___________________________]
API Key:       [___________________________]
Checksum Key:  [___________________________]
```

Lưu qua `settings.set(key, value)` IPC — keys: `payos_client_id`, `payos_api_key`, `payos_checksum_key`.

## Error Handling

| Tình huống | Xử lý |
|-----------|-------|
| PayOS API lỗi khi tạo link | Toast error "Không thể tạo QR", giữ màn hình select |
| Chưa cấu hình PayOS credentials | Nút PayOS QR disabled + tooltip "Chưa cấu hình PayOS trong Cài đặt" |
| SSE mất kết nối | Tự reconnect sau 5 giây (retry logic), hiện "Đang kết nối lại..." |
| Webhook signature sai | Server trả 400, log lỗi, không update DB |
| Checkout tự động thất bại | Toast error + hiện nút checkout thủ công |
| Render free tier drop SSE | Heartbeat 30s + retry giữ kết nối |

## Luồng Checkout Tự Động (sau SSE PAID)

Tái dụng hoàn toàn `checkoutMutation` hiện có trong Invoice.tsx:
- `invoices:create` → lưu invoice với `paymentMethod: 'bank_transfer'`
- Trừ stock, cộng điểm, đóng session, set table idle
- Không in hóa đơn tự động (nhân viên in thủ công sau nếu cần)

## File Changes

```
server/src/routes/payos.ts              (new)
server/src/index.ts                     (register /payos route)
server/package.json                     (add @payos/node)

db/schema.sql                           (add payos_orders table)

src/main/handlers/payos.ts              (new — createLink, cancelLink IPC)
src/main/index.ts                       (register payos handlers)
src/preload/index.ts                    (expose window.api.payos.*)
src/renderer/src/electron.d.ts          (add payos types)
src/renderer/src/types.ts               (PayosLinkResult type)
src/renderer/src/pages/Invoice.tsx      (add payos step + SSE + QR UI)
src/renderer/src/pages/Settings.tsx     (add PayOS credentials section)
```

## Dependencies

```bash
# Server
cd server && npm install @payos/node

# Electron (không cần thêm — dùng native fetch)
```
