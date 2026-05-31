# Product Cost Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm giá nhập (`cost_price`) vào sản phẩm — lưu trong DB, hiển thị trong danh sách, tự cập nhật khi nhập kho có điền giá.

**Architecture:** Thêm cột `cost_price` vào `cloud_products`. `adjustStock` type='in' với costPrice != null sẽ SET cost_price trong cùng 1 UPDATE query. Products.tsx thêm 2 cột Giá nhập + Giá bán thay cột Giá hiện tại.

**Tech Stack:** React 18, TypeScript, PostgreSQL, shadcn/ui

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm `cost_price` vào products |
| `src/renderer/src/types.ts` | Thêm `cost_price: number \| null` vào Product |
| `src/main/handlers/products.ts` | SELECT thêm cost_price, adjustStock cập nhật cost_price khi nhập |
| `src/renderer/src/pages/Products.tsx` | 2 cột Giá nhập + Giá bán trong bảng |
| `tests/unit/handlers/products.test.ts` | Cập nhật tests cho adjustStock và getAllProducts |

---

## Task 1: DB + Types + Backend

**Files:**
- Modify: `db/schema.sql`
- Modify: `src/renderer/src/types.ts`
- Modify: `src/main/handlers/products.ts`
- Modify: `tests/unit/handlers/products.test.ts`

- [ ] **Step 1: Cập nhật `db/schema.sql`**

Mở `db/schema.sql`, tìm block `CREATE TABLE IF NOT EXISTS products (`. Thêm `cost_price` sau dòng `price`:

```sql
  cost_price DECIMAL(10,0) NULL,
```

- [ ] **Step 2: Chạy migration trên cloud DB**

```bash
psql "postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db" \
  -c "ALTER TABLE cloud_products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,0) NULL;"
```

Expected: `ALTER TABLE`

- [ ] **Step 3: Thêm `cost_price` vào `Product` interface trong `src/renderer/src/types.ts`**

Tìm `interface Product {`, thêm `cost_price: number | null` sau `price`:

```typescript
export interface Product {
  id: number
  name: string
  category_id: number
  category_name: string
  category_icon: string
  price: number
  cost_price: number | null
  stock_quantity: number
  min_stock_alert: number
  unit: string
  is_active: boolean
  product_type: 'stock' | 'composite'
  created_at: string
}
```

- [ ] **Step 4: Cập nhật SELECT trong `getAllProducts` — thêm `p.cost_price`**

Mở `src/main/handlers/products.ts`, tìm `getAllProducts`. Thay query:

```typescript
  return query<Product>(
    `SELECT p.id, p.name, p.category_id,
            COALESCE(c.name, 'Khác') AS category_name,
            COALESCE(c.icon, '📦') AS category_icon,
            p.price, p.cost_price, p.stock_quantity, p.min_stock_alert,
            p.unit, p.is_active, p.product_type, p.created_at
     FROM cloud_products p
     LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
     WHERE p.is_active = TRUE AND p.agent_id = $1
     ORDER BY category_name, p.name`,
    [agentId]
  )
```

- [ ] **Step 5: Cập nhật SELECT trong `getProductPage` — thêm `p.cost_price`**

Trong `getProductPage`, tìm query rows (có LIMIT/OFFSET). Thay:

```typescript
    query<Product>(
      `SELECT p.id, p.name, p.category_id,
              COALESCE(c.name, 'Khác') AS category_name,
              COALESCE(c.icon, '📦') AS category_icon,
              p.price, p.cost_price, p.stock_quantity, p.min_stock_alert,
              p.unit, p.is_active, p.product_type, p.created_at
       FROM cloud_products p
       LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
       WHERE p.is_active = TRUE AND p.agent_id = $1
       ORDER BY category_name, p.name
       LIMIT $2 OFFSET $3`,
      [agentId, input.pageSize, offset]
    ),
```

- [ ] **Step 6: Cập nhật `adjustStock` để SET cost_price khi nhập kho**

Tìm hàm `adjustStock`. Thay toàn bộ hàm:

