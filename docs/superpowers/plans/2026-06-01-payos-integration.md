# PayOS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp PayOS làm cổng thanh toán VietQR động — khách quét QR → chuyển khoản → hóa đơn tự động đóng qua SSE push.

**Architecture:** Server Express (Render) xử lý 4 endpoints PayOS; webhook từ PayOS verify HMAC rồi push SSE tới Electron app; main process relay SSE events qua IPC tới renderer; Invoice.tsx tự động checkout khi nhận event PAID.

**Tech Stack:** `@payos/node` (server), Node.js `fetch` + ReadableStream (Electron main), SSE (server→main), IPC `ipcMain.on` relay (main→renderer), React Query (renderer state).

---

## File Map

| File | Action | Mô tả |
|------|--------|-------|
| `db/schema.sql` | Modify | Thêm bảng `payos_orders` |
| `server/package.json` | Modify | Thêm `@payos/node` |
| `server/src/routes/payos.ts` | **Create** | 4 endpoints: create-link, webhook, events (SSE), cancel |
| `server/src/index.ts` | Modify | Register `/api/v1/payos` router |
| `src/main/handlers/payos.ts` | **Create** | IPC handlers: createLink, cancelLink, subscribe (SSE relay), unsubscribe |
| `src/main/index.ts` | Modify | Register payos handlers |
| `src/preload/index.ts` | Modify | Expose `window.api.payos.*` |
| `src/renderer/src/electron.d.ts` | Modify | TypeScript types cho payos API |
| `src/renderer/src/types.ts` | Modify | `PayosLinkResult` interface |
| `src/renderer/src/pages/Invoice.tsx` | Modify | Thêm `payos` payment step + QR UI + SSE listener |
| `src/renderer/src/pages/Settings.tsx` | Modify | Section PayOS credentials |

---

## Task 1: DB Migration — payos_orders table

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Append DDL vào `db/schema.sql`**

Mở file, append ở cuối:

```sql
-- PayOS payment orders
CREATE TABLE IF NOT EXISTS payos_orders (
  id           SERIAL PRIMARY KEY,
  order_code   BIGINT UNIQUE NOT NULL,
  agent_id     VARCHAR(50) NOT NULL,
  session_id   INT NULL,
  amount       DECIMAL(10,0) NOT NULL,
  status       VARCHAR(20) DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','PAID','CANCELLED','EXPIRED')),
  checkout_url TEXT NULL,
  qr_code      TEXT NULL,
  description  TEXT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  paid_at      TIMESTAMPTZ NULL,
  expires_at   TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS payos_orders_agent_idx ON payos_orders (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payos_orders_session_idx ON payos_orders (session_id);
```

- [ ] **Step 2: Chạy migration lên cloud DB**

Lấy DATABASE_URL từ file `.env` ở root project, rồi:

```bash
psql "$(grep MAIN_VITE_DATABASE_URL .env | cut -d= -f2-)" -c "
CREATE TABLE IF NOT EXISTS payos_orders (
  id SERIAL PRIMARY KEY,
  order_code BIGINT UNIQUE NOT NULL,
  agent_id VARCHAR(50) NOT NULL,
  session_id INT NULL,
  amount DECIMAL(10,0) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','CANCELLED','EXPIRED')),
  checkout_url TEXT NULL,
  qr_code TEXT NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS payos_orders_agent_idx ON payos_orders (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payos_orders_session_idx ON payos_orders (session_id);
"
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `CREATE INDEX`

- [ ] **Step 3: Verify**

```bash
psql "$(grep MAIN_VITE_DATABASE_URL .env | cut -d= -f2-)" -c "\d payos_orders"
```

Expected: table hiển thị với các cột id, order_code, agent_id, ...

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add payos_orders table"
```

---

## Task 2: Server — cài @payos/node + route payos.ts

**Files:**
- Modify: `server/package.json`
- Create: `server/src/routes/payos.ts`

- [ ] **Step 1: Cài package**

```bash
cd server && npm install @payos/node
```

Expected: `@payos/node` xuất hiện trong `server/package.json` dependencies.

- [ ] **Step 2: Tạo `server/src/routes/payos.ts`**

