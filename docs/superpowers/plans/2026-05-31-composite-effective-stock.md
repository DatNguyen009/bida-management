# Composite Product Effective Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị số lượng có thể làm được của sản phẩm chế biến dựa trên tồn kho nguyên liệu và công thức, thay vì `stock_quantity` luôn là 0.

**Architecture:** Thêm correlated subquery vào SELECT của `getAllProducts` và `getProductPage` để tính `effective_stock = min(floor(ingredient_stock / recipe_qty))`. Sản phẩm chế biến chưa có recipe → NULL. UI dùng `effective_stock` thay `stock_quantity` cho composite products.

**Tech Stack:** React 18, TypeScript, PostgreSQL, shadcn/ui

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/renderer/src/types.ts` | Thêm `effective_stock: number \| null` vào Product |
| `src/main/handlers/products.ts` | Thêm correlated subquery vào getAllProducts + getProductPage |
| `src/renderer/src/pages/Products.tsx` | Tồn kho cell + lowStockProducts dùng effective_stock cho composite |
| `tests/unit/handlers/products.test.ts` | Cập nhật mock getAllProducts thêm effective_stock |

---

## Task 1: Types + Backend + UI

**Files:**
- Modify: `src/renderer/src/types.ts`
- Modify: `src/main/handlers/products.ts`
- Modify: `src/renderer/src/pages/Products.tsx`
- Modify: `tests/unit/handlers/products.test.ts`

- [ ] **Step 1: Thêm `effective_stock` vào Product interface**

Mở `src/renderer/src/types.ts`, tìm `interface Product {`. Thêm `effective_stock: number | null` sau `cost_price`:

```typescript
export interface Product {
  id: number
  name: string
  category_id: number
  category_name: string
  category_icon: string
  price: number
  cost_price: number | null
  effective_stock: number | null
  stock_quantity: number
  min_stock_alert: number
  unit: string
  is_active: boolean
  product_type: 'stock' | 'composite'
  created_at: string
}
```

- [ ] **Step 2: Cập nhật `getAllProducts` — thêm correlated subquery**

Mở `src/main/handlers/products.ts`. Tìm `getAllProducts`. Thay toàn bộ query:

```typescript
export async function getAllProducts(): Promise<Product[]> {
  const agentId = getAgentId()
  return query<Product>(
    `SELECT p.id, p.name, p.category_id,
            COALESCE(c.name, 'Khác') AS category_name,
            COALESCE(c.icon, '📦') AS category_icon,
            p.price, p.cost_price,
            CASE
              WHEN p.product_type = 'composite' THEN (
                SELECT FLOOR(MIN(ing.stock_quantity::numeric / r.quantity))
                FROM cloud_product_recipes r
                JOIN cloud_products ing ON ing.id = r.ingredient_id AND ing.agent_id = r.agent_id
                WHERE r.product_id = p.id AND r.agent_id = p.agent_id
              )
              ELSE p.stock_quantity::numeric
            END AS effective_stock,
            p.stock_quantity, p.min_stock_alert,
            p.unit, p.is_active, p.product_type, p.created_at
     FROM cloud_products p
     LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
     WHERE p.is_active = TRUE AND p.agent_id = $1
     ORDER BY category_name, p.name`,
    [agentId]
  )
}
```

- [ ] **Step 3: Cập nhật `getProductPage` — thêm correlated subquery**

Tìm `getProductPage`, trong `Promise.all` thay query rows:

```typescript
    query<Product>(
      `SELECT p.id, p.name, p.category_id,
              COALESCE(c.name, 'Khác') AS category_name,
              COALESCE(c.icon, '📦') AS category_icon,
              p.price, p.cost_price,
              CASE
                WHEN p.product_type = 'composite' THEN (
                  SELECT FLOOR(MIN(ing.stock_quantity::numeric / r.quantity))
                  FROM cloud_product_recipes r
                  JOIN cloud_products ing ON ing.id = r.ingredient_id AND ing.agent_id = r.agent_id
                  WHERE r.product_id = p.id AND r.agent_id = p.agent_id
                )
                ELSE p.stock_quantity::numeric
              END AS effective_stock,
              p.stock_quantity, p.min_stock_alert,
              p.unit, p.is_active, p.product_type, p.created_at
       FROM cloud_products p
       LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
       WHERE p.is_active = TRUE AND p.agent_id = $1
       ORDER BY category_name, p.name
       LIMIT $2 OFFSET $3`,
      [agentId, input.pageSize, offset]
    ),
```

- [ ] **Step 4: Cập nhật mock test trong `tests/unit/handlers/products.test.ts`**

Tìm `describe('getAllProducts', ...)`, cập nhật mockProducts thêm `effective_stock`:

```typescript
    const mockProducts = [{ id: 1, name: 'Bia Tiger', category_id: 1, category_name: 'Đồ uống', category_icon: '🥤', cost_price: 20000, effective_stock: 30, is_active: true }]
```

- [ ] **Step 5: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -12
```

Expected: All tests pass.

- [ ] **Step 6: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: Errors chỉ ở `Products.tsx` (chưa cập nhật UI) — OK.

- [ ] **Step 7: Cập nhật `lowStockProducts` trong `Products.tsx`**

Mở `src/renderer/src/pages/Products.tsx`. Tìm dòng:

```typescript
const lowStockProducts = products.filter((p) => p.stock_quantity <= p.min_stock_alert)
```

Thay bằng:

```typescript
const lowStockProducts = products.filter((p) => {
  const qty = p.product_type === 'composite' ? (p.effective_stock ?? 0) : p.stock_quantity
  return qty <= p.min_stock_alert
})
```

- [ ] **Step 8: Cập nhật cell Tồn kho trong bảng sản phẩm**

Tìm đoạn render cột Tồn kho trong tbody:

```tsx
<td className="px-4 py-3 text-right">
  <span className={p.stock_quantity <= p.min_stock_alert ? 'text-red-400 font-semibold' : 'text-[#e2e8f0]'}>
    {p.stock_quantity} {p.unit}
  </span>
</td>
```

Thay bằng:

```tsx
<td className="px-4 py-3 text-right">
  {p.product_type === 'composite' ? (
    <span className={`${(p.effective_stock ?? 0) <= p.min_stock_alert ? 'text-red-400 font-semibold' : 'text-[#e2e8f0]'}`}>
      {p.effective_stock != null ? p.effective_stock : '—'} {p.unit}
      <span className="ml-1 text-[10px] text-[#6b7280]">có thể làm</span>
    </span>
  ) : (
    <span className={p.stock_quantity <= p.min_stock_alert ? 'text-red-400 font-semibold' : 'text-[#e2e8f0]'}>
      {p.stock_quantity} {p.unit}
    </span>
  )}
</td>
```

- [ ] **Step 9: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 10: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/types.ts src/main/handlers/products.ts src/renderer/src/pages/Products.tsx tests/unit/handlers/products.test.ts
git commit -m "feat: show effective stock for composite products based on ingredient inventory"
```
