# Background Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm 2 theme background (V1 blur nhẹ tím-xanh / V2 blur nặng cinematic) có thể chọn trong Settings, áp dụng liquid glass cho sidebar + topbar toàn app.

**Architecture:** Zustand store (`themeStore`) persist qua `localStorage` giữ theme hiện tại. `App.tsx` đọc theme để render background image + liquid glass CSS classes lên sidebar/topbar. Settings page thêm section picker để chuyển theme.

**Tech Stack:** React + Zustand (persist) + Tailwind custom classes + CSS backdrop-filter

---

## File Map

| File | Action | Mục đích |
|------|--------|---------|
| `src/renderer/src/assets/bg-v1.jpg` | Create (download) | Ảnh nền theme V1 |
| `src/renderer/src/assets/bg-v2.jpg` | Create (download) | Ảnh nền theme V2 |
| `src/renderer/src/stores/themeStore.ts` | Create | Zustand store lưu theme, persist localStorage |
| `src/renderer/src/assets/index.css` | Modify | Thêm CSS classes liquid glass + bg themes |
| `src/renderer/src/App.tsx` | Modify | Áp dụng theme vào root, sidebar, topbar |
| `src/renderer/src/pages/Settings.tsx` | Modify | Thêm section chọn theme |

---

## Task 1: Tải ảnh nền về assets

**Files:**
- Create: `src/renderer/src/assets/bg-v1.jpg`
- Create: `src/renderer/src/assets/bg-v2.jpg`

- [ ] **Step 1: Download V1**

```bash
curl -L "https://images.unsplash.com/photo-1603194040785-2ec37b8e9a22?w=1920&q=90" \
  -o src/renderer/src/assets/bg-v1.jpg
```

Expected: file `bg-v1.jpg` ~400–700 KB

- [ ] **Step 2: Download V2**

```bash
curl -L "https://plus.unsplash.com/premium_photo-1670624654509-bc6ea3222917?q=80&w=1920&auto=format&fit=crop" \
  -o src/renderer/src/assets/bg-v2.jpg
```

Expected: file `bg-v2.jpg` ~400–700 KB

- [ ] **Step 3: Kiểm tra**

```bash
ls -lh src/renderer/src/assets/
```

Expected: thấy `bg-v1.jpg`, `bg-v2.jpg`, `index.css`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/assets/bg-v1.jpg src/renderer/src/assets/bg-v2.jpg
git commit -m "assets: add background images for theme v1 and v2"
```

---

## Task 2: Tạo themeStore

**Files:**
- Create: `src/renderer/src/stores/themeStore.ts`

- [ ] **Step 1: Viết store**

```ts
// src/renderer/src/stores/themeStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppTheme = 'v1' | 'v2'

interface ThemeStore {
  theme: AppTheme
  setTheme: (t: AppTheme) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'v1',
      setTheme: (t) => set({ theme: t }),
    }),
    { name: 'bida-theme' }
  )
)
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/themeStore.ts
git commit -m "feat: add themeStore with localStorage persistence"
```

---

## Task 3: Thêm CSS liquid glass vào index.css

**Files:**
- Modify: `src/renderer/src/assets/index.css`

- [ ] **Step 1: Append CSS classes sau phần `@layer base` cuối file**

Mở `src/renderer/src/assets/index.css`, thêm vào **cuối file**:

```css
/* ─── Background Themes ─── */
.theme-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  transition: filter 0.5s ease;
}

.theme-bg-v1 {
  filter: brightness(0.52) saturate(1.2);
}
.theme-bg-v1::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(20, 10, 40, 0.45) 0%, rgba(0, 20, 40, 0.35) 100%);
}

.theme-bg-v2 {
  filter: blur(14px) brightness(0.42) saturate(1.4);
  transform: scale(1.06);
}
.theme-bg-v2::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(30, 10, 0, 0.5) 0%, rgba(10, 5, 0, 0.3) 100%);
}

/* ─── Liquid Glass Sidebar ─── */
.glass-sidebar {
  background: linear-gradient(
    170deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.07) 40%,
    rgba(255, 255, 255, 0.04) 100%
  );
  backdrop-filter: blur(72px) saturate(200%) brightness(1.08);
  -webkit-backdrop-filter: blur(72px) saturate(200%) brightness(1.08);
  border-right: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 1px 0 0 rgba(255, 255, 255, 0.28),
    inset -1px 0 0 rgba(255, 255, 255, 0.04),
    6px 0 40px rgba(0, 0, 0, 0.35);
}
.glass-sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 180px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.13) 0%,
    rgba(255, 255, 255, 0.04) 60%,
    transparent 100%
  );
  pointer-events: none;
}

/* ─── Liquid Glass Topbar ─── */
.glass-topbar {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.09) 0%,
    rgba(255, 255, 255, 0.04) 100%
  );
  backdrop-filter: blur(60px) saturate(180%);
  -webkit-backdrop-filter: blur(60px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 4px 20px rgba(0, 0, 0, 0.15);
}