```typescript
export async function adjustStock(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note: string,
  costPrice: number | null = null
): Promise<Product | null> {
  const agentId = getAgentId()
  const operator = type === 'out' ? '-' : '+'
  const updateCostPrice = type === 'in' && costPrice != null
  const costPriceClause = updateCostPrice ? ', cost_price = $4' : ''
  const queryParams: (number | string | null)[] = updateCostPrice
    ? [quantity, productId, agentId, costPrice]
    : [quantity, productId, agentId]

  const product = await queryOne<Product>(
    `UPDATE cloud_products SET stock_quantity = stock_quantity ${operator} $1${costPriceClause}
     WHERE id = $2 AND agent_id = $3 RETURNING *`,
    queryParams
  )
  if (!product) return null

  const afterQty = product.stock_quantity
  const beforeQty = type === 'out' ? afterQty + quantity : afterQty - quantity

  await queryOne<StockTransactionRow>(
    `INSERT INTO cloud_stock_transactions
       (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [productId, type, quantity, costPrice, beforeQty, afterQty, note, agentId]
  )

  return product
}
```

- [ ] **Step 7: Cập nhật tests trong `tests/unit/handlers/products.test.ts`**

**7a.** Cập nhật mock trong test `getAllProducts` — thêm `cost_price`:

```typescript
describe('getAllProducts', () => {
  it('returns active products with joined category fields', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', category_id: 1, category_name: 'Đồ uống', category_icon: '🥤', cost_price: 20000, is_active: true }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getAllProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN cloud_categories'),
      [null]
    )
    expect(result).toEqual(mockProducts)
  })
})
```

**7b.** Thêm test case cho adjustStock — cập nhật cost_price khi type='in':

Tìm `describe('adjustStock', ...)`, thêm test mới:

```typescript
  it('updates cost_price on product when type is "in" and costPrice provided', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 30, cost_price: 15000, name: 'Test' })
      .mockResolvedValueOnce({ id: 1 })

    await adjustStock(1, 'in', 10, 'Nhập kho', 15000)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('cost_price = $4'),
      expect.arrayContaining([10, 1, null, 15000])
    )
  })

  it('does not update cost_price when type is "out"', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 20, name: 'Test' })
      .mockResolvedValueOnce({ id: 1 })

    await adjustStock(1, 'out', 5, 'Bán', null)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining('cost_price = $4'),
      expect.arrayContaining([5, 1, null])
    )
  })
```

- [ ] **Step 8: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -15
```

Expected: All tests pass.

- [ ] **Step 9: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add db/schema.sql src/renderer/src/types.ts src/main/handlers/products.ts tests/unit/handlers/products.test.ts
git commit -m "feat: add cost_price to products — DB, types, handler with auto-update on nhap kho"
```

---

## Task 2: UI — Hiển thị Giá nhập + Giá bán trong Products.tsx

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

Đọc file trước khi sửa để xác định dòng chính xác.

- [ ] **Step 1: Thay cột "Giá" trong `<thead>` thành 2 cột**

Tìm:
```tsx
<th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá</th>
```

Thay bằng:
```tsx
<th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá nhập</th>
<th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá bán</th>
```

- [ ] **Step 2: Thay cell "Giá" trong `<tbody>` thành 2 cells**

Tìm:
```tsx
<td className="px-4 py-3 text-right text-green-400 font-semibold">{formatCurrency(p.price)}</td>
```

Thay bằng:
```tsx
<td className="px-4 py-3 text-right text-[#6b7280] font-mono text-sm">
  {p.cost_price != null ? formatCurrency(p.cost_price) : '—'}
</td>
<td className="px-4 py-3 text-right text-green-400 font-semibold">{formatCurrency(p.price)}</td>
```

- [ ] **Step 3: Cập nhật TableSkeleton cols**

Bảng sản phẩm hiện có 5 cột (Tên, Loại, Giá, Tồn kho, Thao tác). Sau khi thêm cột Giá nhập → 6 cột.

Tìm trong phần bảng sản phẩm (tab Danh sách, KHÔNG phải tab Category):
```tsx
<TableSkeleton rows={pageSize} cols={5} />
```
Thay bằng:
```tsx
<TableSkeleton rows={pageSize} cols={6} />
```

- [ ] **Step 4: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: show Gia nhap and Gia ban columns in product list"
```
