# Invoice Payment Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm lựa chọn phương thức thanh toán (Tiền mặt / Chuyển khoản + QR VietQR) vào màn hình Invoice.

**Architecture:** Flow 2 bước trên Invoice page: chọn phương thức → action tương ứng. QR VietQR gen động từ URL công khai, không cần backend. `payment_method` lưu vào DB cùng invoice.

**Tech Stack:** React 18, TypeScript, VietQR image API (img.vietqr.io), node-thermal-printer, PostgreSQL (cloud_invoices table)

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm cột `payment_method` vào `cloud_invoices` |
| `src/renderer/src/types.ts` | Thêm `paymentMethod` vào `InvoiceCreateInput`; `payment_method` vào `Invoice` |
| `src/renderer/src/pages/Settings.tsx` | Thêm section "Tài khoản ngân hàng" với 3 fields |
| `src/renderer/src/pages/Invoice.tsx` | Flow 2 bước + QR display component inline |
| `src/main/handlers/invoices.ts` | Thêm `payment_method` vào INSERT query |
| `src/main/handlers/printer.ts` | In QR + dòng "Phuong thuc: Chuyen khoan" khi bank_transfer |
| `tests/unit/vietqr.test.ts` | Unit test cho hàm gen URL VietQR |

---

## Task 1: DB migration — thêm cột payment_method

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Thêm cột vào schema.sql**

Mở `db/schema.sql`, tìm block `CREATE TABLE IF NOT EXISTS cloud_invoices` (hoặc `invoices`), thêm cột sau `points_earned`:

```sql
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
```

Nếu DB đã tồn tại (production), cần chạy migration thủ công trên máy có DB:

```sql
ALTER TABLE cloud_invoices
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';
```

