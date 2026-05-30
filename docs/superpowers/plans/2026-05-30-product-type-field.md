# Product Type Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm field `product_type` ('stock' = Hàng nhập / 'composite' = Chế biến) vào sản phẩm, hiển thị badge trong danh sách và selector trong form tạo/sửa.

**Architecture:** Thêm cột `product_type` vào DB, cập nhật type + handler, thêm radio selector trong dialog form Products.tsx và badge trong bảng danh sách.

**Tech Stack:** React 18, TypeScript, PostgreSQL, shadcn/ui

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm cột `product_type` vào `products` |
| `src/renderer/src/types.ts` | Thêm `product_type` vào `Product` |
| `src/main/handlers/products.ts` | `createProduct` + `updateProduct` nhận `product_type` |
| `src/renderer/src/pages/Products.tsx` | Thêm radio selector trong form, badge trong bảng |

---

## Task 1: DB migration

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Thêm cột vào schema.sql**

Mở `db/schema.sql`, tìm block `CREATE TABLE IF NOT EXISTS products (`, thêm sau `is_active`:

```sql
  product_type VARCHAR(20) NOT NULL DEFAULT 'stock',
```

- [ ] **Step 2: Chạy migration trên cloud DB**

```bash
psql "postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db" \
  -c "ALTER TABLE cloud_products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'stock';"
```

Expected: `ALTER TABLE`

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add product_type column to products schema"
```

---

## Task 2: Types + Backend

**Files:**
- Modify: `src/renderer/src/types.ts`
- Modify: `src/main/handlers/products.ts`

- [ ] **Step 1: Thêm product_type vào Product interface**

Mở `src/renderer/src/types.ts`, tìm `interface Product {`, thêm sau `is_active`:

```typescript
product_type: 'stock' | 'composite'
```

- [ ] **Step 2: Cập nhật createProduct nhận product_type**

Mở `src/main/handlers/products.ts`, tìm `createProduct`, thay toàn bộ:

```typescript
export async function createProduct(input: {
  name: string
  category: Product['category']
  price: number
  unit: string
  min_stock_alert: number
  product_type: 'stock' | 'composite'
}): Promise<Product | null> {
  const agentId = getAgentId()
  return queryOne<Product>(
    `INSERT INTO cloud_products (name, category, price, unit, min_stock_alert, product_type, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.name, input.category, input.price, input.unit, input.min_stock_alert, input.product_type, agentId]
  )
}
```

- [ ] **Step 3: Thêm product_type vào ALLOWED set trong updateProduct**

Tìm dòng:
```typescript
const ALLOWED = new Set(['name', 'category', 'price', 'unit', 'min_stock_alert', 'is_active', 'stock_quantity'])
```
Thay bằng:
```typescript
const ALLOWED = new Set(['name', 'category', 'price', 'unit', 'min_stock_alert', 'is_active', 'stock_quantity', 'product_type'])
```

- [ ] **Step 4: Chạy typecheck**

```bash
npm run typecheck
```

Expected: Lỗi ở Products.tsx vì form chưa có product_type — bình thường, sẽ fix ở Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/types.ts src/main/handlers/products.ts
git commit -m "feat: add product_type to Product type and handlers"
```

---

## Task 3: UI — Form selector + Badge

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

- [ ] **Step 1: Thêm product_type vào form state**

Tìm:
```typescript
const [form, setForm] = useState({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5 })
```
Thay bằng:
```typescript
const [form, setForm] = useState({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' as 'stock' | 'composite' })
```

- [ ] **Step 2: Cập nhật nút "Thêm sản phẩm" reset form**

Tìm onClick của nút thêm:
```typescript
{ setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5 }); setMode('create') }
```
Thay bằng:
```typescript
{ setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }
```

- [ ] **Step 3: Cập nhật nút Sửa load product_type**

Tìm onClick nút sửa (setForm khi mode edit):
```typescript
setForm({ name: p.name, category: p.category, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert })
```
Thay bằng:
```typescript
setForm({ name: p.name, category: p.category, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert, product_type: p.product_type ?? 'stock' })
```

- [ ] **Step 4: Thêm radio selector vào dialog form**

Trong `<Dialog open={mode === 'create' || mode === 'edit'} ...>`, tìm dòng đầu tiên của form `<div><Label>Tên</Label>`, thêm TRƯỚC đó:

```tsx
<div>
  <Label>Loại sản phẩm</Label>
  <div className="flex gap-4 mt-2">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        value="stock"
        checked={form.product_type === 'stock'}
        onChange={() => setForm({ ...form, product_type: 'stock' })}
        className="accent-[#d4af37]"
      />
      <span className="text-sm text-white">Hàng nhập</span>
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        value="composite"
        checked={form.product_type === 'composite'}
        onChange={() => setForm({ ...form, product_type: 'composite' })}
        className="accent-[#d4af37]"
      />
      <span className="text-sm text-white">Chế biến</span>
    </label>
  </div>
</div>
```

- [ ] **Step 5: Cập nhật createMutation và updateMutation truyền product_type**

Tìm `createMutation.mutationFn`:
```typescript
mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'] }),
```
Thay bằng:
```typescript
mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }),
```

Tìm `updateMutation.mutationFn`:
```typescript
mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'] }) : Promise.resolve(null),
```
Thay bằng:
```typescript
mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }) : Promise.resolve(null),
```

- [ ] **Step 6: Thêm badge trong bảng danh sách**

Tìm đoạn render tên sản phẩm trong bảng (td có `p.name`), thêm badge sau tên:

```tsx
<td className="px-4 py-3 font-medium">
  <div className="flex items-center gap-2">
    <span>{p.name}</span>
    {p.product_type === 'composite' && (
      <span className="text-xs bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30 px-1.5 py-0.5 rounded">
        Chế biến
      </span>
    )}
  </div>
</td>
```

- [ ] **Step 7: Chạy typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: No errors, 47 tests passed.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: add product_type selector in form and badge in product list"
```
