# Agent Web Admin Portal — Design Spec

**Date:** 2026-06-02
**Status:** Approved

## Overview

Web admin portal cho chủ quán (agent) đăng nhập từ trình duyệt để quản lý quán bida. Tích hợp vào `web-admin/` sẵn có, thêm role `agent` song song với `master`. UI design giống hệt Electron app: dark glass, gold `#d4af37`, backdrop-blur cards.

## Scope

| Màn hình | Quyền |
|---------|-------|
| Dashboard bàn | Read (poll 10s) |
| Hóa đơn | Read (danh sách + chi tiết) |
| Báo cáo | Read (doanh thu ngày/tháng) |
| Sản phẩm | Full CRUD |
| Danh mục | Full CRUD |
| Nhân viên | Full CRUD |
| Khuyến mãi | Full CRUD |
| Cài đặt quán | Read + Update |

**Không có:** Mở/đóng bàn, tạo hóa đơn, thanh toán, in hóa đơn, nhập kho.

## Architecture

```
web-admin/ (mở rộng)
  ├── src/
  │   ├── App.tsx                    (thêm /agent/* routes + RequireAgent guard)
  │   ├── stores/authStore.ts        (thêm role field)
  │   ├── lib/api.ts                 (dùng lại)
  │   ├── components/
  │   │   ├── AgentLayout.tsx        (new — sidebar + topbar dark glass)
  │   │   └── ...existing
  │   └── pages/agent/
  │       ├── AgentDashboardPage.tsx
  │       ├── AgentInvoicesPage.tsx
  │       ├── AgentReportsPage.tsx
  │       ├── AgentProductsPage.tsx
  │       ├── AgentCategoriesPage.tsx
  │       ├── AgentStaffPage.tsx
  │       ├── AgentPromotionsPage.tsx
  │       └── AgentSettingsPage.tsx

server/
  ├── src/routes/agentPortal.ts      (new — all agent API endpoints)
  ├── src/index.ts                   (register /agent route)
  └── public/agent-admin/            (built output of web-admin)
```

**Deploy:** `npm run build` trong `web-admin/` → copy dist vào `server/public/agent-admin/` → serve tại `/agent`.

## Auth Flow

1. Agent mở `/login` (dùng chung LoginPage)
2. `POST /auth/login` → trả `{ accessToken, refreshToken, role: 'agent', agentId }`
3. `authStore` lưu `role` vào localStorage
4. `LoginPage` redirect: `role === 'agent'` → `/agent`, `role === 'master'` → `/`
5. `RequireAgent` guard: check token + `role === 'agent'`, nếu không → `/login`
6. `RequireMaster` guard: check token + `role === 'master'`, nếu không → `/login`

**authStore** thêm field:
```typescript
role: string | null  // 'master' | 'agent' | null
agentId: string | null
```

## Server API (`server/src/routes/agentPortal.ts`)

Tất cả endpoints dùng `authenticate + requireAgent` middleware. `agentId = req.account.agentId`.

### Tables

```
GET /agent/tables
→ SELECT * FROM cloud_tables WHERE agent_id = $1 ORDER BY name
Response: Table[]
```

### Invoices

```
GET /agent/invoices?page=1&pageSize=20&fromDate=&toDate=
→ Phân trang cloud_invoices + JOIN sessions, tables, customers
Response: { data: InvoiceRow[], total: number }

GET /agent/invoices/:id
→ Chi tiết HD + order_items
Response: { invoice: InvoiceRow, items: OrderItem[] }
```

### Reports

```
GET /agent/reports/summary?fromDate=&toDate=
→ Tổng doanh thu, số HD, tiền giờ chơi, tiền đồ uống
Response: { totalRevenue, invoiceCount, playRevenue, itemsRevenue }

GET /agent/reports/revenue?fromDate=&toDate=
→ Doanh thu theo ngày (7 ngày gần nhất nếu không có filter)
Response: { date, total, count }[]
```

### Products

```
GET  /agent/products?page=1&pageSize=50
POST /agent/products        { name, category_id, price, unit, min_stock_alert, product_type }
PUT  /agent/products/:id    { name, price, unit, min_stock_alert, is_active }
DELETE /agent/products/:id
```

### Categories

```
GET  /agent/categories
POST /agent/categories      { name, icon }
PUT  /agent/categories/:id  { name, icon }
DELETE /agent/categories/:id
```

### Staff

```
GET    /agent/staff
POST   /agent/staff         { username, password, allowedScreens }
PUT    /agent/staff/:id     { password?, allowedScreens, is_active }
DELETE /agent/staff/:id
```

### Promotions

```
GET    /agent/promotions
POST   /agent/promotions    { name, type, discount_type, discount_value, apply_to, ... }
PUT    /agent/promotions/:id
DELETE /agent/promotions/:id
```

### Settings

```
GET /agent/settings
→ SELECT key, value FROM cloud_settings WHERE agent_id = $1

PUT /agent/settings
Body: { key: string, value: string }[]
→ Upsert từng key-value
```

## UI Design Language

Giống hệt Electron app:

