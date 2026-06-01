# Invoice Staff Tracking Design

**Date:** 2026-05-31  
**Goal:** Lưu nhân viên hoàn thành hoá đơn vào `completed_by`, lọc danh sách hoá đơn theo nhân viên (staff chỉ thấy của mình, owner thấy tất cả + lọc được).

---

## Data Model

### `cloud_invoices` — thêm cột
```sql
completed_by VARCHAR(50) NULL
```
Lưu `username` của người tạo hoá đơn. NULL = hoá đơn cũ trước khi tính năng này.

### `authStore` — thêm field
```typescript
username: string   // staff: username nhân viên; owner: '' (trống)
```

---

## Auth Changes

### `auth.ts` — lưu username khi login

- Owner login: `authStore.set('username', '')` (không cần thiết, để rỗng)
- Staff login: `authStore.set('username', username)` — username từ form login

### `authStore.ts`
Thêm `username: string` vào `AuthStoreType`.

Thêm helper: `export const getUsername = (): string => authStore.get('username') ?? ''`

### `auth:getSession` — trả thêm `username`

Return: `{ role, agentId, allowedScreens, username }`

---

## Invoice Changes

### `invoices.ts` — `createInvoice`

Khi INSERT invoice, thêm `completed_by = getUsername()`.

### `invoices.ts` — `getInvoiceList`

- Thêm `i.completed_by` vào SELECT
- Thêm param `staffUsername?: string` vào `InvoiceListInput`
- WHERE thêm: `AND ($N::text IS NULL OR i.completed_by = $N)`
- Nếu role = 'staff': handler tự động set `staffUsername = getUsername()` (bỏ qua input từ client để đảm bảo an toàn)
- Nếu role = 'owner': dùng `staffUsername` từ input (có thể null để xem tất cả)

**Lưu ý bảo mật:** Handler tự kiểm tra role, staff không thể tự truyền `staffUsername = null` để xem invoice của người khác.

---

## IPC / Preload Changes

### `invoices:getList` input
```typescript
{ fromDate?, toDate?, page, pageSize, staffUsername?: string }
```

### `auth:getSession` + `auth:login` return
```typescript
{ role: string; agentId: string | null; allowedScreens: string[]; username: string }
```

---

## Type Changes

### `InvoiceListRow`
```typescript
completed_by: string | null
```

### App.tsx
Truyền `isOwner` (đã có từ `allowedScreens.length === 0`) vào `<InvoiceListPage isOwner={isOwner} />` để page biết có cần hiện dropdown filter hay không.

---

## UI Changes — `InvoiceList.tsx`

### Cột "Nhân viên" trong bảng
Thêm cột hiển thị `completed_by` (hoặc "—" nếu null).

### Filter dropdown (chỉ hiện với owner)
- `window.api.staff.getAll()` để lấy danh sách nhân viên
- Dropdown chọn "Tất cả" hoặc tên nhân viên cụ thể
- Khi lọc, truyền `staffUsername` vào `getList`

---

## Files Changed

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm `completed_by` vào invoices |
| `src/main/lib/authStore.ts` | Thêm `username`, helper `getUsername()` |
| `src/main/handlers/auth.ts` | Lưu username khi login, trả username từ getSession |
| `src/main/handlers/invoices.ts` | completed_by khi tạo, filter trong getList |
| `src/renderer/src/types.ts` | `InvoiceListRow` thêm completed_by |
| `src/preload/index.ts` | getList input + auth return types |
| `src/renderer/src/electron.d.ts` | Cập nhật types |
| `src/renderer/src/App.tsx` | Lưu username từ session |
| `src/renderer/src/pages/InvoiceList.tsx` | Cột nhân viên + dropdown filter |

---

## Out of Scope
- Thống kê doanh thu theo nhân viên (Reports page)
- Chỉnh sửa completed_by sau khi tạo
