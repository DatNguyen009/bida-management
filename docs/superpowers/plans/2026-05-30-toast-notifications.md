# Toast Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm toast notifications (top-right) cho các hành động thành công/thất bại trong app dùng thư viện Sonner.

**Architecture:** Cài sonner, thêm `<Toaster>` một lần vào App.tsx, sau đó gọi `toast.success/error` trong `onSuccess`/`onError` của từng mutation và `catch` block của Login.

**Tech Stack:** Sonner, React 18, TanStack Query mutations

---

## File Map

| File | Thay đổi |
|------|---------|
| `package.json` | Thêm `sonner` |
| `src/renderer/src/App.tsx` | Thêm `<Toaster>` |
| `src/renderer/src/pages/LoginPage.tsx` | Toast success/error thay setError |
| `src/renderer/src/pages/Invoice.tsx` | Toast trong checkoutMutation |
| `src/renderer/src/pages/Products.tsx` | Toast cho 4 mutations |
| `src/renderer/src/pages/Customers.tsx` | Toast cho 2 mutations |
| `src/renderer/src/pages/Settings.tsx` | Toast thay setSaved |

---

## Task 1: Cài sonner + setup Toaster

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Cài sonner**

```bash
npm install sonner
```

Expected: `sonner` xuất hiện trong `dependencies` của `package.json`.

- [ ] **Step 2: Thêm Toaster vào App.tsx**

Mở `src/renderer/src/App.tsx`. Thêm import:

```typescript
import { Toaster } from 'sonner'
```

Trong JSX return, tìm `<div` root element (dòng đầu tiên của return), thêm `<Toaster>` vào bên trong trước tất cả các component khác:

```tsx
return (
  <div ...>
    <Toaster position="top-right" richColors theme="dark" />
    {/* ... existing JSX ... */}
  </div>
)
```

- [ ] **Step 3: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/renderer/src/App.tsx
git commit -m "feat: install sonner and add Toaster to App"
```

---

## Task 2: Toast cho LoginPage

**Files:**
- Modify: `src/renderer/src/pages/LoginPage.tsx`

- [ ] **Step 1: Thêm import toast**

Thêm vào đầu file:

```typescript
import { toast } from 'sonner'
```

- [ ] **Step 2: Cập nhật handleSubmit — thêm toast, xoá setError**

Tìm function `handleSubmit`, thay toàn bộ bằng:

```typescript
async function handleSubmit(e: FormEvent) {
  e.preventDefault()
  setLoading(true)
  try {
    await window.api.auth.login(username, password)
    toast.success('Đăng nhập thành công')
    onLogin()
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại. Kiểm tra lại thông tin.')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 3: Xoá state error và JSX inline error**

Xoá dòng:
```typescript
const [error, setError] = useState('')
```

Xoá block JSX:
```tsx
{error && (
  <div className="bg-[#2d1515] border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
    {error}
  </div>
)}
```

- [ ] **Step 4: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/LoginPage.tsx
git commit -m "feat: add toast notifications to Login"
```

---

## Task 3: Toast cho Invoice

**Files:**
- Modify: `src/renderer/src/pages/Invoice.tsx`

- [ ] **Step 1: Thêm import toast**

Thêm vào đầu file:

```typescript
import { toast } from 'sonner'
```

- [ ] **Step 2: Cập nhật checkoutMutation để trả về invoice + print**

Tìm `checkoutMutation`, thay toàn bộ bằng:

```typescript
const checkoutMutation = useMutation({
  mutationFn: async ({ print }: { print: boolean }) => {
    await api().sessions.close(session.id, playAmount)
    const invoice = await api().invoices.create(invoiceInput)
    if (print && invoice) {
      await api().invoices.print(invoice.id, invoiceInput, invoice.invoice_number, printerPath)
    }
    return { invoice, print }
  },
  onSuccess: ({ invoice, print }) => {
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['sessions'] })
    if (print) {
      toast.success(`Đã in hoá đơn #${invoice?.invoice_number ?? ''}`)
    } else {
      toast.success(`Đã lưu hoá đơn #${invoice?.invoice_number ?? ''}`)
    }
    onComplete()
  },
  onError: () => {
    toast.error('Lưu hoá đơn thất bại')
  },
})
```

- [ ] **Step 3: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/Invoice.tsx
git commit -m "feat: add toast notifications to Invoice checkout"
```

---

