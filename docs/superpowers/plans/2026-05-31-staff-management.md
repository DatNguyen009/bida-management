# Staff Management Implementation Plan (Sub-project 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ quán tạo/sửa/xoá tài khoản nhân viên và gán quyền màn hình trong tab "Nhân viên" của Settings.

**Architecture:** Bảng `cloud_staff` lưu username + bcrypt hash + allowed_screens[]. Handler `staff.ts` xử lý CRUD. Settings.tsx thêm tab "Nhân viên" với danh sách + dialog tạo/sửa có checkboxes chọn màn hình.

**Tech Stack:** React 18, TypeScript, PostgreSQL, bcryptjs, shadcn/ui, TanStack Query

---

## File Map

| File | Thay đổi |
|------|---------|
| `db/schema.sql` | Thêm bảng `staff` |
| `src/renderer/src/types.ts` | Thêm `StaffMember` interface |
| `src/main/handlers/staff.ts` | Tạo mới: getAll, create, update, delete |
| `src/main/index.ts` | Register staff handlers |
| `src/preload/index.ts` | Expose `staff` API |
| `src/renderer/src/electron.d.ts` | Thêm `staff` type declarations |
| `src/renderer/src/pages/Settings.tsx` | Thêm tab switcher + tab Nhân viên |
| `tests/unit/handlers/staff.test.ts` | Tạo mới: unit tests |

---

## Task 1: Install bcryptjs + DB migration

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Cài bcryptjs**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm install bcryptjs && npm install -D @types/bcryptjs
```

Expected: package.json thêm `bcryptjs`.

- [ ] **Step 2: Thêm bảng `staff` vào `db/schema.sql`**

Mở `db/schema.sql`, thêm sau block `categories`:

```sql
CREATE TABLE IF NOT EXISTS staff (
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

- [ ] **Step 3: Chạy migration trên cloud DB**

```bash
psql "postgresql://bida_db_user:rybzgyirqPayAkMDQmbCXo4hkBIJXxBd@dpg-d8c4s1vavr4c73efj0dg-a.singapore-postgres.render.com/bida_db" \
  -c "CREATE TABLE IF NOT EXISTS cloud_staff (
    id SERIAL PRIMARY KEY,
    agent_id UUID NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    allowed_screens TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_cloud_staff_username UNIQUE (username, agent_id)
  );"
```

Expected: `CREATE TABLE`

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql package.json package-lock.json
git commit -m "feat: add staff table schema and install bcryptjs"
```

---

## Task 2: StaffMember type + staff handler (TDD)

**Files:**
- Modify: `src/renderer/src/types.ts`
- Create: `src/main/handlers/staff.ts`
- Create: `tests/unit/handlers/staff.test.ts`

- [ ] **Step 1: Thêm `StaffMember` vào `src/renderer/src/types.ts`**

Thêm vào cuối file:

```typescript
export interface StaffMember {
  id: number
  username: string
  allowed_screens: string[]
  is_active: boolean
  created_at: string
}
```

- [ ] **Step 2: Viết tests trước (TDD)**

Tạo `tests/unit/handlers/staff.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue('agent-123'),
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  }
}))

import * as db from '../../../src/main/db'
import {
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
} from '../../../src/main/handlers/staff'

beforeEach(() => vi.clearAllMocks())

describe('getAllStaff', () => {
  it('returns all active staff for agent', async () => {
    const mock = [{ id: 1, username: 'nv1', allowed_screens: ['dashboard'], is_active: true, created_at: '2026-01-01' }]
    vi.mocked(db.query).mockResolvedValue(mock)

    const result = await getAllStaff()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM cloud_staff'),
      ['agent-123']
    )
    expect(result).toEqual(mock)
  })
})

describe('createStaff', () => {
  it('hashes password and inserts staff', async () => {
    const mock = { id: 2, username: 'nv2', allowed_screens: ['dashboard', 'invoices'], is_active: true, created_at: '2026-01-01' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await createStaff({ username: 'nv2', password: 'pass123', allowedScreens: ['dashboard', 'invoices'] })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_staff'),
      expect.arrayContaining(['nv2', 'hashed_password', 'agent-123'])
    )
    expect(result).toEqual(mock)
  })
})