```typescript
// server/src/routes/payos.ts
import { Router, Response } from 'express'
import PayOS from '@payos/node'
import { pool } from '../db'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { requireAgent } from '../middleware/requireAgent'

const router = Router()

// In-memory SSE subscribers: orderCode → Set of Response objects
const sseClients = new Map<number, Set<Response>>()

function pushSseEvent(orderCode: number, type: string) {
  const clients = sseClients.get(orderCode)
  if (!clients) return
  const data = JSON.stringify({ type, orderCode })
  clients.forEach(res => {
    res.write(`data: ${data}\n\n`)
  })
  if (type === 'PAID' || type === 'CANCELLED') {
    clients.forEach(res => res.end())
    sseClients.delete(orderCode)
  }
}

async function getPayosInstance(agentId: string): Promise<PayOS | null> {
  const { rows } = await pool.query(
    `SELECT key, value FROM cloud_settings
     WHERE agent_id = $1 AND key IN ('payos_client_id','payos_api_key','payos_checksum_key')`,
    [agentId]
  )
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  const { payos_client_id, payos_api_key, payos_checksum_key } = settings
  if (!payos_client_id || !payos_api_key || !payos_checksum_key) return null
  return new PayOS(payos_client_id, payos_api_key, payos_checksum_key)
}

// POST /create-link — tạo PayOS payment link
router.post('/create-link', authenticate, requireAgent, async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { sessionId, amount, tableName, orderItems } = req.body

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'amount phải lớn hơn 0' })
    return
  }

  const payos = await getPayosInstance(agentId)
  if (!payos) {
    res.status(400).json({ error: 'Chưa cấu hình PayOS credentials trong Cài đặt' })
    return
  }

  const orderCode = Date.now() // BIGINT — timestamp ms, unique enough for single shop
  const description = `Bida ${tableName ?? ''} #${orderCode}`.slice(0, 25) // PayOS max 25 chars
  const expiredAt = new Date(Date.now() + 15 * 60 * 1000) // 15 phút

  const items = Array.isArray(orderItems) && orderItems.length > 0
    ? orderItems.map((i: { name: string; quantity: number; price: number }) => ({
        name: String(i.name).slice(0, 25),
        quantity: Number(i.quantity),
        price: Number(i.price),
      }))
    : [{ name: description, quantity: 1, price: Number(amount) }]

  try {
    const link = await payos.createPaymentLink({
      orderCode,
      amount: Number(amount),
      description,
      items,
      returnUrl: 'https://bida-management.onrender.com',
      cancelUrl: 'https://bida-management.onrender.com',
      expiredAt: Math.floor(expiredAt.getTime() / 1000),
    })

    await pool.query(
      `INSERT INTO payos_orders (order_code, agent_id, session_id, amount, status, checkout_url, qr_code, description, expires_at)
       VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8)`,
      [orderCode, agentId, sessionId ?? null, amount, link.checkoutUrl, link.qrCode, description, expiredAt]
    )

    res.json({ orderCode, qrCode: link.qrCode, checkoutUrl: link.checkoutUrl, expiredAt: expiredAt.toISOString() })
  } catch (err) {
    console.error('[PayOS] create-link error:', err)
    res.status(502).json({ error: 'PayOS API error' })
  }
})