- [ ] **Step 2: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add payment_method column to cloud_invoices"
```

---

## Task 2: Types — thêm paymentMethod

**Files:**
- Modify: `src/renderer/src/types.ts`

- [ ] **Step 1: Thêm vào interface Invoice**

Tìm `interface Invoice {`, thêm field sau `points_earned`:

```typescript
payment_method: 'cash' | 'bank_transfer'
```

- [ ] **Step 2: Thêm vào interface InvoiceCreateInput**

Tìm `interface InvoiceCreateInput {`, thêm field:

```typescript
paymentMethod: 'cash' | 'bank_transfer'
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types.ts
git commit -m "feat: add paymentMethod to Invoice types"
```

---

## Task 3: Settings — thêm cấu hình ngân hàng

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Thêm state cho 3 trường ngân hàng**

Trong `SettingsPage`, sau dòng `const [saved, setSaved] = useState(false)`, thêm:

```typescript
const [bankId, setBankId] = useState('')
const [bankAccount, setBankAccount] = useState('')
const [bankAccountName, setBankAccountName] = useState('')
```

- [ ] **Step 2: Load giá trị từ settings trong useEffect đầu tiên**

Trong `useEffect(() => { ... }, [settings])`, thêm sau `setPrinterPath(...)`:

```typescript
setBankId(getVal('bank_id'))
setBankAccount(getVal('bank_account'))
setBankAccountName(getVal('bank_account_name'))
```

- [ ] **Step 3: Lưu 3 trường ngân hàng trong saveMutation**

Trong `saveMutation.mutationFn`, thêm vào mảng `pairs`:

```typescript
['bank_id', bankId],
['bank_account', bankAccount],
['bank_account_name', bankAccountName],
```

- [ ] **Step 4: Thêm section UI ngân hàng**

Thêm section mới sau section "Máy in nhiệt", trước section "Tích điểm":

```tsx
<section className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-5 space-y-4">
  <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">Tài khoản ngân hàng</h2>
  <div>
    <Label className="text-[#6b7280] text-xs">Mã ngân hàng (VietQR)</Label>
    <Input
      className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1 focus:border-[#d4af37]"
      value={bankId}
      onChange={(e) => setBankId(e.target.value.toUpperCase())}
      placeholder="VD: MB, VCB, TCB, ACB, TPB"
    />
    <p className="text-xs text-[#6b7280] mt-1">
      Tra cứu mã tại: img.vietqr.io/danh-sach-ngan-hang
    </p>
  </div>
  <div>
    <Label className="text-[#6b7280] text-xs">Số tài khoản</Label>
    <Input
      className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1 focus:border-[#d4af37]"
      value={bankAccount}
      onChange={(e) => setBankAccount(e.target.value)}
      placeholder="VD: 1234567890"
    />
  </div>
  <div>
    <Label className="text-[#6b7280] text-xs">Tên chủ tài khoản</Label>
    <Input
      className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1 focus:border-[#d4af37]"
      value={bankAccountName}
      onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
      placeholder="VD: NGUYEN VAN A"
    />
  </div>
</section>
```

- [ ] **Step 5: Chạy app, vào Settings, kiểm tra section mới hiển thị và lưu được**

```bash
npm run dev
```

Nhập thông tin ngân hàng → Lưu → reload lại Settings → kiểm tra giá trị còn đó.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: add bank account settings for VietQR"
```

---

## Task 4: Hàm gen URL VietQR + unit test

**Files:**
- Create: `src/renderer/src/lib/vietqr.ts`
- Create: `tests/unit/vietqr.test.ts`

- [ ] **Step 1: Viết failing test trước**

Tạo file `tests/unit/vietqr.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildVietQRUrl, isBankConfigured } from '../../src/renderer/src/lib/vietqr'

describe('buildVietQRUrl', () => {
  it('builds correct VietQR URL', () => {
    const url = buildVietQRUrl({
      bankId: 'MB',
      bankAccount: '1234567890',
      bankAccountName: 'NGUYEN VAN A',
      amount: 150000,
      invoiceNumber: 'HD00123',
    })
    expect(url).toBe(
      'https://img.vietqr.io/image/MB-1234567890-compact2.png' +
      '?amount=150000&addInfo=HD00123&accountName=NGUYEN%20VAN%20A'
    )
  })

  it('encodes special characters in accountName', () => {
    const url = buildVietQRUrl({
      bankId: 'VCB',
      bankAccount: '9876543210',
      bankAccountName: 'TRAN THI B',
      amount: 200000,
      invoiceNumber: 'HD00456',
    })
    expect(url).toContain('accountName=TRAN%20THI%20B')
  })
})

describe('isBankConfigured', () => {
  it('returns true when all 3 fields are set', () => {
    expect(isBankConfigured('MB', '1234567890', 'NGUYEN VAN A')).toBe(true)
  })

  it('returns false when any field is empty', () => {
    expect(isBankConfigured('', '1234567890', 'NGUYEN VAN A')).toBe(false)
    expect(isBankConfigured('MB', '', 'NGUYEN VAN A')).toBe(false)
    expect(isBankConfigured('MB', '1234567890', '')).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy test để confirm fail**

```bash
npm test -- tests/unit/vietqr.test.ts
```

Expected: FAIL — "Cannot find module '../../src/renderer/src/lib/vietqr'"

- [ ] **Step 3: Tạo file implementation**

Tạo `src/renderer/src/lib/vietqr.ts`:

```typescript
export interface VietQRParams {
  bankId: string
  bankAccount: string
  bankAccountName: string
  amount: number
  invoiceNumber: string
}

export function buildVietQRUrl(params: VietQRParams): string {
  const { bankId, bankAccount, bankAccountName, amount, invoiceNumber } = params
  const base = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact2.png`
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: invoiceNumber,
    accountName: bankAccountName,
  })
  return `${base}?${query.toString()}`
}

export function isBankConfigured(bankId: string, bankAccount: string, bankAccountName: string): boolean {
  return bankId.trim() !== '' && bankAccount.trim() !== '' && bankAccountName.trim() !== ''
}
```

- [ ] **Step 4: Chạy test để confirm pass**

```bash
npm test -- tests/unit/vietqr.test.ts
```

Expected: PASS — 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/vietqr.ts tests/unit/vietqr.test.ts
git commit -m "feat: add VietQR URL builder with tests"
```

---

## Task 5: Invoice page — flow 2 bước + QR display

**Files:**
- Modify: `src/renderer/src/pages/Invoice.tsx`

- [ ] **Step 1: Thêm imports và state**

Thêm import vào đầu file (sau các import hiện có):

```typescript
import { buildVietQRUrl, isBankConfigured } from '../lib/vietqr'
```

Thêm state mới vào trong component (sau `const [pointsError, setPointsError] = useState('')`):

```typescript
type PaymentStep = 'select' | 'cash' | 'bank'
const [paymentStep, setPaymentStep] = useState<PaymentStep>('select')
const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash')
```

- [ ] **Step 2: Đọc bank settings từ settings query**

Sau các dòng `const printerPath = ...`, thêm:

```typescript
const bankId = settings?.find((s: { key: string }) => s.key === 'bank_id')?.value ?? ''
const bankAccount = settings?.find((s: { key: string }) => s.key === 'bank_account')?.value ?? ''
const bankAccountName = settings?.find((s: { key: string }) => s.key === 'bank_account_name')?.value ?? ''
const bankConfigured = isBankConfigured(bankId, bankAccount, bankAccountName)
```

- [ ] **Step 3: Cập nhật invoiceInput để include paymentMethod**

Trong object `invoiceInput`, thêm field:

```typescript
paymentMethod,
```

- [ ] **Step 4: Thêm invoiceNumber thực từ DB hoặc dùng placeholder**

Dòng hiện tại `const invoiceNumber = '-----'` giữ nguyên — invoiceNumber thực sẽ được gán sau khi `invoices:create` trả về (đã có trong `checkoutMutation`).

- [ ] **Step 5: Cập nhật checkoutMutation nhận paymentMethod**

`checkoutMutation` hiện nhận `print: boolean`. Đổi thành nhận object:

```typescript
const checkoutMutation = useMutation({
  mutationFn: async ({ print }: { print: boolean }) => {
    await api().sessions.close(session.id, playAmount)
    const invoice = await api().invoices.create(invoiceInput)
    if (print && invoice) {
      await api().invoices.print(invoice.id, invoiceInput, invoice.invoice_number, printerPath)
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['sessions'] })
    onComplete()
  },
})
```

- [ ] **Step 6: Thay thế 2 nút cũ bằng flow 2 bước**

Tìm block sau `<InvoicePreview ...`:

```tsx
<div className="flex gap-3 mt-6">
  <Button ... onClick={() => checkoutMutation.mutate(true)}>In hóa đơn</Button>
  <Button ... onClick={() => checkoutMutation.mutate(false)}>Lưu không in</Button>
</div>
```

Thay toàn bộ block đó bằng:

```tsx
<div className="mt-6">
  {paymentStep === 'select' && (
    <div className="space-y-3">
      <p className="text-xs text-[#6b7280] uppercase tracking-widest text-center mb-2">Phương thức thanh toán</p>
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-[#162a1a] border border-[#1e3d23] text-white hover:bg-[#1e3d23] font-bold py-6 text-base"
          onClick={() => { setPaymentMethod('cash'); setPaymentStep('cash') }}
        >
          💵 Tiền mặt
        </Button>
        <Button
          className="flex-1 bg-[#162a1a] border border-[#1e3d23] text-white hover:bg-[#1e3d23] font-bold py-6 text-base disabled:opacity-40"
          disabled={!bankConfigured}
          title={!bankConfigured ? 'Chưa cấu hình tài khoản ngân hàng trong Cài đặt' : undefined}
          onClick={() => { setPaymentMethod('bank_transfer'); setPaymentStep('bank') }}
        >
          🏦 Chuyển khoản
        </Button>
      </div>
      {!bankConfigured && (
        <p className="text-xs text-[#6b7280] text-center">
          Vào Cài đặt → Tài khoản ngân hàng để bật thanh toán chuyển khoản
        </p>
      )}
    </div>
  )}

  {paymentStep === 'cash' && (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400"
          disabled={checkoutMutation.isPending || !!pointsError}
          onClick={() => checkoutMutation.mutate({ print: true })}
        >
          In hóa đơn
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-[#d4af37] text-[#d4af37] hover:bg-[#162a1a]"
          disabled={checkoutMutation.isPending || !!pointsError}
          onClick={() => checkoutMutation.mutate({ print: false })}
        >
          Lưu không in
        </Button>
      </div>
      <button
        className="w-full text-xs text-[#6b7280] hover:text-white text-center mt-1"
        onClick={() => setPaymentStep('select')}
      >
        ← Quay lại chọn phương thức
      </button>
    </div>
  )}

  {paymentStep === 'bank' && (
    <div className="space-y-4">
      <div className="bg-[#0a1a0d] border border-[#1e3d23] rounded-xl p-4 text-center">
        <img
          src={buildVietQRUrl({
            bankId,
            bankAccount,
            bankAccountName,
            amount: finalAmount,
            invoiceNumber: `HD${String(session.id).padStart(5, '0')}`,
          })}
          alt="QR Chuyển khoản"
          className="mx-auto w-48 h-48 rounded-lg"
        />
        <p className="text-sm text-[#6b7280] mt-2">{bankId} • {bankAccount}</p>
        <p className="text-sm text-white font-medium">{bankAccountName}</p>
        <p className="text-[#d4af37] font-bold text-lg mt-1">{formatCurrency(finalAmount)}</p>
      </div>
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400"
          disabled={checkoutMutation.isPending || !!pointsError}
          onClick={() => checkoutMutation.mutate({ print: true })}
        >
          Đã nhận tiền + In HĐ
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-[#d4af37] text-[#d4af37] hover:bg-[#162a1a]"
          disabled={checkoutMutation.isPending || !!pointsError}
          onClick={() => checkoutMutation.mutate({ print: false })}
        >
          Đã nhận tiền
        </Button>
      </div>
      <button
        className="w-full text-xs text-[#6b7280] hover:text-white text-center"
        onClick={() => setPaymentStep('select')}
      >
        ← Quay lại chọn phương thức
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 7: Chạy app, test flow**

```bash
npm run dev
```

Kiểm tra:
- Mở session bất kỳ → vào Invoice
- Bước 1: thấy 2 nút Tiền mặt / Chuyển khoản
- Chọn Tiền mặt → thấy nút In/Lưu + nút Quay lại
- Quay lại → chọn Chuyển khoản (nếu chưa cấu hình bank → nút disabled + tooltip)
- Vào Settings cấu hình bank → quay lại Invoice → Chuyển khoản enabled
- Chọn Chuyển khoản → thấy QR hiển thị đúng số tiền

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Invoice.tsx
git commit -m "feat: add 2-step payment flow with VietQR display"
```

---

## Task 6: Invoice handler — lưu payment_method vào DB

**Files:**
- Modify: `src/main/handlers/invoices.ts`

- [ ] **Step 1: Cập nhật INSERT query**

Trong hàm `createInvoice`, tìm câu query INSERT:

```typescript
const invoice = await queryOne<Invoice>(
  `INSERT INTO cloud_invoices
     (session_id, invoice_number, play_amount, items_amount, total_amount,
      discount, points_redeemed, discount_from_points, final_amount, points_earned, agent_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
  [
    input.sessionId, invoiceNumber,
    input.playAmount, input.itemsAmount,
    input.playAmount + input.itemsAmount,
    input.discount, input.pointsRedeemed, input.discountFromPoints,
    input.finalAmount, input.pointsEarned, agentId,
  ]
)
```

Thay bằng:

```typescript
const invoice = await queryOne<Invoice>(
  `INSERT INTO cloud_invoices
     (session_id, invoice_number, play_amount, items_amount, total_amount,
      discount, points_redeemed, discount_from_points, final_amount, points_earned,
      payment_method, agent_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
  [
    input.sessionId, invoiceNumber,
    input.playAmount, input.itemsAmount,
    input.playAmount + input.itemsAmount,
    input.discount, input.pointsRedeemed, input.discountFromPoints,
    input.finalAmount, input.pointsEarned,
    input.paymentMethod ?? 'cash', agentId,
  ]
)
```

- [ ] **Step 2: Commit**

```bash
git add src/main/handlers/invoices.ts
git commit -m "feat: persist payment_method in invoice insert"
```

---

## Task 7: Printer — in QR khi chuyển khoản

**Files:**
- Modify: `src/main/handlers/printer.ts`

- [ ] **Step 1: Thêm in phương thức thanh toán và QR**

Trong `printInvoice`, tìm block in tổng cộng rồi sau `printer.setTextNormal()` (sau block tổng cộng), thêm dòng in phương thức thanh toán:

```typescript
// Thêm sau block "TONG CONG"
printer.drawLine()
printer.alignLeft()
if (input.paymentMethod === 'bank_transfer') {
  printer.println('Thanh toan: Chuyen khoan')
} else {
  printer.println('Thanh toan: Tien mat')
}
```

- [ ] **Step 2: Thêm in QR khi bank_transfer**

Sau đoạn in phương thức, thêm in QR nếu chuyển khoản (cần settings ngân hàng truyền vào). Trước tiên, cập nhật interface `InvoiceCreateInput` trong `types.ts` để include bank settings (đã có `paymentMethod` từ Task 2, giờ thêm bank fields vào `InvoiceCreateInput`):

Mở `src/renderer/src/types.ts`, thêm vào `InvoiceCreateInput`:

```typescript
bankId?: string
bankAccount?: string
bankAccountName?: string
```

- [ ] **Step 3: Truyền bank info từ Invoice.tsx vào invoiceInput**

Trong `src/renderer/src/pages/Invoice.tsx`, trong object `invoiceInput`, thêm:

```typescript
bankId,
bankAccount,
bankAccountName,
```

- [ ] **Step 4: In QR trong printer.ts**

Trong `printInvoice`, sau block in phương thức vừa thêm ở Step 1, thêm:

```typescript
if (input.paymentMethod === 'bank_transfer' && input.bankId && input.bankAccount) {
  const qrUrl = `https://img.vietqr.io/image/${input.bankId}-${input.bankAccount}-compact2.png` +
    `?amount=${input.finalAmount}&addInfo=HD${String(input.sessionId).padStart(5,'0')}` +
    `&accountName=${encodeURIComponent(input.bankAccountName ?? '')}`
  printer.alignCenter()
  printer.printQR(qrUrl, { cellSize: 6, correction: 'M', model: 2 })
  printer.println(`${input.bankId} - ${input.bankAccount}`)
  printer.setTextNormal()
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/printer.ts src/renderer/src/types.ts src/renderer/src/pages/Invoice.tsx
git commit -m "feat: print payment method and QR on thermal receipt"
```

---

## Task 8: Chạy full test suite + smoke test

- [ ] **Step 1: Chạy toàn bộ unit tests**

```bash
npm test
```

Expected: Tất cả pass, bao gồm `vietqr.test.ts` mới và các test cũ không bị break.

- [ ] **Step 2: Smoke test flow hoàn chỉnh**

```bash
npm run dev
```

Kiểm tra end-to-end:
1. Vào Settings → nhập bank info (bank_id: `MB`, bank_account: `0123456789`, bank_account_name: `TEST SHOP`) → Lưu
2. Mở bàn → tạo session → vào Invoice
3. Chọn "Tiền mặt" → bấm "Lưu không in" → kiểm tra session đóng, bàn về idle
4. Mở bàn mới → tạo session → vào Invoice
5. Chọn "Chuyển khoản" → QR hiển thị đúng ngân hàng + số tiền → bấm "Đã nhận tiền"
6. Vào InvoiceList → kiểm tra 2 hóa đơn vừa tạo

- [ ] **Step 3: Commit cuối**

```bash
git add -A
git commit -m "feat: complete payment method integration (cash + VietQR)"
```
