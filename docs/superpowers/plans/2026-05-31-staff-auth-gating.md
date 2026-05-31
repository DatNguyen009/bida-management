# Staff Auth & Screen Gating Implementation Plan (Sub-project 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhân viên đăng nhập bằng tài khoản riêng và chỉ thấy màn hình được chủ quán cho phép.

**Architecture:** `auth:login` thử external API trước (chủ quán), nếu fail thì thử `cloud_staff` với bcrypt. authStore lưu thêm `allowedScreens[]`. App.tsx filter nav và block các page không được phép bằng `<AccessDenied />`.

**Tech Stack:** React 18, TypeScript, bcryptjs, Electron IPC, authStore (electron-store)

**Prerequisite:** Sub-project 1 hoàn thành — bảng `cloud_staff` tồn tại, bcryptjs đã cài.

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/main/lib/authStore.ts` | Thêm `allowedScreens` vào AuthStoreType |
| `src/main/handlers/auth.ts` | Fallback login qua cloud_staff, getSession cho staff |
| `src/preload/index.ts` | `allowedScreens` trong return của login/getSession |
| `src/renderer/src/electron.d.ts` | Cập nhật auth return types |
| `src/renderer/src/pages/LoginPage.tsx` | onLogin prop truyền allowedScreens |
| `src/renderer/src/App.tsx` | allowedScreens state, filter nav, page guard |
| `src/renderer/src/components/AccessDenied.tsx` | Tạo mới: component báo không có quyền |

---

## Task 1: authStore + auth.ts backend

**Files:**
- Modify: `src/main/lib/authStore.ts`
- Modify: `src/main/handlers/auth.ts`

- [ ] **Step 1: Cập nhật `src/main/lib/authStore.ts`**

Thêm `allowedScreens` vào `AuthStoreType`:

```typescript
import Store from 'electron-store'

interface AuthStoreType {
  accessToken: string
  refreshToken: string
  expiresAt: number
  role: string
  agentId: string | null
  allowedScreens: string[]
}

export const authStore = new Store<AuthStoreType>({
  name: 'auth',
  encryptionKey: 'bida-auth-v1',
})

export const getAgentId = (): string | null => authStore.get('agentId') ?? null
export const getAccessToken = (): string | null => authStore.get('accessToken') ?? null
```

- [ ] **Step 2: Cập nhật `src/main/handlers/auth.ts`**

Thêm import bcryptjs và query ở đầu file:

```typescript
import { ipcMain } from 'electron'
import { authStore, getAccessToken } from '../lib/authStore'
import { ensureDefaultCategories } from './categories'
import bcrypt from 'bcryptjs'
import { queryOne } from '../db'
```

Thay toàn bộ handler `auth:login`:

```typescript
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    // 1. Thử external API (chủ quán)
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      authStore.set('accessToken', data.accessToken)
      authStore.set('refreshToken', data.refreshToken)
      authStore.set('expiresAt', parseExpiry(data.accessToken))
      authStore.set('role', 'owner')
      authStore.set('agentId', data.agentId)
      authStore.set('allowedScreens', [])
      if (data.agentId) {
        await ensureDefaultCategories(data.agentId)
      }
      return { role: 'owner', agentId: data.agentId, allowedScreens: [] }
    } catch (ownerErr) {
      // 2. Thử cloud_staff
      const staff = await queryOne<{
        id: number; agent_id: string; password_hash: string; allowed_screens: string[]
      }>(
        'SELECT id, agent_id, password_hash, allowed_screens FROM cloud_staff WHERE username = $1 AND is_active = TRUE LIMIT 1',
        [username]
      )
      if (!staff) throw ownerErr

      const match = await bcrypt.compare(password, staff.password_hash)
      if (!match) throw ownerErr

      authStore.set('role', 'staff')
      authStore.set('agentId', staff.agent_id)
      authStore.set('allowedScreens', staff.allowed_screens)
      return { role: 'staff', agentId: staff.agent_id, allowedScreens: staff.allowed_screens }
    }
  })
