# Customer Search Typeahead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế ô tìm khách hàng trong Invoice page bằng typeahead dropdown — gõ ≥3 số → debounce 300ms → query DB → chọn từ danh sách hoặc tạo mới nhanh.

**Architecture:** Thêm `customers:searchByPhone` IPC handler (LIKE prefix query), tách logic tìm khách ra component `CustomerSearchInput`, Invoice.tsx swap block cũ bằng component mới.

**Tech Stack:** React 18, TypeScript, TanStack Query, shadcn/ui (Input, Button), Electron IPC, PostgreSQL LIKE query

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/main/handlers/customers.ts` | Thêm `searchCustomersByPhone` + register handler |
| `src/preload/index.ts` | Expose `customers:searchByPhone` |
| `src/renderer/src/components/CustomerSearchInput.tsx` | Tạo mới — component typeahead |
| `src/renderer/src/pages/Invoice.tsx` | Xóa block cũ, thêm `<CustomerSearchInput>` |

---

## Task 1: Backend — searchCustomersByPhone

**Files:**
- Modify: `src/main/handlers/customers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Thêm function searchCustomersByPhone vào customers.ts**

Mở `src/main/handlers/customers.ts`. Thêm function sau `findCustomerByPhone`:

```typescript
export async function searchCustomersByPhone(prefix: string): Promise<Customer[]> {
  const agentId = getAgentId()
  return query<Customer>(
    'SELECT * FROM cloud_customers WHERE phone LIKE $1 AND agent_id = $2 ORDER BY total_spent DESC',
    [prefix + '%', agentId]
  )
}
```

- [ ] **Step 2: Register handler trong registerCustomerHandlers**

Tìm `export function registerCustomerHandlers()`, thêm dòng mới vào trong:

```typescript
ipcMain.handle('customers:searchByPhone', (_e, prefix: string) => searchCustomersByPhone(prefix))
```

- [ ] **Step 3: Expose trong preload/index.ts**

Mở `src/preload/index.ts`, tìm block `customers: {`, thêm sau dòng `findByPhone`:

```typescript
searchByPhone: (prefix: string): Promise<Customer[]> =>
  ipcRenderer.invoke('customers:searchByPhone', prefix),
```

- [ ] **Step 4: Chạy typecheck để xác nhận không có lỗi**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/customers.ts src/preload/index.ts
git commit -m "feat: add customers:searchByPhone IPC handler"
```

---

## Task 2: Component CustomerSearchInput

**Files:**
- Create: `src/renderer/src/components/CustomerSearchInput.tsx`

- [ ] **Step 1: Tạo file component**

Tạo `src/renderer/src/components/CustomerSearchInput.tsx` với nội dung đầy đủ:

```tsx
import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { Customer } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  onSelect: (customer: Customer | null) => void
}