```css
/* Background */
background: #0f0e0f

/* Cards */
backdrop-filter: blur(20px);
background: rgba(255,255,255,0.05);
border: 1px solid rgba(255,255,255,0.10);
border-radius: 16px;

/* Gold accent */
color: #d4af37;
border-color: #d4af37;

/* Buttons */
.btn-gold { background: #d4af37; color: #0f0e0f; }
.btn-glass { background: rgba(255,255,255,0.08); color: white; }
.btn-danger { background: rgba(239,68,68,0.15); color: #f87171; }

/* Table headers */
color: #d4af37; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
```

CSS classes được copy từ `src/renderer/src/assets/index.css` sang `web-admin/src/index.css`.

## AgentLayout Component

```
┌──────────────────────────────────────────────────┐
│ 🎱  [Tên quán]                     [Đăng xuất ↩] │  ← topbar glass
├────────┬─────────────────────────────────────────┤
│🏠 Bàn  │                                         │
│🧾 HĐ   │                                         │
│📊 BC   │         <children / page content>       │
│📦 SP   │                                         │
│🏷 KM   │                                         │
│👤 NV   │                                         │
│⚙️ Cài  │                                         │
└────────┴─────────────────────────────────────────┘
sidebar w-52, dark glass, gold active state
```

## Màn hình chi tiết

### Dashboard Bàn (`/agent`)
- Grid 2-4 cột responsive
- Mỗi card: tên bàn, trạng thái badge (xanh=trống, đỏ=đang chơi, vàng=đặt trước)
- Nếu đang chơi: hiển thị thời gian đã chơi (tính từ `start_time` của active session)
- Poll `GET /agent/tables` mỗi 10 giây với `setInterval`

### Hóa đơn (`/agent/invoices`)
- Bảng: Số HĐ, Bàn, Ngày, Tiền chơi, Đồ uống, Tổng, Phương thức TT
- Filter: từ ngày, đến ngày
- Phân trang
- Click hàng → slide-in panel xem chi tiết (items, khuyến mãi, điểm)

### Báo cáo (`/agent/reports`)
- Tổng quan: 4 stat cards (Doanh thu hôm nay, Số HĐ, Tiền giờ, Tiền đồ)
- Biểu đồ doanh thu 7 ngày (dùng `recharts` — đã có trong Electron app)
- Date range picker

### Sản phẩm (`/agent/products`)
- Bảng: Tên, Danh mục, Giá, Tồn kho, Trạng thái
- Nút + Thêm → modal (giống Electron app)
- Sửa/Xoá inline

### Danh mục (`/agent/categories`)
- Grid icon cards
- CRUD modal

### Nhân viên (`/agent/staff`)
- Bảng + modal-glass giống Settings.tsx trong Electron
- Checkbox quyền màn hình

### Khuyến mãi (`/agent/promotions`)
- Giống PromotionsPage.tsx trong Electron app — copy design

### Cài đặt (`/agent/settings`)
- Form: tên quán, địa chỉ, SĐT, giá giờ mặc định, VAT
- Section PayOS credentials
- Section VietQR

## Error Handling

| Tình huống | Xử lý |
|-----------|-------|
| Token hết hạn | Refresh tự động (đã có trong api.ts interceptor) |
| Unauthorized (role sai) | Redirect /login |
| API error | Toast thông báo |
| Network offline | Hiện banner "Mất kết nối" |

## Build & Deploy

```bash
# Build web-admin
cd web-admin && npm run build
# Copy sang server
cp -r dist/* ../server/public/agent-admin/

# Hoặc tích hợp vào server/package.json:
"build:agent-admin": "cd ../web-admin && npm run build && cp -r dist/* ../server/public/agent-admin/"
```

Server serve tại:
```typescript
const agentAdminDir = path.join(__dirname, '../public/agent-admin')
app.use('/agent', express.static(agentAdminDir))
app.get('/agent/*', (_req, res) => res.sendFile(path.join(agentAdminDir, 'index.html')))
```

## File Changes

```
web-admin/src/App.tsx                              (add agent routes + RequireAgent)
web-admin/src/stores/authStore.ts                  (add role, agentId fields)
web-admin/src/index.css                            (copy glass CSS from Electron)
web-admin/src/components/AgentLayout.tsx           (new)
web-admin/src/pages/agent/AgentDashboardPage.tsx   (new)
web-admin/src/pages/agent/AgentInvoicesPage.tsx    (new)
web-admin/src/pages/agent/AgentReportsPage.tsx     (new)
web-admin/src/pages/agent/AgentProductsPage.tsx    (new)
web-admin/src/pages/agent/AgentCategoriesPage.tsx  (new)
web-admin/src/pages/agent/AgentStaffPage.tsx       (new)
web-admin/src/pages/agent/AgentPromotionsPage.tsx  (new)
web-admin/src/pages/agent/AgentSettingsPage.tsx    (new)

server/src/routes/agentPortal.ts                   (new — all agent API)
server/src/index.ts                                (register /agent routes + static)
server/public/agent-admin/                         (built output)

web-admin/package.json                             (add recharts if not present)
```