// POST /webhook — nhận callback từ PayOS
router.post('/webhook', async (req: AuthRequest, res: Response) => {
  try {
    // Lấy checksumKey từ DB dựa trên orderCode → agent
    const body = req.body
    const orderCode = body?.data?.orderCode as number | undefined

    if (!orderCode) {
      res.status(400).json({ error: 'Missing orderCode' })
      return
    }

    const { rows } = await pool.query(
      'SELECT agent_id FROM payos_orders WHERE order_code = $1',
      [orderCode]
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Order not found' })
      return
    }
    const agentId = rows[0].agent_id

    const payos = await getPayosInstance(agentId)
    if (!payos) {
      res.status(400).json({ error: 'PayOS not configured' })
      return
    }

    // Verify HMAC signature
    const webhookData = payos.verifyPaymentWebhookData(body)

    if (webhookData.code === '00') {
      // Thanh toán thành công
      await pool.query(
        `UPDATE payos_orders SET status='PAID', paid_at=NOW() WHERE order_code=$1`,
        [orderCode]
      )
      pushSseEvent(orderCode, 'PAID')
    } else if (webhookData.code === '01') {
      // Huỷ
      await pool.query(
        `UPDATE payos_orders SET status='CANCELLED' WHERE order_code=$1`,
        [orderCode]
      )
      pushSseEvent(orderCode, 'CANCELLED')
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[PayOS] webhook error:', err)
    res.status(400).json({ error: 'Invalid webhook' })
  }
})

// GET /events/:orderCode — SSE stream
router.get('/events/:orderCode', authenticate, async (req: AuthRequest, res: Response) => {
  const orderCode = Number(req.params.orderCode)
  if (isNaN(orderCode)) {
    res.status(400).json({ error: 'Invalid orderCode' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable Nginx buffering on Render
  res.flushHeaders()

  // Register this client
  if (!sseClients.has(orderCode)) sseClients.set(orderCode, new Set())
  sseClients.get(orderCode)!.add(res)

  // Heartbeat every 25s (Render free tier drops idle connections at 30s)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 25_000)

  // Check if already paid (race condition)
  const { rows } = await pool.query('SELECT status FROM payos_orders WHERE order_code=$1', [orderCode])
  if (rows[0]?.status === 'PAID') {
    res.write(`data: ${JSON.stringify({ type: 'PAID', orderCode })}\n\n`)
    clearInterval(heartbeat)
    sseClients.get(orderCode)?.delete(res)
    res.end()
    return
  }

  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.get(orderCode)?.delete(res)
  })
})

// POST /cancel/:orderCode — huỷ link
router.post('/cancel/:orderCode', authenticate, requireAgent, async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const orderCode = Number(req.params.orderCode)

  const payos = await getPayosInstance(agentId)
  if (!payos) {
    res.status(400).json({ error: 'PayOS not configured' })
    return
  }

  try {
    await payos.cancelPaymentLink(orderCode, 'Huỷ bởi nhân viên')
    await pool.query(`UPDATE payos_orders SET status='CANCELLED' WHERE order_code=$1 AND agent_id=$2`, [orderCode, agentId])
    pushSseEvent(orderCode, 'CANCELLED')
    res.json({ success: true })
  } catch (err) {
    console.error('[PayOS] cancel error:', err)
    res.status(502).json({ error: 'PayOS cancel failed' })
  }
})

export default router
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add server/package.json server/package-lock.json server/src/routes/payos.ts
git commit -m "feat: add PayOS server route (create-link, webhook, SSE events, cancel)"
```

---

## Task 3: Server — Register route + deploy

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Thêm import và route vào `server/src/index.ts`**

Tìm dòng `import masterRouter from './routes/master'`, thêm sau:
```typescript
import payosRouter from './routes/payos'
```

Tìm dòng `app.use('/api/v1/master', masterRouter)`, thêm sau:
```typescript
app.use('/api/v1/payos', payosRouter)
```

- [ ] **Step 2: Typecheck server**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors (warnings về unused ok)

- [ ] **Step 3: Commit + push để Render tự deploy**

```bash
cd .. && git add server/src/index.ts
git commit -m "feat: register PayOS route in Express server"
git push origin main
```

Expected: Render bắt đầu deploy sau ~30 giây. Theo dõi tại Render dashboard.

- [ ] **Step 4: Verify server route sau deploy**

```bash
curl -X POST https://bida-management.onrender.com/api/v1/payos/create-link \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}'
```

Expected: `401 Unauthorized` (chưa có token) — xác nhận route đã active.

---

## Task 4: Electron Main — payos IPC handlers

**Files:**
- Create: `src/main/handlers/payos.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Tạo `src/main/handlers/payos.ts`**

```typescript
// src/main/handlers/payos.ts
import { ipcMain, WebContents } from 'electron'
import { getAccessToken } from '../lib/authStore'

const API_BASE = import.meta.env.MAIN_VITE_API_URL ?? 'http://localhost:4000/api/v1'

// Track active SSE abort controllers per orderCode
const sseControllers = new Map<number, AbortController>()

export function registerPayosHandlers() {
  // Create PayOS payment link
  ipcMain.handle('payos:createLink', async (_e, input: {
    sessionId: number | null
    amount: number
    tableName: string
    orderItems: { name: string; quantity: number; price: number }[]
  }) => {
    const token = getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${API_BASE}/payos/create-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'PayOS create link failed')
    return data as { orderCode: number; qrCode: string; checkoutUrl: string; expiredAt: string }
  })

  // Cancel PayOS link
  ipcMain.handle('payos:cancelLink', async (_e, orderCode: number) => {
    const token = getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${API_BASE}/payos/cancel/${orderCode}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.json()
  })

  // Subscribe to SSE events — relay to renderer via sender.send
  ipcMain.on('payos:subscribe', async (event, orderCode: number) => {
    const sender: WebContents = event.sender
    const token = getAccessToken()
    if (!token) {
      sender.send('payos:event', { type: 'ERROR', message: 'Not authenticated' })
      return
    }

    // Cancel any existing subscription for this orderCode
    sseControllers.get(orderCode)?.abort()
    const controller = new AbortController()
    sseControllers.set(orderCode, controller)

    const tryConnect = async (retryCount = 0) => {
      try {
        const res = await fetch(`${API_BASE}/payos/events/${orderCode}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          sender.send('payos:event', { type: 'ERROR', message: 'SSE connect failed' })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (!sender.isDestroyed()) sender.send('payos:event', data)
              } catch { /* ignore malformed */ }
            }
          }
        }
      } catch (err: unknown) {
        const name = (err as Error).name
        if (name === 'AbortError') return // intentional cancel
        // Retry up to 3 times with 5s delay
        if (retryCount < 3 && !sender.isDestroyed()) {
          if (!sender.isDestroyed()) sender.send('payos:event', { type: 'RECONNECTING' })
          setTimeout(() => tryConnect(retryCount + 1), 5000)
        } else {
          if (!sender.isDestroyed()) sender.send('payos:event', { type: 'ERROR', message: 'SSE failed' })
        }
      }
    }

    tryConnect()
  })

  // Unsubscribe — cancel SSE connection
  ipcMain.on('payos:unsubscribe', (_e, orderCode: number) => {
    sseControllers.get(orderCode)?.abort()
    sseControllers.delete(orderCode)
  })
}
```

- [ ] **Step 2: Register trong `src/main/index.ts`**

Tìm dòng `import { registerPromotionHandlers }`, thêm sau:
```typescript
import { registerPayosHandlers } from './handlers/payos'
```

Tìm dòng `registerPromotionHandlers()`, thêm sau:
```typescript
registerPayosHandlers()
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck:node
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/payos.ts src/main/index.ts
git commit -m "feat: add PayOS Electron IPC handlers (createLink, cancelLink, SSE relay)"
```

---

## Task 5: Preload bridge + types

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/electron.d.ts`
- Modify: `src/renderer/src/types.ts`

