# Promotions System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hệ thống khuyến mãi gồm 3 loại (voucher, khung giờ, sự kiện) có thể stack với nhau và tích hợp vào màn hình Invoice.

**Architecture:** Một bảng `promotions` lưu tất cả rule theo type enum. Backend handler tính KM hợp lệ tại thời điểm thanh toán. Frontend có trang Khuyến mãi riêng (CRUD) và Invoice tự load KM tự động + cho nhập voucher.

**Tech Stack:** PostgreSQL, Electron IPC (ipcMain/ipcRenderer), React 18, TypeScript, Zustand-free (React Query), Tailwind CSS + liquid glass classes (modal-glass, input-glass, btn-gold, btn-glass).

---

## File Map

| File | Action | Mô tả |
|------|--------|-------|
| `db/schema.sql` | Modify | Thêm bảng `promotions` + cột `promotions_applied` vào `cloud_invoices` |
| `src/main/handlers/promotions.ts` | **Create** | IPC handlers: getAll, getActive, validateVoucher, create, update, delete, incrementUsed |
| `src/main/index.ts` | Modify | Import + register `registerPromotionHandlers` |
| `src/preload/index.ts` | Modify | Expose `window.api.promotions.*` bridge |
| `src/renderer/src/electron.d.ts` | Modify | Thêm `promotions` vào `Window['api']` type |
| `src/renderer/src/types.ts` | Modify | Thêm `Promotion`, `AppliedPromoResult` interfaces |
| `src/renderer/src/lib/promoCalc.ts` | **Create** | Pure function `applyPromotions()` + helpers |
| `src/renderer/src/pages/Promotions.tsx` | **Create** | Trang quản lý KM với table + modal-glass CRUD |
| `src/renderer/src/App.tsx` | Modify | Thêm `'promotions'` vào View union, navItems, render switch |
| `src/renderer/src/pages/Settings.tsx` | Modify | Thêm `'promotions'` vào SCREENS list |
| `src/renderer/src/pages/Invoice.tsx` | Modify | Thêm section KM: auto-promos + voucher input + stack tính toán |
| `src/renderer/src/lib/invoiceCalc.ts` | Modify | Cập nhật `calcInvoice()` nhận thêm `promoDiscount` |

---

## Task 1: DB Migration — Bảng promotions + cột promotions_applied

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Thêm DDL vào schema.sql**

Mở `db/schema.sql`, append ở cuối file:

