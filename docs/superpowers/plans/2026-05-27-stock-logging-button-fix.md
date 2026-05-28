# Stock Logging Enhancement + Button Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log cost_price, before_qty, after_qty khi nhập kho; fix chữ trắng vô hình trên outline buttons.

**Architecture:** Thêm 3 cột vào `stock_transactions` qua migration SQL; cập nhật `adjustStock` để query tồn trước rồi tính after tự động; thêm field giá nhập vào form UI. Button fix là 1 dòng CSS trong `button.tsx`.

**Tech Stack:** PostgreSQL (ALTER TABLE migration), TypeScript, React, shadcn/ui (CVA)

---

## Files Modified

| File | Thay đổi |
|------|----------|
| `db/schema.sql` | Thêm 3 cột mới vào `stock_transactions` |
| `db/migrate-stock-v2.sql` | Migration script cho DB đang chạy |
| `src/renderer/src/types.ts` | Thêm `StockTransaction` interface |
| `src/main/handlers/products.ts` | `adjustStock` query tồn trước, truyền cost_price |
| `src/renderer/src/pages/Products.tsx` | Form nhập kho thêm field giá nhập + preview tồn sau |
| `src/renderer/src/components/ui/button.tsx` | Thêm `text-foreground` vào outline variant |
| `tests/unit/handlers/products.test.ts` | Cập nhật test `adjustStock` |

---

### Task 1: Fix outline button chữ trắng vô hình

**Files:**
- Modify: `src/renderer/src/components/ui/button.tsx:16`

- [ ] **Step 1: Đọc file và xác nhận dòng cần sửa**

Mở `src/renderer/src/components/ui/button.tsx`. Tìm dòng:
```
outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
```

- [ ] **Step 2: Thêm `text-foreground` vào outline variant**

Sửa thành:
```ts
outline:
  "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
```

- [ ] **Step 3: Kiểm tra visual**

