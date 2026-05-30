# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign toàn bộ giao diện theo theme Billiard Dark Green với sidebar navigation, Wide Row table cards, và enhanced data tables — không thay đổi logic.

**Architecture:** Thêm `bida` color tokens vào Tailwind, thay top nav bằng sidebar trong App.tsx, cập nhật từng page/component với classes mới. Không có unit tests vì đây là thay đổi thuần visual — verification bằng typecheck + visual check trong app.

**Tech Stack:** Tailwind CSS, React, shadcn/ui components

---

## Color Reference (dùng xuyên suốt tất cả tasks)

```
bg-[#0d1f12]     → Background chính
bg-[#0a1a0d]     → Sidebar background
bg-[#162a1a]     → Card/panel background
bg-[#2d1515]     → Card đang chơi
#d4af37          → Gold (logo, header, CTA button, table header)
text-[#d4af37]   → Gold text
border-[#1e3d23] → Border thường
border-[#d4af37] → Border gold (sidebar right, table header bottom)
text-[#e2e8f0]   → Text primary
text-[#6b7280]   → Text muted
text-green-400   → Idle/available
text-red-400     → Playing/error
```

---

## File Map

| File | Task |
|------|------|
| `tailwind.config.js` | Task 1 |
| `src/renderer/src/App.tsx` | Task 2 |
| `src/renderer/src/components/TableCard.tsx` | Task 3 |
| `src/renderer/src/pages/Dashboard.tsx` | Task 3 |
| `src/renderer/src/pages/Products.tsx` | Task 4 |
| `src/renderer/src/pages/Customers.tsx` | Task 4 |
| `src/renderer/src/pages/InvoiceList.tsx` | Task 4 |
| `src/renderer/src/pages/StockHistory.tsx` | Task 4 |
| `src/renderer/src/pages/Reports.tsx` | Task 4 |
| `src/renderer/src/pages/Session.tsx` | Task 5 |
| `src/renderer/src/pages/Invoice.tsx` | Task 5 |
| `src/renderer/src/pages/LoginPage.tsx` | Task 6 |
| `src/renderer/src/pages/Settings.tsx` | Task 6 |

---

## Task 1: Tailwind color tokens

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Thêm `bida` colors vào tailwind.config.js**

Trong `tailwind.config.js`, thêm vào `theme.extend.colors`:

```js
bida: {
  bg:      '#0d1f12',
  sidebar: '#0a1a0d',
  card:    '#162a1a',
  playing: '#2d1515',
  gold:    '#d4af37',
  border:  '#1e3d23',
  'border-playing': '#7f1d1d',
},
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add tailwind.config.js && git commit -m "style: add bida color tokens to tailwind config"
```

---

## Task 2: App.tsx — Sidebar navigation

**Files:**
- Modify: `src/renderer/src/App.tsx`

Thay thế layout hiện tại (top nav + main) bằng sidebar + main. Logic auth, routing, View type — **giữ nguyên hoàn toàn**.

- [ ] **Step 1: Đọc file hiện tại**

Read `src/renderer/src/App.tsx` trước.

- [ ] **Step 2: Thay thế phần return của App component**

Thay phần JSX từ `return (` đến cuối (giữ nguyên tất cả state, effects, handlers). Phần JSX mới:

