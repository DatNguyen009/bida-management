# Product Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế 3 category hardcode (`drink/food/other`) bằng hệ thống category động lưu trong DB, CRUD trong tab riêng của trang Sản phẩm, mỗi category có tên + emoji icon.

**Architecture:** Bảng `cloud_categories(id, name, icon, agent_id)` lưu category. `cloud_products` thêm `category_id INT`, bỏ cột `category` cũ. Handler `categories.ts` xử lý CRUD. `Products.tsx` tách thành 2 tab: Danh sách + Category.

**Tech Stack:** React 18, TypeScript, PostgreSQL, shadcn/ui, TanStack Query, Electron IPC

**Prerequisite:** Plan `2026-05-30-product-type-field.md` đã hoàn thành (`product_type` đã có trên Product).

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm bảng `categories`, sửa `products` (category_id thay category) |
| `src/renderer/src/types.ts` | Thêm `Category` interface, cập nhật `Product` |
| `src/main/handlers/categories.ts` | Tạo mới: getAllCategories, createCategory, updateCategory, deleteCategory, ensureDefaultCategories |
| `src/main/handlers/products.ts` | JOIN categories trong queries, category_id thay category |
| `src/main/handlers/auth.ts` | Gọi ensureDefaultCategories sau login |
| `src/main/index.ts` | Register category handlers |
| `src/preload/index.ts` | Expose categories API |
| `src/renderer/src/electron.d.ts` | Thêm categories type declarations |
| `src/renderer/src/pages/Products.tsx` | 2 tabs, category tab CRUD, dropdown trong form, badge động |
| `tests/unit/handlers/categories.test.ts` | Tạo mới: unit tests cho categories handler |
| `tests/unit/handlers/products.test.ts` | Cập nhật tests cho getAllProducts, createProduct |

---

## Task 1: DB migration — categories table + products migration

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Cập nhật `db/schema.sql`**

Mở `db/schema.sql`. Tìm block `CREATE TABLE IF NOT EXISTS products (`. Thêm bảng `categories` VÀO TRƯỚC bảng `products`:

```sql
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) NOT NULL DEFAULT '📦',
  agent_id UUID NULL,
  CONSTRAINT uq_category_name UNIQUE (name, agent_id)
);
```

Trong block `products`, xoá dòng `category VARCHAR(50) NOT NULL DEFAULT 'drink',` và thêm dòng sau `is_active`:

```sql
  category_id INT NULL,
```

- [ ] **Step 2: Chạy migration trên cloud DB**

```bash
psql "postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db" -c "
-- 1. Tạo bảng categories
CREATE TABLE IF NOT EXISTS cloud_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) NOT NULL DEFAULT '📦',
  agent_id UUID NULL,
  CONSTRAINT uq_cloud_category_name UNIQUE (name, agent_id)
);

-- 2. Seed 3 defaults cho mỗi agent_id hiện có
INSERT INTO cloud_categories (name, icon, agent_id)
SELECT 'Đồ uống', '🥤', agent_id FROM (SELECT DISTINCT agent_id FROM cloud_products) a
UNION ALL
SELECT 'Đồ ăn', '🍜', agent_id FROM (SELECT DISTINCT agent_id FROM cloud_products) a
UNION ALL
SELECT 'Khác', '📦', agent_id FROM (SELECT DISTINCT agent_id FROM cloud_products) a
ON CONFLICT DO NOTHING;

-- 3. Thêm category_id
ALTER TABLE cloud_products ADD COLUMN IF NOT EXISTS category_id INT;

-- 4. Map dữ liệu cũ
UPDATE cloud_products p
SET category_id = c.id
FROM cloud_categories c
WHERE c.agent_id IS NOT DISTINCT FROM p.agent_id
  AND (
    (p.category = 'drink' AND c.name = 'Đồ uống') OR
    (p.category = 'food' AND c.name = 'Đồ ăn') OR
    (p.category IN ('other') AND c.name = 'Khác')
  );

-- 5. Products chưa map (nếu có) → Khác
UPDATE cloud_products p
SET category_id = c.id
FROM cloud_categories c
WHERE c.agent_id IS NOT DISTINCT FROM p.agent_id
  AND c.name = 'Khác'
  AND p.category_id IS NULL;

-- 6. Drop cột category cũ
ALTER TABLE cloud_products DROP COLUMN IF EXISTS category;
"
```

