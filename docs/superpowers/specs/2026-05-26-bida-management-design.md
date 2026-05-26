# Bida Management App — Design Spec

**Date:** 2026-05-26  
**Status:** Approved

## Overview

Ứng dụng desktop quản lý quán bida: theo dõi bàn chơi, tính giờ, bán hàng hóa (đồ uống/thức ăn), quản lý kho, in hóa đơn nhiệt 80mm, tích điểm khách hàng, và báo cáo doanh thu.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron (latest stable) |
| Frontend | React 18 + Vite + TypeScript |
| UI Library | shadcn/ui + Tailwind CSS |
| State | Zustand |
| Data Fetching | @tanstack/react-query |
| Database | PostgreSQL (local server) |
| DB Driver | `pg` (node-postgres) |
| Thermal Print | `node-thermal-printer` (ESC/POS) |
| Packaging | electron-builder |

## Architecture

```
Electron Shell
├── Main Process (Node.js)
│   ├── IPC handlers (ipcMain)
│   ├── PostgreSQL queries via `pg`
│   └── Thermal printer via node-thermal-printer
└── Renderer Process
    ├── React + Vite SPA
    ├── Zustand stores
    └── React Query (IPC bridge as fetcher)
```

UI gọi IPC → Main xử lý DB/print → trả kết quả về Renderer.

## Database Schema

```sql
-- Bàn bida
CREATE TABLE tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'idle', -- idle | playing | reserved
  hourly_rate DECIMAL(10,0) NOT NULL DEFAULT 50000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phiên chơi
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  table_id INT REFERENCES tables(id),
  customer_id INT REFERENCES customers(id) NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NULL,
  duration_minutes INT NULL,
  play_amount DECIMAL(10,0) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open' -- open | closed
);

-- Khách hàng
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(100) NULL,
  total_visits INT DEFAULT 0,
  total_spent DECIMAL(12,0) DEFAULT 0,
  points_balance INT DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cấu hình tích điểm
CREATE TABLE loyalty_settings (
  id SERIAL PRIMARY KEY,
  points_per_10k_vnd INT DEFAULT 1,   -- chi 10k = 1 điểm
  vnd_per_point INT DEFAULT 100,       -- 1 điểm = 100đ giảm giá
  min_redeem_points INT DEFAULT 100    -- tối thiểu 100 điểm mới đổi
);

-- Danh mục sản phẩm
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),               -- drink | food | other
  price DECIMAL(10,0) NOT NULL,
  stock_quantity INT DEFAULT 0,
  min_stock_alert INT DEFAULT 5,
  unit VARCHAR(20) DEFAULT 'cái',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items trong phiên
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES sessions(id),
  product_id INT REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal DECIMAL(10,0) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hóa đơn
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES sessions(id),
  invoice_number VARCHAR(20) UNIQUE NOT NULL, -- #00001
  play_amount DECIMAL(10,0) DEFAULT 0,
  items_amount DECIMAL(10,0) DEFAULT 0,
  total_amount DECIMAL(10,0) DEFAULT 0,
  discount DECIMAL(10,0) DEFAULT 0,
  points_redeemed INT DEFAULT 0,
  discount_from_points DECIMAL(10,0) DEFAULT 0,
  final_amount DECIMAL(10,0) NOT NULL,
  points_earned INT DEFAULT 0,
  printed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lịch sử tồn kho
CREATE TABLE stock_transactions (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  type VARCHAR(10) NOT NULL,           -- in | out | adjust
  quantity INT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cài đặt quán
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT
);
-- Keys: shop_name, address, phone, default_hourly_rate, tax_percent
```

## UI Screens

### 1. Dashboard bàn (màn hình chính)
- Grid hiển thị tất cả bàn
- Màu: **xanh lá** = trống, **đỏ** = đang chơi, **vàng** = đặt trước
- Mỗi bàn hiển thị: tên bàn, trạng thái, thời gian chơi (nếu đang chơi), tiền tạm tính
- Click bàn trống → mở modal chọn khách hàng (optional) → bắt đầu phiên
- Click bàn đang chơi → mở Chi tiết phiên

### 2. Chi tiết phiên
- Đồng hồ đếm giờ realtime
- Tiền giờ chơi tạm tính (cập nhật mỗi phút)
- Danh sách đồ uống/thức ăn đã order, có thể thêm/xóa
- Tổng tiền hàng + tổng tạm tính
- Nút: [Thêm đồ uống] [Kết thúc & in HĐ] [Đóng không in]