```sql
-- Chương trình khuyến mãi
CREATE TABLE IF NOT EXISTS promotions (
  id             SERIAL PRIMARY KEY,
  agent_id       VARCHAR(50) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  type           VARCHAR(20) NOT NULL CHECK (type IN ('voucher','time_slot','event')),
  is_active      BOOLEAN DEFAULT TRUE,
  discount_type  VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  apply_to       VARCHAR(20) DEFAULT 'total' CHECK (apply_to IN ('total','play','items')),
  max_discount   DECIMAL(10,0) NULL,
  code           VARCHAR(50) NULL,
  max_uses       INT NULL,
  used_count     INT DEFAULT 0,
  days_of_week   INT[] NULL,
  time_from      TIME NULL,
  time_to        TIME NULL,
  valid_from     DATE NULL,
  valid_to       DATE NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT voucher_has_code CHECK (type <> 'voucher' OR code IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_agent_idx
  ON promotions (agent_id, code) WHERE code IS NOT NULL;

ALTER TABLE cloud_invoices
  ADD COLUMN IF NOT EXISTS promotions_applied JSONB DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Chạy migration lên DB**

```bash
psql $DATABASE_URL -c "
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY, agent_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('voucher','time_slot','event')),
  is_active BOOLEAN DEFAULT TRUE,
  discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  apply_to VARCHAR(20) DEFAULT 'total' CHECK (apply_to IN ('total','play','items')),
  max_discount DECIMAL(10,0) NULL, code VARCHAR(50) NULL, max_uses INT NULL,
  used_count INT DEFAULT 0, days_of_week INT[] NULL, time_from TIME NULL,
  time_to TIME NULL, valid_from DATE NULL, valid_to DATE NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT voucher_has_code CHECK (type <> 'voucher' OR code IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_agent_idx ON promotions (agent_id, code) WHERE code IS NOT NULL;
ALTER TABLE cloud_invoices ADD COLUMN IF NOT EXISTS promotions_applied JSONB DEFAULT '[]'::jsonb;
"
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add promotions table and promotions_applied column to cloud_invoices"
```

---

## Task 2: Types — Promotion interfaces

**Files:**
- Modify: `src/renderer/src/types.ts`

- [ ] **Step 1: Thêm interfaces vào cuối `types.ts`**

```typescript
export interface Promotion {
  id: number
  agent_id: string
  name: string
  type: 'voucher' | 'time_slot' | 'event'
  is_active: boolean
  discount_type: 'percent' | 'fixed'
  discount_value: number
  apply_to: 'total' | 'play' | 'items'
  max_discount: number | null
  code: string | null
  max_uses: number | null
  used_count: number
  days_of_week: number[] | null
  time_from: string | null
  time_to: string | null
  valid_from: string | null
  valid_to: string | null
  created_at: string
}

export interface AppliedPromoResult {
  id: number
  name: string
  amount: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/types.ts
git commit -m "feat: add Promotion and AppliedPromoResult types"
```

---

## Task 3: promoCalc.ts — Logic stack discount

**Files:**
- Create: `src/renderer/src/lib/promoCalc.ts`

- [ ] **Step 1: Tạo file `promoCalc.ts`**

```typescript
// src/renderer/src/lib/promoCalc.ts
import type { Promotion, AppliedPromoResult } from '../types'

export function applyPromotions(
  promos: Promotion[],
  playAmount: number,
  itemsAmount: number
): { items: AppliedPromoResult[]; totalDiscount: number } {
  let remaining = playAmount + itemsAmount
  const items: AppliedPromoResult[] = []

  // time_slot & event trước, voucher sau
  const sorted = [...promos].sort((a, b) =>
    a.type === 'voucher' ? 1 : b.type === 'voucher' ? -1 : 0
  )

  for (const p of sorted) {
    const base =
      p.apply_to === 'play'  ? playAmount  :
      p.apply_to === 'items' ? itemsAmount :
      remaining

    let amount = p.discount_type === 'percent'
      ? base * p.discount_value / 100
      : p.discount_value

    if (p.max_discount != null) amount = Math.min(amount, p.max_discount)
    amount = Math.min(amount, remaining)
    amount = Math.max(0, amount)

    remaining -= amount
    items.push({ id: p.id, name: p.name, amount: Math.round(amount) })
  }

  return { items, totalDiscount: items.reduce((s, i) => s + i.amount, 0) }
}

export function formatPromoLabel(p: Promotion): string {
  const value = p.discount_type === 'percent'
    ? `${p.discount_value}%`
    : `${p.discount_value.toLocaleString('vi-VN')}đ`
  return `${p.name} −${value}`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/lib/promoCalc.ts
git commit -m "feat: add applyPromotions stack discount logic"
```

---

## Task 4: Backend handler — promotions.ts

**Files:**
- Create: `src/main/handlers/promotions.ts`

- [ ] **Step 1: Tạo handler file**

```typescript
// src/main/handlers/promotions.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

const VN = `+ INTERVAL '7 hours'`

export async function getAllPromotions() {
  const agentId = getAgentId()
  return query(
    `SELECT * FROM promotions WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  )
}

export async function getActivePromotions(now: string) {
  const agentId = getAgentId()
  return query(
    `SELECT * FROM promotions
     WHERE agent_id = $1 AND is_active = TRUE
       AND type IN ('time_slot', 'event')
       AND (
         (type = 'time_slot'
           AND days_of_week @> ARRAY[EXTRACT(ISODOW FROM ($2::timestamptz ${VN}))::int]
           AND time_from <= (($2::timestamptz ${VN})::time)
           AND time_to   >= (($2::timestamptz ${VN})::time))
         OR
         (type = 'event'
           AND valid_from <= DATE($2::timestamptz ${VN})
           AND valid_to   >= DATE($2::timestamptz ${VN}))
       )`,
    [agentId, now]
  )
}

export async function validateVoucher(code: string) {
  const agentId = getAgentId()
  return queryOne<object>(
    `SELECT * FROM promotions
     WHERE agent_id = $1 AND code = $2 AND type = 'voucher' AND is_active = TRUE
       AND (max_uses IS NULL OR used_count < max_uses)
       AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
     LIMIT 1`,
    [agentId, code.trim().toUpperCase()]
  )
}

export async function createPromotion(input: {
  name: string; type: string; discount_type: string; discount_value: number
  apply_to: string; max_discount: number | null; code: string | null
  max_uses: number | null; days_of_week: number[] | null
  time_from: string | null; time_to: string | null
  valid_from: string | null; valid_to: string | null; is_active: boolean
}) {
  const agentId = getAgentId()
  return queryOne<object>(
    `INSERT INTO promotions
       (agent_id, name, type, discount_type, discount_value, apply_to, max_discount,
        code, max_uses, days_of_week, time_from, time_to, valid_from, valid_to, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [agentId, input.name, input.type, input.discount_type, input.discount_value,
     input.apply_to, input.max_discount,
     input.code ? input.code.trim().toUpperCase() : null,
     input.max_uses || null,
     input.days_of_week, input.time_from || null, input.time_to || null,
     input.valid_from || null, input.valid_to || null, input.is_active]
  )
}

export async function updatePromotion(id: number, input: Partial<{
  name: string; discount_type: string; discount_value: number; apply_to: string
  max_discount: number | null; code: string | null; max_uses: number | null
  days_of_week: number[] | null; time_from: string | null; time_to: string | null
  valid_from: string | null; valid_to: string | null; is_active: boolean
}>) {
  const agentId = getAgentId()
  const fields = Object.entries(input)
    .map(([k], i) => `${k} = $${i + 3}`)
    .join(', ')
  const values = Object.values(input)
  return queryOne<object>(
    `UPDATE promotions SET ${fields} WHERE id = $1 AND agent_id = $2 RETURNING *`,
    [id, agentId, ...values]
  )
}

export async function deletePromotion(id: number) {
  const agentId = getAgentId()
  await query(`DELETE FROM promotions WHERE id = $1 AND agent_id = $2`, [id, agentId])
}

export async function incrementUsedCount(id: number) {
  const agentId = getAgentId()
  await query(
    `UPDATE promotions SET used_count = used_count + 1 WHERE id = $1 AND agent_id = $2`,
    [id, agentId]
  )
}

export function registerPromotionHandlers() {
  ipcMain.handle('promotions:getAll', () => getAllPromotions())
  ipcMain.handle('promotions:getActive', (_e, now: string) => getActivePromotions(now))
  ipcMain.handle('promotions:validateVoucher', (_e, code: string) => validateVoucher(code))
  ipcMain.handle('promotions:create', (_e, input) => createPromotion(input))
  ipcMain.handle('promotions:update', (_e, id: number, input) => updatePromotion(id, input))
  ipcMain.handle('promotions:delete', (_e, id: number) => deletePromotion(id))
  ipcMain.handle('promotions:incrementUsed', (_e, id: number) => incrementUsedCount(id))
}
```

- [ ] **Step 2: Đăng ký handler trong `src/main/index.ts`**

Thêm import vào đầu file (sau dòng `import { registerStaffHandlers }`):
```typescript
import { registerPromotionHandlers } from './handlers/promotions'
```

Thêm vào trong hàm `app.whenReady()` (sau dòng `registerStaffHandlers()`):
```typescript
registerPromotionHandlers()
```

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/promotions.ts src/main/index.ts
git commit -m "feat: add promotions IPC handlers (getAll, getActive, validateVoucher, CRUD, incrementUsed)"
```

---

## Task 5: Preload bridge + TypeScript types

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Thêm import Promotion type vào preload**

Dòng import đầu `src/preload/index.ts`, thêm `Promotion` vào import list:
```typescript
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, PageResult, RecipeItem, Category, StaffMember, Promotion } from '../renderer/src/types'
```

- [ ] **Step 2: Thêm promotions bridge vào contextBridge (sau khối `loyalty`)**

```typescript
  promotions: {
    getAll: (): Promise<Promotion[]> =>
      ipcRenderer.invoke('promotions:getAll'),
    getActive: (now: string): Promise<Promotion[]> =>
      ipcRenderer.invoke('promotions:getActive', now),
    validateVoucher: (code: string): Promise<Promotion | null> =>
      ipcRenderer.invoke('promotions:validateVoucher', code),
    create: (input: Omit<Promotion, 'id' | 'agent_id' | 'used_count' | 'created_at'>): Promise<Promotion> =>
      ipcRenderer.invoke('promotions:create', input),
    update: (id: number, input: Partial<Promotion>): Promise<Promotion> =>
      ipcRenderer.invoke('promotions:update', id, input),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('promotions:delete', id),
    incrementUsed: (id: number): Promise<void> =>
      ipcRenderer.invoke('promotions:incrementUsed', id),
  },
```

- [ ] **Step 3: Thêm type vào `src/renderer/src/electron.d.ts`**

Trong block `interface Window { api: { ... } }`, thêm sau `loyalty`:
```typescript
      promotions: {
        getAll(): Promise<Promotion[]>
        getActive(now: string): Promise<Promotion[]>
        validateVoucher(code: string): Promise<Promotion | null>
        create(input: Omit<Promotion, 'id' | 'agent_id' | 'used_count' | 'created_at'>): Promise<Promotion>
        update(id: number, input: Partial<Promotion>): Promise<Promotion>
        delete(id: number): Promise<void>
        incrementUsed(id: number): Promise<void>
      }
```

Thêm `Promotion` vào import ở đầu `electron.d.ts`:
```typescript
import type { ..., Promotion } from './types'
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: expose promotions IPC bridge via preload and electron.d.ts"
```

---

## Task 6: Trang Promotions.tsx

**Files:**
- Create: `src/renderer/src/pages/Promotions.tsx`

- [ ] **Step 1: Tạo `Promotions.tsx`**

```typescript
// src/renderer/src/pages/Promotions.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Promotion } from '../types'
import { formatCurrency } from '../lib/utils'

type PromoTab = 'all' | 'voucher' | 'time_slot' | 'event'
type PromoForm = {
  name: string; type: 'voucher' | 'time_slot' | 'event'
  discount_type: 'percent' | 'fixed'; discount_value: number
  apply_to: 'total' | 'play' | 'items'; max_discount: number | null
  code: string; max_uses: number; valid_to: string
  days_of_week: number[]; time_from: string; time_to: string
  valid_from: string; is_active: boolean
}

const BLANK_FORM: PromoForm = {
  name: '', type: 'time_slot', discount_type: 'percent', discount_value: 10,
  apply_to: 'total', max_discount: null, code: '', max_uses: 0, valid_to: '',
  days_of_week: [1,2,3,4,5], time_from: '14:00', time_to: '17:00',
  valid_from: '', is_active: true,
}

const DAY_LABELS = ['T2','T3','T4','T5','T6','T7','CN']
const TYPE_LABELS: Record<string, string> = { voucher: 'Voucher', time_slot: 'Khung giờ', event: 'Sự kiện' }
const TYPE_BADGES: Record<string, string> = {
  voucher: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  time_slot: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  event: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

export default function PromotionsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<PromoTab>('all')
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Promotion | null>(null)
  const [form, setForm] = useState<PromoForm>(BLANK_FORM)

  const { data: promos = [] } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => window.api.promotions.getAll(),
  })

  const createMutation = useMutation({
    mutationFn: () => window.api.promotions.create(buildInput()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['promotions'] }); setModalMode(null); toast.success('Đã tạo khuyến mãi') },
    onError: () => toast.error('Tên hoặc mã đã tồn tại'),
  })

  const updateMutation = useMutation({
    mutationFn: () => selected ? window.api.promotions.update(selected.id, buildInput()) : Promise.reject(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['promotions'] }); setModalMode(null); toast.success('Đã cập nhật') },
    onError: () => toast.error('Lưu thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.promotions.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['promotions'] }); toast.success('Đã xoá') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      window.api.promotions.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  })

  function buildInput() {
    return {
      name: form.name, type: form.type, discount_type: form.discount_type,
      discount_value: form.discount_value, apply_to: form.apply_to,
      max_discount: form.discount_type === 'percent' && form.max_discount ? form.max_discount : null,
      code: form.type === 'voucher' ? form.code.toUpperCase() : null,
      max_uses: form.type === 'voucher' ? (form.max_uses || null) : null,
      days_of_week: form.type === 'time_slot' ? form.days_of_week : null,
      time_from: form.type === 'time_slot' ? form.time_from : null,
      time_to: form.type === 'time_slot' ? form.time_to : null,
      valid_from: form.type === 'event' ? form.valid_from : null,
      valid_to: (form.type === 'event' ? form.valid_to : null) ||
                (form.type === 'voucher' && form.valid_to ? form.valid_to : null),
      is_active: form.is_active,
    }
  }

  function openCreate() {
    setForm(BLANK_FORM); setSelected(null); setModalMode('create')
  }

  function openEdit(p: Promotion) {
    setForm({
      name: p.name, type: p.type, discount_type: p.discount_type,
      discount_value: p.discount_value, apply_to: p.apply_to,
      max_discount: p.max_discount, code: p.code ?? '',
      max_uses: p.max_uses ?? 0, valid_to: p.valid_to ?? '',
      days_of_week: p.days_of_week ?? [1,2,3,4,5],
      time_from: p.time_from ?? '14:00', time_to: p.time_to ?? '17:00',
      valid_from: p.valid_from ?? '', is_active: p.is_active,
    })
    setSelected(p); setModalMode('edit')
  }

  function toggleDay(day: number) {
    const days = form.days_of_week.includes(day)
      ? form.days_of_week.filter(d => d !== day)
      : [...form.days_of_week, day].sort()
    setForm({ ...form, days_of_week: days })
  }

  function formatDiscount(p: Promotion) {
    const val = p.discount_type === 'percent'
      ? `${p.discount_value}%${p.max_discount ? ` (tối đa ${formatCurrency(p.max_discount)})` : ''}`
      : formatCurrency(p.discount_value)
    const scope = p.apply_to === 'play' ? ' (giờ chơi)' : p.apply_to === 'items' ? ' (đồ uống)' : ''
    return `−${val}${scope}`
  }

  const filtered = activeTab === 'all' ? promos : promos.filter(p => p.type === activeTab)
  const TABS: { key: PromoTab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'voucher', label: 'Voucher' },
    { key: 'time_slot', label: 'Khung giờ' },
    { key: 'event', label: 'Sự kiện' },
  ]

  const canSave = form.name.trim() &&
    form.discount_value > 0 &&
    (form.type !== 'voucher' || form.code.trim()) &&
    (form.type !== 'time_slot' || (form.days_of_week.length > 0 && form.time_from && form.time_to)) &&
    (form.type !== 'event' || (form.valid_from && form.valid_to))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#d4af37]">Khuyến mãi</h1>
        <button className="btn-gold" onClick={openCreate}>+ Thêm KM</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-lg p-1 mb-4 w-fit">
        {TABS.map(({ key, label }) => (
          <button key={key}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === key ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white hover:text-[#d4af37]'}`}
            onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="backdrop-blur-xl bg-white/[0.04] rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.06] border-b-2 border-[#d4af37]">
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Loại</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giảm</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Chi tiết</th>
              <th className="text-center px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Bật/Tắt</th>
              <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                <td className="px-4 py-3 text-white/90 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${TYPE_BADGES[p.type]}`}>
                    {TYPE_LABELS[p.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/80">{formatDiscount(p)}</td>
                <td className="px-4 py-3 text-white/55 text-xs">
                  {p.type === 'voucher' && `Mã: ${p.code}${p.max_uses ? ` · ${p.used_count}/${p.max_uses} lượt` : ' · Không giới hạn'}`}
                  {p.type === 'time_slot' && p.days_of_week && `${p.days_of_week.map(d => DAY_LABELS[d-1]).join(', ')} · ${p.time_from?.slice(0,5)}–${p.time_to?.slice(0,5)}`}
                  {p.type === 'event' && `${p.valid_from} → ${p.valid_to}`}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleMutation.mutate({ id: p.id, is_active: !p.is_active })}
                    className={`w-10 h-5 rounded-full transition-colors relative ${p.is_active ? 'bg-[#d4af37]' : 'bg-white/20'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.is_active ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(p)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => { if (confirm('Xoá khuyến mãi này?')) deleteMutation.mutate(p.id) }}>Xoá</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40">
                {activeTab === 'all' ? 'Chưa có chương trình khuyến mãi nào' : `Chưa có KM loại ${TYPE_LABELS[activeTab]}`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalMode(null)} />
          <div className="modal-glass relative w-full max-w-md mx-4 p-6 overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">🏷</div>
                <h2 className="text-base font-bold text-white">
                  {modalMode === 'create' ? 'Thêm khuyến mãi' : 'Sửa khuyến mãi'}
                </h2>
              </div>
            </div>
            <div className="mb-4 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }} />

            <div className="space-y-4">
              {/* Tên */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Tên chương trình</label>
                <input className="input-glass w-full px-4 py-2.5 text-sm" autoFocus
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              {/* Loại */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['time_slot', 'voucher', 'event'] as const).map(t => (
                    <button key={t}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.type === t ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white/70 hover:text-white'}`}
                      onClick={() => setForm({ ...form, type: t })}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voucher fields */}
              {form.type === 'voucher' && (
                <>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Mã code</label>
                    <input className="input-glass w-full px-4 py-2.5 text-sm uppercase"
                      value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="VD: BIDA20" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Số lần dùng tối đa</label>
                      <input type="number" min={0} className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.max_uses} onChange={e => setForm({ ...form, max_uses: Number(e.target.value) })}
                        placeholder="0 = không giới hạn" />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ngày hết hạn</label>
                      <input type="date" className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {/* Time slot fields */}
              {form.type === 'time_slot' && (
                <>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ngày áp dụng</label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, idx) => {
                        const day = idx + 1
                        const active = form.days_of_week.includes(day)
                        return (
                          <button key={day}
                            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${active ? 'bg-[#d4af37] text-[#0f0e0f] border-[#d4af37] font-bold' : 'border-white/10 text-white/50 hover:border-white/30'}`}
                            onClick={() => toggleDay(day)}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Từ</label>
                      <input type="time" className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.time_from} onChange={e => setForm({ ...form, time_from: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Đến</label>
                      <input type="time" className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.time_to} onChange={e => setForm({ ...form, time_to: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {/* Event fields */}
              {form.type === 'event' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Từ ngày</label>
                    <input type="date" className="input-glass w-full px-4 py-2.5 text-sm"
                      value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Đến ngày</label>
                    <input type="date" className="input-glass w-full px-4 py-2.5 text-sm"
                      value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)' }} />

              {/* Discount config */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại giảm</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['percent', 'fixed'] as const).map(t => (
                    <button key={t}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.discount_type === t ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white/70 hover:text-white'}`}
                      onClick={() => setForm({ ...form, discount_type: t })}>
                      {t === 'percent' ? '% Phần trăm' : 'Cố định đồng'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">
                    Giá trị {form.discount_type === 'percent' ? '(%)' : '(đồng)'}
                  </label>
                  <input type="number" min={0} className="input-glass w-full px-4 py-2.5 text-sm"
                    value={form.discount_value} onChange={e => setForm({ ...form, discount_value: Number(e.target.value) })} />
                </div>
                {form.discount_type === 'percent' && (
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Giảm tối đa (đồng)</label>
                    <input type="number" min={0} className="input-glass w-full px-4 py-2.5 text-sm"
                      value={form.max_discount ?? ''} placeholder="Không giới hạn"
                      onChange={e => setForm({ ...form, max_discount: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                )}
              </div>

              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Áp dụng vào</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['total', 'play', 'items'] as const).map(t => (
                    <button key={t}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.apply_to === t ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white/70 hover:text-white'}`}
                      onClick={() => setForm({ ...form, apply_to: t })}>
                      {t === 'total' ? 'Toàn đơn' : t === 'play' ? 'Giờ chơi' : 'Đồ uống'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="accent-[#d4af37] w-4 h-4"
                  checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                <span className="text-sm text-white/90">Kích hoạt ngay</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-glass flex-1" onClick={() => setModalMode(null)}>Huỷ</button>
              <button className="btn-gold flex-1" disabled={!canSave}
                onClick={() => modalMode === 'create' ? createMutation.mutate() : updateMutation.mutate()}>
                {modalMode === 'create' ? '＋ Thêm KM' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/pages/Promotions.tsx
git commit -m "feat: add Promotions management page with CRUD modal-glass UI"
```

---

## Task 7: App.tsx — Thêm route và nav

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Thêm import PromotionsPage**

Sau dòng `import InvoiceListPage from './pages/InvoiceList'`:
```typescript
import PromotionsPage from './pages/Promotions'
```

- [ ] **Step 2: Thêm `'promotions'` vào View union type**

Tìm đoạn:
```typescript
  | { page: 'reports' }
  | { page: 'settings' }
```
Thay bằng:
```typescript
  | { page: 'reports' }
  | { page: 'promotions' }
  | { page: 'settings' }
```

- [ ] **Step 3: Thêm vào navItems (Manage section)**

Tìm dòng:
```typescript
    { page: 'reports', label: 'Báo cáo', icon: '📊' },
```
Thay bằng:
```typescript
    { page: 'reports', label: 'Báo cáo', icon: '📊' },
    { page: 'promotions', label: 'Khuyến mãi', icon: '🏷' },
```

- [ ] **Step 4: Thêm vào Manage section filter**

Tìm dòng:
```typescript
          {visibleNavItems.filter(i => ['reports'].includes(i.page)).map
```
Thay bằng:
```typescript
          {visibleNavItems.filter(i => ['reports', 'promotions'].includes(i.page)).map
```

- [ ] **Step 5: Thêm vào pageLabels**

Tìm:
```typescript
    reports: 'Báo cáo', settings: 'Cài đặt',
```
Thay bằng:
```typescript
    reports: 'Báo cáo', promotions: 'Khuyến mãi', settings: 'Cài đặt',
```

- [ ] **Step 6: Thêm render case**

Sau khối `{view.page === 'reports' && ...}`, thêm:
```typescript
        {view.page === 'promotions' && (
          canAccess('promotions')
            ? <PromotionsPage />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: add Promotions page to nav and router"
```

---

## Task 8: Settings — Thêm 'promotions' vào SCREENS

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Thêm promotions vào SCREENS array**

Tìm:
```typescript
    { key: 'reports', label: '📊 Báo cáo' },
```
Thêm sau:
```typescript
    { key: 'promotions', label: '🏷 Khuyến mãi' },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: add promotions to staff permission screens list"
```

---

## Task 9: invoiceCalc.ts — Cập nhật calcInvoice nhận promoDiscount

**Files:**
- Modify: `src/renderer/src/lib/invoiceCalc.ts`

- [ ] **Step 1: Đọc file invoiceCalc.ts hiện tại**

```bash
cat src/renderer/src/lib/invoiceCalc.ts
```

- [ ] **Step 2: Thêm `promoDiscount` vào CalcInput và calcInvoice**

Tìm interface `CalcInput` (hoặc tham số của `calcInvoice`), thêm:
```typescript
  promoDiscount?: number
```

Trong thân hàm `calcInvoice`, tìm dòng:
```typescript
  const finalAmount = totalAmount - discount - discountFromPoints
```
Thay bằng:
```typescript
  const promoDiscount = input.promoDiscount ?? 0
  const finalAmount = totalAmount - promoDiscount - discount - discountFromPoints
```

Và cập nhật return nếu có:
```typescript
  return { totalAmount, discountFromPoints, promoDiscount, finalAmount: Math.max(0, finalAmount) }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/invoiceCalc.ts
git commit -m "feat: add promoDiscount param to calcInvoice"
```

---

## Task 10: Invoice.tsx — Tích hợp section Khuyến mãi

**Files:**
- Modify: `src/renderer/src/pages/Invoice.tsx`

- [ ] **Step 1: Thêm import**

Thêm vào đầu file (sau import hiện có):
```typescript
import { applyPromotions, formatPromoLabel } from '../lib/promoCalc'
import type { Promotion, AppliedPromoResult } from '../types'
```

- [ ] **Step 2: Thêm state và query**

Sau dòng `const [discount, setDiscount] = useState(0)`, thêm:
```typescript
  const [appliedPromos, setAppliedPromos] = useState<Promotion[]>([])
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
```

Sau query `useQuery loyaltySettings`, thêm:
```typescript
  const { data: autoPromos = [] } = useQuery({
    queryKey: ['promotions', 'active'],
    queryFn: () => window.api.promotions.getActive(new Date().toISOString()),
    refetchInterval: 60000,
  })

  // Merge auto promos với voucher đã áp dụng (auto không trùng lặp)
  const allAppliedPromos: Promotion[] = [
    ...autoPromos,
    ...appliedPromos.filter(p => !autoPromos.some(a => a.id === p.id)),
  ]
```

- [ ] **Step 3: Thêm hàm applyVoucher và removeVoucher**

Trước `return`:
```typescript
  async function applyVoucher() {
    if (!voucherCode.trim()) return
    setVoucherLoading(true)
    try {
      const promo = await window.api.promotions.validateVoucher(voucherCode)
      if (!promo) { toast.error('Mã không hợp lệ hoặc đã hết hạn'); return }
      if (appliedPromos.some(p => p.id === promo.id)) { toast.error('Mã đã được áp dụng'); return }
      setAppliedPromos(prev => [...prev, promo])
      setVoucherCode('')
      toast.success(`Áp dụng "${promo.name}" thành công`)
    } finally {
      setVoucherLoading(false)
    }
  }

  function removeVoucher(id: number) {
    setAppliedPromos(prev => prev.filter(p => p.id !== id))
  }
```

- [ ] **Step 4: Tính promoDiscount và cập nhật calcInvoice**

Tìm dòng:
```typescript
  const discountFromPoints = calcDiscountFromPoints(pointsToRedeem, VND_PER_POINT)
```

Thêm ngay sau:
```typescript
  const promoResult = applyPromotions(allAppliedPromos, playAmount, itemsAmount)
  const promoDiscount = promoResult.totalDiscount
```

Tìm chỗ gọi `calcInvoice(...)` và thêm `promoDiscount`:
```typescript
  const { finalAmount: preVatAmount } = calcInvoice({
    playAmount, itemsAmount, discount, promoDiscount,
    pointsRedeemed: pointsToRedeem, vndPerPoint: VND_PER_POINT,
  })
```

- [ ] **Step 5: Thêm `promotionsApplied` vào `invoiceInput`**

Tìm đoạn `const invoiceInput: InvoiceCreateInput = { ... }`, thêm:
```typescript
    promotionsApplied: promoResult.items,
    promoDiscount,
```

- [ ] **Step 6: Thêm UI section Khuyến mãi**

Tìm chỗ render section giảm giá / điểm trong JSX. Trước phần `discount` thủ công, thêm section KM:

```tsx
          {/* Section Khuyến mãi */}
          {(allAppliedPromos.length > 0 || true) && (
            <div className="backdrop-blur-xl bg-white/[0.04] rounded-xl border border-white/10 p-4 space-y-2">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold mb-2">Khuyến mãi</p>

              {allAppliedPromos.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-white/80">
                    <span className="text-xs">🏷</span>
                    {formatPromoLabel(p)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[#d4af37]">
                      −{(promoResult.items.find((r: AppliedPromoResult) => r.id === p.id)?.amount ?? 0).toLocaleString('vi-VN')}đ
                    </span>
                    {p.type === 'voucher' && (
                      <button onClick={() => removeVoucher(p.id)}
                        className="text-white/30 hover:text-red-400 transition-colors text-xs">✕</button>
                    )}
                  </span>
                </div>
              ))}

              {allAppliedPromos.length === 0 && (
                <p className="text-white/30 text-xs">Chưa có khuyến mãi nào áp dụng</p>
              )}

              {/* Nhập voucher */}
              <div className="flex gap-2 pt-1">
                <input
                  className="input-glass flex-1 px-3 py-2 text-sm uppercase"
                  placeholder="Nhập mã voucher..."
                  value={voucherCode}
                  onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && applyVoucher()}
                />
                <button className="btn-glass text-xs px-3" onClick={applyVoucher} disabled={voucherLoading || !voucherCode.trim()}>
                  {voucherLoading ? '...' : 'Áp dụng'}
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Invoice.tsx
git commit -m "feat: integrate promotions section into Invoice page (auto-apply + voucher input + stack)"
```

---

## Task 11: Lưu promotions_applied vào DB khi checkout

**Files:**
- Modify: `src/main/handlers/invoices.ts`
- Modify: `src/renderer/src/types.ts` (InvoiceCreateInput)

- [ ] **Step 1: Thêm fields vào InvoiceCreateInput trong types.ts**

Tìm interface `InvoiceCreateInput`, thêm 2 fields:
```typescript
  promotionsApplied?: { id: number; name: string; amount: number }[]
  promoDiscount?: number
```

- [ ] **Step 2: Cập nhật invoices handler để lưu promotions_applied**

Mở `src/main/handlers/invoices.ts`, tìm hàm `createInvoice` (hoặc INSERT query). Thêm `promotions_applied` vào INSERT:

Tìm dòng INSERT INTO cloud_invoices, thêm column `promotions_applied` và value `$N`:
```sql
-- Trong danh sách columns thêm:
promotions_applied,
-- Trong VALUES thêm:
$N::jsonb,
-- Trong params array thêm:
JSON.stringify(input.promotionsApplied ?? []),
```

- [ ] **Step 3: Gọi incrementUsed cho voucher sau checkout thành công**

Trong `Invoice.tsx`, tìm `closeMutation` hoặc nơi gọi checkout. Sau khi invoice tạo thành công, thêm:

```typescript
    // Tăng used_count cho voucher đã dùng
    for (const p of appliedPromos.filter(p => p.type === 'voucher')) {
      await window.api.promotions.incrementUsed(p.id)
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/invoices.ts src/renderer/src/types.ts src/renderer/src/pages/Invoice.tsx
git commit -m "feat: persist promotions_applied to invoice and increment voucher used_count on checkout"
```

---

## Task 12: Kiểm tra thủ công end-to-end

- [ ] **Khởi động app**

```bash
npm run dev
```

- [ ] **Test tạo KM khung giờ**
  1. Vào Khuyến mãi → Thêm KM
  2. Loại: Khung giờ, chọn hôm nay (T2-CN), giờ từ 00:00 đến 23:59
  3. Giảm 20%, áp dụng Toàn đơn → Thêm
  4. Kiểm tra hiển thị trong bảng, toggle bật/tắt hoạt động

- [ ] **Test tạo voucher**
  1. Thêm KM loại Voucher, mã: TEST50, giảm 50.000đ cố định, 5 lần dùng
  2. Kiểm tra bảng có hiện mã + `0/5 lượt`

- [ ] **Test Invoice tự động áp dụng KM khung giờ**
  1. Mở phiên chơi → vào Invoice
  2. Section Khuyến mãi hiển thị KM khung giờ đã tạo
  3. Số tiền giảm tính đúng
  4. Tổng tiền = playAmount + items - promoDiscount - discountFromPoints - discount

- [ ] **Test nhập voucher**
  1. Trên Invoice, nhập mã TEST50 → Áp dụng
  2. Tag voucher xuất hiện với nút ✕
  3. Nhập mã sai → toast "Mã không hợp lệ"
  4. Bỏ voucher bằng ✕

- [ ] **Test checkout và used_count**
  1. Checkout với voucher TEST50
  2. Vào Khuyến mãi → voucher TEST50 hiện `1/5 lượt`

- [ ] **Test tạo KM sự kiện**
  1. Loại Sự kiện, từ hôm nay đến ngày mai, giảm 10%
  2. Vào Invoice → tự động áp dụng cùng KM khung giờ (stack)
  3. Kiểm tra tổng giảm = KM khung giờ + KM sự kiện

- [ ] **Commit cuối**

```bash
git add -A
git commit -m "feat: promotions system complete — voucher, time_slot, event with stack support"
```
