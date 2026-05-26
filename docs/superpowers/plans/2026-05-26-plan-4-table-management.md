# Table Management + Button Text Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add table create/edit UI in Dashboard, and fix nav/UI buttons so text is always visible (not hover-only).

**Architecture:** Add `tables:create` and `tables:update` IPC handlers, a `TableFormModal` component for add/edit, wire it into Dashboard with an "Thêm bàn" button and per-card edit icon. Fix text visibility by changing `text-gray-300` → `text-white` on nav buttons.

**Tech Stack:** Electron IPC, React + TypeScript, shadcn/ui (Dialog, Input, Label, Button), Tailwind CSS, pg (node-postgres)

---

### Task 1: Fix nav button text visibility

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Change nav button text classes**

In `src/renderer/src/App.tsx`, find the three nav `<button>` elements for Sản phẩm, Khách hàng, Báo cáo, and the Cài đặt button. Change `className="text-sm text-gray-300 hover:text-white"` to `className="text-sm text-white hover:text-gray-200"` on all four buttons.

Current:
```tsx
<button onClick={() => setView({ page: 'products' })} className="text-sm text-gray-300 hover:text-white">Sản phẩm</button>
<button onClick={() => setView({ page: 'customers' })} className="text-sm text-gray-300 hover:text-white">Khách hàng</button>
<button onClick={() => setView({ page: 'reports' })} className="text-sm text-gray-300 hover:text-white">Báo cáo</button>
<button onClick={() => setView({ page: 'settings' })} className="text-sm text-gray-300 hover:text-white ml-auto">Cài đặt</button>
```

After:
```tsx
<button onClick={() => setView({ page: 'products' })} className="text-sm text-white hover:text-gray-200">Sản phẩm</button>
<button onClick={() => setView({ page: 'customers' })} className="text-sm text-white hover:text-gray-200">Khách hàng</button>
<button onClick={() => setView({ page: 'reports' })} className="text-sm text-white hover:text-gray-200">Báo cáo</button>
<button onClick={() => setView({ page: 'settings' })} className="text-sm text-white hover:text-gray-200 ml-auto">Cài đặt</button>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "fix: nav buttons always show white text, not hover-only"
```

---

### Task 2: Add IPC handlers for table create and update

**Files:**
- Modify: `src/main/handlers/tables.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Add createTable and updateTable functions + register handlers**

In `src/main/handlers/tables.ts`, add two functions and register their handlers:

```ts
// src/main/handlers/tables.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { BidaTable } from '../../renderer/src/types'

export async function getAllTables(): Promise<BidaTable[]> {
  return query<BidaTable>('SELECT * FROM tables ORDER BY id')
}

export async function updateTableStatus(
  tableId: number,
  status: BidaTable['status']
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'UPDATE tables SET status = $1 WHERE id = $2 RETURNING *',
    [status, tableId]
  )
}

export async function createTable(
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'INSERT INTO tables (name, hourly_rate) VALUES ($1, $2) RETURNING *',
    [name, hourlyRate]
  )
}

export async function updateTable(
  tableId: number,
  name: string,
  hourlyRate: number
): Promise<BidaTable | null> {
  return queryOne<BidaTable>(
    'UPDATE tables SET name = $1, hourly_rate = $2 WHERE id = $3 RETURNING *',
    [name, hourlyRate, tableId]
  )
}