```tsx
  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bida-bg">
        <p className="text-gray-500 text-sm">Đang tải...</p>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLogin={() => setAuthState('authenticated')} />
  }

  const navItems: { page: Exclude<View['page'], 'session' | 'invoice'>; label: string; icon: string }[] = [
    { page: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { page: 'products', label: 'Sản phẩm', icon: '📦' },
    { page: 'stock', label: 'Kho', icon: '🏪' },
    { page: 'invoices', label: 'Hóa đơn', icon: '🧾' },
    { page: 'customers', label: 'Khách hàng', icon: '👥' },
    { page: 'reports', label: 'Báo cáo', icon: '📊' },
  ]

  const currentPage = view.page === 'session' || view.page === 'invoice' ? 'dashboard' : view.page

  return (
    <div className="flex h-screen bg-bida-bg text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-40 flex-shrink-0 bg-bida-sidebar border-r-2 border-[#d4af37] flex flex-col">
        <div className="px-4 py-4 border-b border-bida-border">
          <div className="text-[#d4af37] font-bold text-base">🎱 Bida</div>
          <div className="text-[#4b7a52] text-[10px] mt-0.5">Manager</div>
        </div>

        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => setView({ page } as View)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2
                ${currentPage === page
                  ? 'bg-[#1e3d23] text-green-400 border-l-[3px] border-green-400 font-semibold'
                  : 'text-[#6b7280] hover:bg-bida-card hover:text-white border-l-[3px] border-transparent'
                }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="py-3 px-2 border-t border-bida-border flex flex-col gap-0.5">
          <button
            onClick={() => setView({ page: 'settings' })}
            className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2
              ${currentPage === 'settings'
                ? 'bg-[#1e3d23] text-green-400 border-l-[3px] border-green-400 font-semibold'
                : 'text-[#6b7280] hover:bg-bida-card hover:text-white border-l-[3px] border-transparent'
              }`}
          >
            <span>⚙</span><span>Cài đặt</span>
          </button>
          <button
            onClick={async () => {
              await window.api.auth.logout()
              setAuthState('unauthenticated')
              setView({ page: 'dashboard' })
            }}
            className="w-full text-left px-3 py-2 rounded-md text-xs text-red-400 hover:bg-[#2d1515] hover:text-red-300 transition-colors flex items-center gap-2 border-l-[3px] border-transparent"
          >
            <span>↩</span><span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {view.page === 'dashboard' && (
          <Dashboard onViewSession={(tableId) => setView({ page: 'session', tableId })} />
        )}
        {view.page === 'session' && (
          <SessionPage
            tableId={view.tableId}
            onBack={() => setView({ page: 'dashboard' })}
            onCheckout={handleCheckout}
          />
        )}
        {view.page === 'invoice' && (
          <InvoicePage
            session={view.session}
            playAmount={view.playAmount}
            onComplete={() => setView({ page: 'dashboard' })}
          />
        )}
        {view.page === 'products' && <ProductsPage />}
        {view.page === 'stock' && <StockHistoryPage />}
        {view.page === 'invoices' && <InvoiceListPage />}
        {view.page === 'customers' && <CustomersPage />}
        {view.page === 'reports' && <ReportsPage />}
        {view.page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
```

**Lưu ý:** `View` type cần giữ nguyên, `navItems` array dùng `Exclude<View['page'], 'session' | 'invoice'>` nên cần import type đúng. Nếu TypeScript báo lỗi kiểu, cast `{ page } as View` là đủ.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/App.tsx && git commit -m "style: replace top nav with sidebar navigation"
```

---

## Task 3: TableCard + Dashboard redesign

**Files:**
- Modify: `src/renderer/src/components/TableCard.tsx`
- Modify: `src/renderer/src/pages/Dashboard.tsx`

- [ ] **Step 1: Rewrite TableCard.tsx — Wide Row Card**

Thay toàn bộ nội dung `src/renderer/src/components/TableCard.tsx`:

```tsx
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import { formatCurrency, formatDuration, elapsedSeconds } from '../lib/utils'
import { useState, useEffect } from 'react'

interface Props {
  table: BidaTable
  onOpen: (table: BidaTable) => void
  onView: (tableId: number) => void
  onEdit: (table: BidaTable) => void
}

function PlayingTimer({ startTime, hourlyRate }: { startTime: string; hourlyRate: number }) {
  const [secs, setSecs] = useState(() => elapsedSeconds(startTime))
  useEffect(() => {
    const t = setInterval(() => setSecs(elapsedSeconds(startTime)), 1000)
    return () => clearInterval(t)
  }, [startTime])
  const amount = Math.round((secs / 3600) * hourlyRate)
  return (
    <div>
      <div className="text-red-400 font-mono font-bold text-sm">{formatDuration(secs)}</div>
      <div className="text-red-400 text-xs">{formatCurrency(amount)}</div>
    </div>
  )
}

export default function TableCard({ table, onOpen, onView, onEdit }: Props) {
  const session = useSessionStore((s) => s.getSessionByTableId(table.id))
  const isPlaying = table.status === 'playing'

  return (
    <div
      className={`relative rounded-xl p-3 flex items-center gap-4 cursor-pointer transition-colors
        ${isPlaying
          ? 'bg-[#2d1515] border border-[#991b1b] hover:border-red-500'
          : 'bg-[#162a1a] border border-[#1e3d23] hover:border-green-500'
        }`}
      onClick={() => isPlaying ? onView(table.id) : onOpen(table)}
    >
      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0
        ${isPlaying
          ? 'bg-gradient-to-br from-[#991b1b] to-[#7f1d1d]'
          : 'bg-gradient-to-br from-[#166534] to-[#14532d]'
        }`}>
        🎱
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[#d4af37] font-bold text-sm">{table.name}</div>
        {isPlaying && session
          ? <PlayingTimer startTime={session.start_time} hourlyRate={session.hourly_rate} />
          : <div className="text-[#6b7280] text-xs">{formatCurrency(table.hourly_rate)}/giờ</div>
        }
      </div>

      {/* Status + edit */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isPlaying
          ? <span className="bg-[#7f1d1d] text-red-400 text-[10px] px-2.5 py-1 rounded-full font-semibold">● Đang chơi</span>
          : <span className="bg-[#14532d] text-green-400 text-[10px] px-2.5 py-1 rounded-full font-semibold">● Trống</span>
        }
        <button
          className="relative z-10 text-[#6b7280] hover:text-white text-xs px-1.5 py-1 rounded hover:bg-[#1e3d23] transition-colors"
          onClick={(e) => { e.stopPropagation(); onEdit(table) }}
          title="Chỉnh sửa"
        >
          ✎
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật Dashboard.tsx — thêm stats bar và page header**

Đọc `src/renderer/src/pages/Dashboard.tsx`. Thay phần `return (` đến cuối (giữ nguyên tất cả queries, mutations, state):

```tsx
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#6b7280]">Đang tải...</p>
      </div>
    )
  }

  const idleCount = tables.filter((t) => t.status === 'idle').length
  const playingCount = tables.filter((t) => t.status === 'playing').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#d4af37]">Dashboard</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">Quản lý bàn bida</p>
        </div>
        <button
          onClick={handleAddNew}
          className="bg-[#d4af37] text-[#0d1f12] text-xs font-bold px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
        >
          + Thêm bàn
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 text-center">
          <div className="text-green-400 text-2xl font-bold">{idleCount}</div>
          <div className="text-[#6b7280] text-xs mt-1">Bàn trống</div>
        </div>
        <div className="bg-[#2d1515] border border-[#7f1d1d] rounded-xl p-4 text-center">
          <div className="text-red-400 text-2xl font-bold">{playingCount}</div>
          <div className="text-[#6b7280] text-xs mt-1">Đang chơi</div>
        </div>
        <div className="bg-[#162a1a] border border-[#d4af37] rounded-xl p-4 text-center">
          <div className="text-[#d4af37] text-2xl font-bold">{tables.length}</div>
          <div className="text-[#6b7280] text-xs mt-1">Tổng số bàn</div>
        </div>
      </div>

      {/* Table cards */}
      <div className="flex flex-col gap-3">
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
        open={formOpen}
        table={editingTable}
        onSave={handleSave}
        onClose={() => { setFormOpen(false); setEditingTable(null) }}
        saving={createTableMutation.isPending || updateTableMutation.isPending}
      />
    </div>
  )
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/components/TableCard.tsx src/renderer/src/pages/Dashboard.tsx && git commit -m "style: redesign TableCard (wide row) and Dashboard (stats bar)"
```

---

## Task 4: Data table pages

**Files:**
- Modify: `src/renderer/src/pages/Products.tsx`
- Modify: `src/renderer/src/pages/Customers.tsx`
- Modify: `src/renderer/src/pages/InvoiceList.tsx`
- Modify: `src/renderer/src/pages/StockHistory.tsx`
- Modify: `src/renderer/src/pages/Reports.tsx`

**Nguyên tắc chung cho tất cả trang:**
- Background page: inherit từ App (`bg-[#0d1f12]`)
- Page header: `<h1 className="text-xl font-bold text-[#d4af37]">`
- Table container: `bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]`
- `<thead>`: `bg-[#162a1a] border-b-2 border-[#d4af37]`
- `<th>`: `text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold px-4 py-3 text-left`
- `<tr>` even: `bg-[#0d1a0f]`
- `<tr>` hover: `hover:bg-[#162a1a] transition-colors`
- `<tr>` border: `border-b border-[#1e3d23]`
- `<td>`: `px-4 py-3 text-sm text-[#e2e8f0]`
- Primary button (Thêm mới): `bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400`
- Secondary action (Nhập kho, Sửa): `text-[#d4af37] hover:text-yellow-300`
- Danger action (Xóa): `text-red-400 hover:text-red-300`
- Filter inputs: `bg-[#162a1a] border-[#1e3d23] text-white focus:border-[#d4af37]`
- Filter button: `bg-blue-700 hover:bg-blue-600` hoặc `bg-[#d4af37] text-[#0d1f12]`
- Badges: giữ màu xanh/đỏ/vàng nhưng dùng bg darker (`bg-[#14532d]`, `bg-[#7f1d1d]`, `bg-[#292524]`)
- Low stock: `text-red-400 font-semibold`
- Amount/price: `text-green-400 font-semibold`
- Dialog/modal: `bg-[#162a1a] border-[#1e3d23] text-white`
- Dialog inputs: `bg-[#0a1a0d] border-[#1e3d23] text-white focus:border-[#d4af37]`

- [ ] **Step 1: Update Products.tsx**

Đọc toàn bộ `src/renderer/src/pages/Products.tsx`. Giữ nguyên tất cả logic/mutations/state. Chỉ thay đổi className trong JSX:

Các className cần thay trong table section:
- `className="w-full text-sm"` → `className="w-full text-sm"`
- Header row: thêm `border-b-2 border-[#d4af37]` vào `<thead>`, cells `<th>` dùng `text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold px-4 py-3`
- `<tbody>`: thêm pattern zebra + hover
- Container: `className="bg-gray-900 rounded-xl overflow-hidden"` → `className="bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]"`
- Page title `<h1>`: thêm `text-[#d4af37]`
- "+ Thêm sản phẩm" button: `className="bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400"`
- "Nhập kho" button: `size="sm" variant="outline" className="border-[#d4af37] text-[#d4af37] hover:bg-[#1e3d23] h-7 text-xs"`
- "Sửa" button: `size="sm" variant="ghost" className="text-[#6b7280] hover:text-white h-7 text-xs"`
- "Xoá" button: giữ `text-red-400`
- Low stock warning banner: `className="bg-[#2d1515] border border-red-800 rounded-xl p-3 mb-4"`
- Dialog: `className="bg-[#162a1a] border-[#1e3d23] text-white"`
- Dialog inputs: thêm `className="bg-[#0a1a0d] border-[#1e3d23] text-white"`
- Badge đồ uống: `className="bg-[#14532d] text-green-400 text-xs border-0"`
- Badge đồ ăn: `className="bg-[#292524] text-orange-400 text-xs border-0"`
- Giá column: `className="text-green-400 font-semibold"`
- Tồn kho thấp: `className="text-red-400 font-semibold"`

- [ ] **Step 2: Update Customers.tsx**

Đọc toàn bộ `src/renderer/src/pages/Customers.tsx`. Thay className:

- Page title: `text-[#d4af37]`
- "+ Thêm" button: `bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400`
- Search input: `bg-[#162a1a] border-[#1e3d23] text-white`
- Customer list items: `bg-[#162a1a] border border-[#1e3d23] hover:bg-[#1e3d23]` / selected: `bg-[#1e3d23] border-[#d4af37]`
- Customer name: `text-[#e2e8f0] font-medium`
- Phone: `text-[#6b7280]`
- Points badge: `bg-[#7f3f00] text-yellow-300`
- Detail panel: `bg-[#162a1a] border border-[#1e3d23] rounded-xl`
- Stats cards trong panel: `bg-[#0a1a0d] rounded-lg`
- Points value: `text-[#d4af37] text-2xl font-bold`
- Visits value: `text-green-400 text-2xl font-bold`
- Total spent: `text-green-400 text-lg font-bold`
- Invoice history items: `bg-[#0a1a0d] rounded text-sm`
- Invoice amount: `text-green-400`
- Dialog inputs: `bg-[#0a1a0d] border-[#1e3d23] text-white`
- Edit form buttons: Lưu = `bg-green-700 hover:bg-green-600`, Huỷ = `border-[#1e3d23]`

- [ ] **Step 3: Update InvoiceList.tsx**

Đọc toàn bộ `src/renderer/src/pages/InvoiceList.tsx`. Thay className:

- Page title `h1`: `text-[#d4af37]`
- Date inputs: `bg-[#162a1a] border-[#1e3d23] text-white`
- Lọc button: `bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400`
- Table container: `bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]`
- `<thead>`: `bg-[#162a1a] border-b-2 border-[#d4af37]`
- `<th>`: `text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold px-4 py-3`
- `<tbody> <tr>` even: `className={... + ' even:bg-[#0d1a0f]'}` — thêm vào pattern hiện tại
- `<tr>` hover: thêm `hover:bg-[#162a1a]`
- Selected row: `bg-blue-900` → `bg-[#1e3d23]`
- Amount column: `text-green-400 font-semibold`
- Detail panel: `bg-[#162a1a] border border-[#1e3d23] rounded-xl`
- Customer section trong panel: `bg-[#0a1a0d] rounded`
- Gold separator: `border-t border-[#d4af37]`
- Total amount: `text-green-400 font-bold text-base`
- Points: `text-[#d4af37]`

- [ ] **Step 4: Update StockHistory.tsx**

Đọc toàn bộ `src/renderer/src/pages/StockHistory.tsx`. Thay className:

- Page title: `text-[#d4af37]`
- Product filter input: `bg-[#162a1a] border-[#1e3d23] text-white`
- Date inputs: `bg-[#162a1a] border-[#1e3d23] text-white`
- Lọc button: `bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400`
- Table container: `bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]`
- `<thead>`: `bg-[#162a1a] border-b-2 border-[#d4af37]`
- `<th>`: `text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold px-4 py-3`
- `<tr>`: thêm zebra + hover
- Badge Nhập: `bg-[#14532d] text-green-400 text-xs border-0`
- Badge Xuất: `bg-[#7f1d1d] text-red-400 text-xs border-0`
- Badge Điều chỉnh: `bg-[#292524] text-yellow-400 text-xs border-0`
- Qty +: `text-green-400`
- Qty -: `text-red-400`

- [ ] **Step 5: Update Reports.tsx**

Đọc toàn bộ `src/renderer/src/pages/Reports.tsx`. Thay className:

- Page title: `text-[#d4af37]`
- Period buttons: active = `bg-[#d4af37] text-[#0d1f12] font-bold`, inactive = `bg-[#162a1a] text-[#6b7280] border border-[#1e3d23] hover:bg-[#1e3d23]`
- Date inputs: `bg-[#162a1a] border-[#1e3d23] text-white`
- Summary cards: `bg-[#162a1a] border border-[#1e3d23] rounded-xl` với amount `text-[#d4af37] font-bold text-2xl`
- Chart container: `bg-[#162a1a] border border-[#1e3d23] rounded-xl`
- Chart colors: `fill="#d4af37"` cho Bar
- Table container nếu có: same pattern như trên

- [ ] **Step 6: Typecheck + visual check**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```

Chạy app kiểm tra visual:
```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run dev
```

- [ ] **Step 7: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/pages/Products.tsx src/renderer/src/pages/Customers.tsx src/renderer/src/pages/InvoiceList.tsx src/renderer/src/pages/StockHistory.tsx src/renderer/src/pages/Reports.tsx && git commit -m "style: redesign data table pages (Products, Customers, Invoices, Stock, Reports)"
```

---

## Task 5: Session + Invoice pages

**Files:**
- Modify: `src/renderer/src/pages/Session.tsx`
- Modify: `src/renderer/src/pages/Invoice.tsx`

- [ ] **Step 1: Rewrite Session.tsx**

Đọc `src/renderer/src/pages/Session.tsx`. Giữ nguyên tất cả logic. Thay phần JSX trong `return`:

```tsx
  if (!session) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-[#6b7280] hover:text-white text-sm flex items-center gap-1 mb-4">← Quay lại</button>
        <p className="text-[#6b7280]">Không tìm thấy phiên chơi.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-[#6b7280] hover:text-white text-sm flex items-center gap-1">← Quay lại</button>
        <h1 className="text-xl font-bold text-[#d4af37]">{session.table_name}</h1>
      </div>

      {/* Timer block */}
      <div className="bg-[#2d1515] border border-[#7f1d1d] rounded-xl p-8 mb-4 text-center">
        <p className="text-[#6b7280] text-[10px] uppercase tracking-widest mb-3">Thời gian chơi</p>
        <p className="text-6xl font-mono font-bold text-red-400 tracking-wider">{formatDuration(seconds)}</p>
        <p className="text-2xl font-bold text-red-400 mt-3">{formatCurrency(playAmount)}</p>
        <p className="text-xs text-[#6b7280] mt-1">{formatCurrency(session.hourly_rate)}/giờ</p>
      </div>

      {/* CTA */}
      <button
        className="w-full bg-[#d4af37] text-[#0d1f12] font-bold py-4 rounded-xl text-base hover:bg-yellow-400 transition-colors"
        onClick={() => onCheckout(session, playAmount)}
      >
        Kết thúc & Thanh toán — {formatCurrency(playAmount)}
      </button>
    </div>
  )
```

- [ ] **Step 2: Update Invoice.tsx — checkout page styling**

Đọc `src/renderer/src/pages/Invoice.tsx`. Giữ nguyên hoàn toàn tất cả logic, state, mutations. Chỉ thay className:

- Grid container: `className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto"`
- Customer lookup section: `bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-2 col-span-full`
- Label "KHÁCH HÀNG": `text-[10px] uppercase tracking-widest text-[#6b7280] mb-3`
- Tìm button: `bg-blue-700 hover:bg-blue-600`
- Found customer name: `text-green-400 font-medium`
- Points display: `text-[#d4af37] font-bold`
- ✕ Xóa button: `text-[#6b7280] hover:text-white`
- Points input label: `text-[#d4af37] text-xs`
- Points error: `text-red-400 text-xs`
- Points info: `text-green-400 text-xs`
- Đồ uống section header: `bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-4`
- "+ Thêm" button: `bg-[#d4af37] text-[#0d1f12] font-bold text-xs`
- Billing section: `bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 space-y-3`
- Discount input: `bg-[#0a1a0d] border-[#1e3d23] text-white mt-1`
- Divider: `border-t border-[#1e3d23]` → summary rows: text-sm
- Tổng cộng value: `text-[#d4af37] font-bold text-lg`
- "In hóa đơn" button: `bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400`
- "Lưu không in" button: `border border-[#d4af37] text-[#d4af37] hover:bg-[#162a1a]`

- [ ] **Step 3: Typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/pages/Session.tsx src/renderer/src/pages/Invoice.tsx && git commit -m "style: redesign Session and Invoice pages"
```

---

## Task 6: Login + Settings pages

**Files:**
- Modify: `src/renderer/src/pages/LoginPage.tsx`
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Rewrite LoginPage.tsx**

Đọc `src/renderer/src/pages/LoginPage.tsx`. Giữ nguyên toàn bộ logic (state, handleSubmit, error handling). Thay phần `return`:

```tsx
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1f12]">
      <form onSubmit={handleSubmit} className="bg-[#0a1a0d] border-2 border-[#d4af37] p-8 rounded-2xl w-96 space-y-5 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎱</div>
          <h1 className="text-2xl font-bold text-[#d4af37]">Bida Manager</h1>
          <p className="text-[#6b7280] text-sm mt-1">Đăng nhập để tiếp tục</p>
        </div>

        {error && (
          <div className="bg-[#2d1515] border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="text-[#d4af37] text-xs uppercase tracking-widest block mb-1.5">Tài khoản</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            className="w-full bg-[#162a1a] border border-[#1e3d23] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4af37] transition-colors"
            placeholder="Nhập tên đăng nhập"
          />
        </div>

        <div>
          <label className="text-[#d4af37] text-xs uppercase tracking-widest block mb-1.5">Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-[#162a1a] border border-[#1e3d23] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4af37] transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#d4af37] text-[#0d1f12] font-bold py-3 rounded-xl text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
```

- [ ] **Step 2: Update Settings.tsx styling**

Đọc `src/renderer/src/pages/Settings.tsx`. Giữ nguyên logic. Thay className:

- Page title `h1`: `text-xl font-bold text-[#d4af37]`
- Section containers: `bg-[#162a1a] border border-[#1e3d23] rounded-xl p-5 space-y-4`
- Section headings `h2`: `font-semibold text-[#d4af37] text-sm uppercase tracking-widest mb-3`
- Labels: `text-[#6b7280] text-xs`
- Inputs: `bg-[#0a1a0d] border-[#1e3d23] text-white focus:border-[#d4af37] mt-1`
- Hint text: `text-xs text-[#6b7280]`
- Save button normal: `bg-[#d4af37] text-[#0d1f12] font-bold w-full hover:bg-yellow-400`
- Save button saved state: `bg-green-700 text-white w-full`

- [ ] **Step 3: Full typecheck**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run typecheck
```

- [ ] **Step 4: Full tests**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm test
```
Expected: 43 passed (UI changes không ảnh hưởng tests).

- [ ] **Step 5: Build**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && npm run build
```

- [ ] **Step 6: Commit + push**

```bash
cd /Users/datnguyen/Documents/Freelance/bida && git add src/renderer/src/pages/LoginPage.tsx src/renderer/src/pages/Settings.tsx && git commit -m "style: redesign Login and Settings pages" && git push
```