describe('updateStaff', () => {
  it('updates allowed_screens without changing password when password not provided', async () => {
    const mock = { id: 1, username: 'nv1', allowed_screens: ['dashboard', 'reports'], is_active: true, created_at: '2026-01-01' }
    vi.mocked(db.queryOne).mockResolvedValue(mock)

    const result = await updateStaff(1, { allowedScreens: ['dashboard', 'reports'] })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cloud_staff'),
      expect.arrayContaining([['dashboard', 'reports'], 1, 'agent-123'])
    )
    expect(result).toEqual(mock)
  })

  it('updates password_hash when password provided', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ id: 1, username: 'nv1', allowed_screens: [], is_active: true, created_at: '2026-01-01' })

    await updateStaff(1, { password: 'newpass', allowedScreens: [] })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('password_hash'),
      expect.arrayContaining(['hashed_password'])
    )
  })
})

describe('deleteStaff', () => {
  it('soft-deletes staff by setting is_active = false', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ id: 1 })

    await deleteStaff(1)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('is_active = FALSE'),
      expect.arrayContaining([1, 'agent-123'])
    )
  })
})
```

- [ ] **Step 3: Chạy tests — phải FAIL**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test tests/unit/handlers/staff.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 4: Tạo `src/main/handlers/staff.ts`**

```typescript
import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { StaffMember } from '../../renderer/src/types'

export async function getAllStaff(): Promise<StaffMember[]> {
  const agentId = getAgentId()
  return query<StaffMember>(
    `SELECT id, username, allowed_screens, is_active, created_at
     FROM cloud_staff
     WHERE agent_id = $1 AND is_active = TRUE
     ORDER BY created_at`,
    [agentId]
  )
}

export async function createStaff(input: {
  username: string
  password: string
  allowedScreens: string[]
}): Promise<StaffMember | null> {
  const agentId = getAgentId()
  const passwordHash = await bcrypt.hash(input.password, 10)
  return queryOne<StaffMember>(
    `INSERT INTO cloud_staff (agent_id, username, password_hash, allowed_screens)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, allowed_screens, is_active, created_at`,
    [agentId, input.username, passwordHash, input.allowedScreens]
  )
}

export async function updateStaff(
  id: number,
  input: { password?: string; allowedScreens: string[] }
): Promise<StaffMember | null> {
  const agentId = getAgentId()
  if (input.password) {
    const passwordHash = await bcrypt.hash(input.password, 10)
    return queryOne<StaffMember>(
      `UPDATE cloud_staff SET password_hash = $1, allowed_screens = $2
       WHERE id = $3 AND agent_id = $4
       RETURNING id, username, allowed_screens, is_active, created_at`,
      [passwordHash, input.allowedScreens, id, agentId]
    )
  }
  return queryOne<StaffMember>(
    `UPDATE cloud_staff SET allowed_screens = $1
     WHERE id = $2 AND agent_id = $3
     RETURNING id, username, allowed_screens, is_active, created_at`,
    [input.allowedScreens, id, agentId]
  )
}

export async function deleteStaff(id: number): Promise<void> {
  const agentId = getAgentId()
  await queryOne(
    'UPDATE cloud_staff SET is_active = FALSE WHERE id = $1 AND agent_id = $2 RETURNING id',
    [id, agentId]
  )
}

export function registerStaffHandlers() {
  ipcMain.handle('staff:getAll', () => getAllStaff())
  ipcMain.handle('staff:create', (_e, input: { username: string; password: string; allowedScreens: string[] }) =>
    createStaff(input)
  )
  ipcMain.handle('staff:update', (_e, id: number, input: { password?: string; allowedScreens: string[] }) =>
    updateStaff(id, input)
  )
  ipcMain.handle('staff:delete', (_e, id: number) => deleteStaff(id))
}
```

- [ ] **Step 5: Chạy tests — phải PASS**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test tests/unit/handlers/staff.test.ts 2>&1 | tail -15
```

Expected: 5 tests passed.

- [ ] **Step 6: Chạy typecheck node**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck:node 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/types.ts src/main/handlers/staff.ts tests/unit/handlers/staff.test.ts
git commit -m "feat: add StaffMember type and staff CRUD handler with bcrypt"
```

---

## Task 3: Register handlers + Preload + electron.d.ts

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Register trong `src/main/index.ts`**

Thêm import sau import `registerCategoryHandlers`:
```typescript
import { registerStaffHandlers } from './handlers/staff'
```

Thêm call sau `registerCategoryHandlers()`:
```typescript
  registerStaffHandlers()