export default function CustomerSearchInput({ onSelect }: Props) {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = async (value: string) => {
    if (value.length < 3) {
      setResults([])
      setIsOpen(false)
      return
    }
    setIsLoading(true)
    try {
      const customers = await window.api.customers.searchByPhone(value)
      setResults(customers)
      setIsOpen(true)
    } catch {
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    setShowCreate(false)
    setCreateName('')
    setCreateError('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  const handleSelect = (customer: Customer) => {
    setSelected(customer)
    setIsOpen(false)
    setInput('')
    onSelect(customer)
  }

  const handleClear = () => {
    setSelected(null)
    setInput('')
    setResults([])
    setIsOpen(false)
    setShowCreate(false)
    setCreateName('')
    onSelect(null)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
      setShowCreate(false)
    }, 150)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      window.api.customers.create({ name: createName, phone: input, email: null, notes: null }),
    onSuccess: (customer) => {
      if (customer) {
        setSelected(customer)
        setIsOpen(false)
        setInput('')
        setShowCreate(false)
        setCreateName('')
        setCreateError('')
        onSelect(customer)
      }
    },
    onError: () => setCreateError('Không tạo được, thử lại'),
  })

  if (selected) {
    return (
      <div className="flex justify-between items-center">
        <div>
          <p className="font-medium text-green-400">✓ {selected.name}</p>
          <p className="text-sm text-[#6b7280]">{selected.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-[#d4af37] font-bold">{selected.points_balance} điểm</p>
          <button className="text-xs text-[#6b7280] hover:text-white" onClick={handleClear}>
            ✕ Xóa
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        className="bg-[#0a1a0d] border-[#1e3d23] text-white"
        placeholder="Nhập số điện thoại (≥3 số)..."
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
      />
      {isLoading && <p className="text-xs text-[#6b7280] mt-1">Đang tìm...</p>}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#0a1a0d] border border-[#1e3d23] rounded-lg overflow-auto max-h-64 shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2 hover:bg-[#162a1a] flex justify-between items-center"
              onMouseDown={() => handleSelect(c)}
            >
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-[#6b7280] text-xs">{c.phone}</p>
              </div>
              <p className="text-[#d4af37] text-xs">{c.points_balance} điểm</p>
            </button>
          ))}
          {results.length === 0 && input.length >= 3 && !isLoading && (
            <div>
              {!showCreate ? (
                <button
                  className="w-full text-left px-3 py-2 text-green-400 hover:bg-[#162a1a] text-sm"
                  onMouseDown={() => setShowCreate(true)}
                >
                  + Thêm khách "{input}"
                </button>
              ) : (
                <div className="p-3 space-y-2">
                  <Input
                    className="bg-[#162a1a] border-[#1e3d23] text-white text-sm"
                    placeholder="Tên khách hàng..."
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && createName && createMutation.mutate()
                    }
                    autoFocus
                  />
                  {createError && <p className="text-xs text-red-400">{createError}</p>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-700 hover:bg-green-600 flex-1"
                      disabled={!createName || createMutation.isPending}
                      onMouseDown={() => createMutation.mutate()}
                    >
                      Tạo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#1e3d23] text-[#6b7280]"
                      onMouseDown={() => {
                        setShowCreate(false)
                        setCreateError('')
                      }}
                    >
                      Huỷ
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Chạy typecheck để xác nhận không có lỗi TypeScript**

```bash
npm run typecheck
```

Expected: No errors. Nếu có lỗi `searchByPhone` không tồn tại trên `window.api.customers`, kiểm tra Task 1 Step 3 đã được thực hiện chưa.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/CustomerSearchInput.tsx
git commit -m "feat: add CustomerSearchInput typeahead component"
```

---

## Task 3: Invoice.tsx — swap block cũ

**Files:**
- Modify: `src/renderer/src/pages/Invoice.tsx`

- [ ] **Step 1: Thêm import CustomerSearchInput**

Mở `src/renderer/src/pages/Invoice.tsx`. Thêm import sau dòng `import OrderList from '../components/OrderList'`:

```typescript
import CustomerSearchInput from '../components/CustomerSearchInput'
```

- [ ] **Step 2: Xóa state và mutations không cần nữa**

Xóa các dòng sau (không còn cần vì CustomerSearchInput tự quản lý):

```typescript
const [phoneInput, setPhoneInput] = useState('')
const [searchState, setSearchState] = useState<'idle' | 'found' | 'notfound'>('idle')
const [quickName, setQuickName] = useState('')
```

Xóa mutation `findCustomerMutation` (toàn bộ block `const findCustomerMutation = useMutation({...})`).

Xóa mutation `createCustomerMutation` (toàn bộ block `const createCustomerMutation = useMutation({...})`).

- [ ] **Step 3: Xóa block JSX customer lookup cũ, thêm CustomerSearchInput**

Tìm block JSX bắt đầu bằng:

```tsx
<div className="col-span-full bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-2">
  <h3 className="font-semibold text-xs text-[#6b7280] uppercase tracking-widest mb-3">KHÁCH HÀNG (tùy chọn)</h3>

  {searchState === 'idle' && ( ... )}
  {searchState === 'found' && selectedCustomer && ( ... )}
  {searchState === 'notfound' && ( ... )}
</div>
```

Thay toàn bộ block đó bằng:

```tsx
<div className="col-span-full bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-2">
  <h3 className="font-semibold text-xs text-[#6b7280] uppercase tracking-widest mb-3">KHÁCH HÀNG (tùy chọn)</h3>
  <CustomerSearchInput onSelect={setSelectedCustomer} />
</div>
```

- [ ] **Step 4: Xóa block hiển thị điểm nếu đã chọn khách (đã được CustomerSearchInput xử lý)**

Kiểm tra xem trong Invoice.tsx còn block nào hiện thông tin điểm/khách dựa vào `selectedCustomer` (ngoài `invoiceInput`) không. Block điểm trong invoiceInput giữ nguyên vì `selectedCustomer` state vẫn còn. Chỉ xóa những gì render UI liên quan đến `searchState`.

- [ ] **Step 5: Chạy typecheck**

```bash
npm run typecheck
```

Expected: No errors. Fix nếu có lỗi về `searchState`, `phoneInput`, `quickName` còn sót.

- [ ] **Step 6: Chạy toàn bộ test suite**

```bash
npm test
```

Expected: 47 tests passed (hoặc nhiều hơn nếu có test mới).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Invoice.tsx
git commit -m "feat: replace customer lookup with CustomerSearchInput typeahead"
```

---

## Task 4: Smoke test

- [ ] **Step 1: Chạy app**

```bash
npm run dev
```

- [ ] **Step 2: Kiểm tra luồng tìm khách có sẵn**

1. Mở bàn → tạo session → vào Invoice
2. Gõ 1-2 số → không có dropdown (< 3 ký tự)
3. Gõ ≥3 số khớp với khách trong DB → dropdown hiện danh sách
4. Click chọn → hiện card "✓ Tên | SĐT | X điểm"
5. Nhấn ✕ Xóa → quay về ô input trống

- [ ] **Step 3: Kiểm tra tạo mới nhanh**

1. Gõ số điện thoại mới không có trong DB (≥3 số)
2. Dropdown hiện `+ Thêm "XXXX"`
3. Click → form nhập tên hiện ra
4. Nhập tên → Enter hoặc nút Tạo
5. Khách được tạo và chọn tự động

- [ ] **Step 4: Commit cuối nếu cần**

Nếu có fix nhỏ trong quá trình smoke test:

```bash
git add -A
git commit -m "fix: customer search typeahead smoke test fixes"
```
