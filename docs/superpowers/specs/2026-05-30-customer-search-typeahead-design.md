# Customer Search Typeahead Design

**Date:** 2026-05-30
**Scope:** Thay thế ô tìm kiếm khách hàng trong Invoice page bằng typeahead/autocomplete với dropdown kết quả, debounce server-side search, và tạo mới nhanh inline.

---

## 1. Vấn đề hiện tại

Invoice page yêu cầu cashier nhập đầy đủ số điện thoại rồi nhấn "Tìm" mới ra kết quả. UX chậm và không tự nhiên so với việc gõ vài số đầu và chọn từ danh sách.

---

## 2. Giải pháp

Typeahead search với server-side query (debounce 300ms). Gõ từ 3 ký tự trở lên → query DB theo prefix SĐT → dropdown kết quả scrollable. Nếu không có kết quả → option tạo mới nhanh inline.

---

## 3. Backend: IPC handler mới

**File:** `src/main/handlers/customers.ts`

Thêm function và handler:

```typescript
export async function searchCustomersByPhone(prefix: string): Promise<Customer[]> {
  const agentId = getAgentId()
  return query<Customer>(
    'SELECT * FROM cloud_customers WHERE phone LIKE $1 AND agent_id = $2 ORDER BY total_spent DESC',
    [prefix + '%', agentId]
  )
}
// register: ipcMain.handle('customers:searchByPhone', (_e, prefix) => searchCustomersByPhone(prefix))
```

**File:** `src/preload/index.ts` — thêm vào `customers`:
```typescript
searchByPhone: (prefix: string): Promise<Customer[]> =>
  ipcRenderer.invoke('customers:searchByPhone', prefix),
```

---

## 4. Component: `CustomerSearchInput`

**File:** `src/renderer/src/components/CustomerSearchInput.tsx`

### Props
```typescript
interface Props {
  onSelect: (customer: Customer | null) => void
}
```

### Internal state
| State | Type | Mô tả |
|-------|------|-------|
| `input` | `string` | Text đang gõ |
| `results` | `Customer[]` | Kết quả từ query |
| `isOpen` | `boolean` | Dropdown mở/đóng |
| `selected` | `Customer \| null` | Khách đã chọn |
| `showCreate` | `boolean` | Đang nhập tên để tạo mới |
| `createName` | `string` | Tên nhập khi tạo mới |
| `isLoading` | `boolean` | Đang query |

### Luồng UX

**Chưa chọn khách:**
```
Input gõ < 3 ký tự  → dropdown đóng, không query
Input gõ ≥ 3 ký tự → debounce 300ms → searchByPhone(input)
                   → có kết quả: hiện dropdown list
                   → không kết quả: hiện "+ Thêm XXXX" cuối dropdown
```

**Dropdown:**
- Mỗi item: tên + SĐT + số điểm
- Scroll nếu nhiều kết quả
- Click item → chọn khách, đóng dropdown, gọi `onSelect(customer)`
- Click ngoài (`onBlur` delay 150ms) hoặc Escape → đóng dropdown
- Item "+ Thêm XXXX": click → `showCreate = true`

**Tạo mới nhanh:**
- `showCreate = true`: input thêm xuất hiện để nhập tên
- Nhấn Enter hoặc nút "Tạo" → `customers:create({ name, phone: input, email: null, notes: null })`
- Thành công → tự động chọn khách vừa tạo, gọi `onSelect(newCustomer)`, đóng dropdown

**Đã chọn khách:**
```
Hiện card: ✓ Tên | SĐT | X điểm | [✕ Xóa]
Nút ✕ → selected = null, input = '', onSelect(null)
```

---

## 5. Invoice.tsx — thay block customer lookup

**Xóa:**
- State: `phoneInput`, `searchState`, `quickName`
- Mutations: `findCustomerMutation`, `createCustomerMutation`
- Toàn bộ JSX block customer lookup (idle/found/notfound)

**Thêm:**
```tsx
import CustomerSearchInput from '../components/CustomerSearchInput'

// trong JSX thay block cũ:
<CustomerSearchInput onSelect={setSelectedCustomer} />
```

`selectedCustomer` state giữ nguyên. Mọi logic tính điểm/hiển thị phụ thuộc `selectedCustomer` không đổi.

---

## 6. Edge cases

| Tình huống | Xử lý |
|-----------|-------|
| Gõ < 3 ký tự | Không query, dropdown đóng |
| Network/IPC lỗi | Hiện "Không tìm được, thử lại" |
| Đang tạo mới, nhấn Escape | Hủy tạo, quay về dropdown |
| Tạo mới thất bại | Hiện lỗi inline, giữ nguyên form |

---

## 7. Files thay đổi

| File | Thay đổi |
|------|---------|
| `src/main/handlers/customers.ts` | Thêm `searchCustomersByPhone` + handler |
| `src/preload/index.ts` | Expose `customers:searchByPhone` |
| `src/renderer/src/components/CustomerSearchInput.tsx` | Component mới |
| `src/renderer/src/pages/Invoice.tsx` | Thay block customer lookup bằng `<CustomerSearchInput>` |

---

## 8. Out of scope

- Search theo tên khách hàng (chỉ theo SĐT)
- Highlight match trong kết quả
- Keyboard navigation trong dropdown (arrow keys)
