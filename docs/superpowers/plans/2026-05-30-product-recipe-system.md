# Product Recipe System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm hệ thống công thức nguyên liệu cho sản phẩm chế biến: lưu recipe trong DB, UI nhập nguyên liệu trong form sản phẩm, và tự động trừ kho nguyên liệu khi bán sản phẩm chế biến.

**Architecture:** Bảng `cloud_product_recipes` lưu (product_id, ingredient_id, quantity). Handler `recipes.ts` quản lý CRUD recipe. `Products.tsx` thêm section nguyên liệu khi chọn loại Chế biến. `invoices.ts` sửa stock deduction: nếu composite → trừ kho nguyên liệu theo recipe.

**Tech Stack:** React 18, TypeScript, PostgreSQL, TanStack Query

**Prerequisite:** Plan `2026-05-30-product-type-field.md` phải hoàn thành trước (cần `product_type` field trên Product).

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm bảng `product_recipes` |
| `src/renderer/src/types.ts` | Thêm `RecipeItem` interface |
| `src/main/handlers/recipes.ts` | Tạo mới: `getRecipe`, `saveRecipe` |
| `src/main/index.ts` | Register recipe handlers |
| `src/preload/index.ts` | Expose `recipes.get`, `recipes.save` |
| `src/renderer/src/electron.d.ts` | Thêm recipes API type |
| `src/renderer/src/pages/Products.tsx` | Thêm recipe section UI, recipe state |
| `src/main/handlers/invoices.ts` | Sửa stock deduction cho composite products |

---

## Task 1: DB migration — product_recipes table

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Thêm bảng vào schema.sql**

Mở `db/schema.sql`, thêm sau block `order_items`:

```sql
CREATE TABLE IF NOT EXISTS product_recipes (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  agent_id UUID NULL,
  CONSTRAINT uq_recipe UNIQUE (product_id, ingredient_id, agent_id)
);
```

- [ ] **Step 2: Chạy migration trên cloud DB**

```bash
psql "postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db" \
  -c "CREATE TABLE IF NOT EXISTS cloud_product_recipes (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    agent_id UUID NULL,
    CONSTRAINT uq_cloud_recipe UNIQUE (product_id, ingredient_id, agent_id)
  );"
```

Expected: `CREATE TABLE`

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add product_recipes table to schema"
```

---

## Task 2: RecipeItem type + recipes handler

**Files:**
- Modify: `src/renderer/src/types.ts`
- Create: `src/main/handlers/recipes.ts`

- [ ] **Step 1: Thêm RecipeItem vào types.ts**

Mở `src/renderer/src/types.ts`, thêm vào cuối file:

```typescript
export interface RecipeItem {
  id: number
  product_id: number
  ingredient_id: number
  ingredient_name: string
  quantity: number
}
```

- [ ] **Step 2: Tạo recipes handler**

Tạo file `src/main/handlers/recipes.ts`:

```typescript
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { RecipeItem } from '../../renderer/src/types'

export async function getRecipe(productId: number): Promise<RecipeItem[]> {
  const agentId = getAgentId()
  return query<RecipeItem>(
    `SELECT r.id, r.product_id, r.ingredient_id, p.name AS ingredient_name, r.quantity
     FROM cloud_product_recipes r
     JOIN cloud_products p ON p.id = r.ingredient_id
     WHERE r.product_id = $1 AND r.agent_id = $2
     ORDER BY r.id`,
    [productId, agentId]
  )
}