Chạy app (`npm run dev`) và mở trang Products. Các button "Nhập kho", "Sửa" phải hiện chữ rõ khi không hover. Kiểm tra thêm dialog Nhập kho — button "Huỷ" phải thấy chữ.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/button.tsx
git commit -m "fix: add text-foreground to outline button variant for dark mode visibility"
```

---

### Task 2: Thêm cột vào schema + tạo migration

**Files:**
- Modify: `db/schema.sql`
- Create: `db/migrate-stock-v2.sql`

- [ ] **Step 1: Cập nhật `db/schema.sql`**

Tìm block `CREATE TABLE IF NOT EXISTS stock_transactions` và sửa thành:
```sql
CREATE TABLE IF NOT EXISTS stock_transactions (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  type VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  cost_price NUMERIC(12,0) NULL,
  before_qty INT NOT NULL DEFAULT 0,
  after_qty INT NOT NULL DEFAULT 0,
  note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: Tạo migration script**

Tạo file `db/migrate-stock-v2.sql`:
```sql
-- Migration: thêm cost_price, before_qty, after_qty vào stock_transactions
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,0) NULL,
  ADD COLUMN IF NOT EXISTS before_qty INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_qty INT NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Chạy migration trên DB local**

```bash
psql bida_db < db/migrate-stock-v2.sql
```

Expected output:
```
ALTER TABLE
```

- [ ] **Step 4: Xác nhận schema**

```bash
psql bida_db -c "\d stock_transactions"
```

Phải thấy các cột: `cost_price`, `before_qty`, `after_qty`.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/migrate-stock-v2.sql
git commit -m "feat: add cost_price, before_qty, after_qty columns to stock_transactions"
```

---

### Task 3: Cập nhật TypeScript types

**Files:**
- Modify: `src/renderer/src/types.ts`

- [ ] **Step 1: Thêm `StockTransaction` interface vào cuối file `src/renderer/src/types.ts`**

```ts
export interface StockTransaction {
  id: number
  product_id: number
  type: 'in' | 'out' | 'adjust'
  quantity: number
  cost_price: number | null
  before_qty: number
  after_qty: number
  note: string | null
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/types.ts
git commit -m "feat: add StockTransaction type with cost_price, before_qty, after_qty"
```

---

### Task 4: Cập nhật backend `adjustStock`

**Files:**
- Modify: `src/main/handlers/products.ts`
- Modify: `tests/unit/handlers/products.test.ts`

- [ ] **Step 1: Viết failing test trước**

Mở `tests/unit/handlers/products.test.ts`. Xóa block `describe('adjustStock', ...)` hiện tại và thay bằng:

```ts
describe('adjustStock', () => {
  it('logs before_qty, after_qty and cost_price in transaction', async () => {
    const currentProduct = { id: 1, stock_quantity: 20 }
    const updatedProduct = { id: 1, stock_quantity: 30 }
    // queryOne được gọi 2 lần: lấy tồn hiện tại, rồi update
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce(currentProduct)
      .mockResolvedValueOnce(updatedProduct)
    vi.mocked(db.query).mockResolvedValue([])

    const result = await adjustStock(1, 'in', 10, 'Nhập kho test', 15000)

    // Kiểm tra update stock
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('stock_quantity + $1'),
      expect.arrayContaining([10, 1])
    )
    // Kiểm tra log transaction với đủ thông tin
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_transactions'),
      expect.arrayContaining([1, 'in', 10, 15000, 20, 30, 'Nhập kho test'])
    )
    expect(result).toEqual(updatedProduct)
  })

  it('accepts null cost_price', async () => {
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ id: 1, stock_quantity: 5 })
      .mockResolvedValueOnce({ id: 1, stock_quantity: 8 })
    vi.mocked(db.query).mockResolvedValue([])

    await adjustStock(1, 'in', 3, 'Nhập không có giá', null)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_transactions'),
      expect.arrayContaining([1, 'in', 3, null, 5, 8, 'Nhập không có giá'])
    )
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test -- tests/unit/handlers/products.test.ts
```

Expected: FAIL — `adjustStock` chưa nhận `cost_price`.

- [ ] **Step 3: Cập nhật `adjustStock` trong `src/main/handlers/products.ts`**

Thay toàn bộ hàm `adjustStock`:
```ts
export async function adjustStock(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note: string,
  costPrice: number | null = null
): Promise<Product | null> {
  // Lấy tồn hiện tại trước khi thay đổi
  const current = await queryOne<{ stock_quantity: number }>(
    'SELECT stock_quantity FROM products WHERE id = $1',
    [productId]
  )
  const beforeQty = current?.stock_quantity ?? 0
  const afterQty = type === 'out' ? beforeQty - quantity : beforeQty + quantity

  const operator = type === 'out' ? '-' : '+'
  const product = await queryOne<Product>(
    `UPDATE products SET stock_quantity = stock_quantity ${operator} $1
     WHERE id = $2 RETURNING *`,
    [quantity, productId]
  )
  await query(
    `INSERT INTO stock_transactions (product_id, type, quantity, cost_price, before_qty, after_qty, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [productId, type, quantity, costPrice, beforeQty, afterQty, note]
  )
  return product
}
```

Cập nhật handler registration (cuối file):
```ts
ipcMain.handle(
  'products:adjustStock',
  (_e, id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string, costPrice: number | null) =>
    adjustStock(id, type, qty, note, costPrice)
)
```

- [ ] **Step 4: Chạy test để xác nhận pass**

```bash
npm run test -- tests/unit/handlers/products.test.ts
```

Expected: PASS — tất cả tests xanh.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/products.ts tests/unit/handlers/products.test.ts
git commit -m "feat: adjustStock logs cost_price, before_qty, after_qty in stock_transactions"
```

---

### Task 5: Cập nhật UI form nhập kho

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

- [ ] **Step 1: Thêm state `stockCostPrice` cạnh các state hiện có**

Tìm dòng:
```ts
const [stockNote, setStockNote] = useState('')
```

