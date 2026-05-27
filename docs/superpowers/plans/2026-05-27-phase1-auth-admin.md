# Phase 1: Auth + Web Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm màn hình đăng nhập vào Electron app, xây Express API server xử lý auth và quản lý agent, và tạo React web admin portal cho master account.

**Architecture:** Express API server (`server/`) xử lý auth + agent CRUD với PostgreSQL cloud riêng. Web Admin (`web-admin/`) là React SPA gọi API. Electron app thêm login screen; token lưu trong Main Process bằng `electron-store` (không bao giờ expose ra renderer).

**Tech Stack:** Node.js + Express + TypeScript (server), React + Vite + Tailwind (web-admin), electron-store v8 (Electron token), bcrypt + jsonwebtoken, pg (postgres), vitest + supertest (tests).

---

## File Map

### Tạo mới — `server/`
| File | Mục đích |
|------|---------|
| `server/package.json` | Dependencies server |
| `server/tsconfig.json` | TypeScript config |
| `server/.env.example` | Các biến môi trường cần thiết |
| `server/db/schema.sql` | DDL cloud DB (agents, accounts, refresh_tokens) |
| `server/db/seed-master.ts` | Seed master account lần đầu deploy |
| `server/src/db.ts` | pg Pool singleton |
| `server/src/lib/password.ts` | bcrypt hash/verify + tạo password ngẫu nhiên |
| `server/src/lib/jwt.ts` | sign/verify access token, generate refresh token |
| `server/src/middleware/authenticate.ts` | Verify JWT Bearer, gắn `req.account` |
| `server/src/middleware/requireMaster.ts` | Guard role = master |
| `server/src/routes/auth.ts` | /auth/login, /auth/refresh, /auth/logout, /auth/me |
| `server/src/routes/agents.ts` | CRUD agent + reset-password |
| `server/src/index.ts` | Express app, CORS, rate limit, mount routes |
| `server/tests/password.test.ts` | Unit tests password helpers |
| `server/tests/jwt.test.ts` | Unit tests jwt helpers |
| `server/tests/middleware.test.ts` | Unit tests middleware |
| `server/tests/auth.test.ts` | Integration tests auth routes |
| `server/tests/agents.test.ts` | Integration tests agents routes |

### Tạo mới — `web-admin/`
| File | Mục đích |
|------|---------|
| `web-admin/package.json` | Dependencies |
| `web-admin/vite.config.ts` | Vite config, port 5174 |
| `web-admin/tsconfig.json` | TypeScript config |
| `web-admin/index.html` | HTML entry |
| `web-admin/tailwind.config.js` | Tailwind config |
| `web-admin/postcss.config.js` | PostCSS config |
| `web-admin/src/main.tsx` | React entry |
| `web-admin/src/index.css` | Tailwind directives |
| `web-admin/src/App.tsx` | Router: /login, /, /agents/:id |
| `web-admin/src/lib/api.ts` | axios instance + auto refresh interceptor |
| `web-admin/src/stores/authStore.ts` | Zustand: access token in-memory |
| `web-admin/src/pages/LoginPage.tsx` | Form đăng nhập master |
| `web-admin/src/pages/AgentListPage.tsx` | Danh sách agent, nút tạo mới |
| `web-admin/src/pages/AgentDetailPage.tsx` | Chi tiết agent, suspend/activate |
| `web-admin/src/components/CreateAgentModal.tsx` | Modal tạo agent + hiện password |
| `web-admin/src/components/ResetPasswordModal.tsx` | Modal reset password |

### Sửa — Electron app
| File | Thay đổi |
|------|---------|
| `src/main/handlers/auth.ts` | **MỚI** — IPC handlers: auth:login, auth:logout, auth:getSession |
| `src/main/index.ts` | Import + gọi `registerAuthHandlers()` |
| `src/preload/index.ts` | Thêm namespace `auth` vào contextBridge |
| `src/renderer/src/electron.d.ts` | Thêm type `auth` vào `Window.api` |
| `src/renderer/src/pages/LoginPage.tsx` | **MỚI** — Form đăng nhập |
| `src/renderer/src/App.tsx` | Thêm auth gate trước khi render app |

---

## Task 1: Server scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`

- [ ] **Step 1: Tạo server/package.json**

```json
{
  "name": "bida-server",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/pg": "^8.11.6",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.15.7",
    "typescript": "^5.5.3",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Tạo server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Tạo server/.env.example**

```
DATABASE_URL=postgresql://user:pass@localhost:5432/bida_cloud
JWT_ACCESS_SECRET=change-me-to-a-long-random-string-min-32-chars
PORT=4000
WEB_ADMIN_URL=http://localhost:5174
NODE_ENV=development
```

- [ ] **Step 4: Cài dependencies**

```bash
cd server && npm install
```

Expected: `node_modules/` được tạo, không có lỗi.

- [ ] **Step 5: Copy .env và điền giá trị thực**

```bash
cp server/.env.example server/.env
```

Sau đó sửa `server/.env`: điền `DATABASE_URL` thực và tạo `JWT_ACCESS_SECRET` ngẫu nhiên:

```bash
openssl rand -hex 32
```

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json server/.env.example
git commit -m "feat: scaffold server package"
```

---

## Task 2: Cloud DB schema + seed master

**Files:**
- Create: `server/db/schema.sql`
- Create: `server/db/seed-master.ts`

