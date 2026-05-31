# Staff Management Design (Sub-project 1)

**Date:** 2026-05-31  
**Goal:** Chủ quán tạo/sửa/xoá tài khoản nhân viên và gán quyền màn hình cho từng nhân viên, quản lý trong tab "Nhân viên" của trang Settings.

**Depends on:** Sub-project 2 (login + gating) cần hoàn thành SP1 trước.

---

## Data Model

### Bảng mới: `cloud_staff`

```sql
CREATE TABLE IF NOT EXISTS cloud_staff (
  id SERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  allowed_screens TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_staff_username UNIQUE (username, agent_id)
);
```

`allowed_screens` là mảng các page keys: `'dashboard' | 'products' | 'stock' | 'invoices' | 'customers' | 'reports' | 'settings'`

---

## Password Hashing

Dùng `bcryptjs` (pure JS, không cần native addons — an toàn trong Electron):

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

`cost factor = 10` khi hash.

---

## IPC API

### `staff` namespace

| Handler | Input | Output |
|---------|-------|--------|
| `staff:getAll` | — | `StaffMember[]` |
| `staff:create` | `{ username, password, allowedScreens }` | `StaffMember \| null` |
| `staff:update` | `id, { username?, password?, allowedScreens? }` | `StaffMember \| null` |
| `staff:delete` | `id` | `void` |

### TypeScript type

```typescript
export interface StaffMember {
  id: number
  username: string
  allowed_screens: string[]
  is_active: boolean
  created_at: string
}
```

---

## UI — Tab "Nhân viên" trong Settings

### Danh sách nhân viên

Bảng gồm: **Tên đăng nhập** | **Màn hình được phép** | **Thao tác (Sửa / Xoá)**

- Tab không được chọn: chữ trắng, nền `#1e3d23`
- Tab được chọn: nền `#d4af37`, chữ `#0d1f12`
- Badge màn hình: nền `#d4af37`, chữ đen

### Dialog tạo/sửa nhân viên

Fields:
- **Tên đăng nhập** — text input
- **Mật khẩu** — password input (khi sửa: để trống = không đổi)
- **Màn hình được phép** — 7 checkboxes (chữ đen):
  - 🏠 Dashboard (`dashboard`)
  - 📦 Sản phẩm (`products`)
  - 🏪 Kho (`stock`)
  - 🧾 Hóa đơn (`invoices`)
  - 👥 Khách hàng (`customers`)
  - 📊 Báo cáo (`reports`)
  - ⚙️ Cài đặt (`settings`)

### Error handling

| Tình huống | Xử lý |
|-----------|-------|
| Username trùng | Toast "Tên đăng nhập đã tồn tại" |
| Password trống khi tạo | Validate trước khi submit, disable nút Lưu |
| Xoá nhân viên | Confirm dialog trước khi xoá |

---

## Files Changed

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm bảng `staff` |
| `src/renderer/src/types.ts` | Thêm `StaffMember` interface |
| `src/main/handlers/staff.ts` | Tạo mới: getAll, create, update, delete |
| `src/main/index.ts` | Register staff handlers |
| `src/preload/index.ts` | Expose `staff` API |
| `src/renderer/src/electron.d.ts` | Thêm `staff` type declarations |
| `src/renderer/src/pages/Settings.tsx` | Thêm tab "Nhân viên" với CRUD UI |

---

## Out of Scope

- Reset password bởi chủ quán (update password đã cover)
- Lịch sử đăng nhập nhân viên
- Giới hạn số lượng nhân viên
- Login flow (Sub-project 2)