export function registerTableHandlers() {
  ipcMain.handle('tables:getAll', () => getAllTables())
  ipcMain.handle(
    'tables:updateStatus',
    (_event, tableId: number, status: BidaTable['status']) =>
      updateTableStatus(tableId, status)
  )
  ipcMain.handle(
    'tables:create',
    (_event, name: string, hourlyRate: number) => createTable(name, hourlyRate)
  )
  ipcMain.handle(
    'tables:update',
    (_event, tableId: number, name: string, hourlyRate: number) =>
      updateTable(tableId, name, hourlyRate)
  )
}
```

- [ ] **Step 2: Expose new IPC methods in preload**

In `src/preload/index.ts`, add `create` and `update` to the `tables` namespace:

```ts
tables: {
  getAll: (): Promise<BidaTable[]> =>
    ipcRenderer.invoke('tables:getAll'),
  updateStatus: (tableId: number, status: BidaTable['status']): Promise<BidaTable | null> =>
    ipcRenderer.invoke('tables:updateStatus', tableId, status),
  create: (name: string, hourlyRate: number): Promise<BidaTable | null> =>
    ipcRenderer.invoke('tables:create', name, hourlyRate),
  update: (tableId: number, name: string, hourlyRate: number): Promise<BidaTable | null> =>
    ipcRenderer.invoke('tables:update', tableId, name, hourlyRate),
},
```

- [ ] **Step 3: Add TypeScript declarations**

In `src/renderer/src/electron.d.ts`, update the `tables` section:

```ts
tables: {
  getAll(): Promise<BidaTable[]>
  updateStatus(id: number, status: BidaTable['status']): Promise<BidaTable | null>
  create(name: string, hourlyRate: number): Promise<BidaTable | null>
  update(tableId: number, name: string, hourlyRate: number): Promise<BidaTable | null>
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/tables.ts src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: add tables:create and tables:update IPC handlers"
```

---

### Task 3: Create TableFormModal component

**Files:**
- Create: `src/renderer/src/components/TableFormModal.tsx`

- [ ] **Step 1: Write failing test**

Create `src/renderer/src/__tests__/TableFormModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TableFormModal from '../components/TableFormModal'

describe('TableFormModal', () => {
  it('renders nothing when table is null and isOpen is false', () => {
    const { container } = render(
      <TableFormModal isOpen={false} table={null} onSave={vi.fn()} onClose={vi.fn()} />
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders Add form when isOpen=true and table=null', () => {
    render(
      <TableFormModal isOpen={true} table={null} onSave={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('Thêm bàn mới')).toBeInTheDocument()
  })

  it('renders Edit form pre-filled when table is provided', () => {
    const table = { id: 1, name: 'Bàn 1', status: 'idle' as const, hourly_rate: 50000, created_at: '' }
    render(
      <TableFormModal isOpen={true} table={table} onSave={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('Chỉnh sửa bàn')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bàn 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('50000')).toBeInTheDocument()
  })

  it('calls onSave with name and hourlyRate when submitted', () => {
    const onSave = vi.fn()
    render(
      <TableFormModal isOpen={true} table={null} onSave={onSave} onClose={vi.fn()} />
    )
    fireEvent.change(screen.getByPlaceholderText('VD: Bàn 1'), { target: { value: 'Bàn 5' } })
    fireEvent.change(screen.getByPlaceholderText('VD: 50000'), { target: { value: '60000' } })
    fireEvent.click(screen.getByText('Lưu'))
    expect(onSave).toHaveBeenCalledWith('Bàn 5', 60000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/src/__tests__/TableFormModal.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement TableFormModal**

Create `src/renderer/src/components/TableFormModal.tsx`:

```tsx
import { useState, useEffect } from 'react'
import type { BidaTable } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  isOpen: boolean
  table: BidaTable | null
  onSave: (name: string, hourlyRate: number) => void
  onClose: () => void
}

export default function TableFormModal({ isOpen, table, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [hourlyRate, setHourlyRate] = useState(50000)

  useEffect(() => {
    if (isOpen) {
      setName(table?.name ?? '')
      setHourlyRate(table?.hourly_rate ?? 50000)
    }
  }, [isOpen, table])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || hourlyRate <= 0) return
    onSave(name.trim(), hourlyRate)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-sm"
      >
        <h2 className="text-lg font-bold mb-4">
          {table ? 'Chỉnh sửa bàn' : 'Thêm bàn mới'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Tên bàn</Label>
            <Input
              className="mt-1 bg-gray-800 border-gray-600"
              placeholder="VD: Bàn 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label>Giá/giờ (đồng)</Label>
            <Input
              type="number"
              className="mt-1 bg-gray-800 border-gray-600"
              placeholder="VD: 50000"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 bg-green-700 hover:bg-green-600">
              Lưu
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-gray-600"
              onClick={onClose}
            >
              Hủy
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/src/__tests__/TableFormModal.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TableFormModal.tsx src/renderer/src/__tests__/TableFormModal.test.tsx
git commit -m "feat: add TableFormModal component for adding and editing tables"
```

---

### Task 4: Wire TableFormModal into Dashboard + add edit button to TableCard

**Files:**
- Modify: `src/renderer/src/pages/Dashboard.tsx`
- Modify: `src/renderer/src/components/TableCard.tsx`

- [ ] **Step 1: Update TableCard to accept onEdit prop and show edit button**

In `src/renderer/src/components/TableCard.tsx`, add `onEdit` prop and show a small edit button (pencil icon using a text character) always visible in the top-right corner:

```tsx
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import SessionTimer from './SessionTimer'
import { formatCurrency } from '../lib/utils'

interface Props {
  table: BidaTable
  onOpen: (table: BidaTable) => void
  onView: (tableId: number) => void
  onEdit: (table: BidaTable) => void
}

const STATUS_COLORS = {
  idle: 'bg-green-900 border-green-500 hover:bg-green-800',
  playing: 'bg-red-900 border-red-500 hover:bg-red-800',
  reserved: 'bg-yellow-900 border-yellow-500 hover:bg-yellow-800',
} as const

const STATUS_LABELS = {
  idle: 'Trống',
  playing: 'Đang chơi',
  reserved: 'Đã đặt',
} as const

export default function TableCard({ table, onOpen, onView, onEdit }: Props) {
  const session = useSessionStore((s) => s.getSessionByTableId(table.id))

  return (
    <div className={`relative w-full rounded-xl border-2 p-4 text-left transition-all ${STATUS_COLORS[table.status].replace('hover:bg-green-800', '').replace('hover:bg-red-800', '').replace('hover:bg-yellow-800', '')}`}>
      <button
        data-testid="table-card"
        className="absolute inset-0 rounded-xl"
        onClick={() => table.status === 'idle' ? onOpen(table) : onView(table.id)}
        aria-label={`Bàn ${table.name}`}
      />
      <div className="relative flex justify-between items-start mb-2">
        <span className="text-lg font-bold">{table.name}</span>
        <div className="flex items-center gap-1">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            table.status === 'idle' ? 'bg-green-500' :
            table.status === 'playing' ? 'bg-red-500' : 'bg-yellow-500'
          } text-white`}>
            {STATUS_LABELS[table.status]}
          </span>
          <button
            className="text-gray-400 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-gray-700 z-10"
            onClick={(e) => { e.stopPropagation(); onEdit(table) }}
            title="Chỉnh sửa"
          >
            ✎
          </button>
        </div>
      </div>
      {table.status === 'idle' && (
        <p className="text-sm text-gray-400 relative">{formatCurrency(table.hourly_rate)}/giờ</p>
      )}
      {table.status === 'playing' && session && (
        <SessionTimer startTime={session.start_time} hourlyRate={session.hourly_rate} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update Dashboard to handle add/edit table**

In `src/renderer/src/pages/Dashboard.tsx`, add state for the form modal, add mutations for create/update, wire the "Thêm bàn" button and edit handler:

```tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import TableCard from '../components/TableCard'
import OpenSessionModal from '../components/OpenSessionModal'
import TableFormModal from '../components/TableFormModal'
import { Button } from '@/components/ui/button'
import { api } from '../lib/ipc'

interface Props {
  onViewSession: (tableId: number) => void
}

export default function Dashboard({ onViewSession }: Props) {
  const queryClient = useQueryClient()
  const setActiveSessions = useSessionStore((s) => s.setActiveSessions)
  const [selectedTable, setSelectedTable] = useState<BidaTable | null>(null)
  const [editingTable, setEditingTable] = useState<BidaTable | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api().tables.getAll(),
    refetchInterval: 30000,
  })

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
    refetchInterval: 60000,
  })

  useEffect(() => {
    setActiveSessions(activeSessions)
  }, [activeSessions, setActiveSessions])

  const openSessionMutation = useMutation({
    mutationFn: ({ tableId, customerId }: { tableId: number; customerId: number | null }) =>
      api().sessions.create(tableId, customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      setSelectedTable(null)
    },
  })

  const createTableMutation = useMutation({
    mutationFn: ({ name, hourlyRate }: { name: string; hourlyRate: number }) =>
      window.api.tables.create(name, hourlyRate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      setFormOpen(false)
      setEditingTable(null)
    },
  })

  const updateTableMutation = useMutation({
    mutationFn: ({ tableId, name, hourlyRate }: { tableId: number; name: string; hourlyRate: number }) =>
      window.api.tables.update(tableId, name, hourlyRate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      setFormOpen(false)
      setEditingTable(null)
    },
  })

  const handleSave = (name: string, hourlyRate: number) => {
    if (editingTable) {
      updateTableMutation.mutate({ tableId: editingTable.id, name, hourlyRate })
    } else {
      createTableMutation.mutate({ name, hourlyRate })
    }
  }

  const handleEdit = (table: BidaTable) => {
    setEditingTable(table)
    setFormOpen(true)
  }

  const handleAddNew = () => {
    setEditingTable(null)
    setFormOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Đang tải...</p>
      </div>
    )
  }

  const idleCount = tables.filter((t) => t.status === 'idle').length
  const playingCount = tables.filter((t) => t.status === 'playing').length

  return (
    <div>
      <div className="flex items-center gap-6 mb-6">
        <h1 className="text-2xl font-bold">Quản lý bàn</h1>
        <span className="text-sm text-green-400">{idleCount} bàn trống</span>
        <span className="text-sm text-red-400">{playingCount} bàn đang chơi</span>
        <Button
          size="sm"
          className="ml-auto bg-green-700 hover:bg-green-600"
          onClick={handleAddNew}
        >
          + Thêm bàn
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onOpen={setSelectedTable}
            onView={onViewSession}
            onEdit={handleEdit}
          />
        ))}
      </div>
      <OpenSessionModal
        table={selectedTable}
        onConfirm={async (tableId, customerId) => {
          await openSessionMutation.mutateAsync({ tableId, customerId })
        }}
        onClose={() => setSelectedTable(null)}
      />
      <TableFormModal
        isOpen={formOpen}
        table={editingTable}
        onSave={handleSave}
        onClose={() => { setFormOpen(false); setEditingTable(null) }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/Dashboard.tsx src/renderer/src/components/TableCard.tsx
git commit -m "feat: add table create/edit UI in Dashboard"
```

---

### Task 5: Run all tests and verify

**Files:** none new

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass + 4 new TableFormModal tests pass

- [ ] **Step 2: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: verify all tests pass after table management feature"
```