- [ ] **Step 1: Tạo server/db/schema.sql**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(20),
  address     TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('master', 'agent')),
  agent_id      UUID REFERENCES agents(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);
```

- [ ] **Step 2: Chạy schema lên cloud DB**

```bash
psql $DATABASE_URL < server/db/schema.sql
```

Expected: Không có lỗi, 3 bảng được tạo.

- [ ] **Step 3: Tạo server/db/seed-master.ts**

```typescript
import { Pool } from 'pg'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function seed() {
  const hash = await bcrypt.hash('admin123', 12)
  await pool.query(
    `INSERT INTO accounts (username, password_hash, role)
     VALUES ('master', $1, 'master')
     ON CONFLICT (username) DO NOTHING`,
    [hash]
  )
  console.log('Master seeded — username: master, password: admin123')
  console.log('Đổi password ngay sau lần đăng nhập đầu tiên!')
  await pool.end()
}

seed().catch(console.error)
```

- [ ] **Step 4: Chạy seed**

```bash
cd server && npx tsx db/seed-master.ts
```

Expected: `Master seeded — username: master, password: admin123`

- [ ] **Step 5: Commit**

```bash
git add server/db/
git commit -m "feat: add cloud DB schema and master seed script"
```

---

## Task 3: DB + password + JWT helpers

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/lib/password.ts`
- Create: `server/src/lib/jwt.ts`
- Test: `server/tests/password.test.ts`
- Test: `server/tests/jwt.test.ts`

- [ ] **Step 1: Tạo server/src/db.ts**

```typescript
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
```

- [ ] **Step 2: Tạo server/src/lib/password.ts**

```typescript
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}
```

- [ ] **Step 3: Tạo server/src/lib/jwt.ts**

```typescript
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!

export interface TokenPayload {
  accountId: string
  role: 'master' | 'agent'
  agentId: string | null
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' })
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload
}

export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(40).toString('hex')
  const hash = hashToken(raw)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  return { raw, hash, expiresAt }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
```

- [ ] **Step 4: Viết tests helpers — expect FAIL**

Tạo `server/tests/password.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generatePassword } from '../src/lib/password'

describe('password helpers', () => {
  it('hashPassword trả về bcrypt hash', async () => {
    const hash = await hashPassword('secret')
    expect(hash).toMatch(/^\$2b\$/)
  })

  it('verifyPassword trả về true với đúng password', async () => {
    const hash = await hashPassword('secret')
    expect(await verifyPassword('secret', hash)).toBe(true)
  })

  it('verifyPassword trả về false với sai password', async () => {
    const hash = await hashPassword('secret')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('generatePassword trả về đúng độ dài', () => {
    expect(generatePassword(12)).toHaveLength(12)
  })

  it('generatePassword chỉ dùng ký tự an toàn', () => {
    expect(generatePassword(50)).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/)
  })
})
```

Tạo `server/tests/jwt.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } from '../src/lib/jwt'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

describe('jwt helpers', () => {
  it('sign + verify round-trips payload', () => {
    const payload = { accountId: 'abc', role: 'master' as const, agentId: null }
    const token = signAccessToken(payload)
    const decoded = verifyAccessToken(token)
    expect(decoded.accountId).toBe('abc')
    expect(decoded.role).toBe('master')
    expect(decoded.agentId).toBeNull()
  })

  it('verifyAccessToken throws với token không hợp lệ', () => {
    expect(() => verifyAccessToken('bad-token')).toThrow()
  })

  it('generateRefreshToken trả về raw 80 chars, hash 64 chars, expires tương lai', () => {
    const { raw, hash, expiresAt } = generateRefreshToken()
    expect(raw).toHaveLength(80)
    expect(hash).toHaveLength(64)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('hashToken là deterministic', () => {
    expect(hashToken('foo')).toBe(hashToken('foo'))
  })
})
```

- [ ] **Step 5: Chạy tests — expect FAIL**

```bash
cd server && npm test -- tests/password.test.ts tests/jwt.test.ts
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 6: Chạy lại sau khi các file đã tạo ở Step 1-3 — expect PASS**

```bash
cd server && npm test -- tests/password.test.ts tests/jwt.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/ server/tests/password.test.ts server/tests/jwt.test.ts
git commit -m "feat: add db pool, password and jwt helpers"
```

---

## Task 4: Auth middleware

**Files:**
- Create: `server/src/middleware/authenticate.ts`
- Create: `server/src/middleware/requireMaster.ts`
- Test: `server/tests/middleware.test.ts`

- [ ] **Step 1: Viết failing test**

Tạo `server/tests/middleware.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { authenticate } from '../src/middleware/authenticate'
import { requireMaster } from '../src/middleware/requireMaster'
import { signAccessToken } from '../src/lib/jwt'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

function makeApp() {
  const app = express()
  app.get('/protected', authenticate, (_req, res) => res.json({ ok: true }))
  app.get('/master-only', authenticate, requireMaster, (_req, res) => res.json({ ok: true }))
  return app
}

