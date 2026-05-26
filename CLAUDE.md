# Bida Management App

Ứng dụng desktop quản lý quán bida: theo dõi bàn, tính giờ, bán hàng, in hóa đơn nhiệt, tích điểm khách hàng, báo cáo doanh thu.

## Tech Stack

- **Shell:** Electron (latest stable)
- **Frontend:** React 18 + Vite + TypeScript
- **UI:** shadcn/ui + Tailwind CSS
- **State:** Zustand
- **Data:** @tanstack/react-query (IPC bridge làm fetcher)
- **Database:** PostgreSQL (local)
- **DB Driver:** `pg` (node-postgres)
- **Thermal Print:** `node-thermal-printer` (ESC/POS, 80mm)
- **Packaging:** electron-builder

## Project Structure

```
bida/
├── electron/
│   ├── main.ts          # Electron main process
│   ├── preload.ts       # Context bridge IPC
│   └── handlers/        # IPC handler modules
│       ├── tables.ts
│       ├── sessions.ts
│       ├── products.ts
│       ├── invoices.ts
│       ├── customers.ts
│       ├── reports.ts
│       └── printer.ts
├── src/
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx      # Grid bàn bida
│   │   ├── Session.tsx        # Chi tiết phiên chơi
│   │   ├── Invoice.tsx        # Preview & in hóa đơn
│   │   ├── Products.tsx       # Quản lý hàng hóa
│   │   ├── Customers.tsx      # Quản lý khách hàng
│   │   ├── Reports.tsx        # Báo cáo thống kê
│   │   └── Settings.tsx       # Cài đặt quán
│   ├── components/
│   │   ├── TableCard.tsx      # Card bàn bida
│   │   ├── SessionTimer.tsx   # Đồng hồ đếm giờ
│   │   ├── OrderList.tsx      # Danh sách đồ uống
│   │   └── InvoicePreview.tsx # Preview hóa đơn 80mm
│   ├── stores/
│   │   ├── tableStore.ts
│   │   └── sessionStore.ts
│   └── lib/
│       ├── ipc.ts             # IPC helper functions
│       └── utils.ts
├── db/
│   ├── schema.sql             # DDL toàn bộ schema
│   └── seed.sql               # Dữ liệu mẫu
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-26-bida-management-design.md
├── CLAUDE.md
├── package.json
└── vite.config.ts
```

## Database (PostgreSQL)

Schema đầy đủ tại `db/schema.sql`. Các bảng chính:

| Bảng | Mục đích |
|------|---------|
| `tables` | Bàn bida (tên, trạng thái, giá/giờ) |
| `sessions` | Phiên chơi (bắt đầu, kết thúc, tiền chơi) |
| `customers` | Khách hàng (SĐT, điểm tích lũy) |
| `loyalty_settings` | Cấu hình tích điểm |
| `products` | Hàng hóa (đồ uống, thức ăn) |
| `order_items` | Đơn hàng trong phiên |
| `invoices` | Hóa đơn đã thanh toán |
| `stock_transactions` | Lịch sử nhập/xuất kho |
| `settings` | Cài đặt quán (tên, địa chỉ, SĐT) |

**Kết nối DB:** cấu hình qua `Settings` > lưu vào `settings` table hoặc `.env` local.

## IPC Architecture

Main Process expose các handler qua `ipcMain.handle()`. Renderer gọi qua `window.api.*` (contextBridge).

```
Renderer: window.api.tables.getAll()
    → preload: ipcRenderer.invoke('tables:getAll')
    → main: ipcMain.handle('tables:getAll', handler)
    → PostgreSQL query
    → return data
```

## Màn hình chính

1. **Dashboard** — Grid bàn: xanh=trống, đỏ=đang chơi, vàng=đặt trước
2. **Session** — Đồng hồ realtime, thêm order, tính tiền tạm tính
3. **Invoice** — Preview hóa đơn 80mm, áp điểm/giảm giá, in ESC/POS
4. **Products** — CRUD hàng hóa, nhập kho, cảnh báo sắp hết
5. **Customers** — Tra cứu SĐT, lịch sử, quản lý điểm
6. **Reports** — Doanh thu ngày/tháng, thống kê bàn, tồn kho
7. **Settings** — Thông tin quán, giá giờ, máy in, cấu hình điểm

## In Hóa Đơn (Thermal 80mm)

- Thư viện: `node-thermal-printer` với driver ESC/POS
- Kết nối qua USB hoặc Serial port (cấu hình trong Settings)
- Nếu máy in lỗi: vẫn lưu HĐ vào DB, hiện thông báo lỗi
- Format hóa đơn: tên quán, số HĐ, bàn, giờ chơi, đồ uống, tổng, điểm

## Business Logic Quan Trọng

**Tính tiền giờ chơi:**
```
duration_minutes = (end_time - start_time) in minutes
play_amount = ceil(duration_minutes / 60) * hourly_rate
-- hoặc tính theo phút: (duration_minutes / 60) * hourly_rate
```

**Tích điểm:**
```
points_earned = floor(final_amount / 10000) * points_per_10k_vnd
discount_from_points = points_redeemed * vnd_per_point
```

**Đóng phiên:**
1. Tính `play_amount` từ `start_time → NOW()`
2. Tính `items_amount` từ `order_items`
3. Tạo `invoice` record
4. Trừ `stock_quantity` cho từng sản phẩm đã order
5. Cộng `points_earned` vào `customer.points_balance`
6. Set `session.status = 'closed'`, `table.status = 'idle'`

## Development Setup

```bash
# Cài dependencies
npm install

# Khởi động dev (Electron + Vite HMR)
npm run dev

# Build production
npm run build

# Package thành .exe / .dmg
npm run dist
```

**Yêu cầu môi trường:**
- Node.js >= 18
- PostgreSQL >= 14 chạy local (port 5432)
- Tạo DB: `createdb bida_db`
- Chạy schema: `psql bida_db < db/schema.sql`

## Code Conventions

- TypeScript strict mode
- IPC channel naming: `resource:action` (vd: `tables:getAll`, `sessions:create`)
- Tất cả DB queries trong `electron/handlers/`, không query trực tiếp từ Renderer
- Zustand stores chỉ lưu UI state, server state dùng React Query
- Không dùng `any` trong TypeScript

## Design Spec

Chi tiết đầy đủ tại: `docs/superpowers/specs/2026-05-26-bida-management-design.md`