/* ─── Active nav item ─── */
.glass-nav-active {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.18) 0%,
    rgba(255, 255, 255, 0.09) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 4px 16px rgba(0, 0, 0, 0.2);
}
```

- [ ] **Step 2: Verify CSS parse (dev server không báo lỗi)**

```bash
npm run dev 2>&1 | head -30
```

Expected: build thành công, không có CSS error

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/assets/index.css
git commit -m "style: add liquid glass and theme background CSS classes"
```

---

## Task 4: Cập nhật App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx`

Mục tiêu: (a) import ảnh + themeStore, (b) render `<div class="theme-bg">` cố định phía sau layout, (c) đổi sidebar/topbar dùng `glass-sidebar`/`glass-topbar`, (d) bỏ `bg-[#0f0e0f]` trên root và topbar.

- [ ] **Step 1: Thêm imports ở đầu file (sau các import hiện tại)**

```ts
import bgV1 from './assets/bg-v1.jpg'
import bgV2 from './assets/bg-v2.jpg'
import { useThemeStore } from './stores/themeStore'
```

- [ ] **Step 2: Đọc theme trong component**

Trong `App()`, thêm dòng này ngay sau `const isOwner = ...`:

```ts
const theme = useThemeStore((s) => s.theme)
const bgImage = theme === 'v1' ? bgV1 : bgV2
```

- [ ] **Step 3: Thêm background div vào loading state**

Tìm đoạn:
```tsx
if (authState === 'checking') {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0e0f]">
      <p className="text-gray-500 text-sm">Đang tải...</p>
    </div>
  )
}
```

Đổi thành:
```tsx
if (authState === 'checking') {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div
        className={`theme-bg theme-bg-${theme}`}
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <p className="text-gray-500 text-sm relative z-10">Đang tải...</p>
    </div>
  )
}
```

- [ ] **Step 4: Cập nhật root div của main layout**

Tìm:
```tsx
<div className="flex h-screen bg-[#0f0e0f] text-white overflow-hidden">
```

Đổi thành:
```tsx
<div className="flex h-screen text-white overflow-hidden relative">
  {/* Background layer */}
  <div
    className={`theme-bg theme-bg-${theme}`}
    style={{ backgroundImage: `url(${bgImage})` }}
  />
```

Lưu ý: thêm `<div>` mở mới cho background — đảm bảo nó nằm **trước** `<aside>`.

- [ ] **Step 5: Cập nhật aside sidebar**

Tìm:
```tsx
<aside className="w-48 flex-shrink-0 bg-[#141313] border-r border-[#272525] flex flex-col">
```

Đổi thành:
```tsx
<aside className="glass-sidebar w-48 flex-shrink-0 flex flex-col relative">
```

- [ ] **Step 6: Cập nhật search box trong sidebar**

Tìm:
```tsx
<div className="flex items-center gap-2 bg-[#1c1b1b] border border-[#272525] rounded-lg px-3 py-1.5">
```

Đổi thành:
```tsx
<div className="flex items-center gap-2 bg-white/[0.07] border border-white/10 rounded-lg px-3 py-1.5">
```

- [ ] **Step 7: Cập nhật active nav item**

Tìm className của nav button (dòng có `bg-[#252323]`):
```tsx
className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2.5 mb-0.5
  ${currentPage === page
    ? 'bg-[#252323] text-white font-medium'
    : 'text-[#6b6b6b] hover:bg-[#1c1b1b] hover:text-[#aaaaaa]'
  }`}
```

Đổi thành:
```tsx
className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2.5 mb-0.5
  ${currentPage === page
    ? 'glass-nav-active text-white font-medium'
    : 'text-white/40 hover:bg-white/[0.06] hover:text-white/80'
  }`}
```

- [ ] **Step 8: Cập nhật border-t footer trong sidebar**

Tìm:
```tsx
className="px-2 py-3 border-t border-[#272525] space-y-0.5"
```
(Nếu có — là phần cuối nav)

Đổi `border-[#272525]` thành `border-white/[0.08]`.

- [ ] **Step 9: Cập nhật topbar**

Tìm:
```tsx
<header className="flex-shrink-0 h-12 bg-[#0f0e0f] border-b border-[#272525] flex items-center px-6 gap-2">
```

Đổi thành:
```tsx
<header className="glass-topbar flex-shrink-0 h-12 flex items-center px-6 gap-2">
```

- [ ] **Step 10: Đóng thêm `</div>` cho background div**

Cuối return, trước dấu `}` của component, đảm bảo có `</div>` đóng cho root div đã thêm background (tổng cộng root div có thêm 1 child là `.theme-bg`).

- [ ] **Step 11: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 12: Chạy app và kiểm tra bằng mắt**

```bash
npm run dev
```