describe('authenticate', () => {
  it('401 khi không có Authorization header', async () => {
    const res = await request(makeApp()).get('/protected')
    expect(res.status).toBe(401)
  })

  it('401 khi token không hợp lệ', async () => {
    const res = await request(makeApp()).get('/protected').set('Authorization', 'Bearer bad')
    expect(res.status).toBe(401)
  })

  it('200 với token master hợp lệ', async () => {
    const token = signAccessToken({ accountId: 'id1', role: 'master', agentId: null })
    const res = await request(makeApp()).get('/protected').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})

describe('requireMaster', () => {
  it('403 với role agent', async () => {
    const token = signAccessToken({ accountId: 'id2', role: 'agent', agentId: 'a1' })
    const res = await request(makeApp()).get('/master-only').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('200 với role master', async () => {
    const token = signAccessToken({ accountId: 'id1', role: 'master', agentId: null })
    const res = await request(makeApp()).get('/master-only').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Chạy test — expect FAIL**

```bash
cd server && npm test -- tests/middleware.test.ts
```

Expected: FAIL — "Cannot find module '../src/middleware/authenticate'"

- [ ] **Step 3: Tạo server/src/middleware/authenticate.ts**

```typescript
import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, TokenPayload } from '../lib/jwt'

export interface AuthRequest extends Request {
  account?: TokenPayload
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    req.account = verifyAccessToken(authHeader.slice(7))
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

- [ ] **Step 4: Tạo server/src/middleware/requireMaster.ts**

```typescript
import { Response, NextFunction } from 'express'
import { AuthRequest } from './authenticate'

export function requireMaster(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.account?.role !== 'master') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
```

- [ ] **Step 5: Chạy test — expect PASS**

```bash
cd server && npm test -- tests/middleware.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/ server/tests/middleware.test.ts
git commit -m "feat: add authenticate and requireMaster middleware"
```

---

## Task 5: Auth routes

**Files:**
- Create: `server/src/routes/auth.ts`
- Test: `server/tests/auth.test.ts`

- [ ] **Step 1: Viết failing tests**

Tạo `server/tests/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

vi.mock('../src/db', () => ({
  pool: { query: vi.fn() }
}))

import { pool } from '../src/db'
import { authRouter } from '../src/routes/auth'
import { hashPassword } from '../src/lib/password'
import { generateRefreshToken } from '../src/lib/jwt'

const mockQuery = pool.query as ReturnType<typeof vi.fn>

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRouter)
  return app
}

describe('POST /auth/login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 khi thiếu body', async () => {
    const res = await request(makeApp()).post('/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('401 khi username không tồn tại', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'x', password: 'y' })
    expect(res.status).toBe(401)
  })

  it('401 khi sai password', async () => {
    const hash = await hashPassword('correct')
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uid1', password_hash: hash, role: 'master', agent_id: null, status: 'active' }]
    })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'master', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('403 khi account bị suspended', async () => {
    const hash = await hashPassword('pass')
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uid1', password_hash: hash, role: 'agent', agent_id: 'a1', status: 'suspended' }]
    })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'agent1', password: 'pass' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Tài khoản đã bị khóa')
  })

  it('200 với accessToken + refreshToken khi login thành công', async () => {
    const hash = await hashPassword('pass')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'uid1', password_hash: hash, role: 'master', agent_id: null, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp()).post('/auth/login').send({ username: 'master', password: 'pass' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body.role).toBe('master')
  })
})

describe('POST /auth/refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 khi thiếu refreshToken', async () => {
    const res = await request(makeApp()).post('/auth/refresh').send({})
    expect(res.status).toBe(400)
  })

  it('401 khi token không tồn tại trong DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp()).post('/auth/refresh').send({ refreshToken: 'bad' })
    expect(res.status).toBe(401)
  })

  it('200 với accessToken mới cho refresh token hợp lệ', async () => {
    const { raw } = generateRefreshToken()
    mockQuery.mockResolvedValueOnce({
      rows: [{
        account_id: 'uid1',
        expires_at: new Date(Date.now() + 1_000_000),
        role: 'master',
        agent_id: null,
        status: 'active'
      }]
    })
    const res = await request(makeApp()).post('/auth/refresh').send({ refreshToken: raw })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
  })
})

describe('POST /auth/logout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 khi không có Authorization header', async () => {
    const res = await request(makeApp()).post('/auth/logout').send({})
    expect(res.status).toBe(401)
  })

  it('200 khi có valid token', async () => {
    const hash = await hashPassword('pass')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'uid1', password_hash: hash, role: 'master', agent_id: null, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { body: { accessToken, refreshToken } } = await request(makeApp())
      .post('/auth/login').send({ username: 'master', password: 'pass' })

    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Chạy test — expect FAIL**

```bash
cd server && npm test -- tests/auth.test.ts
```

Expected: FAIL — "Cannot find module '../src/routes/auth'"

- [ ] **Step 3: Tạo server/src/routes/auth.ts**

```typescript
import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { verifyPassword } from '../lib/password'
import { signAccessToken, generateRefreshToken, hashToken } from '../lib/jwt'
import { authenticate, AuthRequest } from '../middleware/authenticate'

export const authRouter = Router()

authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' })
    return
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, password_hash, role, agent_id, status FROM accounts WHERE username = $1',
      [username]
    )
    const account = rows[0]
    if (!account || !(await verifyPassword(password, account.password_hash))) {
      res.status(401).json({ error: 'Sai thông tin đăng nhập' })
      return
    }
    if (account.status === 'suspended') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa' })
      return
    }
    const payload = { accountId: account.id, role: account.role, agentId: account.agent_id }
    const accessToken = signAccessToken(payload)
    const { raw, hash, expiresAt } = generateRefreshToken()
    await pool.query(
      'INSERT INTO refresh_tokens (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [account.id, hash, expiresAt]
    )
    await pool.query('UPDATE accounts SET last_login_at = NOW() WHERE id = $1', [account.id])
    res.json({ accessToken, refreshToken: raw, role: account.role, agentId: account.agent_id })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' })
    return
  }
  try {
    const { rows } = await pool.query(
      `SELECT rt.account_id, rt.expires_at, a.role, a.agent_id, a.status
       FROM refresh_tokens rt
       JOIN accounts a ON a.id = rt.account_id
       WHERE rt.token_hash = $1`,
      [hashToken(refreshToken)]
    )
    const row = rows[0]
    if (!row || new Date(row.expires_at) < new Date()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' })
      return
    }
    if (row.status === 'suspended') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa' })
      return
    }
    const accessToken = signAccessToken({ accountId: row.account_id, role: row.role, agentId: row.agent_id })
    res.json({ accessToken })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)])
  }
  res.json({ ok: true })
})

authRouter.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  res.json(req.account)
})
```

- [ ] **Step 4: Chạy test — expect PASS**

```bash
cd server && npm test -- tests/auth.test.ts
```

Expected: Tất cả tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/auth.ts server/tests/auth.test.ts
git commit -m "feat: add auth routes (login, refresh, logout, me)"
```

---

## Task 6: Agents routes

**Files:**
- Create: `server/src/routes/agents.ts`
- Test: `server/tests/agents.test.ts`

- [ ] **Step 1: Viết failing tests**

Tạo `server/tests/agents.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

vi.mock('../src/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() }
}))