```

- [ ] **Step 2: Expose trong `src/preload/index.ts`**

Thêm `StaffMember` vào import types ở đầu file.

Thêm block `staff` sau block `categories`:
```typescript
  staff: {
    getAll: (): Promise<StaffMember[]> =>
      ipcRenderer.invoke('staff:getAll'),
    create: (input: { username: string; password: string; allowedScreens: string[] }): Promise<StaffMember | null> =>
      ipcRenderer.invoke('staff:create', input),
    update: (id: number, input: { password?: string; allowedScreens: string[] }): Promise<StaffMember | null> =>
      ipcRenderer.invoke('staff:update', id, input),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('staff:delete', id),
  },
```

- [ ] **Step 3: Thêm vào `src/renderer/src/electron.d.ts`**

Thêm `StaffMember` vào import types.

Thêm block `staff` sau block `categories`:
```typescript
      staff: {
        getAll(): Promise<StaffMember[]>
        create(input: { username: string; password: string; allowedScreens: string[] }): Promise<StaffMember | null>
        update(id: number, input: { password?: string; allowedScreens: string[] }): Promise<StaffMember | null>
        delete(id: number): Promise<void>
      }
```

- [ ] **Step 4: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: Errors chỉ ở Settings.tsx (chưa update) — OK. Không có lỗi ở handler/preload/types.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: register staff handlers, expose in preload and electron.d.ts"
```

---

## Task 4: Settings.tsx — Tab Nhân viên

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

Đọc file trước khi sửa.

- [ ] **Step 1: Thêm imports và tab state**

Thêm `useMutation` vào react-query import (đã có), thêm `Dialog` components vào shadcn imports. Thêm imports:

```typescript
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import type { StaffMember } from '../types'
```

Thêm state sau `const queryClient = useQueryClient()`:

```typescript
const [activeTab, setActiveTab] = useState<'settings' | 'staff'>('settings')
```

- [ ] **Step 2: Thêm staff query và mutations**

Sau `const { data: loyaltyData } ...`, thêm:

```typescript
const { data: staffList = [], refetch: refetchStaff } = useQuery({
  queryKey: ['staff'],
  queryFn: () => window.api.staff.getAll(),
})

const [staffMode, setStaffMode] = useState<'create' | 'edit' | null>(null)
const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
const [staffForm, setStaffForm] = useState({ username: '', password: '', allowedScreens: [] as string[] })

const SCREENS = [
  { key: 'dashboard', label: '🏠 Dashboard' },
  { key: 'products', label: '📦 Sản phẩm' },
  { key: 'stock', label: '🏪 Kho' },
  { key: 'invoices', label: '🧾 Hóa đơn' },
  { key: 'customers', label: '👥 Khách hàng' },
  { key: 'reports', label: '📊 Báo cáo' },
  { key: 'settings', label: '⚙️ Cài đặt' },
]

const createStaffMutation = useMutation({
  mutationFn: () => window.api.staff.create({ username: staffForm.username, password: staffForm.password, allowedScreens: staffForm.allowedScreens }),
  onSuccess: () => { refetchStaff(); setStaffMode(null); toast.success('Đã tạo nhân viên') },
  onError: () => toast.error('Tên đăng nhập đã tồn tại'),
})

const updateStaffMutation = useMutation({
  mutationFn: () => selectedStaff ? window.api.staff.update(selectedStaff.id, { password: staffForm.password || undefined, allowedScreens: staffForm.allowedScreens }) : Promise.resolve(null),
  onSuccess: () => { refetchStaff(); setStaffMode(null); toast.success('Đã cập nhật nhân viên') },
  onError: () => toast.error('Cập nhật thất bại'),
})

const deleteStaffMutation = useMutation({
  mutationFn: (id: number) => window.api.staff.delete(id),
  onSuccess: () => { refetchStaff(); toast.success('Đã xoá nhân viên') },
})
```

- [ ] **Step 3: Thêm tab switcher vào JSX**

Thay `<h1 className="text-xl font-bold text-[#d4af37] mb-6">Cài đặt</h1>` bằng:

```tsx
<div className="flex items-center justify-between mb-6">
  <h1 className="text-xl font-bold text-[#d4af37]">Cài đặt</h1>
  <div className="flex gap-1 bg-[#0a1a0d] border border-[#1e3d23] rounded-lg p-1">
    <button
      className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'settings' ? 'bg-[#d4af37] text-[#0d1f12] font-bold' : 'text-white hover:text-[#d4af37]'}`}
      onClick={() => setActiveTab('settings')}
    >
      Cài đặt
    </button>
    <button
      className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'staff' ? 'bg-[#d4af37] text-[#0d1f12] font-bold' : 'text-white hover:text-[#d4af37]'}`}
      onClick={() => setActiveTab('staff')}
    >
      Nhân viên
    </button>
  </div>
</div>
```

