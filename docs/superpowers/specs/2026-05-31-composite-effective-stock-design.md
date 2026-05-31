# Composite Product Effective Stock Design

**Date:** 2026-05-31  
**Goal:** Hiển thị tồn kho có thể làm được cho sản phẩm chế biến, tính từ tồn kho nguyên liệu và công thức.

---

## Logic

```
effective_stock = min( floor(ingredient.stock_quantity / recipe.quantity) )
                  for all ingredients in recipe
```

- Nếu sản phẩm chế biến chưa có recipe → `effective_stock = NULL` → hiện `—`
- Nếu một nguyên liệu hết kho (stock_quantity = 0) → effective_stock = 0
- Sản phẩm hàng nhập (stock): giữ nguyên `stock_quantity`

---

## SQL

Correlated subquery trong SELECT của `getAllProducts` và `getProductPage`:

```sql
CASE
  WHEN p.product_type = 'composite' THEN (
    SELECT FLOOR(MIN(ing.stock_quantity::numeric / r.quantity))
    FROM cloud_product_recipes r
    JOIN cloud_products ing ON ing.id = r.ingredient_id AND ing.agent_id = r.agent_id
    WHERE r.product_id = p.id AND r.agent_id = p.agent_id
  )
  ELSE p.stock_quantity::numeric
END AS effective_stock
```

---

## Type Change

```typescript
// Product interface — thêm:
effective_stock: number | null
```

---

## UI Change

Trong bảng danh sách sản phẩm (`Products.tsx`), cột **Tồn kho**:
- Sản phẩm `stock`: hiển thị `stock_quantity` (như hiện tại)
- Sản phẩm `composite`: hiển thị `effective_stock` nếu có, `—` nếu null. Thêm badge nhỏ "có thể làm" để phân biệt

Cảnh báo sắp hết (`lowStockProducts`): dùng `effective_stock` cho composite, `stock_quantity` cho stock.

---

## Files Changed

| File | Thay đổi |
|------|---------|
| `src/renderer/src/types.ts` | Thêm `effective_stock: number \| null` vào Product |
| `src/main/handlers/products.ts` | Thêm correlated subquery vào getAllProducts + getProductPage |
| `src/renderer/src/pages/Products.tsx` | Cột Tồn kho + cảnh báo sắp hết dùng effective_stock cho composite |

---

## Out of Scope

- Cập nhật effective_stock real-time khi thêm order (chỉ refresh khi reload)
- Cảnh báo "không đủ nguyên liệu" khi thêm order