import { pool } from '../src/db'
import { agentsRouter } from '../src/routes/agents'
import { signAccessToken } from '../src/lib/jwt'

const mockQuery = pool.query as ReturnType<typeof vi.fn>
const mockConnect = pool.connect as ReturnType<typeof vi.fn>

const masterToken = () => signAccessToken({ accountId: 'uid1', role: 'master', agentId: null })
const agentToken = () => signAccessToken({ accountId: 'uid2', role: 'agent', agentId: 'a1' })

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/agents', agentsRouter)
  return app
}

describe('GET /agents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 không có auth', async () => {
    const res = await request(makeApp()).get('/agents')
    expect(res.status).toBe(401)
  })

  it('403 với role agent', async () => {
    const res = await request(makeApp()).get('/agents').set('Authorization', `Bearer ${agentToken()}`)
    expect(res.status).toBe(403)
  })

  it('200 trả về danh sách agents cho master', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Quán ABC', username: 'quan_abc' }] })
    const res = await request(makeApp()).get('/agents').set('Authorization', `Bearer ${masterToken()}`)
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('Quán ABC')
  })
})

describe('POST /agents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 khi thiếu name', async () => {
    const res = await request(makeApp())
      .post('/agents').set('Authorization', `Bearer ${masterToken()}`).send({ username: 'x' })
    expect(res.status).toBe(400)
  })

  it('201 tạo agent và trả về generated password', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'new-id' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined),
      release: vi.fn()
    }
    mockConnect.mockResolvedValueOnce(client)
    const res = await request(makeApp())
      .post('/agents').set('Authorization', `Bearer ${masterToken()}`)
      .send({ name: 'Quán XYZ', username: 'quan_xyz' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('password')
    expect(res.body.username).toBe('quan_xyz')
  })

  it('409 khi username trùng', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'aid' }] })
        .mockRejectedValueOnce({ code: '23505' }),
      release: vi.fn()
    }
    mockConnect.mockResolvedValueOnce(client)
    const res = await request(makeApp())
      .post('/agents').set('Authorization', `Bearer ${masterToken()}`)
      .send({ name: 'Quán XYZ', username: 'quan_xyz' })
    expect(res.status).toBe(409)
  })
})

describe('PATCH /agents/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 suspend agent và sync account status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp())
      .patch('/agents/a1').set('Authorization', `Bearer ${masterToken()}`)
      .send({ status: 'suspended' })
    expect(res.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('404 khi agent không tồn tại', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp())
      .patch('/agents/unknown').set('Authorization', `Bearer ${masterToken()}`)
      .send({ status: 'suspended' })
    expect(res.status).toBe(404)
  })
})