Expected: nhiều dòng output SQL statements thành công, không có ERROR.

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add categories table, migrate products to category_id"
```

---

## Task 2: Types + Categories handler

**Files:**
- Modify: `src/renderer/src/types.ts`
- Create: `src/main/handlers/categories.ts`
- Create: `tests/unit/handlers/categories.test.ts`

- [ ] **Step 1: Cập nhật `src/renderer/src/types.ts`**

Thêm `Category` interface vào cuối file:

```typescript
export interface Category {
  id: number
  name: string
  icon: string
}
```

Tìm `interface Product {` và thay toàn bộ interface bằng:

```typescript
export interface Product {
  id: number
  name: string
  category_id: number
  category_name: string
  category_icon: string
  price: number
  stock_quantity: number
  min_stock_alert: number
  unit: string
  is_active: boolean
  product_type: 'stock' | 'composite'
  created_at: string
}
```

- [ ] **Step 2: Viết test file trước (TDD)**

Tạo `tests/unit/handlers/categories.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue('agent-123'),
}))

import * as db from '../../../src/main/db'
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  ensureDefaultCategories,
} from '../../../src/main/handlers/categories'

beforeEach(() => vi.clearAllMocks())

describe('getAllCategories', () => {
  it('returns all categories for agent', async () => {
    const mock = [{ id: 1, name: 'Đồ uống', icon: '🥤' }]
    vi.mocked(db.query).mockResolvedValue(mock)

    const result = await getAllCategories()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM cloud_categories'),
      ['agent-123']
    )
    expect(result).toEqual(mock)
  })
})

describe('createCategory', () => {
  it('inserts and returns new category', async () => {
    const mock = { id: 2, name: 'Bia', icon: '🍺' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await createCategory({ name: 'Bia', icon: '🍺' })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_categories'),
      expect.arrayContaining(['Bia', '🍺', 'agent-123'])
    )
    expect(result).toEqual(mock)
  })
})

describe('updateCategory', () => {
  it('updates and returns category', async () => {
    const mock = { id: 1, name: 'Nước ngọt', icon: '🥤' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await updateCategory(1, { name: 'Nước ngọt', icon: '🥤' })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cloud_categories'),
      expect.arrayContaining(['Nước ngọt', '🥤', 1, 'agent-123'])
    )
    expect(result).toEqual(mock)
  })
})

describe('deleteCategory', () => {
  it('returns productCount and blocks delete when products exist', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '3' })

    const result = await deleteCategory(1)

    expect(result).toEqual({ success: false, productCount: 3 })
    expect(db.queryOne).toHaveBeenCalledTimes(1)
  })

  it('deletes and returns success when no products use it', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ id: 1 })

    const result = await deleteCategory(1)

    expect(result).toEqual({ success: true, productCount: 0 })
    expect(db.queryOne).toHaveBeenCalledTimes(2)
  })
})

describe('ensureDefaultCategories', () => {
  it('inserts 3 defaults if agent has no categories', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '0' })
    vi.mocked(db.query).mockResolvedValue([])

    await ensureDefaultCategories('agent-123')

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_categories'),
      expect.arrayContaining(['agent-123'])
    )
  })

  it('skips insert if agent already has categories', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '3' })

    await ensureDefaultCategories('agent-123')

    expect(db.query).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test tests/unit/handlers/categories.test.ts 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module `categories`"

- [ ] **Step 4: Tạo `src/main/handlers/categories.ts`**

