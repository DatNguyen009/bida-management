# Stock History Cost Price Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị cột "Giá nhập" (`cost_price`) trong trang Lịch sử kho — data đã có trong DB, chỉ cần thêm vào SELECT query và render trong bảng.

**Architecture:** 3 file thay đổi nhỏ: thêm field vào TypeScript type, thêm field vào SQL SELECT, thêm cột vào bảng UI.

**Tech Stack:** React 18, TypeScript, PostgreSQL, shadcn/ui

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/renderer/src/types.ts` | Thêm `cost_price: number \| null` vào `StockTransaction` |
| `src/main/handlers/products.ts` | Thêm `st.cost_price` vào SELECT của `getStockHistory` |
| `src/renderer/src/pages/StockHistory.tsx` | Thêm cột "Giá nhập", colSpan 7→8 |
| `tests/unit/handlers/products.test.ts` | Cập nhật mock data thêm `cost_price` |

---

## Task 1: Thêm cost_price vào type + query + UI

**Files:**
- Modify: `src/renderer/src/types.ts`
- Modify: `src/main/handlers/products.ts`
- Modify: `src/renderer/src/pages/StockHistory.tsx`
- Modify: `tests/unit/handlers/products.test.ts`

- [ ] **Step 1: Thêm `cost_price` vào `StockTransaction` interface**

Mở `src/renderer/src/types.ts`, tìm `interface StockTransaction {`, thêm sau `after_qty`:

```typescript
  cost_price: number | null
```

Interface sau khi sửa:
```typescript
export interface StockTransaction {
  id: number
  product_id: number
  product_name: string
  type: 'in' | 'out' | 'adjust'
  quantity: number
  before_qty: number
  after_qty: number
  cost_price: number | null
  note: string | null
  created_at: string
}
```

- [ ] **Step 2: Thêm `st.cost_price` vào SELECT của `getStockHistory`**

Mở `src/main/handlers/products.ts`, tìm đoạn SELECT trong `getStockHistory` (khoảng dòng 141-143):

```typescript
      `SELECT st.id, st.product_id, p.name AS product_name,
              st.type, st.quantity, st.before_qty, st.after_qty,
              st.note, st.created_at
```

Thay bằng:

```typescript
      `SELECT st.id, st.product_id, p.name AS product_name,
              st.type, st.quantity, st.before_qty, st.after_qty,
              st.cost_price, st.note, st.created_at
```

- [ ] **Step 3: Cập nhật mock data trong test**

Mở `tests/unit/handlers/products.test.ts`, tìm `describe('getStockHistory', ...)`, cập nhật mock trong test đầu tiên để bao gồm `cost_price`:

```typescript
    const mockRows = [
      { id: 1, product_id: 1, product_name: 'Bia Tiger', type: 'in', quantity: 24, before_qty: 6, after_qty: 30, cost_price: 15000, note: 'Nhập kho', created_at: '2026-05-29T10:00:00Z' }
    ]
```

- [ ] **Step 4: Chạy tests — phải PASS**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -10
```

Expected: All 54 tests pass (không có test nào bị break).

- [ ] **Step 5: Thêm cột "Giá nhập" vào `StockHistory.tsx`**

Mở `src/renderer/src/pages/StockHistory.tsx`.

**5a.** Thêm import `formatCurrency` ở đầu file (sau các imports hiện có):
```typescript
import { formatCurrency } from '../lib/utils'
```

**5b.** Trong `<thead>`, tìm dòng header "Ghi chú" và thêm header "Giá nhập" VÀO TRƯỚC nó:

```tsx
<th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá nhập</th>
```

**5c.** Trong `<tbody>`, tìm dòng render `{t.note ?? '—'}` và thêm cell "Giá nhập" VÀO TRƯỚC nó:

```tsx
<td className="px-4 py-3 text-right text-[#e2e8f0] font-mono text-xs">
  {t.cost_price != null ? formatCurrency(t.cost_price) : '—'}
</td>
```

**5d.** Cập nhật `colSpan` từ `7` thành `8` ở 2 chỗ:
- Dòng skeleton: `<td colSpan={7}>` → `<td colSpan={8}>`
- Dòng empty state: `<td colSpan={7} className=...>` → `<td colSpan={8} className=...>`

- [ ] **Step 6: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/types.ts src/main/handlers/products.ts src/renderer/src/pages/StockHistory.tsx tests/unit/handlers/products.test.ts
git commit -m "feat: show cost_price column in stock history page"
```