describe('POST /agents/:id/reset-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 trả về password mới và xóa refresh tokens', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'account-id' }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(makeApp())
      .post('/agents/a1/reset-password').set('Authorization', `Bearer ${masterToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('password')
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Chạy test — expect FAIL**

```bash
cd server && npm test -- tests/agents.test.ts
```

Expected: FAIL — "Cannot find module '../src/routes/agents'"

- [ ] **Step 3: Tạo server/src/routes/agents.ts**

```typescript
import { Router, Response } from 'express'
import { pool } from '../db'
import { hashPassword, generatePassword } from '../lib/password'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { requireMaster } from '../middleware/requireMaster'

export const agentsRouter = Router()
agentsRouter.use(authenticate, requireMaster)

agentsRouter.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.phone, a.address, a.status, a.created_at,
              ac.username, ac.status AS account_status, ac.last_login_at
       FROM agents a
       JOIN accounts ac ON ac.agent_id = a.id
       ORDER BY a.created_at DESC`
    )
    res.json(rows)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

agentsRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, phone, address, username } = req.body
  if (!name || !username) {
    res.status(400).json({ error: 'name and username required' })
    return
  }
  const password = generatePassword()
  const passwordHash = await hashPassword(password)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [agent] } = await client.query(
      'INSERT INTO agents (name, phone, address) VALUES ($1, $2, $3) RETURNING id',
      [name, phone ?? null, address ?? null]
    )
    await client.query(
      'INSERT INTO accounts (username, password_hash, role, agent_id) VALUES ($1, $2, $3, $4)',
      [username, passwordHash, 'agent', agent.id]
    )
    await client.query('COMMIT')
    res.status(201).json({ agentId: agent.id, username, password })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      res.status(409).json({ error: 'Username already exists' })
    } else {
      res.status(500).json({ error: 'Internal server error' })
    }
  } finally {
    client.release()
  }
})

agentsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.phone, a.address, a.status, a.created_at,
              ac.username, ac.status AS account_status, ac.last_login_at
       FROM agents a
       JOIN accounts ac ON ac.agent_id = a.id
       WHERE a.id = $1`,
      [req.params.id]
    )
    if (!rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    res.json(rows[0])
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

agentsRouter.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, phone, address, status } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE agents
       SET name    = COALESCE($1, name),
           phone   = COALESCE($2, phone),
           address = COALESCE($3, address),
           status  = COALESCE($4, status)
       WHERE id = $5 RETURNING id`,
      [name ?? null, phone ?? null, address ?? null, status ?? null, req.params.id]
    )
    if (!rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    if (status) {
      await pool.query('UPDATE accounts SET status = $1 WHERE agent_id = $2', [status, req.params.id])
    }
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

agentsRouter.post('/:id/reset-password', async (req: AuthRequest, res: Response) => {
  try {
    const password = generatePassword()
    const passwordHash = await hashPassword(password)
    const { rows } = await pool.query(
      'UPDATE accounts SET password_hash = $1 WHERE agent_id = $2 RETURNING id',
      [passwordHash, req.params.id]
    )
    if (!rows[0]) { res.status(404).json({ error: 'Agent not found' }); return }
    await pool.query('DELETE FROM refresh_tokens WHERE account_id = $1', [rows[0].id])
    res.json({ password })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

- [ ] **Step 4: Chạy test — expect PASS**

```bash
cd server && npm test -- tests/agents.test.ts
```

Expected: Tất cả tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/agents.ts server/tests/agents.test.ts
git commit -m "feat: add agents routes (CRUD + reset-password)"
```

---

## Task 7: Server entry point

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Tạo server/src/index.ts**

```typescript
import express from 'express'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import dotenv from 'dotenv'
import { authRouter } from './routes/auth'
import { agentsRouter } from './routes/agents'

dotenv.config()

export const app = express()

app.use(cors({
  origin: process.env.WEB_ADMIN_URL ?? 'http://localhost:5174',
  credentials: true,
}))
app.use(express.json())

app.use('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }))
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }))

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/agents', agentsRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT ?? 4000)
  app.listen(PORT, () => console.log(`Bida API server running on port ${PORT}`))
}
```

- [ ] **Step 2: Chạy toàn bộ tests server**

```bash
cd server && npm test
```

Expected: Tất cả tests từ Task 3-6 PASS.

- [ ] **Step 3: Thử thủ công**

Terminal 1:
```bash
cd server && npm run dev
```

Terminal 2:
```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"master","password":"admin123"}' | jq .
```

Expected: JSON với `accessToken`, `refreshToken`, `role: "master"`.

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add Express entry point with CORS and rate limiting"
```

---

## Task 8: Web Admin scaffolding

**Files:**
- Create: `web-admin/package.json`
- Create: `web-admin/vite.config.ts`
- Create: `web-admin/tsconfig.json`
- Create: `web-admin/index.html`
- Create: `web-admin/tailwind.config.js`
- Create: `web-admin/postcss.config.js`
- Create: `web-admin/src/main.tsx`
- Create: `web-admin/src/index.css`

- [ ] **Step 1: Tạo web-admin/package.json**

```json
{
  "name": "bida-web-admin",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.1",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
```

- [ ] **Step 2: Tạo web-admin/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
})
```

- [ ] **Step 3: Tạo web-admin/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Tạo web-admin/index.html**

```html
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bida Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Tạo web-admin/tailwind.config.js**

```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 6: Tạo web-admin/postcss.config.js**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 7: Tạo web-admin/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Tạo web-admin/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 9: Cài dependencies**

```bash
cd web-admin && npm install
```

- [ ] **Step 10: Commit**

```bash
git add web-admin/
git commit -m "feat: scaffold web-admin React app"
```

---

## Task 9: Web Admin — auth layer

**Files:**
- Create: `web-admin/src/lib/api.ts`
- Create: `web-admin/src/stores/authStore.ts`
- Create: `web-admin/src/pages/LoginPage.tsx`
- Create: `web-admin/src/App.tsx`

- [ ] **Step 1: Tạo web-admin/src/stores/authStore.ts**

```typescript
import { create } from 'zustand'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  setAuth: (accessToken: string, refreshToken: string) => void
  setAccessToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: localStorage.getItem('refreshToken'),
  setAuth: (accessToken, refreshToken) => {
    localStorage.setItem('refreshToken', refreshToken)
    set({ accessToken, refreshToken })
  },
  setAccessToken: (token) => set({ accessToken: token }),
  logout: () => {
    localStorage.removeItem('refreshToken')
    set({ accessToken: null, refreshToken: null })
  },
}))
```

- [ ] **Step 2: Tạo web-admin/src/lib/api.ts**

```typescript
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let queue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(api(original))
        })
      })
    }
    isRefreshing = true
    const refreshToken = useAuthStore.getState().refreshToken
    try {
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
      useAuthStore.getState().setAccessToken(data.accessToken)
      queue.forEach((cb) => cb(data.accessToken))
      queue = []
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return api(original)
    } catch {
      useAuthStore.getState().logout()
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)
```

- [ ] **Step 3: Tạo web-admin/src/pages/LoginPage.tsx**

```tsx
import { useState, FormEvent } from 'react'
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${BASE_URL}/auth/login`, { username, password })
      if (data.role !== 'master') {
        setError('Chỉ tài khoản master mới được truy cập trang này')
        return
      }
      setAuth(data.accessToken, data.refreshToken)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow w-80 space-y-4">
        <h1 className="text-xl font-bold text-center">Bida Admin</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm" required autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm" required />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Tạo web-admin/src/App.tsx**

```tsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { api } from './lib/api'
import LoginPage from './pages/LoginPage'
import AgentListPage from './pages/AgentListPage'
import AgentDetailPage from './pages/AgentDetailPage'

function RequireMaster({ children }: { children: React.ReactNode }) {
  const { accessToken, refreshToken, setAccessToken, logout } = useAuthStore()
  const [checking, setChecking] = useState(!accessToken && !!refreshToken)

  useEffect(() => {
    if (!accessToken && refreshToken) {
      api.post('/auth/refresh', { refreshToken })
        .then(({ data }) => setAccessToken(data.accessToken))
        .catch(() => logout())
        .finally(() => setChecking(false))
    }
  }, [])

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Đang tải...</div>
  }
  if (!accessToken) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireMaster><AgentListPage /></RequireMaster>} />
        <Route path="/agents/:id" element={<RequireMaster><AgentDetailPage /></RequireMaster>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Tạo placeholder pages để App.tsx compile**

Tạo `web-admin/src/pages/AgentListPage.tsx`:
```tsx
export default function AgentListPage() {
  return <div className="p-6">Agent List — coming in Task 10</div>
}
```

Tạo `web-admin/src/pages/AgentDetailPage.tsx`:
```tsx
export default function AgentDetailPage() {
  return <div className="p-6">Agent Detail — coming in Task 11</div>
}
```

- [ ] **Step 6: Verify trong browser**

Đảm bảo server đang chạy (`cd server && npm run dev`), sau đó:

```bash
cd web-admin && npm run dev
```

Mở `http://localhost:5174/login`. Đăng nhập với `master` / `admin123`.

Expected: Redirect sang `/`, hiển thị placeholder "Agent List — coming in Task 10".

- [ ] **Step 7: Commit**

```bash
git add web-admin/src/
git commit -m "feat: add web-admin auth layer (api, authStore, LoginPage, App routing)"
```

---

## Task 10: Web Admin — AgentListPage + CreateAgentModal

**Files:**
- Modify: `web-admin/src/pages/AgentListPage.tsx` (thay placeholder)
- Create: `web-admin/src/components/CreateAgentModal.tsx`

- [ ] **Step 1: Tạo web-admin/src/components/CreateAgentModal.tsx**

```tsx
import { useState, FormEvent } from 'react'
import { api } from '../lib/api'

interface Props {
  onCreated: () => void
  onClose: () => void
}

export default function CreateAgentModal({ onCreated, onClose }: Props) {
  const [form, setForm] = useState({ name: '', phone: '', address: '', username: '' })
  const [result, setResult] = useState<{ username: string; password: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/agents', form)
      setResult({ username: data.username, password: data.password })
      onCreated()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Tạo agent thất bại')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-96 space-y-4">
          <h2 className="font-bold text-lg">Tạo agent thành công</h2>
          <p className="text-sm text-gray-600">Gửi thông tin này cho chủ quán (chỉ hiển thị một lần):</p>
          <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div><span className="font-medium">Username:</span> {result.username}</div>
            <div><span className="font-medium">Password:</span> <span className="font-mono">{result.password}</span></div>
          </div>
          <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded text-sm">Đóng</button>
        </div>
      </div>
    )
  }

  const fields = [
    { label: 'Tên quán *', key: 'name', required: true },
    { label: 'SĐT', key: 'phone', required: false },
    { label: 'Địa chỉ', key: 'address', required: false },
    { label: 'Username *', key: 'username', required: true },
  ] as const

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 w-96 space-y-3">
        <h2 className="font-bold text-lg">Tạo agent mới</h2>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {fields.map(({ label, key, required }) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input type="text" value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm" required={required} />
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border py-2 rounded text-sm">Hủy</button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded text-sm disabled:opacity-50">
            {loading ? 'Đang tạo...' : 'Tạo'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Thay thế placeholder AgentListPage**

Ghi đè `web-admin/src/pages/AgentListPage.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import CreateAgentModal from '../components/CreateAgentModal'

interface Agent {
  id: string
  name: string
  username: string
  account_status: string
  phone: string | null
  last_login_at: string | null
}