```

Thay toàn bộ handler `auth:getSession`:

```typescript
  ipcMain.handle('auth:getSession', async () => {
    const role = authStore.get('role')

    // Staff session: persist qua authStore, không cần refreshToken
    if (role === 'staff') {
      const agentId = authStore.get('agentId')
      if (!agentId) return null
      return {
        role: 'staff',
        agentId,
        allowedScreens: authStore.get('allowedScreens') ?? [],
      }
    }

    // Owner session: dùng refreshToken như cũ
    const refreshToken = authStore.get('refreshToken')
    if (!refreshToken) return null

    const accessToken = getAccessToken()
    const expiresAt = authStore.get('expiresAt')

    if (accessToken && expiresAt && Date.now() < expiresAt - 60_000) {
      return { role: authStore.get('role'), agentId: authStore.get('agentId'), allowedScreens: [] }
    }

    try {
      const data = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
      authStore.set('accessToken', data.accessToken)
      authStore.set('refreshToken', data.refreshToken)
      authStore.set('expiresAt', parseExpiry(data.accessToken))
      return { role: authStore.get('role'), agentId: authStore.get('agentId'), allowedScreens: [] }
    } catch {
      authStore.clear()
      return null
    }
  })
```

- [ ] **Step 3: Chạy typecheck node**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck:node 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/lib/authStore.ts src/main/handlers/auth.ts
git commit -m "feat: staff login fallback via cloud_staff with bcrypt, staff getSession"
```

---

## Task 2: Preload + electron.d.ts + LoginPage

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`
- Modify: `src/renderer/src/pages/LoginPage.tsx`

- [ ] **Step 1: Cập nhật return type của `auth.login` và `auth.getSession` trong `src/preload/index.ts`**

Tìm block `auth:` trong preload. Cập nhật `login` và `getSession`:

```typescript
  auth: {
    login: (username: string, password: string): Promise<{ role: string; agentId: string | null; allowedScreens: string[] }> =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: (): Promise<void> =>
      ipcRenderer.invoke('auth:logout'),
    getSession: (): Promise<{ role: string; agentId: string | null; allowedScreens: string[] } | null> =>
      ipcRenderer.invoke('auth:getSession'),
  },
```

- [ ] **Step 2: Cập nhật `src/renderer/src/electron.d.ts`**

Tìm block `auth:` trong electron.d.ts. Cập nhật:

```typescript
      auth: {
        login(username: string, password: string): Promise<{ role: string; agentId: string | null; allowedScreens: string[] }>
        logout(): Promise<void>
        getSession(): Promise<{ role: string; agentId: string | null; allowedScreens: string[] } | null>
      }
```

- [ ] **Step 3: Cập nhật `src/renderer/src/pages/LoginPage.tsx`**

Thay interface Props và callback:

```typescript
interface Props {
  onLogin: (allowedScreens: string[]) => void
}

export default function LoginPage({ onLogin }: Props) {
  // ... giữ nguyên state
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await window.api.auth.login(username, password)
      toast.success('Đăng nhập thành công')
      onLogin(result.allowedScreens)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại. Kiểm tra lại thông tin.')
    } finally {
      setLoading(false)
    }
  }
  // ... giữ nguyên JSX
```

- [ ] **Step 4: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: Errors ở App.tsx (chưa update) — OK. Không có lỗi ở preload/electron.d.ts/LoginPage.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/electron.d.ts src/renderer/src/pages/LoginPage.tsx
git commit -m "feat: pass allowedScreens through auth IPC and LoginPage callback"
```

---

## Task 3: App.tsx + AccessDenied component

**Files:**
- Create: `src/renderer/src/components/AccessDenied.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Tạo `src/renderer/src/components/AccessDenied.tsx`**

```typescript
interface Props {
  onBack: () => void
}