```typescript
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Category } from '../../renderer/src/types'

export async function getAllCategories(): Promise<Category[]> {
  const agentId = getAgentId()
  return query<Category>(
    'SELECT id, name, icon FROM cloud_categories WHERE agent_id = $1 ORDER BY name',
    [agentId]
  )
}

export async function createCategory(input: { name: string; icon: string }): Promise<Category | null> {
  const agentId = getAgentId()
  return queryOne<Category>(
    'INSERT INTO cloud_categories (name, icon, agent_id) VALUES ($1, $2, $3) RETURNING id, name, icon',
    [input.name, input.icon, agentId]
  )
}

export async function updateCategory(id: number, input: { name: string; icon: string }): Promise<Category | null> {
  const agentId = getAgentId()
  return queryOne<Category>(
    'UPDATE cloud_categories SET name = $1, icon = $2 WHERE id = $3 AND agent_id = $4 RETURNING id, name, icon',
    [input.name, input.icon, id, agentId]
  )
}

export async function deleteCategory(id: number): Promise<{ success: boolean; productCount: number }> {
  const agentId = getAgentId()
  const countRow = await queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM cloud_products WHERE category_id = $1 AND agent_id = $2',
    [id, agentId]
  )
  const productCount = parseInt(countRow?.count ?? '0', 10)
  if (productCount > 0) return { success: false, productCount }

  await queryOne(
    'DELETE FROM cloud_categories WHERE id = $1 AND agent_id = $2 RETURNING id',
    [id, agentId]
  )
  return { success: true, productCount: 0 }
}

export async function ensureDefaultCategories(agentId: string): Promise<void> {
  const countRow = await queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM cloud_categories WHERE agent_id = $1',
    [agentId]
  )
  if (parseInt(countRow?.count ?? '0', 10) > 0) return

  await query(
    `INSERT INTO cloud_categories (name, icon, agent_id) VALUES
     ('Đồ uống', '🥤', $1),
     ('Đồ ăn', '🍜', $1),
     ('Khác', '📦', $1)
     ON CONFLICT DO NOTHING`,
    [agentId]
  )
}

export function registerCategoryHandlers() {
  ipcMain.handle('categories:getAll', () => getAllCategories())
  ipcMain.handle('categories:create', (_e, input: { name: string; icon: string }) => createCategory(input))
  ipcMain.handle('categories:update', (_e, id: number, input: { name: string; icon: string }) => updateCategory(id, input))
  ipcMain.handle('categories:delete', (_e, id: number) => deleteCategory(id))
}
```

- [ ] **Step 5: Chạy test — phải PASS**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test tests/unit/handlers/categories.test.ts 2>&1 | tail -15
```

Expected: 6 tests passed.

- [ ] **Step 6: Gọi `ensureDefaultCategories` trong `src/main/handlers/auth.ts`**

Thêm import ở đầu file `src/main/handlers/auth.ts`:

```typescript
import { ensureDefaultCategories } from './categories'
```

Trong handler `auth:login`, sau dòng `authStore.set('agentId', data.agentId)`, thêm:

```typescript
    if (data.agentId) {
      await ensureDefaultCategories(data.agentId)
    }
```

- [ ] **Step 7: Chạy typecheck node**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck:node 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/types.ts src/main/handlers/categories.ts src/main/handlers/auth.ts tests/unit/handlers/categories.test.ts
git commit -m "feat: add Category type, categories handler, ensureDefaultCategories on login"
```

---

## Task 3: Update products handler

**Files:**
- Modify: `src/main/handlers/products.ts`
- Modify: `tests/unit/handlers/products.test.ts`

- [ ] **Step 1: Cập nhật `getAllProducts` — JOIN categories**

Mở `src/main/handlers/products.ts`. Tìm hàm `getAllProducts`, thay query:

```typescript
export async function getAllProducts(): Promise<Product[]> {
  const agentId = getAgentId()
  return query<Product>(
    `SELECT p.id, p.name, p.category_id,
            COALESCE(c.name, 'Khác') AS category_name,
            COALESCE(c.icon, '📦') AS category_icon,
            p.price, p.stock_quantity, p.min_stock_alert,
            p.unit, p.is_active, p.product_type, p.created_at
     FROM cloud_products p
     LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
     WHERE p.is_active = TRUE AND p.agent_id = $1
     ORDER BY category_name, p.name`,
    [agentId]
  )
}
```

