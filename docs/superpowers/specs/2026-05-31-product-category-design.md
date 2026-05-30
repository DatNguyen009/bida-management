# Product Category Management Design

**Date:** 2026-05-31  
**Goal:** Thay thế 3 category cố định (`drink/food/other`) bằng hệ thống category động: lưu trong DB, quản lý CRUD trong tab riêng của trang Sản phẩm, mỗi category có tên + emoji icon.

---

## Overview

Hiện tại `category` là `VARCHAR(50)` lưu giá trị hardcode `'drink' | 'food' | 'other'`. Sau khi implement, category được lưu trong bảng `cloud_categories` và products tham chiếu qua `category_id` (FK).

---

## Data Model

### Bảng mới: `cloud_categories`

```sql
CREATE TABLE IF NOT EXISTS cloud_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) NOT NULL DEFAULT '📦',
  agent_id UUID NULL,
  CONSTRAINT uq_category_name UNIQUE (name, agent_id)
);
```

### Thay đổi `cloud_products`

- Thêm cột `category_id INT NULL`
- Xoá cột `category VARCHAR(50)` sau khi migration
- Các query `SELECT` JOIN với `cloud_categories` để lấy `category_name` và `category_icon`

### Schema `db/schema.sql` (local reference)

- Thêm bảng `categories` (không prefix — schema local không dùng `cloud_`)
- Sửa bảng `products`: thêm `category_id INT`, xoá cột `category`

---

## Migration Plan (cloud DB)

Chạy theo thứ tự:

1. **Tạo bảng `cloud_categories`**
2. **Seed 3 defaults cho mỗi `agent_id` đang có trong `cloud_products`:**
   ```sql
   INSERT INTO cloud_categories (name, icon, agent_id)
   SELECT '🥤 Đồ uống', '🥤', agent_id FROM (SELECT DISTINCT agent_id FROM cloud_products) a
   UNION ALL SELECT '🍜 Đồ ăn', '🍜', agent_id FROM (SELECT DISTINCT agent_id FROM cloud_products) a
   UNION ALL SELECT '📦 Khác', '📦', agent_id FROM (SELECT DISTINCT agent_id FROM cloud_products) a
   ON CONFLICT DO NOTHING;
   ```
   Tên category lưu không gồm emoji (icon lưu riêng ở cột `icon`).
3. **Thêm `category_id INT NULL`** vào `cloud_products`
4. **Map dữ liệu cũ:**
   - `category = 'drink'` → category_id của row có name='Đồ uống' cùng agent_id
   - `category = 'food'` → category_id của row có name='Đồ ăn' cùng agent_id
   - `category = 'other'` hoặc NULL → category_id của row có name='Khác' cùng agent_id
5. **Drop cột `category`** cũ

**Seed defaults khi login mới:** Handler `auth` gọi `ensureDefaultCategories(agentId)` — INSERT 3 category mặc định nếu agent chưa có category nào (idempotent nhờ `ON CONFLICT DO NOTHING`).

---

## TypeScript Types

```typescript
// Thêm vào types.ts
export interface Category {
  id: number
  name: string
  icon: string
}

// Cập nhật Product — thay category string bằng:
export interface Product {
  // ...các field hiện tại...
  category_id: number
  category_name: string   // joined từ cloud_categories
  category_icon: string   // joined từ cloud_categories
  // bỏ: category: 'drink' | 'food' | 'other'
}
```

---

## IPC API

### `categories` namespace

| Handler | Input | Output |
|---------|-------|--------|
| `categories:getAll` | — | `Category[]` |
| `categories:create` | `{ name, icon }` | `Category \| null` |
| `categories:update` | `id, { name, icon }` | `Category \| null` |
| `categories:delete` | `id` | `{ success: boolean; productCount: number }` |

### Thay đổi `products` handlers

- `getAllProducts`, `getProductPage`: thêm JOIN với `cloud_categories`
- `createProduct`: nhận `category_id` thay vì `category`
- `updateProduct`: ALLOWED set thêm `category_id`, bỏ `category`

---

## UI Design

### Tab layout — trang Sản phẩm

```
[Danh sách] [Category]
```

Tab "Danh sách" giữ nguyên layout hiện tại (bảng sản phẩm + phân trang + nút Thêm).  
Tab "Category" là bảng quản lý CRUD.

### Tab "Category"

Bảng gồm các cột: **Icon** | **Tên** | **Số SP** | **Thao tác (Sửa / Xoá)**

- Nút **+ Thêm category** góc phải → mở Dialog với 2 field: input text gõ emoji (1 ký tự) + input tên
- Nút **Sửa** → mở Dialog pre-filled
- Nút **Xoá** → confirm dialog trước khi xoá. Nếu category đang được dùng bởi ≥1 sản phẩm: hiện toast error "Có X sản phẩm đang dùng category này, không thể xoá"

### Form tạo/sửa sản phẩm (Dialog trong tab Danh sách)

Field "Category" thay bằng `<Select>` dropdown hiển thị danh sách từ `categories:getAll`. Hiển thị `{icon} {name}` trong dropdown.

### Badge trong bảng sản phẩm

Cột "Loại" hiển thị `{category_icon} {category_name}` thay vì badge hardcode hiện tại.

---

## Error Handling

| Tình huống | Xử lý |
|-----------|-------|
| Xoá category có sản phẩm đang dùng | Handler kiểm tra count trước, trả `{ success: false, productCount: N }`, UI show toast error |
| Tạo/sửa trùng tên (unique constraint) | Catch DB error, toast "Tên category đã tồn tại" |
| Sản phẩm không có category_id | Hiển thị "📦 Khác" làm fallback |

---

## Files Changed

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm bảng `categories`, sửa `products` (category_id thay category) |
| `src/renderer/src/types.ts` | Thêm `Category`, cập nhật `Product` |
| `src/main/handlers/categories.ts` | Tạo mới: getAll, create, update, delete + ensureDefaults |
| `src/main/handlers/products.ts` | JOIN categories, category_id thay category |
| `src/main/handlers/auth.ts` | Gọi `ensureDefaultCategories` khi login |
| `src/main/index.ts` | Register category handlers |
| `src/preload/index.ts` | Expose `categories` API |
| `src/renderer/src/electron.d.ts` | Thêm `categories` type declarations |
| `src/renderer/src/pages/Products.tsx` | 2 tabs, category tab UI, dropdown trong form, badge động |

---

## Out of Scope

- Filter/search sản phẩm theo category (có thể thêm sau)
- Sắp xếp thứ tự category
- Category có màu sắc (chỉ dùng emoji)
- Sub-category / category lồng nhau
