# Loyalty Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tra cứu / tạo khách hàng tại màn hình thanh toán, dùng điểm tích lũy giảm giá, và tự động cập nhật điểm sau khi thanh toán.

**Architecture:** Thêm `loyalty` IPC namespace (handler + preload + type) cho `cloud_loyalty_settings`. Refactor Invoice page thêm customer lookup section với phone search. Customers page thêm inline edit form.

**Tech Stack:** Electron IPC, React + Zustand, @tanstack/react-query, PostgreSQL (`cloud_customers`, `cloud_loyalty_settings`)

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/main/handlers/loyalty.ts` | NEW — `getSettings`, `saveSettings` |
| `src/main/index.ts` | MODIFY — register loyalty handlers |
| `src/preload/index.ts` | MODIFY — add `loyalty` to bridge |
| `src/renderer/src/electron.d.ts` | MODIFY — add `loyalty` type |
| `src/renderer/src/types.ts` | MODIFY — add `LoyaltySettings` |
| `src/renderer/src/pages/Invoice.tsx` | MODIFY — customer lookup section |
| `src/renderer/src/pages/Settings.tsx` | MODIFY — save to cloud_loyalty_settings |
| `src/renderer/src/pages/Customers.tsx` | MODIFY — inline edit form |
| `tests/unit/handlers/loyalty.test.ts` | NEW — unit tests |

---

## Task 1: loyalty handler + tests

**Files:**
- Create: `src/main/handlers/loyalty.ts`
- Create: `tests/unit/handlers/loyalty.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/handlers/loyalty.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue('test-agent-id'),
}))

import * as db from '../../../src/main/db'
import { getLoyaltySettings, saveLoyaltySettings } from '../../../src/main/handlers/loyalty'

describe('getLoyaltySettings', () => {
  it('returns settings when row exists', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({
      points_per_10k_vnd: 2,
      vnd_per_point: 200,
      min_redeem_points: 50,
    })
    const result = await getLoyaltySettings()
    expect(result).toEqual({ pointsPer10k: 2, vndPerPoint: 200, minRedeemPoints: 50 })
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('cloud_loyalty_settings'),
      ['test-agent-id']
    )
  })

  it('returns defaults when no row exists', async () => {
    vi.mocked(db.queryOne).mockResolvedValue(null)
    const result = await getLoyaltySettings()
    expect(result).toEqual({ pointsPer10k: 1, vndPerPoint: 100, minRedeemPoints: 100 })
  })
})