- [ ] **Step 2: Cập nhật `getProductPage` — JOIN categories**

Tìm hàm `getProductPage`, thay query đầu (SELECT rows):

```typescript
    query<Product>(
      `SELECT p.id, p.name, p.category_id,
              COALESCE(c.name, 'Khác') AS category_name,
              COALESCE(c.icon, '📦') AS category_icon,
              p.price, p.stock_quantity, p.min_stock_alert,
              p.unit, p.is_active, p.product_type, p.created_at
       FROM cloud_products p
       LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
       WHERE p.is_active = TRUE AND p.agent_id = $1
       ORDER BY category_name, p.name
       LIMIT $2 OFFSET $3`,
      [agentId, input.pageSize, offset]
    ),
```

- [ ] **Step 3: Cập nhật `createProduct` — nhận category_id thay category**

Thay toàn bộ hàm `createProduct`:

```typescript
export async function createProduct(input: {
  name: string
  category_id: number
  price: number
  unit: string
  min_stock_alert: number
  product_type: 'stock' | 'composite'
}): Promise<Product | null> {
  const agentId = getAgentId()
  const row = await queryOne<{
    id: number; name: string; category_id: number; price: number;
    stock_quantity: number; min_stock_alert: number; unit: string;
    is_active: boolean; product_type: string; created_at: string
  }>(
    `INSERT INTO cloud_products (name, category_id, price, unit, min_stock_alert, product_type, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.name, input.category_id, input.price, input.unit, input.min_stock_alert, input.product_type, agentId]
  )
  if (!row) return null
  const cat = await queryOne<{ name: string; icon: string }>(
    'SELECT name, icon FROM cloud_categories WHERE id = $1 AND agent_id = $2',
    [input.category_id, agentId]
  )
  return {
    ...row,
    category_name: cat?.name ?? 'Khác',
    category_icon: cat?.icon ?? '📦',
  } as Product
}
```

- [ ] **Step 4: Cập nhật `updateProduct` — ALLOWED set**

Tìm dòng ALLOWED, thay:

```typescript
const ALLOWED = new Set(['name', 'category_id', 'price', 'unit', 'min_stock_alert', 'is_active', 'stock_quantity', 'product_type'])
```

- [ ] **Step 5: Cập nhật tests trong `tests/unit/handlers/products.test.ts`**

Tìm test `getAllProducts` và `createProduct`, cập nhật:

```typescript
describe('getAllProducts', () => {
  it('returns active products with joined category fields', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', category_id: 1, category_name: 'Đồ uống', category_icon: '🥤', is_active: true }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getAllProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN cloud_categories'),
      [null]
    )
    expect(result).toEqual(mockProducts)
  })
})

describe('createProduct', () => {
  it('inserts product with category_id and returns with category fields', async () => {
    const input = { name: 'Bia Tiger', category_id: 1, price: 30000, unit: 'lon', min_stock_alert: 10, product_type: 'stock' as const }
    const mockRow = { id: 1, name: 'Bia Tiger', category_id: 1, price: 30000, stock_quantity: 0, min_stock_alert: 10, unit: 'lon', is_active: true, product_type: 'stock', created_at: '2026-01-01' }
    const mockCat = { name: 'Đồ uống', icon: '🥤' }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(mockRow)
      .mockResolvedValueOnce(mockCat)

    const result = await createProduct(input)

    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO cloud_products'),
      expect.arrayContaining([input.name, 1, input.price])
    )
    expect(result).toMatchObject({ category_name: 'Đồ uống', category_icon: '🥤' })
  })
})
```

- [ ] **Step 6: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -15
```

Expected: All tests pass (số tests tăng lên so với 47).

- [ ] **Step 7: Commit**

```bash
git add src/main/handlers/products.ts tests/unit/handlers/products.test.ts
git commit -m "feat: update products handler to use category_id with JOIN"
```

---

## Task 4: Register handlers + Preload

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Register trong `src/main/index.ts`**