export default function AccessDenied({ onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-4xl">🚫</div>
      <h2 className="text-lg font-semibold text-[#d4af37]">Không có quyền truy cập</h2>
      <p className="text-[#6b7280] text-sm">Bạn không được phép vào màn hình này.</p>
      <button
        onClick={onBack}
        className="bg-[#d4af37] text-[#0d1f12] font-bold px-4 py-2 rounded-lg text-sm hover:bg-yellow-400 transition-colors"
      >
        Về Dashboard
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật `src/renderer/src/App.tsx` — thêm state và helper**

Thêm import `AccessDenied`:
```typescript
import AccessDenied from './components/AccessDenied'
```

Thay `useState` cho authState:
```typescript
const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')
const [allowedScreens, setAllowedScreens] = useState<string[]>([])
const isOwner = allowedScreens.length === 0
```

- [ ] **Step 3: Cập nhật `useEffect` getSession để lưu allowedScreens**

Tìm `useEffect` với `window.api.auth.getSession()`. Thay:

```typescript
  useEffect(() => {
    window.api.auth.getSession()
      .then((session) => {
        if (session) {
          setAllowedScreens(session.allowedScreens ?? [])
          setAuthState('authenticated')
        } else {
          setAuthState('unauthenticated')
        }
      })
      .catch(() => {
        setAuthState('unauthenticated')
      })
  }, [])
```

- [ ] **Step 4: Cập nhật `<LoginPage>` callback**

Tìm:
```tsx
return <LoginPage onLogin={() => setAuthState('authenticated')} />
```
Thay bằng:
```tsx
return <LoginPage onLogin={(screens) => { setAllowedScreens(screens); setAuthState('authenticated') }} />
```

- [ ] **Step 5: Filter navItems và thêm page guard**

Sau khai báo `navItems`, thêm:

```typescript
const visibleNavItems = isOwner
  ? navItems
  : navItems.filter(({ page }) => allowedScreens.includes(page))

function canAccess(page: string): boolean {
  return isOwner || page === 'session' || page === 'invoice' || allowedScreens.includes(page)
}
```

- [ ] **Step 6: Dùng `visibleNavItems` trong nav**

Tìm `{navItems.map(({ page, label, icon }) => (` trong sidebar nav, thay thành `{visibleNavItems.map(...)}`.

- [ ] **Step 7: Thêm page guard vào render**

Tìm section render các page (khoảng sau `return (` chính). Bọc mỗi page render bằng canAccess check. Thay toàn bộ khối render pages:

```tsx
{view.page === 'dashboard' && (
  canAccess('dashboard')
    ? <DashboardPage onStartSession={...} onCheckout={handleCheckout} />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
{view.page === 'session' && <SessionPage ... />}
{view.page === 'invoice' && <InvoicePage ... />}
{view.page === 'products' && (
  canAccess('products')
    ? <ProductsPage />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
{view.page === 'stock' && (
  canAccess('stock')
    ? <StockHistoryPage />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
{view.page === 'invoices' && (
  canAccess('invoices')
    ? <InvoiceListPage />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
{view.page === 'customers' && (
  canAccess('customers')
    ? <CustomersPage />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
{view.page === 'reports' && (
  canAccess('reports')
    ? <ReportsPage />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
{view.page === 'settings' && (
  canAccess('settings')
    ? <SettingsPage />
    : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
)}
```

Lưu ý: đọc App.tsx để biết chính xác cách các props được truyền vào từng page component, đặc biệt `DashboardPage` có nhiều props.

- [ ] **Step 8: Logout — reset allowedScreens**

Tìm onClick logout button:
```typescript
await window.api.auth.logout()
setAuthState('unauthenticated')
setView({ page: 'dashboard' })
```
Thêm `setAllowedScreens([])` vào:
```typescript
await window.api.auth.logout()
setAllowedScreens([])
setAuthState('unauthenticated')
setView({ page: 'dashboard' })
```

- [ ] **Step 9: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 10: Chạy tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -12
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/components/AccessDenied.tsx src/renderer/src/App.tsx
git commit -m "feat: filter nav and guard pages based on staff allowed screens"
```
