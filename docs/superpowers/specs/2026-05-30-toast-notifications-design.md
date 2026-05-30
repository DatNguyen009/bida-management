# Toast Notifications Design

**Date:** 2026-05-30
**Scope:** Thêm toast notifications (top-right) cho các hành động thành công/thất bại trong app.

---

## 1. Thư viện

**Sonner** — toast library nhỏ (1.3kb), được shadcn/ui recommend.

```bash
npm install sonner
```

---

## 2. Setup

Thêm `<Toaster>` một lần vào `src/renderer/src/App.tsx`:

```tsx
import { Toaster } from 'sonner'

// trong JSX return, bên trong root div:
<Toaster position="top-right" richColors theme="dark" />
```

Dùng ở bất kỳ component nào:
```typescript
import { toast } from 'sonner'
toast.success('message')
toast.error('message')
```

---

## 3. Danh sách toast theo trang

### LoginPage.tsx
| Event | Toast |
|-------|-------|
| Đăng nhập thành công | `toast.success('Đăng nhập thành công')` |
| Đăng nhập thất bại | `toast.error('Sai tài khoản hoặc mật khẩu')` |

Hiện tại login dùng `try/catch` + `setError` — giữ inline error, thêm toast lỗi để UX nhất quán. Toast lỗi thay thế `setError` để tránh trùng lặp.

### Invoice.tsx (`checkoutMutation`)
| Event | Toast |
|-------|-------|
| Lưu + in HĐ thành công | `toast.success('Đã in hoá đơn #XXXXX')` |
| Lưu không in thành công | `toast.success('Đã lưu hoá đơn #XXXXX')` |
| Thất bại | `toast.error('Lưu hoá đơn thất bại')` |

### Products.tsx
| Event | Toast |
|-------|-------|
| Tạo sản phẩm | `toast.success('Đã tạo sản phẩm')` |
| Sửa sản phẩm | `toast.success('Đã cập nhật sản phẩm')` |
| Xoá sản phẩm | `toast.success('Đã xoá sản phẩm')` |
| Nhập kho | `toast.success('Đã nhập kho')` |
| Thất bại (bất kỳ) | `toast.error('Có lỗi xảy ra')` |

### Customers.tsx
| Event | Toast |
|-------|-------|
| Tạo khách hàng | `toast.success('Đã tạo khách hàng')` |
| Sửa khách hàng | `toast.success('Đã cập nhật khách hàng')` |
| Thất bại | `toast.error('Có lỗi xảy ra')` |

### Settings.tsx
| Event | Toast |
|-------|-------|
| Lưu cài đặt | `toast.success('Đã lưu cài đặt')` — thay thế `setSaved` state hiện tại |
| Thất bại | `toast.error('Lưu cài đặt thất bại')` |

---

## 4. Files thay đổi

| File | Thay đổi |
|------|---------|
| `package.json` | Thêm `sonner` |
| `src/renderer/src/App.tsx` | Thêm `<Toaster>` |
| `src/renderer/src/pages/LoginPage.tsx` | Toast success/error thay setError |
| `src/renderer/src/pages/Invoice.tsx` | Toast success/error trong checkoutMutation |
| `src/renderer/src/pages/Products.tsx` | Toast success/error cho 4 mutations |
| `src/renderer/src/pages/Customers.tsx` | Toast success/error cho 2 mutations |
| `src/renderer/src/pages/Settings.tsx` | Toast thay setSaved + thêm onError |

---

## 5. Out of scope

- Toast khi tạo khách hàng từ `CustomerSearchInput` (đã có inline error)
- Toast khi thêm/xoá order items trong Invoice (quá granular)
- Toast khi mở/đóng bàn