Thêm import sau dòng `import { registerLoyaltyHandlers }`:
```typescript
import { registerCategoryHandlers } from './handlers/categories'
```

Thêm call sau `registerLoyaltyHandlers()`:
```typescript
registerCategoryHandlers()
```

- [ ] **Step 2: Cập nhật import trong `src/preload/index.ts`**

Tìm dòng import types, thêm `Category` vào danh sách:
```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, PageResult, RecipeItem, Category } from '../renderer/src/types'
```

Thêm block `categories` sau block `recipes`:
```typescript
  categories: {
    getAll: (): Promise<Category[]> =>
      ipcRenderer.invoke('categories:getAll'),
    create: (input: { name: string; icon: string }): Promise<Category | null> =>
      ipcRenderer.invoke('categories:create', input),
    update: (id: number, input: { name: string; icon: string }): Promise<Category | null> =>
      ipcRenderer.invoke('categories:update', id, input),
    delete: (id: number): Promise<{ success: boolean; productCount: number }> =>
      ipcRenderer.invoke('categories:delete', id),
  },
```

Cập nhật block `products.create` trong preload — kiểu input thay `category` bằng `category_id`:
```typescript
    create: (input: { name: string; category_id: number; price: number; unit: string; min_stock_alert: number; product_type: 'stock' | 'composite' }): Promise<Product | null> =>
      ipcRenderer.invoke('products:create', input),
```

- [ ] **Step 3: Cập nhật `src/renderer/src/electron.d.ts`**

Thêm `Category` vào import:
```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, RecipeItem, Category } from './types'
```

Thêm block `categories` sau block `recipes`:
```typescript
      categories: {
        getAll(): Promise<Category[]>
        create(input: { name: string; icon: string }): Promise<Category | null>
        update(id: number, input: { name: string; icon: string }): Promise<Category | null>
        delete(id: number): Promise<{ success: boolean; productCount: number }>
      }
```

Cập nhật `products.create` type:
```typescript
        create(input: { name: string; category_id: number; price: number; unit: string; min_stock_alert: number; product_type: 'stock' | 'composite' }): Promise<Product | null>
```

- [ ] **Step 4: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -40
```

Expected: Errors chỉ trong `Products.tsx` (chưa cập nhật UI) — OK. Không có lỗi ở handler/preload/types.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: register category handlers, expose in preload and electron.d.ts"
```

---

## Task 5: UI — Products.tsx (tabs + category tab + form + badge)

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

Đây là task lớn nhất. Đọc toàn bộ file hiện tại trước khi bắt đầu.

- [ ] **Step 1: Thêm tab state và categories query**

Tìm dòng đầu component (sau `const queryClient = useQueryClient()`), thêm:

```typescript
const [tab, setTab] = useState<'products' | 'categories'>('products')
```

Sau phần `const products = productResult?.data ?? []`, thêm:

```typescript
const { data: categories = [] } = useQuery({
  queryKey: ['categories'],
  queryFn: () => window.api.categories.getAll(),
})
```

- [ ] **Step 2: Thêm category state và mutations**

Sau `const [recipeItems, setRecipeItems]...`, thêm:

```typescript
const [catForm, setCatForm] = useState({ name: '', icon: '📦' })
const [catMode, setCatMode] = useState<'create' | 'edit' | null>(null)
const [selectedCat, setSelectedCat] = useState<{ id: number; name: string; icon: string } | null>(null)

const createCatMutation = useMutation({
  mutationFn: () => window.api.categories.create(catForm),
  onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); setCatMode(null); toast.success('Đã tạo category') },
  onError: () => toast.error('Tên category đã tồn tại'),
})

const updateCatMutation = useMutation({
  mutationFn: () => selectedCat ? window.api.categories.update(selectedCat.id, catForm) : Promise.resolve(null),
  onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); setCatMode(null); toast.success('Đã cập nhật category') },
  onError: () => toast.error('Tên category đã tồn tại'),
})

const deleteCatMutation = useMutation({
  mutationFn: (id: number) => window.api.categories.delete(id),
  onSuccess: (res) => {
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Đã xoá category')
    } else {
      toast.error(`Có ${res.productCount} sản phẩm đang dùng category này, không thể xoá`)
    }
  },
})
```