### 3. Hóa đơn & In
- Preview hóa đơn đúng khổ 80mm
- Tra cứu/chọn khách hàng, áp điểm tích lũy
- Ô nhập giảm giá thủ công
- Nút: [In hóa đơn] [Lưu không in]
- Sau in: cập nhật tồn kho, cộng điểm khách hàng

### 4. Quản lý sản phẩm
- Bảng danh sách hàng hóa có tìm kiếm, lọc theo danh mục
- CRUD sản phẩm: tên, danh mục, giá, tồn kho, ngưỡng cảnh báo
- Nhập kho nhanh: cộng số lượng vào tồn kho, ghi note
- Badge đỏ cho sản phẩm sắp hết (tồn ≤ min_stock_alert)

### 5. Khách hàng
- Tra cứu nhanh bằng SĐT
- Danh sách: tên, SĐT, điểm, tổng chi tiêu, số lần đến
- Chi tiết: lịch sử hóa đơn, cộng/trừ điểm thủ công
- CRUD khách hàng

### 6. Báo cáo
- **Doanh thu:** chọn ngày/tuần/tháng, tổng tiền, số HĐ, biểu đồ cột
- **Thống kê bàn:** bàn nào doanh thu cao nhất, giờ cao điểm
- **Cảnh báo tồn kho:** danh sách sản phẩm cần nhập thêm

### 7. Cài đặt
- Thông tin quán (tên, địa chỉ, SĐT, logo)
- Giá giờ mặc định cho từng bàn
- Cấu hình tích điểm (điểm/10k, quy đổi)
- Cấu hình máy in nhiệt (port USB/Serial, baudrate)
- Backup/restore database

## Invoice Layout (80mm Thermal)

```
================================
        [TÊN QUÁN]
     [Địa chỉ quán]
     Tel: [SĐT quán]
================================
HĐ: #00123    26/05/2026 21:30
Bàn: Bàn 5
KH: Nguyễn Văn A (0901234567)
--------------------------------
GIỜ CHƠI:
  19:00 → 21:30 (2.5 giờ)
  50k/h x 2.5h         125,000đ
--------------------------------
ĐỒ UỐNG / THỨC ĂN:
  Bia Tiger         x2  60,000đ
  Nước ngọt         x3  30,000đ
--------------------------------
Tổng hàng:           90,000đ
Tổng chơi:          125,000đ
Giảm giá:           -10,000đ
Đổi điểm (50đ):      -5,000đ
================================
TỔNG CỘNG:          200,000đ
================================
Điểm tích thêm: +20 điểm
Điểm hiện tại: 170 điểm
--------------------------------
     Cảm ơn quý khách!
     Hẹn gặp lại! 🎱
================================
```

## Print Flow

1. Nhân viên nhấn "Kết thúc & in HĐ"
2. Main Process tính toán: duration, play_amount, items_amount
3. Renderer hiển thị preview + ô áp điểm/giảm giá
4. Nhấn [In hóa đơn]:
   - Main Process gửi ESC/POS commands qua `node-thermal-printer`
   - Lưu invoice vào DB
   - Trừ tồn kho các sản phẩm đã order
   - Cộng điểm vào customer.points_balance
   - Cập nhật table.status = 'idle'
   - Đóng session

## Error Handling

- **Máy in không kết nối:** Hiện dialog lỗi, vẫn cho phép lưu HĐ không in
- **PostgreSQL không kết nối khi khởi động:** Hiện màn hình lỗi với hướng dẫn khởi động lại service
- **Mất điện giữa phiên:** Phiên `open` vẫn còn trong DB, nhân viên đóng thủ công khi khởi động lại

## Testing Strategy

- **Unit:** Business logic (tính giờ, tính điểm, format ESC/POS)
- **Integration:** IPC handlers với DB thật (PostgreSQL test DB)
- **E2E:** Playwright + Electron — luồng mở bàn → order → đóng → in HĐ

## Out of Scope

- Đặt bàn online / app khách hàng
- Thanh toán điện tử (QR, thẻ)
- Multi-branch (nhiều chi nhánh)
- Phân quyền nhân viên / ca làm việc
