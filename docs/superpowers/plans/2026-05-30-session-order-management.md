# Session Order Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm gọi món ngay từ Session page và fix upsert khi thêm sản phẩm trùng.

**Architecture:** Fix `addOrderItem` dùng upsert ON CONFLICT, thêm unique constraint vào DB. Session.tsx tái sử dụng `OrderList` + `ProductPicker` components và `orderItems:*` IPC handlers đã có.

**Tech Stack:** React 18, TypeScript, PostgreSQL (ON CONFLICT upsert), TanStack Query

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm UNIQUE constraint vào `order_items` |
| `src/main/handlers/orderItems.ts` | Đổi INSERT → upsert ON CONFLICT |
| `src/renderer/src/pages/Session.tsx` | Thêm order query + 2 mutations + UI |

---

## Task 1: DB + Backend upsert

**Files:**
- Modify: `db/schema.sql`
- Modify: `src/main/handlers/orderItems.ts`

- [ ] **Step 1: Thêm unique constraint vào schema.sql**

Mở `db/schema.sql`, tìm block `CREATE TABLE IF NOT EXISTS order_items`, thêm constraint sau `agent_id UUID NULL`:

```sql
  CONSTRAINT uq_order_items_session_product_agent UNIQUE (session_id, product_id, agent_id)
```

Block đầy đủ sẽ là:
```sql
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal DECIMAL(10,0) NOT NULL,
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_order_items_session_product_agent UNIQUE (session_id, product_id, agent_id)
);
```

- [ ] **Step 2: Chạy migration trên cloud DB**

```bash
psql "postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db" \
  -c "ALTER TABLE cloud_order_items ADD CONSTRAINT IF NOT EXISTS uq_order_items_session_product_agent UNIQUE (session_id, product_id, agent_id);"
```

Expected: `ALTER TABLE`

- [ ] **Step 3: Đổi addOrderItem sang upsert**

Mở `src/main/handlers/orderItems.ts`, thay toàn bộ function `addOrderItem`:

```typescript
export async function addOrderItem(
  sessionId: number,
  productId: number,
  quantity: number,
  unitPrice: number
): Promise<OrderItem | null> {
  const agentId = getAgentId()
  const subtotal = quantity * unitPrice
  return queryOne<OrderItem>(
    `INSERT INTO cloud_order_items (session_id, product_id, quantity, unit_price, subtotal, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id, product_id, agent_id)
     DO UPDATE SET
       quantity = cloud_order_items.quantity + EXCLUDED.quantity,
       subtotal = cloud_order_items.subtotal + EXCLUDED.subtotal
     RETURNING *`,
    [sessionId, productId, quantity, unitPrice, subtotal, agentId]
  )
}
```

- [ ] **Step 4: Chạy tests**

```bash
npm test
```

Expected: 47 tests passed.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql src/main/handlers/orderItems.ts
git commit -m "feat: upsert order items on conflict (session+product+agent)"
```

---

## Task 2: Session.tsx — thêm order management UI

**Files:**
- Modify: `src/renderer/src/pages/Session.tsx`

- [ ] **Step 1: Thêm imports**

Thêm các imports sau vào đầu `src/renderer/src/pages/Session.tsx`:

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { formatCurrency, calcPlayAmount, elapsedSeconds, formatDuration } from '../lib/utils'
import type { Session as SessionType } from '../types'
import OrderList from '../components/OrderList'
import ProductPicker from '../components/ProductPicker'
```

(File hiện tại chỉ có `useState, useEffect, useQuery, api, formatCurrency, calcPlayAmount, elapsedSeconds, formatDuration, SessionType` — thêm `useMutation, useQueryClient, OrderList, ProductPicker`)

- [ ] **Step 2: Thêm queryClient, orderItems query và 2 mutations**

Trong component `SessionPage`, sau dòng `const [seconds, setSeconds] = useState(0)`, thêm:

```typescript
const [showPicker, setShowPicker] = useState(false)
const queryClient = useQueryClient()

const { data: orderItems = [] } = useQuery({
  queryKey: ['orderItems', session?.id],
  queryFn: () => session ? api().orderItems.get(session.id) : Promise.resolve([]),
  enabled: !!session,
})

const addItemMutation = useMutation({
  mutationFn: ({ productId, quantity, price }: { productId: number; quantity: number; price: number }) =>
    api().orderItems.add(session!.id, productId, quantity, price),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session?.id] }),
})

const removeItemMutation = useMutation({
  mutationFn: (itemId: number) => api().orderItems.remove(itemId),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session?.id] }),
})
```

- [ ] **Step 3: Tính itemsAmount**

Sau dòng `const playAmount = calcPlayAmount(seconds / 60, session.hourly_rate)`, thêm:

```typescript
const itemsAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
```

- [ ] **Step 4: Thêm UI order section vào JSX**

Tìm đoạn JSX sau block đồng hồ (sau `</div>` đóng block `bg-[#2d1515]`), thêm section order trước nút thanh toán:

```tsx
{/* Order section */}
<div className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-4">
  <div className="flex justify-between items-center mb-3">
    <h3 className="font-semibold text-[#e2e8f0] text-sm">Đồ uống / thức ăn</h3>
    <button
      className="bg-[#d4af37] text-[#0d1f12] font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-yellow-400"
      onClick={() => setShowPicker(true)}
    >
      + Gọi
    </button>
  </div>
  <OrderList items={orderItems} onRemove={(id) => removeItemMutation.mutate(id)} />
  {itemsAmount > 0 && (
    <div className="mt-3 pt-3 border-t border-[#1e3d23] flex justify-between text-sm">
      <span className="text-[#6b7280]">Tổng đồ uống:</span>
      <span className="text-[#d4af37] font-bold">{formatCurrency(itemsAmount)}</span>
    </div>
  )}
</div>
```

- [ ] **Step 5: Thêm ProductPicker modal**

Sau nút thanh toán (cuối JSX, trước `</div>` đóng root), thêm:

```tsx
<ProductPicker
  open={showPicker}
  onClose={() => setShowPicker(false)}
  onSelect={async (product, qty) => {
    await addItemMutation.mutateAsync({
      productId: product.id,
      quantity: qty,
      price: product.price,
    })
    setShowPicker(false)
  }}
/>
```

- [ ] **Step 6: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 7: Chạy tests**

```bash
npm test
```

Expected: 47 tests passed.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Session.tsx
git commit -m "feat: add order management to Session page"
```