- [ ] **Step 3: Cập nhật form state — thay `category` bằng `category_id`**

Tìm dòng:
```typescript
const [form, setForm] = useState({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' as 'stock' | 'composite' })
```

Thay bằng:
```typescript
const [form, setForm] = useState({ name: '', category_id: 0, price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' as 'stock' | 'composite' })
```

- [ ] **Step 4: Cập nhật tất cả setForm calls**

Tìm reset form trong "Thêm sản phẩm" button:
```typescript
{ setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }
```
Thay bằng:
```typescript
{ setForm({ name: '', category_id: categories[0]?.id ?? 0, price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }
```

Tìm setForm trong nút Sửa:
```typescript
setForm({ name: p.name, category: p.category, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert, product_type: p.product_type ?? 'stock' })
```
Thay bằng:
```typescript
setForm({ name: p.name, category_id: p.category_id, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert, product_type: p.product_type ?? 'stock' })
```

- [ ] **Step 5: Cập nhật createMutation và updateMutation**

Tìm `createMutation.mutationFn`:
```typescript
mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }),
```
Thay bằng:
```typescript
mutationFn: () => api().products.create({ ...form, price: Number(form.price), product_type: form.product_type }),
```

Tìm `updateMutation.mutationFn`:
```typescript
mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }) : Promise.resolve(null),
```
Thay bằng:
```typescript
mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), product_type: form.product_type }) : Promise.resolve(null),
```

- [ ] **Step 6: Thêm tab switcher vào JSX**

Tìm:
```tsx
<h1 className="text-xl font-bold text-[#d4af37]">Quản lý sản phẩm</h1>
```

Thay toàn bộ `<div className="flex items-center justify-between mb-6">` block bằng:

```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="text-xl font-bold text-[#d4af37]">Quản lý sản phẩm</h1>
  <div className="flex gap-1 bg-[#0a1a0d] border border-[#1e3d23] rounded-lg p-1">
    <button
      className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'products' ? 'bg-[#d4af37] text-[#0d1f12] font-bold' : 'text-[#6b7280] hover:text-white'}`}
      onClick={() => setTab('products')}
    >
      Danh sách
    </button>
    <button
      className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'categories' ? 'bg-[#d4af37] text-[#0d1f12] font-bold' : 'text-[#6b7280] hover:text-white'}`}
      onClick={() => setTab('categories')}
    >
      Category
    </button>
  </div>
</div>
```

- [ ] **Step 7: Wrap nội dung products tab + thêm nút trong tab Danh sách**

Tìm nút "Thêm sản phẩm":
```tsx
<Button onClick={() => { setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }}
```

Thay nút đó (với onClick đã cập nhật ở Step 4) và bọc toàn bộ nội dung hiện có (từ lowStockProducts alert cho đến Pagination) trong:

```tsx
{tab === 'products' && (
  <div>
    <div className="flex justify-end mb-4">
      <Button onClick={() => { setForm({ name: '', category_id: categories[0]?.id ?? 0, price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }}
        className="bg-[#d4af37] text-[#0d1f12] font-bold text-sm px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors">
        + Thêm sản phẩm
      </Button>
    </div>
    {/* Giữ nguyên: lowStockProducts alert, bảng sản phẩm, Pagination — không thay đổi */}
  </div>
)}
```

**Lưu ý cho implementer:** Phần `{/* Giữ nguyên... */}` nghĩa là giữ toàn bộ JSX hiện có (lowStockProducts alert + table + Pagination) không thay đổi, chỉ bọc chúng trong `{tab === 'products' && <div>...</div>}`. Không xoá bất cứ gì.

- [ ] **Step 8: Thêm tab Category sau tab Products**

Sau khối `{tab === 'products' && ...}`, thêm:

