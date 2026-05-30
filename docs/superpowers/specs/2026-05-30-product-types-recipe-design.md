# Product Types & Recipe System Design

**Date:** 2026-05-30
**Scope:** Thêm loại sản phẩm ("Hàng nhập" / "Chế biến") và hệ thống công thức nguyên liệu cho sản phẩm chế biến.

---

## Sub-project 1: Product Type

### DB

Thêm cột vào `cloud_products`:
```sql
ALTER TABLE cloud_products
  ADD COLUMN product_type VARCHAR(20) NOT NULL DEFAULT 'stock';
-- values: 'stock' (hàng nhập) | 'composite' (chế biến)
```

Cập nhật `db/schema.sql` tương ứng.

### Types (`src/renderer/src/types.ts`)

```typescript
interface Product {
  // ... existing fields
  product_type: 'stock' | 'composite'
}
```

### Handler (`src/main/handlers/products.ts`)

- `createProduct`: thêm `product_type` vào INSERT
- `updateProduct`: thêm `'product_type'` vào `ALLOWED` set
- `getProductPage`: SELECT đã dùng `*` nên tự lấy được

### UI (`src/renderer/src/pages/Products.tsx`)

**Form tạo/sửa:**
- Thêm field `product_type: 'stock'` vào form state ban đầu
- Thêm select/radio trong dialog:
  ```
  Loại sản phẩm:  ● Hàng nhập  ○ Chế biến
  ```
- Khi chọn "Chế biến" → hiện section nguyên liệu (Sub-project 2)

**Danh sách sản phẩm:**
- Hiện badge nhỏ: "Hàng nhập" (xanh) hoặc "Chế biến" (vàng) bên cạnh tên

---

## Sub-project 2: Recipe System

### DB

Bảng mới `product_recipes`:
```sql
CREATE TABLE IF NOT EXISTS product_recipes (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,        -- sản phẩm chế biến
  ingredient_id INT NOT NULL,     -- nguyên liệu (cũng là product)
  quantity DECIMAL(10,2) NOT NULL, -- số lượng cần
  agent_id UUID NULL,
  CONSTRAINT uq_recipe UNIQUE (product_id, ingredient_id, agent_id)
);
```

Cloud DB tương ứng: `cloud_product_recipes`.

### Handler mới (`src/main/handlers/recipes.ts`)

```typescript
// Lấy công thức của 1 sản phẩm
getRecipe(productId: number): Promise<RecipeItem[]>

// Lưu công thức (replace toàn bộ)
saveRecipe(productId: number, items: { ingredientId: number; quantity: number }[]): Promise<void>
```

`saveRecipe` dùng transaction: DELETE cũ → INSERT mới.

### Logic trừ kho khi bán (`src/main/handlers/invoices.ts`)

Trong `createInvoice`, khi loop `orderItems` để trừ kho:

```typescript
for (const item of orderItems) {
  const product = await queryOne('SELECT product_type FROM cloud_products WHERE id=$1', [item.product_id])
  
  if (product?.product_type === 'composite') {
    // Trừ kho từng nguyên liệu theo công thức × số lượng bán
    const recipe = await query('SELECT * FROM cloud_product_recipes WHERE product_id=$1 AND agent_id=$2', [item.product_id, agentId])
    for (const ing of recipe) {
      const deductQty = ing.quantity * item.quantity
      await query('UPDATE cloud_products SET stock_quantity = stock_quantity - $1 WHERE id=$2 AND agent_id=$3', [deductQty, ing.ingredient_id, agentId])
      // log stock_transaction cho ingredient
    }
  } else {
    // Hàng nhập: trừ kho bình thường (logic hiện tại)
    await query('UPDATE cloud_products SET stock_quantity = stock_quantity - $1 WHERE id=$2 AND agent_id=$3', [item.quantity, item.product_id, agentId])
    // log stock_transaction
  }
}
```

### Types

```typescript
interface RecipeItem {
  id: number
  product_id: number
  ingredient_id: number
  ingredient_name: string
  quantity: number
}
```

### UI — Section nguyên liệu trong form (`Products.tsx`)

Khi `form.product_type === 'composite'`, hiện section bên dưới các fields cơ bản:

```
Nguyên liệu:
┌─────────────────────────┬──────────┬───┐
│ Chọn nguyên liệu...     │ SL: 1    │ ✕ │
│ Cà phê rang             │ SL: 30   │ ✕ │
└─────────────────────────┴──────────┴───┘
[+ Thêm nguyên liệu]
```

- Dropdown chọn từ danh sách `products` (loại `stock`)
- Input nhập số lượng
- Nút ✕ xoá dòng
- Lưu cùng lúc với sản phẩm: `saveRecipe(productId, recipeItems)` sau `createProduct`/`updateProduct`

---

## Files thay đổi

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm cột `product_type`, bảng `product_recipes` |
| `src/renderer/src/types.ts` | `product_type` trong Product, thêm `RecipeItem` |
| `src/main/handlers/products.ts` | create/update thêm `product_type` |
| `src/main/handlers/recipes.ts` | Tạo mới: `getRecipe`, `saveRecipe` |
| `src/main/handlers/invoices.ts` | Sửa stock deduction logic |
| `src/main/index.ts` | Register recipe handlers |
| `src/preload/index.ts` | Expose `recipes.get`, `recipes.save` |
| `src/renderer/src/pages/Products.tsx` | Type selector + recipe section trong form |

---

## Out of scope

- Kiểm tra đủ nguyên liệu trước khi bán (warning khi kho nguyên liệu không đủ)
- Sản phẩm chế biến từ sản phẩm chế biến khác (chỉ hỗ trợ 1 cấp)
- Báo cáo chi phí nguyên liệu