export async function saveRecipe(
  productId: number,
  items: { ingredientId: number; quantity: number }[]
): Promise<void> {
  const agentId = getAgentId()
  await queryOne(
    'DELETE FROM cloud_product_recipes WHERE product_id = $1 AND agent_id = $2 RETURNING id',
    [productId, agentId]
  )
  for (const item of items) {
    await queryOne(
      `INSERT INTO cloud_product_recipes (product_id, ingredient_id, quantity, agent_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [productId, item.ingredientId, item.quantity, agentId]
    )
  }
}

export function registerRecipeHandlers() {
  ipcMain.handle('recipes:get', (_e, productId: number) => getRecipe(productId))
  ipcMain.handle('recipes:save',
    (_e, productId: number, items: { ingredientId: number; quantity: number }[]) =>
      saveRecipe(productId, items)
  )
}
```

- [ ] **Step 3: Chạy typecheck node**

```bash
npm run typecheck:node
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/types.ts src/main/handlers/recipes.ts
git commit -m "feat: add RecipeItem type and recipes handler"
```

---

## Task 3: Register handlers + Preload

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Register recipe handlers trong index.ts**

Mở `src/main/index.ts`. Thêm import:

```typescript
import { registerRecipeHandlers } from './handlers/recipes'
```

Trong block `app.whenReady()`, sau dòng `registerProductHandlers()`, thêm:

```typescript
registerRecipeHandlers()
```

- [ ] **Step 2: Expose trong preload/index.ts**

Mở `src/preload/index.ts`. Thêm sau block `orderItems: {`:

```typescript
recipes: {
  get: (productId: number): Promise<RecipeItem[]> =>
    ipcRenderer.invoke('recipes:get', productId),
  save: (productId: number, items: { ingredientId: number; quantity: number }[]): Promise<void> =>
    ipcRenderer.invoke('recipes:save', productId, items),
},
```

Thêm `RecipeItem` vào import types ở đầu file:
```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, PageResult, RecipeItem } from '../renderer/src/types'
```

- [ ] **Step 3: Thêm recipes vào electron.d.ts**

Mở `src/renderer/src/electron.d.ts`, thêm sau block `orderItems`:

```typescript
recipes: {
  get(productId: number): Promise<RecipeItem[]>
  save(productId: number, items: { ingredientId: number; quantity: number }[]): Promise<void>
}
```

Thêm `RecipeItem` vào import trong electron.d.ts nếu cần (tìm dòng import types ở đầu file).

- [ ] **Step 4: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: register recipe handlers, expose in preload"
```

---

## Task 4: Products.tsx — Recipe section UI

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

- [ ] **Step 1: Thêm recipe state**

Trong component `ProductsPage`, sau `const [stockCostPrice, ...]`, thêm:

```typescript
const [recipeItems, setRecipeItems] = useState<{ ingredientId: number; ingredientName: string; quantity: number }[]>([])
```

- [ ] **Step 2: Load recipe khi mở form edit sản phẩm composite**

Thêm useQuery để load recipe khi có selected product composite:

```typescript
const { data: existingRecipe = [] } = useQuery({
  queryKey: ['recipe', selected?.id],
  queryFn: () => selected ? window.api.recipes.get(selected.id) : Promise.resolve([]),
  enabled: !!selected && selected.product_type === 'composite',
})
```

Thêm useEffect để sync recipe vào state khi mở edit:

```typescript
useEffect(() => {
  if (mode === 'edit' && selected?.product_type === 'composite' && existingRecipe.length > 0) {
    setRecipeItems(existingRecipe.map((r) => ({
      ingredientId: r.ingredient_id,
      ingredientName: r.ingredient_name,
      quantity: r.quantity,
    })))
  }
  if (mode === 'create') {
    setRecipeItems([])
  }
}, [mode, existingRecipe])
```

- [ ] **Step 3: Cập nhật createMutation và updateMutation để save recipe**

Tìm `createMutation`, thêm `onSuccess` sau `setMode(null)`:

```typescript
const createMutation = useMutation({
  mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }),
  onSuccess: async (product) => {
    if (product && form.product_type === 'composite' && recipeItems.length > 0) {
      await window.api.recipes.save(product.id, recipeItems.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })))
    }
    queryClient.invalidateQueries({ queryKey: ['products'] })
    setMode(null)
    toast.success('Đã tạo sản phẩm')
  },
  onError: () => toast.error('Tạo sản phẩm thất bại'),
})
```

Tìm `updateMutation`, cập nhật tương tự:

```typescript
const updateMutation = useMutation({
  mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }) : Promise.resolve(null),
  onSuccess: async () => {
    if (selected && form.product_type === 'composite') {
      await window.api.recipes.save(selected.id, recipeItems.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })))
    }
    queryClient.invalidateQueries({ queryKey: ['products', selected?.id] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
    setMode(null)
    toast.success('Đã cập nhật sản phẩm')
  },
  onError: () => toast.error('Cập nhật sản phẩm thất bại'),
})
```

- [ ] **Step 4: Thêm section nguyên liệu vào dialog form**

Trong dialog form (sau tất cả fields cơ bản, trước `<DialogFooter>`), thêm:

```tsx
{form.product_type === 'composite' && (
  <div className="border-t border-[#1e3d23] pt-3 mt-1">
    <Label className="text-[#d4af37] text-sm font-semibold">Nguyên liệu</Label>
    <div className="space-y-2 mt-2">
      {recipeItems.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-sm text-white flex-1">{item.ingredientName}</span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            className="w-20 bg-[#0a1a0d] border border-[#1e3d23] text-white rounded px-2 py-1 text-sm"
            value={item.quantity}
            onChange={(e) => {
              const updated = [...recipeItems]
              updated[idx] = { ...updated[idx], quantity: Number(e.target.value) }
              setRecipeItems(updated)
            }}
          />
          <button
            className="text-red-400 hover:text-red-300 px-1"
            onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== idx))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
    <div className="flex gap-2 mt-2">
      <Select
        value=""
        onValueChange={(productId) => {
          const p = products.find((pr) => pr.id === Number(productId))
          if (p && !recipeItems.find((r) => r.ingredientId === p.id)) {
            setRecipeItems([...recipeItems, { ingredientId: p.id, ingredientName: p.name, quantity: 1 }])
          }
        }}
      >
        <SelectTrigger className="flex-1 bg-[#0a1a0d] border-[#1e3d23] text-white text-sm h-8">
          <SelectValue placeholder="+ Thêm nguyên liệu..." />
        </SelectTrigger>
        <SelectContent className="bg-[#0a1a0d] border-[#1e3d23]">
          {products
            .filter((p) => p.product_type === 'stock' && !recipeItems.find((r) => r.ingredientId === p.id))
            .map((p) => (
              <SelectItem key={p.id} value={String(p.id)} className="text-white hover:bg-[#162a1a]">
                {p.name} (tồn: {p.stock_quantity} {p.unit})
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  </div>
)}
```

- [ ] **Step 5: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 6: Chạy tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: add recipe section UI to product form"
```

---

## Task 5: Invoice — sửa stock deduction cho composite

**Files:**
- Modify: `src/main/handlers/invoices.ts`

- [ ] **Step 1: Sửa stock deduction loop trong createInvoice**

Tìm block trong `createInvoice` xử lý `orderItems`:

```typescript
for (const item of orderItems) {
  const updated = await queryOne<{ stock_quantity: number }>(
    `UPDATE cloud_products SET stock_quantity = stock_quantity - $1
     WHERE id = $2 AND agent_id = $3 RETURNING stock_quantity`,
    [item.quantity, item.product_id, agentId]
  )
  if (!updated) continue

  const afterQty = updated.stock_quantity
  const beforeQty = afterQty + item.quantity

  await queryOne(
    `INSERT INTO cloud_stock_transactions
       (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [item.product_id, 'out', item.quantity, null, beforeQty, afterQty, `Hóa đơn #${invoiceNumber}`, agentId]
  )
}
```

Thay toàn bộ block đó bằng:

```typescript
for (const item of orderItems) {
  const product = await queryOne<{ product_type: string }>(
    'SELECT product_type FROM cloud_products WHERE id = $1 AND agent_id = $2',
    [item.product_id, agentId]
  )

  if (product?.product_type === 'composite') {
    // Trừ kho từng nguyên liệu theo công thức × số lượng bán
    const recipe = await query<{ ingredient_id: number; quantity: number }>(
      'SELECT ingredient_id, quantity FROM cloud_product_recipes WHERE product_id = $1 AND agent_id = $2',
      [item.product_id, agentId]
    )
    for (const ing of recipe) {
      const deductQty = ing.quantity * item.quantity
      const ingUpdated = await queryOne<{ stock_quantity: number }>(
        `UPDATE cloud_products SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND agent_id = $3 RETURNING stock_quantity`,
        [deductQty, ing.ingredient_id, agentId]
      )
      if (!ingUpdated) continue
      const ingAfterQty = ingUpdated.stock_quantity
      const ingBeforeQty = ingAfterQty + deductQty
      await queryOne(
        `INSERT INTO cloud_stock_transactions
           (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [ing.ingredient_id, 'out', deductQty, null, ingBeforeQty, ingAfterQty, `Hóa đơn #${invoiceNumber} (chế biến)`, agentId]
      )
    }
  } else {
    // Hàng nhập: trừ kho bình thường
    const updated = await queryOne<{ stock_quantity: number }>(
      `UPDATE cloud_products SET stock_quantity = stock_quantity - $1
       WHERE id = $2 AND agent_id = $3 RETURNING stock_quantity`,
      [item.quantity, item.product_id, agentId]
    )
    if (!updated) continue
    const afterQty = updated.stock_quantity
    const beforeQty = afterQty + item.quantity
    await queryOne(
      `INSERT INTO cloud_stock_transactions
         (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [item.product_id, 'out', item.quantity, null, beforeQty, afterQty, `Hóa đơn #${invoiceNumber}`, agentId]
    )
  }
}
```

- [ ] **Step 2: Chạy typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: No errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/invoices.ts
git commit -m "feat: deduct ingredient stock for composite products on invoice"
```
