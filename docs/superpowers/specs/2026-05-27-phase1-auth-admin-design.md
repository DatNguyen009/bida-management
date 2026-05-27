# Phase 1: Auth + Web Admin — Design Spec

**Date:** 2026-05-27
**Status:** Approved
**Scope:** Phase 1 of multi-tenant expansion — login system, API server, web admin portal for master account management.

---

## Overview

Mở rộng app Electron quản lý quán bida thành nền tảng multi-tenant. Phase 1 tập trung vào:

1. **Express API Server** (`server/`) — xác thực và quản lý tài khoản agent
2. **Web Admin Portal** (`web-admin/`) — master tạo và quản lý tài khoản agent
3. **Electron Login Screen** — agent đăng nhập trước khi vào app

Phase 2 (tiếp theo): multi-tenant DB migration + sync engine.
Phase 3: master dashboard xem toàn bộ dữ liệu từng quán.

---

## Architecture

```
┌─────────────────────┐          HTTPS + JWT          ┌──────────────────────────┐
│   Electron App      │ ◄───────────────────────────► │   Express API Server     │
│   (login screen)    │                               │   server/  (Node.js)     │
└─────────────────────┘                               │                          │
                                                      │   PostgreSQL (cloud)     │
┌─────────────────────┐          HTTPS + JWT          │   - agents               │
│   Web Admin         │ ◄───────────────────────────► │   - accounts             │
│   web-admin/ (React)│                               │   - refresh_tokens       │
└─────────────────────┘                               └──────────────────────────┘
```

- **`server/`** — Node.js/Express + TypeScript. Chạy trên VPS. PostgreSQL riêng trên cloud (chỉ lưu accounts/agents, chưa lưu dữ liệu vận hành quán).
- **`web-admin/`** — React + Vite + shadcn/ui + Tailwind (cùng stack). Master đăng nhập, tạo và quản lý tài khoản agent.
- **Electron app** — thêm màn hình login. JWT lưu trong Main Process bằng `electron-store` (encrypted). Renderer không bao giờ thấy raw token.

---

## Database Schema (Cloud PostgreSQL)

```sql
-- Thông tin quán (agent)
CREATE TABLE agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,        -- tên quán
  phone       VARCHAR(20),
  address     TEXT,
  status      VARCHAR(20) DEFAULT 'active', -- active | suspended
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tài khoản đăng nhập
CREATE TABLE accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,              -- bcrypt cost 12
  role          VARCHAR(20) NOT NULL,       -- master | agent
  agent_id      UUID REFERENCES agents(id) NULL, -- NULL nếu là master
  status        VARCHAR(20) DEFAULT 'active',    -- active | suspended
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,               -- SHA-256 hash của token thực
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**Luồng quan hệ:** Master tạo 1 `agent` (thông tin quán) → tạo 1 `account` gắn `agent_id` → gửi username/password cho chủ quán.

**Master account** được seed sẵn khi deploy, `agent_id = NULL`.

**Token lifetime:**
- Access token: JWT, hết hạn **15 phút**
- Refresh token: hash SHA-256 lưu DB, hết hạn **30 ngày**

---

## API Endpoints

Base URL: `https://your-server.com/api/v1`

### Auth (public)

```
POST /auth/login          — username + password → access_token + refresh_token
POST /auth/refresh        — refresh_token → access_token mới
POST /auth/logout         — invalidate refresh_token
GET  /auth/me             — thông tin account hiện tại (cần JWT hợp lệ)
```

### Agents (master only)

```
GET    /agents              — danh sách tất cả agent (filter theo status)
POST   /agents              — tạo agent mới + account cùng lúc
GET    /agents/:id          — chi tiết 1 agent
PATCH  /agents/:id          — cập nhật thông tin / đổi status (suspend/activate)
POST   /agents/:id/reset-password  — master đặt lại password cho agent
```

### Middleware stack

```
Request → rate-limit → cors → json-parse → authenticate(JWT) → requireMaster → handler
```

- `/auth/login` và `/auth/refresh`: bỏ qua `authenticate`
- `/agents/*`: cần `role = master`
- `/auth/me`: chỉ cần JWT hợp lệ

### Rate limiting

- `/auth/login`: 10 req/phút/IP — chống brute force
- Các route khác: 100 req/phút/IP

---

## Electron App Changes

### Luồng khởi động mới

