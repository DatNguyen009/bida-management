# Staff Auth & Screen Gating Design (Sub-project 2)

**Date:** 2026-05-31  
**Goal:** Nhân viên đăng nhập bằng tài khoản riêng, sau khi login chỉ thấy các màn hình được chủ quán cho phép.

**Depends on:** Sub-project 1 (`cloud_staff` table phải tồn tại).

---

## Login Flow

```
User nhập username + password
  ↓
Thử external API (chủ quán)
  → Success: role='owner', agentId=..., allowedScreens=ALL
  → Fail (401/network):
      ↓
    Thử cloud_staff: SELECT WHERE username=$1 AND agent_id xác định qua...
```

### Vấn đề agent_id khi staff login

Staff login không có agentId từ external API. Giải pháp: `cloud_staff` lưu `agent_id` của chủ quán khi tạo. Khi staff login:
1. Query `cloud_staff` theo `username` (không lọc agent_id vì chưa biết)
2. Nếu tìm thấy → bcrypt.verify(password, password_hash)
3. Nếu match → trả về `{ role: 'staff', agentId: staff.agent_id, allowedScreens: staff.allowed_screens }`

**Note:** Username phải unique across tất cả agents (hoặc chấp nhận username có thể trùng giữa các quán khác nhau — OK vì login sẽ khớp với staff của quán nào có username+password đó).

---

## authStore Changes

Thêm vào `authStore`:
```typescript
allowedScreens: string[]  // [] = owner (full access), [...] = staff restricted
```

Khi chủ quán login: `allowedScreens = []` (empty = full access).
Khi nhân viên login: `allowedScreens = ['dashboard', 'invoices', ...]`.

---

## auth.ts Changes

`auth:login` handler:

```typescript
// 1. Thử external API
try {
  const data = await apiFetch('/auth/login', { ... })
  authStore.set('role', 'owner')
  authStore.set('allowedScreens', [])
  // ... như hiện tại
  return { role: 'owner', agentId: data.agentId, allowedScreens: [] }
} catch (err) {
  // 2. Thử cloud_staff
  const staff = await queryOne('SELECT * FROM cloud_staff WHERE username = $1 AND is_active = TRUE', [username])
  if (!staff) throw err  // re-throw original error
  const match = await bcrypt.compare(password, staff.password_hash)
  if (!match) throw err
  authStore.set('role', 'staff')
  authStore.set('agentId', staff.agent_id)
  authStore.set('allowedScreens', staff.allowed_screens)
  return { role: 'staff', agentId: staff.agent_id, allowedScreens: staff.allowed_screens }
}
```

---

## preload + electron.d.ts Changes

`auth:login` và `auth:getSession` trả về thêm `allowedScreens: string[]`.

---

## App.tsx Changes

### 1. Lưu allowedScreens vào state

```typescript
const [allowedScreens, setAllowedScreens] = useState<string[]>([])
const isOwner = allowedScreens.length === 0
```

### 2. Filter nav items

```typescript
const visibleNavItems = navItems.filter(({ page }) =>
  isOwner || allowedScreens.includes(page)
)
```

### 3. Page guard

Khi render page: nếu staff và page không trong allowedScreens → render `<AccessDenied />` component thay vì page thực.

```tsx
function canAccess(page: string): boolean {
  return isOwner || allowedScreens.includes(page)
}
```

### 4. `<AccessDenied />` component

Simple component: "Bạn không có quyền truy cập màn hình này." + nút về Dashboard.

---

## Files Changed

| File | Thay đổi |
|------|---------|
| `src/main/handlers/auth.ts` | Fallback login qua cloud_staff + bcrypt |
| `src/preload/index.ts` | `allowedScreens` trong login/getSession return |
| `src/renderer/src/electron.d.ts` | `allowedScreens` type |
| `src/renderer/src/App.tsx` | Filter nav + page guard |
| `src/renderer/src/components/AccessDenied.tsx` | Tạo mới: component báo không có quyền |

---

## getSession cho staff

Staff không có `refreshToken` từ external API. `auth:getSession` cần xử lý đặc biệt:

```typescript
// Trong auth:getSession handler:
const role = authStore.get('role')
if (role === 'staff') {
  // Staff session: không cần refresh, trả về từ store nếu có agentId
  const agentId = authStore.get('agentId')
  if (!agentId) return null
  return {
    role: 'staff',
    agentId,
    allowedScreens: authStore.get('allowedScreens') ?? []
  }
}
// Còn lại: flow owner như cũ (refreshToken + external API)
```

Staff session tồn tại đến khi logout hoặc tài khoản bị xoá/vô hiệu hoá.

---

## Out of Scope

- Refresh token cho staff (staff session persist qua authStore, không cần refresh)
- Audit log truy cập
- Real-time revoke quyền khi đang login