- [ ] **Step 1: Thêm `PayosLinkResult` vào `src/renderer/src/types.ts`**

Append ở cuối file:
```typescript
export interface PayosLinkResult {
  orderCode: number
  qrCode: string
  checkoutUrl: string
  expiredAt: string
}
```

- [ ] **Step 2: Cập nhật `src/preload/index.ts`**

Thêm `PayosLinkResult` vào import line đầu file (sau `Promotion`):
```typescript
import type { ..., Promotion, PayosLinkResult } from '../renderer/src/types'
```

Thêm `payos` block vào `contextBridge.exposeInMainWorld('api', { ... })` sau `promotions`:
```typescript
  payos: {
    createLink: (input: {
      sessionId: number | null
      amount: number
      tableName: string
      orderItems: { name: string; quantity: number; price: number }[]
    }): Promise<PayosLinkResult> =>
      ipcRenderer.invoke('payos:createLink', input),
    cancelLink: (orderCode: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('payos:cancelLink', orderCode),
    subscribe: (orderCode: number): void =>
      ipcRenderer.send('payos:subscribe', orderCode),
    unsubscribe: (orderCode: number): void =>
      ipcRenderer.send('payos:unsubscribe', orderCode),
    onEvent: (callback: (data: { type: string; orderCode?: number; message?: string }) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { type: string }) => callback(data)
      ipcRenderer.on('payos:event', handler)
      return () => ipcRenderer.removeListener('payos:event', handler)
    },
  },
```