Mở app, kiểm tra:
- Background ảnh hiển thị (không còn màu `#0f0e0f` đen thuần)
- Sidebar có hiệu ứng kính mờ
- Topbar có hiệu ứng kính mờ

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: apply liquid glass theme to App layout"
```

---

## Task 5: Thêm Theme Picker vào Settings

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Import themeStore**

Thêm vào đầu file `Settings.tsx`, sau các import hiện tại:

```ts
import { useThemeStore, type AppTheme } from '../stores/themeStore'
import bgV1 from '../assets/bg-v1.jpg'
import bgV2 from '../assets/bg-v2.jpg'
```

- [ ] **Step 2: Đọc theme trong component**

Trong `SettingsPage()`, thêm sau dòng `const queryClient = useQueryClient()`:

```ts
const { theme, setTheme } = useThemeStore()
```

- [ ] **Step 3: Thêm section theme picker vào tab settings**

Tìm đoạn cuối của `{activeTab === 'settings' && (` — ngay **trước** `</div>` đóng của block đó — thêm section mới:

```tsx
<section className="bg-white/[0.06] border border-white/10 rounded-xl p-5 space-y-4">
  <h3 className="text-white font-semibold text-sm">Giao diện</h3>
  <p className="text-[#6b7280] text-xs">Chọn background theme cho toàn bộ app.</p>
  <div className="grid grid-cols-2 gap-4">
    {(
      [
        {
          id: 'v1' as AppTheme,
          label: 'V1 — Blur nhẹ',
          desc: 'Tím xanh · Ảnh rõ',
          bg: bgV1,
          overlayClass: 'bg-[rgba(20,10,40,0.45)]',
        },
        {
          id: 'v2' as AppTheme,
          label: 'V2 — Cinematic',
          desc: 'Amber warm · Blur nặng',
          bg: bgV2,
          overlayClass: 'bg-[rgba(30,10,0,0.5)]',
        },
      ] as const
    ).map((t) => (
      <button
        key={t.id}
        onClick={() => setTheme(t.id)}
        className={`relative rounded-xl overflow-hidden border-2 transition-all text-left
          ${theme === t.id
            ? 'border-[#d4af37] shadow-[0_0_16px_rgba(212,175,55,0.4)]'
            : 'border-white/10 hover:border-white/25'
          }`}
      >
        {/* Preview thumbnail */}
        <div className="h-24 relative">
          <img
            src={t.bg}
            alt={t.label}
            className="w-full h-full object-cover"
            style={{ filter: t.id === 'v2' ? 'blur(4px) brightness(0.5) saturate(1.4)' : 'brightness(0.52) saturate(1.2)' }}
          />
          <div className={`absolute inset-0 ${t.overlayClass}`} />
          {/* Glassmorphism strip */}
          <div className="absolute bottom-0 left-0 right-0 h-8 backdrop-blur-md bg-white/10 border-t border-white/15" />
        </div>
        {/* Label */}
        <div className="p-3 bg-white/[0.04]">
          <p className="text-white text-xs font-semibold">{t.label}</p>
          <p className="text-white/40 text-[10px] mt-0.5">{t.desc}</p>
        </div>
        {/* Active checkmark */}
        {theme === t.id && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#d4af37] flex items-center justify-center">
            <span className="text-[10px] text-black font-bold">✓</span>
          </div>
        )}
      </button>
    ))}
  </div>
</section>
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 5: Chạy app và test**

```bash
npm run dev
```

Vào **Cài đặt** → cuộn xuống section "Giao diện":
- Click V2: background app chuyển sang cinematic ngay lập tức
- Reload app: theme vẫn giữ (localStorage persist)
- Click V1: background trở lại tím xanh

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: add theme picker in Settings page"
```

---

## Task 6: Cập nhật LoginPage background

**Files:**
- Modify: `src/renderer/src/pages/LoginPage.tsx`

LoginPage cần hiển thị đúng theme đã chọn (người dùng thấy background ngay từ màn hình login).

- [ ] **Step 1: Xem cấu trúc LoginPage hiện tại**

```bash
head -30 src/renderer/src/pages/LoginPage.tsx
```

- [ ] **Step 2: Thêm imports**

```ts
import { useThemeStore } from '../stores/themeStore'
import bgV1 from '../assets/bg-v1.jpg'
import bgV2 from '../assets/bg-v2.jpg'
```

- [ ] **Step 3: Áp dụng theme vào root div của LoginPage**

Đọc root div hiện tại (thường là `className="min-h-screen flex items-center justify-center bg-[#0f0e0f]"` hoặc tương tự).

Thêm trong component:
```ts
const theme = useThemeStore((s) => s.theme)
const bgImage = theme === 'v1' ? bgV1 : bgV2
```

Đổi root div thành:
```tsx
<div className="min-h-screen flex items-center justify-center relative overflow-hidden">
  <div
    className={`theme-bg theme-bg-${theme}`}
    style={{ backgroundImage: `url(${bgImage})` }}
  />
  {/* ... nội dung login card giữ nguyên, thêm relative z-10 ... */}
</div>
```

Đảm bảo login card (form box) có `relative z-10` để nằm trên background.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/LoginPage.tsx
git commit -m "feat: apply theme background to LoginPage"
```