export default function AgentListPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await api.get('/agents')
      setAgents(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="font-bold text-lg">Bida Admin</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800">Đăng xuất</button>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700">Quản lý Agent</h2>
          <button onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            + Tạo agent
          </button>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Đang tải...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3">Tên quán</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Đăng nhập lần cuối</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-gray-600">{a.username}</td>
                    <td className="px-4 py-3 text-gray-600">{a.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        a.account_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {a.account_status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {a.last_login_at ? new Date(a.last_login_at).toLocaleDateString('vi') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/agents/${a.id}`)}
                        className="text-blue-600 hover:underline text-xs">Chi tiết</button>
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Chưa có agent nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {showModal && (
        <CreateAgentModal onCreated={fetchAgents} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify trong browser**

Mở `http://localhost:5174`. Tạo 1 agent test qua modal.

Expected: Agent xuất hiện trong bảng. Modal hiển thị password sinh tự động (chỉ hiện 1 lần).

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/pages/AgentListPage.tsx web-admin/src/components/CreateAgentModal.tsx
git commit -m "feat: add AgentListPage and CreateAgentModal"
```

---

## Task 11: Web Admin — AgentDetailPage + ResetPasswordModal

**Files:**
- Modify: `web-admin/src/pages/AgentDetailPage.tsx` (thay placeholder)
- Create: `web-admin/src/components/ResetPasswordModal.tsx`

- [ ] **Step 1: Tạo web-admin/src/components/ResetPasswordModal.tsx**

```tsx
import { useState } from 'react'
import { api } from '../lib/api'

interface Props {
  agentId: string
  onClose: () => void
}

export default function ResetPasswordModal({ agentId, onClose }: Props) {
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(`/agents/${agentId}/reset-password`)
      setNewPassword(data.password)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Reset thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80 space-y-4">
        {newPassword ? (
          <>
            <h2 className="font-bold text-lg">Password mới</h2>
            <p className="text-sm text-gray-600">Gửi cho agent (chỉ hiển thị một lần):</p>
            <div className="bg-gray-50 rounded p-3 font-mono text-sm break-all">{newPassword}</div>
            <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded text-sm">Đóng</button>
          </>
        ) : (
          <>
            <h2 className="font-bold text-lg">Reset password</h2>
            <p className="text-sm text-gray-600">Tạo password mới và vô hiệu tất cả session hiện tại?</p>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 border py-2 rounded text-sm">Hủy</button>
              <button onClick={handleReset} disabled={loading}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm disabled:opacity-50">
                {loading ? 'Đang reset...' : 'Reset'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Thay thế placeholder AgentDetailPage**

Ghi đè `web-admin/src/pages/AgentDetailPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import ResetPasswordModal from '../components/ResetPasswordModal'

interface AgentDetail {
  id: string; name: string; username: string
  phone: string | null; address: string | null
  status: string; account_status: string
  created_at: string; last_login_at: string | null
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    api.get(`/agents/${id}`).then(({ data }) => setAgent(data))
  }, [id])

  async function toggleStatus() {
    if (!agent) return
    const newStatus = agent.account_status === 'active' ? 'suspended' : 'active'
    setToggling(true)
    try {
      await api.patch(`/agents/${id}`, { status: newStatus })
      setAgent({ ...agent, status: newStatus, account_status: newStatus })
    } finally {
      setToggling(false)
    }
  }

  if (!agent) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Đang tải...</div>

  const isSuspended = agent.account_status === 'suspended'
  const infoRows: [string, string][] = [
    ['Tên quán', agent.name],
    ['Username', agent.username],
    ['SĐT', agent.phone ?? '—'],
    ['Địa chỉ', agent.address ?? '—'],
    ['Ngày tạo', new Date(agent.created_at).toLocaleDateString('vi')],
    ['Đăng nhập lần cuối', agent.last_login_at ? new Date(agent.last_login_at).toLocaleDateString('vi') : '—'],
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800 text-sm">← Quay lại</button>
        <h1 className="font-bold text-lg">{agent.name}</h1>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-3 text-sm">
          <h2 className="font-semibold text-gray-700 mb-2">Thông tin quán</h2>
          {infoRows.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-gray-500 w-44 shrink-0">{label}</span>
              <span>{value}</span>
            </div>
          ))}
          <div className="flex gap-2">
            <span className="text-gray-500 w-44 shrink-0">Trạng thái</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {isSuspended ? 'Suspended' : 'Active'}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={toggleStatus} disabled={toggling}
            className={`px-4 py-2 rounded text-sm font-medium disabled:opacity-50 ${isSuspended ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-yellow-500 text-white hover:bg-yellow-600'}`}>
            {isSuspended ? 'Kích hoạt' : 'Tạm khóa'}
          </button>
          <button onClick={() => setShowReset(true)}
            className="px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700">
            Reset password
          </button>
        </div>
      </main>
      {showReset && <ResetPasswordModal agentId={agent.id} onClose={() => setShowReset(false)} />}
    </div>
  )
}
```

- [ ] **Step 3: Verify trong browser**

Click "Chi tiết" trên 1 agent. Thử suspend/activate và reset password.

Expected: Status toggle đúng. Reset modal hiển thị password mới.

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/pages/AgentDetailPage.tsx web-admin/src/components/ResetPasswordModal.tsx
git commit -m "feat: add AgentDetailPage and ResetPasswordModal"
```

---

## Task 12: Electron — IPC auth handlers

**Files:**
- Create: `src/main/handlers/auth.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Cài electron-store v8 (CJS-compatible)**

```bash
npm install electron-store@8
```

Dùng v8 vì electron-vite compile main process sang CommonJS. v9+ chỉ hỗ trợ ESM.

- [ ] **Step 2: Tạo src/main/handlers/auth.ts**

```typescript
import { ipcMain } from 'electron'
import Store from 'electron-store'

const API_BASE = process.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

interface AuthStore {
  accessToken: string
  refreshToken: string
  expiresAt: number
  role: string
  agentId: string | null
}

const store = new Store<AuthStore>({ name: 'auth', encryptionKey: 'bida-auth-v1' })

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status })
  return data
}

function parseExpiry(accessToken: string): number {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
  return payload.exp * 1000
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    store.set('accessToken', data.accessToken)
    store.set('refreshToken', data.refreshToken)
    store.set('expiresAt', parseExpiry(data.accessToken))
    store.set('role', data.role)
    store.set('agentId', data.agentId)
    return { role: data.role, agentId: data.agentId }
  })

  ipcMain.handle('auth:logout', async () => {
    const refreshToken = store.get('refreshToken')
    const accessToken = store.get('accessToken')
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      // logout locally even if server call fails
    }
    store.clear()
  })

  ipcMain.handle('auth:getSession', async () => {
    const refreshToken = store.get('refreshToken')
    if (!refreshToken) return null

    const accessToken = store.get('accessToken')
    const expiresAt = store.get('expiresAt')

    // access token còn hạn (trừ buffer 60s)
    if (accessToken && expiresAt && Date.now() < expiresAt - 60_000) {
      return { role: store.get('role'), agentId: store.get('agentId') }
    }

    // access token hết hạn — thử refresh
    try {
      const data = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
      store.set('accessToken', data.accessToken)
      store.set('expiresAt', parseExpiry(data.accessToken))
      return { role: store.get('role'), agentId: store.get('agentId') }
    } catch {
      store.clear()
      return null
    }
  })
}
```

- [ ] **Step 3: Đăng ký auth handlers trong src/main/index.ts**

Mở file. Thêm import sau các import handlers hiện tại:

```typescript
import { registerAuthHandlers } from './handlers/auth'
```

Thêm lời gọi bên trong `app.whenReady()`, theo đúng pattern hiện tại (cùng chỗ với các `register*Handlers()` khác):

```typescript
registerAuthHandlers()
```

- [ ] **Step 4: Cập nhật src/preload/index.ts**

Trong `contextBridge.exposeInMainWorld('api', { ... })`, thêm namespace `auth` vào cuối object, sau `reports`:

```typescript
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },
```

- [ ] **Step 5: Cập nhật src/renderer/src/electron.d.ts**

Trong interface `Window { api: { ... } }`, thêm sau block `reports`:

```typescript
      auth: {
        login(username: string, password: string): Promise<{ role: string; agentId: string | null }>
        logout(): Promise<void>
        getSession(): Promise<{ role: string; agentId: string | null } | null>
      }