Thêm ngay sau:
```ts
const [stockCostPrice, setStockCostPrice] = useState<number | ''>('')
```

- [ ] **Step 2: Cập nhật `stockMutation` để truyền `costPrice`**

Tìm:
```ts
mutationFn: () => selected ? api().products.adjustStock(selected.id, 'in', stockQty, stockNote) : Promise.resolve(null),
```

Sửa thành:
```ts
mutationFn: () => selected
  ? api().products.adjustStock(selected.id, 'in', stockQty, stockNote, stockCostPrice === '' ? null : stockCostPrice)
  : Promise.resolve(null),
```

- [ ] **Step 3: Reset `stockCostPrice` khi mở modal**

Tìm dòng gọi `setMode('stock')`:
```ts
onClick={() => { setSelected(p); setStockQty(0); setStockNote(''); setMode('stock') }}
```

Sửa thành:
```ts
onClick={() => { setSelected(p); setStockQty(0); setStockNote(''); setStockCostPrice(''); setMode('stock') }}
```

- [ ] **Step 4: Cập nhật form dialog nhập kho**

Tìm block `<Dialog open={mode === 'stock'} ...>`. Thay nội dung `<div className="space-y-3">` bên trong:

```tsx
<div className="space-y-3">
  <p className="text-sm text-gray-400">
    Tồn hiện tại: <span className="text-white">{selected?.stock_quantity} {selected?.unit}</span>
  </p>
  <div>
    <Label>Số lượng nhập thêm</Label>
    <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={stockQty}
      onChange={(e) => setStockQty(Number(e.target.value))} />
  </div>
  <div>
    <Label>Giá nhập (đ/đơn vị) — tuỳ chọn</Label>
    <Input type="number" className="mt-1 bg-gray-800 border-gray-600"
      placeholder="Để trống nếu không cần theo dõi"
      value={stockCostPrice}
      onChange={(e) => setStockCostPrice(e.target.value === '' ? '' : Number(e.target.value))} />
  </div>
  <div>
    <Label>Ghi chú</Label>
    <Input className="mt-1 bg-gray-800 border-gray-600" value={stockNote}
      onChange={(e) => setStockNote(e.target.value)} />
  </div>
  {stockQty > 0 && (
    <p className="text-sm text-green-400">
      Tồn sau khi nhập: {(selected?.stock_quantity ?? 0) + stockQty} {selected?.unit}
    </p>
  )}
</div>
```

- [ ] **Step 5: Kiểm tra IPC preload có hỗ trợ costPrice chưa**

Chạy:
```bash
grep -n "adjustStock" src/preload/index.ts 2>/dev/null || grep -rn "adjustStock" src/main/ src/preload/ --include="*.ts"
```

Nếu preload định nghĩa signature cứng cho `adjustStock`, cập nhật để thêm tham số `costPrice: number | null` vào cuối.

- [ ] **Step 6: Chạy app và kiểm tra**

```bash
npm run dev
```

1. Vào trang **Sản phẩm**
2. Click **Nhập kho** cho bất kỳ sản phẩm nào
3. Nhập số lượng → phải thấy dòng "Tồn sau khi nhập: X" màu xanh xuất hiện
4. Nhập giá nhập (tuỳ chọn)
5. Click **Nhập kho** → tồn kho phải cập nhật đúng
6. Kiểm tra DB:
```bash
psql bida_db -c "SELECT * FROM stock_transactions ORDER BY id DESC LIMIT 3;"
```
Phải thấy các cột `cost_price`, `before_qty`, `after_qty` có giá trị.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: add cost_price field and before/after stock preview to nhập kho form"
```

---

## Tổng kết

Sau khi hoàn thành tất cả tasks:

- Button outline hiển thị chữ rõ trong dark mode
- Mỗi lần nhập kho ghi lại: số lượng, giá nhập (optional), tồn trước, tồn sau
- Tests đảm bảo backend logic đúng
- Schema migration an toàn với `IF NOT EXISTS / ADD COLUMN IF NOT EXISTS`