- [ ] **Step 4: Bọc nội dung cài đặt hiện tại trong tab guard**

Bọc `<div className="space-y-4">` (chứa các section + nút Lưu) trong:
```tsx
{activeTab === 'settings' && (
  // ... toàn bộ nội dung cũ giữ nguyên
)}
```

- [ ] **Step 5: Thêm tab Nhân viên**

Sau `{activeTab === 'settings' && ...}`, thêm:

```tsx
{activeTab === 'staff' && (
  <div>
    <div className="flex justify-end mb-4">
      <Button
        className="bg-[#d4af37] text-[#0d1f12] font-bold text-sm px-3 py-2 rounded-lg hover:bg-yellow-400"
        onClick={() => { setStaffForm({ username: '', password: '', allowedScreens: [] }); setSelectedStaff(null); setStaffMode('create') }}
      >
        + Thêm nhân viên
      </Button>
    </div>

    <div className="bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#162a1a] border-b-2 border-[#d4af37]">
            <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên đăng nhập</th>
            <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Màn hình được phép</th>
            <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {staffList.map((s, i) => (
            <tr key={s.id} className={`border-b border-[#1e3d23] hover:bg-[#162a1a] transition-colors ${i % 2 === 1 ? 'bg-[#0d1a0f]' : ''}`}>
              <td className="px-4 py-3 text-[#e2e8f0] font-medium">{s.username}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {s.allowed_screens.map((sc) => (
                    <span key={sc} className="bg-[#d4af37] text-black text-[10px] px-1.5 py-0.5 rounded-full">
                      {SCREENS.find((x) => x.key === sc)?.label ?? sc}
                    </span>
                  ))}
                  {s.allowed_screens.length === 0 && <span className="text-[#6b7280] text-xs">Không có quyền</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-right space-x-1">
                <Button size="sm" variant="ghost" className="text-[#6b7280] hover:text-white h-7 text-xs px-2"
                  onClick={() => {
                    setSelectedStaff(s)
                    setStaffForm({ username: s.username, password: '', allowedScreens: s.allowed_screens })
                    setStaffMode('edit')
                  }}>
                  Sửa
                </Button>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 text-xs px-2"
                  onClick={() => deleteStaffMutation.mutate(s.id)}>
                  Xoá
                </Button>
              </td>
            </tr>
          ))}
          {staffList.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-[#6b7280]">Chưa có nhân viên nào</td></tr>
          )}
        </tbody>
      </table>
    </div>

    <Dialog open={staffMode === 'create' || staffMode === 'edit'} onOpenChange={(o) => !o && setStaffMode(null)}>
      <DialogContent className="bg-[#162a1a] border-[#1e3d23] text-white">
        <DialogHeader>
          <DialogTitle>{staffMode === 'create' ? 'Thêm nhân viên' : 'Sửa nhân viên'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[#6b7280] text-xs">Tên đăng nhập</Label>
            <Input
              className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1"
              value={staffForm.username}
              onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
              disabled={staffMode === 'edit'}
            />
          </div>
          <div>
            <Label className="text-[#6b7280] text-xs">
              {staffMode === 'edit' ? 'Mật khẩu mới (để trống = không đổi)' : 'Mật khẩu'}
            </Label>
            <Input
              type="password"
              className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1"
              value={staffForm.password}
              onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-[#6b7280] text-xs mb-2 block">Màn hình được phép truy cập</Label>
            <div className="space-y-2">
              {SCREENS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[#d4af37]"
                    checked={staffForm.allowedScreens.includes(key)}
                    onChange={(e) => {
                      const screens = e.target.checked
                        ? [...staffForm.allowedScreens, key]
                        : staffForm.allowedScreens.filter((s) => s !== key)
                      setStaffForm({ ...staffForm, allowedScreens: screens })
                    }}
                  />
                  <span className="text-sm text-black" style={{ color: '#000' }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStaffMode(null)} className="border-[#1e3d23] text-[#6b7280]">Huỷ</Button>
          <Button
            className="bg-[#d4af37] text-[#0d1f12] font-bold"
            disabled={staffMode === 'create' && (!staffForm.username || !staffForm.password)}
            onClick={() => staffMode === 'create' ? createStaffMutation.mutate() : updateStaffMutation.mutate()}
          >
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)}
```

- [ ] **Step 6: Chạy typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 7: Chạy all tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test 2>&1 | tail -12
```

Expected: All tests pass (≥61 tests).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: add staff management tab in Settings with CRUD UI"
```
