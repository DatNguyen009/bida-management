# UI Redesign — Design Spec

**Date:** 2026-05-30
**Scope:** Toàn bộ giao diện visual — không thay đổi logic, IPC, handler, hay tests

---

## 1. Quyết định thiết kế

| Hạng mục | Quyết định |
|----------|-----------|
| Theme | Billiard Dark Green |
| Navigation | Sidebar dọc bên trái |
| Table cards | Wide Row Card (nằm ngang) |
| Data pages | Bảng với enhanced styling |

---

## 2. Color Palette

```
Background chính:    #0d1f12   (toàn app)
Background sidebar:  #0a1a0d
Background card:     #162a1a   (idle/normal)
Background playing:  #2d1515   (đang chơi)
Background hover:    #162a1a

Gold accent:         #d4af37   (logo, header, title, CTA button)
Border normal:       #1e3d23
Border playing:      #7f1d1d / #991b1b

Text primary:        #e2e8f0
Text muted:          #6b7280
Text gold:           #d4af37

Green idle:          #4ade80   (badge trống)
Green idle bg:       #14532d
Green dark:          #15803d / #166534

Red playing:         #f87171   (badge đang chơi, timer)
Red playing bg:      #7f1d1d
Red warning:         #ef4444
```

Thêm vào `tailwind.config.js` custom colors:
```js
bida: {
  bg:       '#0d1f12',
  sidebar:  '#0a1a0d',
  card:     '#162a1a',
  playing:  '#2d1515',
  gold:     '#d4af37',
  border:   '#1e3d23',
  'border-playing': '#7f1d1d',
}
```

---

## 3. Sidebar Navigation

**Thay thế top nav hiện tại** trong `App.tsx`:

```
┌──────────────────┐
│ 🎱 Bida Manager  │  ← gold
│ qk_admin         │  ← muted
├──────────────────┤
│ 🏠 Dashboard     │  ← active: green bg + left border
│ 📦 Sản phẩm      │  ← muted
│ 🏪 Kho           │
│ 🧾 Hóa đơn       │
│ 👥 Khách hàng    │
│ 📊 Báo cáo       │
├──────────────────┤
│ ⚙  Cài đặt       │  ← bottom section
│ ↩  Đăng xuất     │  ← red
└──────────────────┘
```

- Width: `w-40` (160px), `flex-shrink-0`
- Border right: `border-r-2 border-bida-gold`
- Active item: `bg-[#1e3d23] text-green-400 border-l-[3px] border-green-400`
- Hover item: `hover:bg-[#162a1a] hover:text-white`
- Username: lấy từ authStore (role hiển thị hoặc tên agent)
- Main layout: `flex h-screen` → sidebar + `<main className="flex-1 overflow-auto p-6">`

---

## 4. Dashboard — Wide Row Card

Thay `TableCard.tsx` (hoặc inline trong `Dashboard.tsx`):

**Idle card:**
```
bg-bida-card border border-bida-border rounded-xl p-3 flex items-center gap-4
hover:border-green-500 transition-colors cursor-pointer

[Icon 44px gradient green rounded-lg] | [Tên gold bold / Rate muted] | [● Trống badge green]
```

**Playing card:**
```
bg-bida-playing border border-[#991b1b] rounded-xl p-3 flex items-center gap-4

[Icon 44px gradient red rounded-lg] | [Tên gold bold / Timer red monospace bold] | [Amount red bold / ● Đang chơi badge]
```

**Stats bar trên Dashboard:**
```
3 stat cards nhỏ: Bàn trống (green) | Đang chơi (red) | Doanh thu hôm nay (gold)
```

---

## 5. Data Tables (Products, Customers, InvoiceList, StockHistory, Reports)