```
App start
  → đọc JWT từ electron-store
  → còn hạn?  ──yes──► vào app bình thường
      │
      no
      ▼
  có refresh token?  ──yes──► gọi /auth/refresh
      │                         ├─ thành công → lưu token mới → vào app
      │                         └─ thất bại  → hiện LoginPage
      no
      ▼
  hiện LoginPage
```

### Thay đổi code

**`src/main/handlers/auth.ts`** (file mới) — IPC handlers:
```
auth:login(username, password)  → gọi API, lưu tokens vào electron-store
auth:logout()                   → xóa tokens, gọi /auth/logout
auth:getMe()                    → trả về thông tin account hiện tại
```

**`src/renderer/src/pages/LoginPage.tsx`** (file mới) — form login.

**`src/renderer/src/App.tsx`** — thêm routing:
```
if (!authenticated) → render <LoginPage />
else               → render app bình thường
```

### Bảo mật token

- `electron-store` với encryption key lấy từ machine ID
- Lưu: `access_token`, `refresh_token`, `expires_at`
- Token nằm hoàn toàn trong Main Process
- Renderer chỉ gọi IPC, không bao giờ nhận raw JWT

---

## Web Admin Portal

### Cấu trúc `web-admin/`

```
web-admin/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx        — master đăng nhập
│   │   ├── AgentListPage.tsx    — danh sách agent, tạo mới
│   │   └── AgentDetailPage.tsx  — chi tiết, suspend/activate, reset pass
│   ├── components/
│   │   ├── AgentTable.tsx
│   │   ├── CreateAgentModal.tsx
│   │   └── ResetPasswordModal.tsx
│   ├── lib/
│   │   └── api.ts               — axios instance với auto token refresh
│   └── stores/
│       └── authStore.ts         — Zustand, access token in-memory
├── package.json
└── vite.config.ts
```

### Màn hình Agent List

```
┌─────────────────────────────────────────────┐
│ Bida Admin                    [Đăng xuất]   │
├─────────────────────────────────────────────┤
│ Quản lý Agent                 [+ Tạo agent] │
├──────────┬────────────┬────────┬────────────┤
│ Tên quán │ Username   │ Status │ Thao tác   │
├──────────┼────────────┼────────┼────────────┤
│ Quán ABC │ quan_abc   │ Active │ [Chi tiết] │
└──────────┴────────────┴────────┴────────────┘
```

### Form tạo agent mới (modal)

Fields: Tên quán, SĐT, địa chỉ, Username, Password (tự sinh ngẫu nhiên — hiển thị 1 lần để master copy gửi agent).

### Auth Web Admin

- Access token lưu **in-memory** (Zustand) — không lưu localStorage
- Refresh token lưu **httpOnly cookie** — browser tự gửi, JS không đọc được
- Khi F5 trang: tự gọi `/auth/refresh` bằng cookie → lấy lại access token

---

## Project Structure

```
bida/
├── src/                              # Electron app (hiện tại)
│   ├── main/
│   │   └── handlers/auth.ts          # NEW
│   └── renderer/src/
│       └── pages/LoginPage.tsx        # NEW
├── server/                           # NEW: Express API server
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   └── agents.ts
│   │   ├── middleware/
│   │   │   ├── authenticate.ts
│   │   │   └── requireMaster.ts
│   │   ├── db.ts
│   │   └── lib/
│   │       └── jwt.ts
│   ├── package.json
│   └── tsconfig.json
└── web-admin/                        # NEW: React admin app
    ├── src/
    └── package.json
```

---

## Error Handling

| Tình huống | Xử lý |
|-----------|-------|
| Electron: mất mạng lúc login | Hiện lỗi "Không kết nối được server", cho retry |
| Electron: access token hết hạn giữa chừng | Main process tự refresh, retry request trong suốt |
| Electron: refresh token hết hạn | Xóa token, đẩy về LoginPage |
| Web Admin: session hết hạn | Redirect về `/login` |
| Server: sai username/password | 401, message chung "Sai thông tin đăng nhập" |
| Server: account bị suspend | 403, message "Tài khoản đã bị khóa" |

---

## Deploy

- `server/`: chạy bằng `pm2` trên VPS
- `web-admin/`: build static, serve bằng nginx
- Cloud PostgreSQL: cùng VPS hoặc managed DB (Neon, RDS...)
- Master account: seed khi lần đầu deploy server

---

## Out of Scope (Phase 2+)

- Multi-tenant DB migration (thêm `agent_id` vào bảng dữ liệu quán)
- Sync engine (local PostgreSQL → cloud)
- Master dashboard xem dữ liệu vận hành của từng quán