- [ ] **Step 3: Cập nhật `src/renderer/src/electron.d.ts`**

Thêm `PayosLinkResult` vào import ở đầu file.

Thêm vào `interface Window { api: { ... } }` sau `promotions`:
```typescript
      payos: {
        createLink(input: {
          sessionId: number | null
          amount: number
          tableName: string
          orderItems: { name: string; quantity: number; price: number }[]
        }): Promise<PayosLinkResult>
        cancelLink(orderCode: number): Promise<{ success: boolean }>
        subscribe(orderCode: number): void
        unsubscribe(orderCode: number): void
        onEvent(callback: (data: { type: string; orderCode?: number; message?: string }) => void): () => void
      }
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/electron.d.ts src/renderer/src/types.ts
git commit -m "feat: expose PayOS IPC bridge via preload and electron.d.ts"
```

---

## Task 6: Settings.tsx — PayOS credentials section

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Đọc `Settings.tsx` để hiểu cấu trúc hiện tại**

Xác định vị trí: section cài đặt ngân hàng VietQR (có `bank_id`, `bank_account`, `bank_account_name`). Thêm section PayOS ngay sau đó.

- [ ] **Step 2: Thêm state cho 3 PayOS fields**

Tìm chỗ các state như `shopName`, `address`, `bankId`, v.v. được khai báo từ settings data. Thêm:
```typescript
  const payosClientId = settings.find(s => s.key === 'payos_client_id')?.value ?? ''
  const payosApiKey = settings.find(s => s.key === 'payos_api_key')?.value ?? ''
  const payosChecksumKey = settings.find(s => s.key === 'payos_checksum_key')?.value ?? ''

  const [localPayosClientId, setLocalPayosClientId] = useState(payosClientId)
  const [localPayosApiKey, setLocalPayosApiKey] = useState(payosApiKey)
  const [localPayosChecksumKey, setLocalPayosChecksumKey] = useState(payosChecksumKey)
```

Thêm `useEffect` để sync khi settings load (tìm cùng pattern với các field khác như `shopName`):
```typescript
  useEffect(() => {
    setLocalPayosClientId(payosClientId)
    setLocalPayosApiKey(payosApiKey)
    setLocalPayosChecksumKey(payosChecksumKey)
  }, [payosClientId, payosApiKey, payosChecksumKey])
```

- [ ] **Step 3: Thêm vào `saveMutation.mutationFn` — lưu 3 PayOS keys**

Tìm `saveMutation` — nơi gọi `api().settings.set(...)` cho từng key. Thêm 3 key mới vào cùng batch:
```typescript
    api().settings.set('payos_client_id', localPayosClientId),
    api().settings.set('payos_api_key', localPayosApiKey),
    api().settings.set('payos_checksum_key', localPayosChecksumKey),
```

- [ ] **Step 4: Thêm UI section trong JSX**

Tìm section ngân hàng VietQR trong JSX. Thêm section PayOS ngay sau (dùng cùng pattern `<section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">`):

```tsx
            <section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">PayOS</h2>
              <p className="text-white/40 text-xs">Đăng ký miễn phí tại <span className="text-white/60">payos.vn</span> để lấy thông tin bên dưới.</p>
              <div>
                <Label className="text-white/55 text-xs">Client ID</Label>
                <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                  value={localPayosClientId} onChange={e => setLocalPayosClientId(e.target.value)} />
              </div>
              <div>
                <Label className="text-white/55 text-xs">API Key</Label>
                <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                  value={localPayosApiKey} onChange={e => setLocalPayosApiKey(e.target.value)} />
              </div>
              <div>
                <Label className="text-white/55 text-xs">Checksum Key</Label>
                <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                  value={localPayosChecksumKey} onChange={e => setLocalPayosChecksumKey(e.target.value)} />
              </div>
            </section>
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/Settings.tsx
git commit -m "feat: add PayOS credentials section in Settings"
```

---

## Task 7: Invoice.tsx — PayOS QR step

**Files:**
- Modify: `src/renderer/src/pages/Invoice.tsx`

Đây là task phức tạp nhất. Đọc toàn bộ file trước khi sửa.

- [ ] **Step 1: Thêm imports**

```typescript
import type { PayosLinkResult } from '../types'
```