```tsx
{tab === 'categories' && (
  <div>
    <div className="flex justify-end mb-4">
      <Button
        className="bg-[#d4af37] text-[#0d1f12] font-bold text-sm px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
        onClick={() => { setCatForm({ name: '', icon: '📦' }); setSelectedCat(null); setCatMode('create') }}
      >
        + Thêm category
      </Button>
    </div>
    <div className="bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#162a1a] border-b-2 border-[#d4af37]">
            <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Icon</th>
            <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên</th>
            <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat, i) => (
            <tr key={cat.id} className={`border-b border-[#1e3d23] hover:bg-[#162a1a] transition-colors ${i % 2 === 1 ? 'bg-[#0d1a0f]' : ''}`}>
              <td className="px-4 py-3 text-2xl">{cat.icon}</td>
              <td className="px-4 py-3 text-[#e2e8f0] font-medium">{cat.name}</td>
              <td className="px-4 py-3 text-right space-x-1">
                <Button size="sm" variant="ghost" className="text-[#6b7280] hover:text-white h-7 text-xs px-2"
                  onClick={() => { setSelectedCat(cat); setCatForm({ name: cat.name, icon: cat.icon }); setCatMode('edit') }}>
                  Sửa
                </Button>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 text-xs px-2"
                  onClick={() => deleteCatMutation.mutate(cat.id)}>
                  Xoá
                </Button>
              </td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-[#6b7280]">Chưa có category nào</td></tr>
          )}
        </tbody>
      </table>
    </div>

    {/* Dialog tạo/sửa category */}
    <Dialog open={catMode === 'create' || catMode === 'edit'} onOpenChange={(o) => !o && setCatMode(null)}>
      <DialogContent className="bg-[#162a1a] border-[#1e3d23] text-white">
        <DialogHeader>
          <DialogTitle>{catMode === 'create' ? 'Thêm category' : 'Sửa category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Icon (gõ 1 emoji)</Label>
            <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1 text-2xl" value={catForm.icon}
              onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} maxLength={2} />
          </div>
          <div>
            <Label>Tên category</Label>
            <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCatMode(null)} className="border-[#1e3d23] text-[#6b7280]">Huỷ</Button>
          <Button className="bg-[#d4af37] text-[#0d1f12] font-bold"
            onClick={() => catMode === 'create' ? createCatMutation.mutate() : updateCatMutation.mutate()}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)}
```

- [ ] **Step 9: Cập nhật form sản phẩm — dropdown category**

Trong Dialog tạo/sửa sản phẩm (mode === 'create' || mode === 'edit'), tìm phần radio selector loại sản phẩm. Thêm field Category VÀO TRƯỚC radio loại sản phẩm:

```tsx
<div>
  <Label>Category</Label>
  <select
    className="w-full mt-1 bg-[#0a1a0d] border border-[#1e3d23] text-white rounded-md px-3 py-2 text-sm"
    value={form.category_id}
    onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}
  >
    {categories.map((cat) => (
      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 10: Cập nhật badge trong bảng sản phẩm**

Tìm cột "Loại" trong bảng (có các badge hardcode `🥤 Đồ uống`, `🍜 Đồ ăn`):

```tsx
<td className="px-4 py-3">
  {p.category === 'drink'
    ? <span className="bg-[#14532d] text-green-400 text-xs px-2 py-0.5 rounded-full border-0">🥤 Đồ uống</span>
    : p.category === 'food'
    ? <span className="bg-[#292524] text-orange-400 text-xs px-2 py-0.5 rounded-full border-0">🍜 Đồ ăn</span>
    : <span className="bg-[#1e3d23] text-gray-400 text-xs px-2 py-0.5 rounded-full border-0">Khác</span>
  }
</td>
```

Thay bằng:

```tsx
<td className="px-4 py-3">
  <span className="bg-[#1e3d23] text-[#e2e8f0] text-xs px-2 py-0.5 rounded-full">
    {p.category_icon} {p.category_name}
  </span>
</td>
```

- [ ] **Step 11: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 12: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -15
```

Expected: All tests pass.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: add category tabs, CRUD UI, dynamic badge in Products page"
```