describe('saveLoyaltySettings', () => {
  it('upserts settings and returns saved values', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({
      points_per_10k_vnd: 2,
      vnd_per_point: 150,
      min_redeem_points: 50,
    })
    const result = await saveLoyaltySettings({ pointsPer10k: 2, vndPerPoint: 150, minRedeemPoints: 50 })
    expect(result).toEqual({ pointsPer10k: 2, vndPerPoint: 150, minRedeemPoints: 50 })
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_loyalty_settings'),
      ['test-agent-id', 2, 150, 50]
    )
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- tests/unit/handlers/loyalty.test.ts
```
Expected: `getLoyaltySettings is not a function`

- [ ] **Step 3: Implement handler**

```typescript
// src/main/handlers/loyalty.ts
import { ipcMain } from 'electron'
import { queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

export interface LoyaltySettings {
  pointsPer10k: number
  vndPerPoint: number
  minRedeemPoints: number
}

const DEFAULTS: LoyaltySettings = { pointsPer10k: 1, vndPerPoint: 100, minRedeemPoints: 100 }

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const agentId = getAgentId()
  const row = await queryOne<{
    points_per_10k_vnd: number
    vnd_per_point: number
    min_redeem_points: number
  }>(
    'SELECT points_per_10k_vnd, vnd_per_point, min_redeem_points FROM cloud_loyalty_settings WHERE agent_id = $1',
    [agentId]
  )
  if (!row) return DEFAULTS
  return {
    pointsPer10k: row.points_per_10k_vnd,
    vndPerPoint: row.vnd_per_point,
    minRedeemPoints: row.min_redeem_points,
  }
}

export async function saveLoyaltySettings(s: LoyaltySettings): Promise<LoyaltySettings> {
  const agentId = getAgentId()
  const row = await queryOne<{
    points_per_10k_vnd: number
    vnd_per_point: number
    min_redeem_points: number
  }>(
    `INSERT INTO cloud_loyalty_settings (agent_id, points_per_10k_vnd, vnd_per_point, min_redeem_points)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id) DO UPDATE
       SET points_per_10k_vnd = EXCLUDED.points_per_10k_vnd,
           vnd_per_point = EXCLUDED.vnd_per_point,
           min_redeem_points = EXCLUDED.min_redeem_points
     RETURNING points_per_10k_vnd, vnd_per_point, min_redeem_points`,
    [agentId, s.pointsPer10k, s.vndPerPoint, s.minRedeemPoints]
  )
  return row
    ? { pointsPer10k: row.points_per_10k_vnd, vndPerPoint: row.vnd_per_point, minRedeemPoints: row.min_redeem_points }
    : s
}

export function registerLoyaltyHandlers(): void {
  ipcMain.handle('loyalty:getSettings', () => getLoyaltySettings())
  ipcMain.handle('loyalty:saveSettings', (_e, s: LoyaltySettings) => saveLoyaltySettings(s))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- tests/unit/handlers/loyalty.test.ts
```
Expected: `2 passed`

- [ ] **Step 5: Add UNIQUE constraint trên cloud_loyalty_settings nếu chưa có**

```bash
node -e "
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.MAIN_VITE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('ALTER TABLE cloud_loyalty_settings ADD CONSTRAINT cloud_loyalty_settings_agent_id_unique UNIQUE (agent_id)')
  .then(() => { console.log('done'); pool.end(); })
  .catch(e => { console.log(e.message.includes('already exists') ? 'already exists, ok' : e.message); pool.end(); });
"
```

- [ ] **Step 6: Register handler trong main/index.ts**

Thêm import và gọi vào `src/main/index.ts`:

```typescript
// Thêm vào import block
import { registerLoyaltyHandlers } from './handlers/loyalty'

// Thêm sau registerAuthHandlers()
registerLoyaltyHandlers()
```

- [ ] **Step 7: Commit**

```bash
git add src/main/handlers/loyalty.ts src/main/index.ts tests/unit/handlers/loyalty.test.ts
git commit -m "feat: add loyalty IPC handlers (getSettings, saveSettings)"
```

---

## Task 2: Cập nhật preload + types

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`
- Modify: `src/renderer/src/types.ts`

- [ ] **Step 1: Thêm LoyaltySettings vào types.ts**

Thêm vào cuối `src/renderer/src/types.ts`:

```typescript
export interface LoyaltySettings {
  pointsPer10k: number
  vndPerPoint: number
  minRedeemPoints: number
}
```

- [ ] **Step 2: Thêm loyalty vào preload**

Trong `src/preload/index.ts`, thêm import type và thêm `loyalty` block vào `contextBridge.exposeInMainWorld`:

```typescript
// Thêm vào import type ở đầu file
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings } from '../renderer/src/types'

// Thêm vào object trong contextBridge.exposeInMainWorld, sau auth:
loyalty: {
  getSettings: (): Promise<LoyaltySettings> =>
    ipcRenderer.invoke('loyalty:getSettings'),
  saveSettings: (s: LoyaltySettings): Promise<LoyaltySettings> =>
    ipcRenderer.invoke('loyalty:saveSettings', s),
},
```

- [ ] **Step 3: Thêm loyalty vào electron.d.ts**

Trong `src/renderer/src/electron.d.ts`, thêm import `LoyaltySettings` và thêm block `loyalty` vào `Window.api`:

```typescript
// Đầu file — thêm LoyaltySettings vào import
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings } from './types'

// Trong interface Window.api, thêm sau auth:
loyalty: {
  getSettings(): Promise<LoyaltySettings>
  saveSettings(s: LoyaltySettings): Promise<LoyaltySettings>
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/electron.d.ts src/renderer/src/types.ts
git commit -m "feat: add loyalty to preload bridge and types"
```

---

## Task 3: Invoice page — customer lookup section

**Files:**
- Modify: `src/renderer/src/pages/Invoice.tsx`

Thêm section tra cứu khách hàng ở đầu Invoice page. Section này là tùy chọn — không có khách vẫn thanh toán được.

- [ ] **Step 1: Thêm state và refactor customer logic**

Trong `Invoice.tsx`, thay thế `useQuery` cho customer bằng local state:

```typescript
// Xóa useQuery cho customer cũ, thay bằng:
const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
const [phoneInput, setPhoneInput] = useState('')
const [searchState, setSearchState] = useState<'idle' | 'found' | 'notfound' | 'creating'>('idle')
const [quickName, setQuickName] = useState('')
const [pointsError, setPointsError] = useState('')
```

Import thêm `Customer` từ types:
```typescript
import type { Session, InvoiceCreateInput, Customer } from '../types'
```

- [ ] **Step 2: Thêm queries và mutations cho customer lookup**

Thêm vào sau các query hiện tại trong Invoice.tsx:

```typescript
const { data: loyaltySettings } = useQuery({
  queryKey: ['loyalty', 'settings'],
  queryFn: () => window.api.loyalty.getSettings(),
})

const VND_PER_POINT = loyaltySettings?.vndPerPoint ?? 100
const POINTS_PER_10K = loyaltySettings?.pointsPer10k ?? 1
const MIN_REDEEM = loyaltySettings?.minRedeemPoints ?? 100

const findCustomerMutation = useMutation({
  mutationFn: (phone: string) => window.api.customers.findByPhone(phone),
  onSuccess: (customer) => {
    if (customer) {
      setSelectedCustomer(customer)
      setSearchState('found')
    } else {
      setSearchState('notfound')
    }
    setPointsToRedeem(0)
    setPointsError('')
  },
})

const createCustomerMutation = useMutation({
  mutationFn: () => window.api.customers.create({
    name: quickName, phone: phoneInput, email: null, notes: null,
  }),
  onSuccess: (customer) => {
    if (customer) {
      setSelectedCustomer(customer)
      setSearchState('found')
      setQuickName('')
    }
  },
})
```

- [ ] **Step 3: Cập nhật invoiceInput để dùng selectedCustomer**

```typescript
// Thay session.customer_id bằng selectedCustomer?.id ?? null
const invoiceInput: InvoiceCreateInput = {
  sessionId: session.id,
  customerId: selectedCustomer?.id ?? null,
  playAmount, itemsAmount, discount,
  pointsRedeemed: pointsToRedeem,
  discountFromPoints, finalAmount, pointsEarned,
  shopName, shopAddress, shopPhone,
  tableId: session.table_id,
  tableName: session.table_name,
  orderItems: orderItems.map((i) => ({
    product_name: i.product_name ?? '', quantity: i.quantity, subtotal: i.subtotal,
  })),
  customerName: selectedCustomer?.name,
  customerPhone: selectedCustomer?.phone,
  customerPoints: selectedCustomer?.points_balance,
}
```

- [ ] **Step 4: Thêm validation điểm**

```typescript
const handlePointsChange = (value: number) => {
  setPointsError('')
  if (!selectedCustomer) return
  if (value > selectedCustomer.points_balance) {
    setPointsError(`Không đủ điểm (có ${selectedCustomer.points_balance})`)
  } else if (value > 0 && value < MIN_REDEEM) {
    setPointsError(`Tối thiểu ${MIN_REDEEM} điểm`)
  } else if (value * VND_PER_POINT > finalAmount + value * VND_PER_POINT) {
    setPointsError('Giảm giá vượt quá tổng hóa đơn')
  }
  setPointsToRedeem(value)
}
```

- [ ] **Step 5: Thêm CustomerLookup section vào JSX**

Thêm vào đầu phần JSX `<div className="grid ...">`, trước phần đồ uống:

```tsx
{/* Customer Lookup Section */}
<div className="col-span-full bg-gray-900 rounded-xl p-4 mb-2">
  <h3 className="font-semibold text-sm text-gray-400 uppercase mb-3">Khách hàng (tùy chọn)</h3>

  {searchState === 'idle' && (
    <div className="flex gap-2">
      <Input
        className="bg-gray-800 border-gray-600 flex-1"
        placeholder="Nhập số điện thoại..."
        value={phoneInput}
        onChange={(e) => setPhoneInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && phoneInput && findCustomerMutation.mutate(phoneInput)}
      />
      <Button
        size="sm"
        className="bg-blue-600 hover:bg-blue-700"
        disabled={!phoneInput || findCustomerMutation.isPending}
        onClick={() => findCustomerMutation.mutate(phoneInput)}
      >
        Tìm
      </Button>
    </div>
  )}

  {searchState === 'found' && selectedCustomer && (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-medium text-green-400">✓ {selectedCustomer.name}</p>
          <p className="text-sm text-gray-400">{selectedCustomer.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-yellow-400 font-bold">{selectedCustomer.points_balance} điểm</p>
          <button
            className="text-xs text-gray-500 hover:text-gray-300"
            onClick={() => { setSearchState('idle'); setSelectedCustomer(null); setPointsToRedeem(0); setPointsError('') }}
          >
            ✕ Xóa
          </button>
        </div>
      </div>
      {selectedCustomer.points_balance > 0 && (
        <div>
          <Label className="text-xs">Dùng điểm (1 điểm = {formatCurrency(VND_PER_POINT)})</Label>
          <Input
            type="number"
            min={0}
            max={selectedCustomer.points_balance}
            className="mt-1 bg-gray-800 border-gray-600"
            value={pointsToRedeem || ''}
            onChange={(e) => handlePointsChange(Number(e.target.value))}
          />
          {pointsError && <p className="text-xs text-red-400 mt-1">{pointsError}</p>}
          {pointsToRedeem > 0 && !pointsError && (
            <p className="text-xs text-green-400 mt-1">
              Giảm {formatCurrency(pointsToRedeem * VND_PER_POINT)} •
              Sau TT: +{calcPointsEarned(finalAmount, POINTS_PER_10K)} điểm,
              còn {selectedCustomer.points_balance - pointsToRedeem + calcPointsEarned(finalAmount, POINTS_PER_10K)} điểm
            </p>
          )}
        </div>
      )}
    </div>
  )}

  {searchState === 'notfound' && (
    <div className="space-y-2">
      <p className="text-sm text-red-400">✗ Không tìm thấy SĐT "{phoneInput}"</p>
      {searchState === 'notfound' && (
        <div className="flex gap-2 items-center">
          <Input
            className="bg-gray-800 border-gray-600 flex-1"
            placeholder="Tên khách hàng..."
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
          />
          <Button
            size="sm"
            className="bg-green-700 hover:bg-green-600 whitespace-nowrap"
            disabled={!quickName || createCustomerMutation.isPending}
            onClick={() => createCustomerMutation.mutate()}
          >
            + Tạo mới
          </Button>
          <button
            className="text-xs text-gray-500 hover:text-gray-300 ml-1"
            onClick={() => { setSearchState('idle'); setPhoneInput('') }}
          >
            Huỷ
          </button>
        </div>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 6: Xóa block điểm cũ trong phần tính tiền**

Trong section tính tiền (`bg-gray-900 rounded-xl p-4 space-y-3`), xóa block "Đổi điểm" vì đã chuyển lên trên:

```typescript
// Xóa đoạn này:
// <div>
//   <Label>Đổi điểm (1 điểm = {formatCurrency(VND_PER_POINT)})</Label>
//   {customer && (...)}
//   <Input type="number" ... value={pointsToRedeem} onChange={...} />
// </div>
```

Cũng xóa block query `loyaltySettings` cũ (dùng `settings.getAll`):
```typescript
// Xóa useQuery cũ:
// const { data: loyaltySettings } = useQuery({
//   queryKey: ['settings', 'loyalty'],
//   queryFn: async () => { ... }
// })
```

- [ ] **Step 7: Typecheck + chạy app thử**

```bash
npm run typecheck
npm run dev
```
Mở bàn, vào Invoice, thử tra cứu SĐT có tồn tại (ata_admin account), kiểm tra: tìm thấy hiện đúng tên/điểm, nhập điểm không vượt quá balance, thanh toán không lỗi.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Invoice.tsx
git commit -m "feat: add customer phone lookup and points redemption in invoice"
```

---

## Task 4: Settings page — lưu vào cloud_loyalty_settings

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Cập nhật Settings page để đọc từ loyalty:getSettings**

Trong `src/renderer/src/pages/Settings.tsx`, thêm query:

```typescript
const { data: loyaltyData } = useQuery({
  queryKey: ['loyalty', 'settings'],
  queryFn: () => window.api.loyalty.getSettings(),
})
```

Và trong `useEffect` khi `loyaltyData` thay đổi, điền vào state:
```typescript
useEffect(() => {
  if (!loyaltyData) return
  setPointsPer10k(String(loyaltyData.pointsPer10k))
  setVndPerPoint(String(loyaltyData.vndPerPoint))
}, [loyaltyData])
```

- [ ] **Step 2: Cập nhật saveMutation để lưu loyalty vào cloud_loyalty_settings**

Trong `saveMutation`, sau khi lưu settings key-value, thêm:

```typescript
await window.api.loyalty.saveSettings({
  pointsPer10k: Number(pointsPer10k) || 1,
  vndPerPoint: Number(vndPerPoint) || 100,
  minRedeemPoints: 100,
})
```

Và invalidate loyalty query:
```typescript
queryClient.invalidateQueries({ queryKey: ['loyalty', 'settings'] })
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: sync loyalty settings to cloud_loyalty_settings on save"
```

---

## Task 5: Customers page — inline edit form

**Files:**
- Modify: `src/renderer/src/pages/Customers.tsx`

- [ ] **Step 1: Thêm edit state và mutation**

Trong `Customers.tsx`, thêm state:
```typescript
const [editMode, setEditMode] = useState(false)
const [editForm, setEditForm] = useState({ name: '', email: '', notes: '' })
```

Thêm mutation:
```typescript
const updateMutation = useMutation({
  mutationFn: () => window.api.customers.update(selected!.id, {
    name: editForm.name || undefined,
    email: editForm.email || null,
    notes: editForm.notes || null,
  }),
  onSuccess: (updated) => {
    queryClient.invalidateQueries({ queryKey: ['customers'] })
    if (updated) setSelected(updated)
    setEditMode(false)
  },
})
```

- [ ] **Step 2: Thêm nút Sửa và inline form vào panel chi tiết**

Trong panel chi tiết (bên phải), sau tên/SĐT, thêm nút Sửa:

```tsx
<div className="flex justify-between items-start mb-1">
  <div>
    {editMode ? (
      <div className="space-y-2">
        <Input
          className="bg-gray-800 border-gray-600 text-sm"
          value={editForm.name}
          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          placeholder="Tên"
        />
        <Input
          className="bg-gray-800 border-gray-600 text-sm"
          value={editForm.email}
          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          placeholder="Email"
        />
        <Input
          className="bg-gray-800 border-gray-600 text-sm"
          value={editForm.notes}
          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
          placeholder="Ghi chú"
        />
        <div className="flex gap-2">
          <Button size="sm" className="bg-green-700 hover:bg-green-600"
            disabled={!editForm.name || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}>
            Lưu
          </Button>
          <Button size="sm" variant="outline" className="border-gray-600"
            onClick={() => setEditMode(false)}>
            Huỷ
          </Button>
        </div>
      </div>
    ) : (
      <>
        <h2 className="text-lg font-bold">{selected.name}</h2>
        <p className="text-gray-400 text-sm">{selected.phone}</p>
        {selected.email && <p className="text-gray-400 text-sm">{selected.email}</p>}
      </>
    )}
  </div>
  {!editMode && (
    <Button size="sm" variant="outline" className="border-gray-600 text-xs"
      onClick={() => {
        setEditForm({ name: selected.name, email: selected.email ?? '', notes: selected.notes ?? '' })
        setEditMode(true)
      }}>
      Sửa
    </Button>
  )}
</div>
```

- [ ] **Step 3: Reset editMode khi chọn khách khác**

Thêm vào handler `onClick` của mỗi customer row trong danh sách:
```typescript
onClick={() => { setSelected(customer); setEditMode(false) }}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/Customers.tsx
git commit -m "feat: add inline edit form in customers detail panel"
```

---

## Task 6: Chạy full tests + build

- [ ] **Step 1: Chạy toàn bộ tests**

```bash
npm test
```
Expected: `31 passed` (+ 2 loyalty tests = **33 passed**)

- [ ] **Step 2: Build kiểm tra typecheck**

```bash
npm run build
```
Expected: no errors, build thành công

- [ ] **Step 3: Smoke test trong app**

```bash
npm run dev
```

Kiểm tra:
1. Login bằng `ata_admin`
2. Mở bàn → vào Session → Kết thúc & Thanh toán
3. Nhập SĐT có tồn tại → thấy tên + điểm
4. Nhập SĐT không tồn tại → thấy "Tạo mới" → tạo → thấy khách mới
5. Nhập điểm muốn dùng → thấy giảm giá tính đúng
6. Nhập vượt quá điểm → thấy lỗi
7. Thanh toán → kiểm tra DB `cloud_customers` điểm đã cập nhật
8. Vào Settings → thay đổi tỷ lệ điểm → Lưu → kiểm tra DB `cloud_loyalty_settings`
9. Vào Customers → click khách → nút Sửa → đổi tên → Lưu

- [ ] **Step 4: Commit nếu cần fix nhỏ**

```bash
git add -p   # stage chỉ những thay đổi cần thiết
git commit -m "fix: loyalty points smoke test fixes"
```

- [ ] **Step 5: Final commit**

```bash
git push
```