```css
/* Table container */
.data-table { @apply bg-[#0a1a0d] rounded-xl overflow-hidden border border-bida-border }

/* Header */
thead tr { @apply bg-bida-card border-b-2 border-bida-gold }
th { @apply text-bida-gold text-[10px] uppercase tracking-widest font-semibold px-4 py-3 }

/* Body rows */
tbody tr:nth-child(even) { @apply bg-[#0d1a0f] }
tbody tr { @apply border-b border-bida-border hover:bg-bida-card transition-colors }
td { @apply px-4 py-3 text-sm text-[#e2e8f0] }

/* Badges */
.badge-green { @apply bg-[#14532d] text-green-400 text-[10px] px-2 py-0.5 rounded-full }
.badge-orange { @apply bg-[#292524] text-orange-400 text-[10px] px-2 py-0.5 rounded-full }
.badge-red { @apply bg-[#7f1d1d] text-red-400 text-[10px] px-2 py-0.5 rounded-full }

/* Amount */
.amount { @apply text-green-400 font-semibold }

/* Low stock warning */
.low-stock { @apply text-red-400 font-semibold }
```

---

## 6. Page header pattern

Mỗi trang có header nhất quán:
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-xl font-bold text-bida-gold">Tên trang</h1>
    <p className="text-xs text-gray-500 mt-0.5">Mô tả phụ nếu có</p>
  </div>
  <Button className="bg-bida-gold text-[#0d1f12] hover:bg-yellow-500 font-bold">
    + Thêm mới
  </Button>
</div>
```

---

## 7. Session page

```
Timer block: bg-[#2d1515] border border-[#7f1d1d] rounded-xl
  - Label: text-[10px] uppercase tracking-widest text-gray-500
  - Timer: text-4xl font-mono font-bold text-red-400
  - Amount: text-xl font-bold text-red-400

Order list: bg-bida-card border border-bida-border rounded-xl
  - Header gold, separator gold
  - Items: text-[#e2e8f0]
  - Total row: text-bida-gold font-bold

CTA button: bg-bida-gold text-[#0d1f12] font-bold py-3 rounded-xl w-full
```

---

## 8. Invoice / Checkout page

- Customer lookup section: `bg-bida-card border border-bida-border`
- Found customer: green accent
- Points input: styled input với label gold
- Billing section: card với gold separators
- Buttons: "In hóa đơn" = `bg-bida-gold text-[#0d1f12]`, "Lưu không in" = outline gold

---

## 9. Login page

```
Full screen: bg-bida-bg
Card center: bg-[#0a1a0d] border border-bida-gold rounded-2xl p-8 w-96
Logo: 🎱 text-3xl + "Bida Manager" text-bida-gold text-2xl font-bold
Inputs: bg-bida-card border-bida-border text-white focus:border-bida-gold
Button: bg-bida-gold text-[#0d1f12] font-bold w-full py-3 rounded-xl
```

---

## 10. File Map

| File | Thay đổi |
|------|---------|
| `tailwind.config.js` | Thêm `bida` color tokens |
| `src/renderer/src/App.tsx` | Sidebar layout, xóa top nav |
| `src/renderer/src/pages/Dashboard.tsx` | Stats bar + Wide Row cards |
| `src/renderer/src/components/TableCard.tsx` | Nếu tồn tại — update style |
| `src/renderer/src/pages/Products.tsx` | Enhanced table |
| `src/renderer/src/pages/Customers.tsx` | Enhanced table + panel |
| `src/renderer/src/pages/InvoiceList.tsx` | Enhanced table + panel |
| `src/renderer/src/pages/StockHistory.tsx` | Enhanced table |
| `src/renderer/src/pages/Reports.tsx` | Enhanced table |
| `src/renderer/src/pages/Session.tsx` | Timer + order styling |
| `src/renderer/src/pages/Invoice.tsx` | Checkout styling |
| `src/renderer/src/pages/Settings.tsx` | Form styling |
| `src/renderer/src/pages/LoginPage.tsx` | Login card styling |

---

## 11. Không trong scope

- Thay đổi logic, IPC, handler
- Thay đổi business logic hay data flow
- Thêm tính năng mới
- Responsive mobile (Electron desktop only)
- Animation / transition phức tạp