```

- [ ] **Step 6: Commit**

```bash
git add src/main/handlers/auth.ts src/main/index.ts src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: add Electron IPC auth handlers with electron-store token storage"
```

---

## Task 13: Electron — LoginPage + App auth gate

**Files:**
- Create: `src/renderer/src/pages/LoginPage.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Tạo src/renderer/src/pages/LoginPage.tsx**

```tsx
import { useState, FormEvent } from 'react'

interface Props {
  onLogin: () => void
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await window.api.auth.login(username, password)
      onLogin()
    } catch (err: any) {
      setError(err?.message ?? 'Đăng nhập thất bại. Kiểm tra lại thông tin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 p-8 rounded-lg w-80 space-y-4">
        <h1 className="text-xl font-bold text-center text-green-400">🎱 Bida Manager</h1>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            required autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            required />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-green-600 text-white py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật src/renderer/src/App.tsx**

Thêm auth state vào đầu App component. Giữ nguyên toàn bộ JSX hiện tại, chỉ wrap thêm auth gate.

Thêm imports:

```typescript
import { useEffect } from 'react'  // thêm useEffect (useState đã có sẵn)
import LoginPage from './pages/LoginPage'
```

Thay thế `export default function App()`:

```tsx
export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' })
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')

  useEffect(() => {
    window.api.auth.getSession().then((session) => {
      setAuthState(session ? 'authenticated' : 'unauthenticated')
    })
  }, [])

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-500 text-sm">Đang tải...</p>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLogin={() => setAuthState('authenticated')} />
  }

  // Giữ nguyên phần return hiện tại từ đây xuống (div min-h-screen...)
```

Giữ toàn bộ phần `return ( <div className="min-h-screen bg-gray-950 text-white"> ... </div> )` và đóng hàm như cũ.

- [ ] **Step 3: Khởi động Electron app và kiểm tra**

Đảm bảo server đang chạy, sau đó:

```bash
npm run dev
```

Expected:
- App khởi động hiển thị màn hình login (nền tối, khớp design hiện tại)
- Đăng nhập với credentials agent đã tạo qua web admin
- App chuyển sang dashboard bình thường
- Đóng và mở lại: app tự đăng nhập lại (token còn hạn)
- Đăng xuất (cần thêm nút logout sau) → quay về login

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/LoginPage.tsx src/renderer/src/App.tsx
git commit -m "feat: add Electron login screen and auth gate in App"
```

---

## Kết quả Phase 1

| Component | Kết quả |
|-----------|---------|
| `server/` | Express API với auth + agent CRUD, JWT 15min / refresh 30 ngày, bcrypt, rate limiting |
| `web-admin/` | React admin portal: master login, tạo/suspend/activate agent, reset password |
| Electron app | Login screen khớp theme tối, token an toàn trong Main Process, auto-refresh khi khởi động |

**Phase 2 tiếp theo:** Multi-tenant DB migration (thêm `agent_id` vào tất cả bảng local) + sync engine.