- [ ] **Step 2: Mở rộng PaymentStep type**

Tìm:
```typescript
  type PaymentStep = 'select' | 'cash' | 'bank'
```
Thay bằng:
```typescript
  type PaymentStep = 'select' | 'cash' | 'bank' | 'payos'
```

- [ ] **Step 3: Thêm PayOS state variables**

Sau `const [cashReceived, setCashReceived] = useState...`, thêm:
```typescript
  const [payosData, setPayosData] = useState<PayosLinkResult | null>(null)
  const [payosStatus, setPayosStatus] = useState<'loading' | 'waiting' | 'expired' | 'reconnecting'>('loading')
  const [payosCountdown, setPayosCountdown] = useState(15 * 60) // giây
```

- [ ] **Step 4: Thêm settings check cho PayOS**

Sau các dòng lấy `bankId`, `bankAccount`, v.v. từ settings, thêm:
```typescript
  const payosClientId = settings?.find((s: { key: string }) => s.key === 'payos_client_id')?.value ?? ''
  const payosConfigured = payosClientId.trim() !== ''
```

- [ ] **Step 5: Thêm hàm `startPayos`**

Trước `return` statement, thêm:
```typescript
  async function startPayos() {
    setPaymentStep('payos')
    setPayosStatus('loading')
    setPayosData(null)
    setPayosCountdown(15 * 60)

    try {
      const result = await window.api.payos.createLink({
        sessionId: session.id,
        amount: finalAmount,
        tableName: session.table_name,
        orderItems: orderItems.map(i => ({
          name: i.product_name ?? 'Sản phẩm',
          quantity: i.quantity,
          price: i.unit_price,
        })),
      })
      setPayosData(result)
      setPayosStatus('waiting')

      // Start countdown
      const countdownTimer = setInterval(() => {
        setPayosCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimer)
            setPayosStatus('expired')
            window.api.payos.unsubscribe(result.orderCode)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      // Subscribe to SSE events via IPC relay
      window.api.payos.subscribe(result.orderCode)
      const unsubscribe = window.api.payos.onEvent((data) => {
        if (data.orderCode !== result.orderCode && data.orderCode !== undefined) return
        if (data.type === 'PAID') {
          clearInterval(countdownTimer)
          unsubscribe()
          window.api.payos.unsubscribe(result.orderCode)
          toast.success('Thanh toán PayOS thành công!')
          checkoutMutation.mutate()
        } else if (data.type === 'CANCELLED') {
          clearInterval(countdownTimer)
          unsubscribe()
          setPayosStatus('expired')
        } else if (data.type === 'RECONNECTING') {
          setPayosStatus('reconnecting')
        } else if (data.type === 'ERROR') {
          clearInterval(countdownTimer)
          unsubscribe()
          toast.error('Lỗi kết nối PayOS')
          setPayosStatus('expired')
        }
      })
    } catch (err) {
      toast.error('Không thể tạo QR PayOS. Kiểm tra cài đặt PayOS.')
      setPaymentStep('select')
    }
  }

  async function retryPayos() {
    if (payosData) {
      await window.api.payos.cancelLink(payosData.orderCode).catch(() => {})
      window.api.payos.unsubscribe(payosData.orderCode)
    }
    startPayos()
  }

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }
```

- [ ] **Step 6: Thêm nút PayOS vào bước `select`**

Tìm bước `paymentStep === 'select'` trong JSX. Tìm chỗ render nút "Chuyển khoản" và thêm nút PayOS ngay sau:

```tsx
                <button
                  className={`btn-gold flex-1 ${!payosConfigured ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={!payosConfigured}
                  title={!payosConfigured ? 'Chưa cấu hình PayOS trong Cài đặt' : undefined}
                  onClick={payosConfigured ? startPayos : undefined}
                >
                  📱 PayOS QR
                </button>
```

- [ ] **Step 7: Thêm bước `payos` trong JSX**

Sau block `{paymentStep === 'bank' && ( ... )}`, thêm:

```tsx
          {paymentStep === 'payos' && (
            <div className="backdrop-blur-xl bg-white/[0.04] rounded-xl border border-white/10 p-6 text-center space-y-4">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Thanh toán PayOS</p>

              {payosStatus === 'loading' && (
                <div className="py-8">
                  <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/55 text-sm">Đang tạo mã QR...</p>
                </div>
              )}

              {(payosStatus === 'waiting' || payosStatus === 'reconnecting') && payosData && (
                <>
                  <img
                    src={payosData.qrCode}
                    alt="PayOS QR"
                    className="w-48 h-48 mx-auto rounded-xl border border-white/10"
                  />
                  <div>
                    <p className="text-white font-bold text-lg">{formatCurrency(finalAmount)}</p>
                    <p className="text-white/40 text-xs mt-0.5">Mã đơn: #{payosData.orderCode}</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="text-white/40">⏱ Hết hạn sau:</span>
                    <span className={`font-mono font-bold ${payosCountdown < 60 ? 'text-red-400' : 'text-[#d4af37]'}`}>
                      {formatCountdown(payosCountdown)}
                    </span>
                  </div>
                  {payosStatus === 'reconnecting' ? (
                    <p className="text-amber-400 text-xs animate-pulse">Đang kết nối lại...</p>
                  ) : (
                    <p className="text-white/40 text-xs animate-pulse">● Đang chờ xác nhận thanh toán...</p>
                  )}
                </>
              )}

              {payosStatus === 'expired' && (
                <div className="py-6">
                  <p className="text-red-400 text-sm mb-1">⌛ Mã QR đã hết hạn</p>
                  <p className="text-white/40 text-xs">Tạo mã mới để tiếp tục</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button className="btn-glass flex-1" onClick={() => {
                  if (payosData) {
                    window.api.payos.cancelLink(payosData.orderCode).catch(() => {})
                    window.api.payos.unsubscribe(payosData.orderCode)
                  }
                  setPaymentStep('select')
                }}>
                  Quay lại
                </button>
                {(payosStatus === 'expired') && (
                  <button className="btn-gold flex-1" onClick={retryPayos}>
                    Tạo lại QR
                  </button>
                )}
              </div>
            </div>
          )}
```

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck:web
```

Expected: no new errors

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/pages/Invoice.tsx
git commit -m "feat: add PayOS QR payment step in Invoice (SSE auto-checkout)"
```

---

## Task 8: Push + smoke test

- [ ] **Step 1: Push tất cả lên remote**

```bash
git push origin main
```

- [ ] **Step 2: Khởi động app**

```bash
pkill -f "electron.*bida" 2>/dev/null; npm run dev
```

- [ ] **Step 3: Cấu hình PayOS credentials trong Settings**

Đăng ký tại payos.vn, lấy Client ID / API Key / Checksum Key, điền vào **Cài đặt > PayOS**, bấm Lưu.

- [ ] **Step 4: Test tạo QR**

1. Mở phiên chơi → tạo hóa đơn
2. Bước chọn thanh toán → bấm **📱 PayOS QR**
3. Verify: QR hiển thị, countdown chạy, "● Đang chờ xác nhận..."

- [ ] **Step 5: Test webhook (nếu có tài khoản PayOS live)**

Quét QR thật / dùng PayOS sandbox → verify hóa đơn tự đóng + toast "Thanh toán PayOS thành công!"

- [ ] **Step 6: Test expired + retry**

Chờ countdown hết (hoặc set countdown ngắn để test) → verify nút "Tạo lại QR" xuất hiện → bấm → QR mới tạo thành công.

- [ ] **Step 7: Test khi chưa cấu hình PayOS**

Xoá credentials trong Settings → verify nút PayOS QR bị disabled với tooltip.

---

## Ghi chú triển khai

**PayOS Sandbox:** Để test không cần thanh toán thật, dùng credentials sandbox từ PayOS dashboard. Webhook URL cần set trong PayOS dashboard: `https://bida-management.onrender.com/api/v1/payos/webhook`

**Render free tier + SSE:** Heartbeat 25s đủ để giữ kết nối. Nếu vẫn bị drop, có thể giảm xuống 20s.

**orderCode uniqueness:** `Date.now()` (timestamp ms) đủ unique cho single-shop use case. Nếu 2 hóa đơn được tạo cùng millisecond → PayOS sẽ báo lỗi duplicate → retry bằng `Date.now() + Math.random()`.