## Task 4: Toast cho Products

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`

- [ ] **Step 1: Thêm import toast**

Thêm vào đầu file:

```typescript
import { toast } from 'sonner'
```

- [ ] **Step 2: Thêm toast vào createMutation**

Tìm `createMutation`, thêm `onError` và toast vào `onSuccess`:

```typescript
const createMutation = useMutation({
  mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'] }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    setMode(null)
    toast.success('Đã tạo sản phẩm')
  },
  onError: () => toast.error('Tạo sản phẩm thất bại'),
})
```

- [ ] **Step 3: Thêm toast vào updateMutation**

Tìm `updateMutation`, thêm toast:

```typescript
const updateMutation = useMutation({
  mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'] }) : Promise.resolve(null),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    setMode(null)
    toast.success('Đã cập nhật sản phẩm')
  },
  onError: () => toast.error('Cập nhật sản phẩm thất bại'),
})
```

- [ ] **Step 4: Thêm toast vào stockMutation**

Tìm `stockMutation`, thêm toast:

```typescript
const stockMutation = useMutation({
  mutationFn: () => selected
    ? api().products.adjustStock(selected.id, 'in', stockQty, stockNote, stockCostPrice === '' ? null : stockCostPrice)
    : Promise.resolve(null),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    setMode(null)
    toast.success('Đã nhập kho')
  },
  onError: () => toast.error('Nhập kho thất bại'),
})
```

- [ ] **Step 5: Thêm toast vào deactivateMutation**

Tìm `deactivateMutation`, thêm toast:

```typescript
const deactivateMutation = useMutation({
  mutationFn: (id: number) => api().products.update(id, { is_active: false }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    toast.success('Đã xoá sản phẩm')
  },
  onError: () => toast.error('Xoá sản phẩm thất bại'),
})
```

- [ ] **Step 6: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/Products.tsx
git commit -m "feat: add toast notifications to Products"
```

---

## Task 5: Toast cho Customers

**Files:**
- Modify: `src/renderer/src/pages/Customers.tsx`

- [ ] **Step 1: Thêm import toast**

Thêm vào đầu file:

```typescript
import { toast } from 'sonner'
```

- [ ] **Step 2: Thêm toast vào createMutation**

Tìm `createMutation` trong Customers.tsx, thêm toast:

```typescript
const createMutation = useMutation({
  mutationFn: () => api().customers.create({
    name: form.name, phone: form.phone,
    email: form.email || null, notes: form.notes || null,
  }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] })
    setShowCreate(false)
    setForm({ name: '', phone: '', email: '', notes: '' })
    toast.success('Đã tạo khách hàng')
  },
  onError: () => toast.error('Tạo khách hàng thất bại'),
})
```

- [ ] **Step 3: Thêm toast vào updateMutation**

Tìm `updateMutation` trong Customers.tsx, thêm toast:

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
    toast.success('Đã cập nhật khách hàng')
  },
  onError: () => toast.error('Cập nhật khách hàng thất bại'),
})
```

- [ ] **Step 4: Chạy typecheck**

```bash
npm run typecheck:web
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/Customers.tsx
git commit -m "feat: add toast notifications to Customers"
```

---

## Task 6: Toast cho Settings

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Thêm import toast**

Thêm vào đầu file:

```typescript
import { toast } from 'sonner'
```

- [ ] **Step 2: Xoá state saved**

Xoá dòng:
```typescript
const [saved, setSaved] = useState(false)
```

- [ ] **Step 3: Cập nhật saveMutation — thay setSaved bằng toast**

Tìm `saveMutation`, thay `onSuccess`:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['settings'] })
  queryClient.invalidateQueries({ queryKey: ['loyalty', 'settings'] })
  toast.success('Đã lưu cài đặt')
},
onError: () => toast.error('Lưu cài đặt thất bại'),
```

- [ ] **Step 4: Cập nhật nút Lưu trong JSX**

Tìm nút Lưu cài đặt:

```tsx
<Button
  className={saved ? 'bg-green-700 text-white w-full font-bold' : 'bg-[#d4af37] text-[#0d1f12] font-bold w-full hover:bg-yellow-400'}
  onClick={() => saveMutation.mutate()}
  disabled={saveMutation.isPending}
>
  {saved ? '✓ Đã lưu' : saveMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
</Button>
```

Thay bằng:

```tsx
<Button
  className="bg-[#d4af37] text-[#0d1f12] font-bold w-full hover:bg-yellow-400"
  onClick={() => saveMutation.mutate()}
  disabled={saveMutation.isPending}
>
  {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
</Button>
```

- [ ] **Step 5: Chạy typecheck và toàn bộ tests**

```bash
npm run typecheck && npm test
```

Expected: No errors, 47 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: add toast notifications to Settings"
```
