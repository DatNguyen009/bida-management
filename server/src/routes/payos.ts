// server/src/routes/payos.ts
import { Router, Response } from 'express'
import { PayOS } from '@payos/node'
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

async function getPayosInstance(agentId: string): Promise<InstanceType<typeof PayOS> | null> {
  const { rows } = await pool.query(
    `SELECT key, value FROM cloud_settings
     WHERE agent_id = $1 AND key IN ('payos_client_id','payos_api_key','payos_checksum_key')`,
    [agentId]
  )
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  const { payos_client_id, payos_api_key, payos_checksum_key } = settings
  if (!payos_client_id || !payos_api_key || !payos_checksum_key) return null
  return new PayOS({ clientId: payos_client_id, apiKey: payos_api_key, checksumKey: payos_checksum_key })
}

// POST /create-link
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

  const orderCode = Date.now()
  const description = `Bida ${tableName ?? ''} #${orderCode}`.slice(0, 25)
  const expiredAt = new Date(Date.now() + 15 * 60 * 1000)

  const items = Array.isArray(orderItems) && orderItems.length > 0
    ? orderItems.map((i: { name: string; quantity: number; price: number }) => ({
        name: String(i.name).slice(0, 25),
        quantity: Number(i.quantity),
        price: Number(i.price),
      }))
    : [{ name: description, quantity: 1, price: Number(amount) }]

  try {
    const link = await payos.paymentRequests.create({
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

// Shared webhook handler — dùng cho cả /webhook/:agentId và /webhook (legacy)
async function handleWebhook(agentId: string, body: unknown, res: Response) {
  try {
    const payos = await getPayosInstance(agentId)
    if (!payos) {
      res.status(400).json({ error: 'PayOS not configured' })
      return
    }

    // Verify HMAC signature (throws nếu sai)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await payos.webhooks.verify(body as any)

    const data = body as { code?: string; data?: { orderCode?: number } }
    const orderCode = data?.data?.orderCode
    const webhookCode = data?.code

    // Nếu không có orderCode → đây là verify request từ PayOS dashboard
    if (!orderCode) {
      res.json({ success: true })
      return
    }

    if (webhookCode === '00') {
      await pool.query(`UPDATE payos_orders SET status='PAID', paid_at=NOW() WHERE order_code=$1`, [orderCode])
      pushSseEvent(orderCode, 'PAID')
    } else if (webhookCode === '01') {
      await pool.query(`UPDATE payos_orders SET status='CANCELLED' WHERE order_code=$1`, [orderCode])
      pushSseEvent(orderCode, 'CANCELLED')
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[PayOS] webhook error:', err)
    res.status(400).json({ error: 'Invalid webhook' })
  }
}

// GET /webhook/:agentId — PayOS verify bằng GET
router.get('/webhook/:agentId', (_req, res: Response) => {
  res.json({ success: true })
})

// POST /webhook/:agentId — webhook chính, agentId trong URL
router.post('/webhook/:agentId', async (req: AuthRequest, res: Response) => {
  await handleWebhook(req.params.agentId, req.body, res)
})

// GET /webhook — fallback verify (không có agentId)
router.get('/webhook', (_req, res: Response) => {
  res.json({ success: true })
})

// POST /webhook — legacy, tra DB lấy agentId từ orderCode
router.post('/webhook', async (req: AuthRequest, res: Response) => {
  const body = req.body as { data?: { orderCode?: number } }
  const orderCode = body?.data?.orderCode

  if (!orderCode) {
    // Không có orderCode và không có agentId → verify request không xác định được
    res.json({ success: true })
    return
  }

  const { rows } = await pool.query('SELECT agent_id FROM payos_orders WHERE order_code=$1', [orderCode])
  const agentId = rows[0]?.agent_id
  if (!agentId) { res.json({ success: true }); return }

  await handleWebhook(agentId, req.body, res)
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
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  if (!sseClients.has(orderCode)) sseClients.set(orderCode, new Set())
  sseClients.get(orderCode)!.add(res)

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 25_000)

  // Race condition: check if already paid
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

// POST /cancel/:orderCode
router.post('/cancel/:orderCode', authenticate, requireAgent, async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const orderCode = Number(req.params.orderCode)

  const payos = await getPayosInstance(agentId)
  if (!payos) {
    res.status(400).json({ error: 'PayOS not configured' })
    return
  }

  try {
    await payos.paymentRequests.cancel(orderCode, 'Huỷ bởi nhân viên')
    await pool.query(`UPDATE payos_orders SET status='CANCELLED' WHERE order_code=$1 AND agent_id=$2`, [orderCode, agentId])
    pushSseEvent(orderCode, 'CANCELLED')
    res.json({ success: true })
  } catch (err) {
    console.error('[PayOS] cancel error:', err)
    res.status(502).json({ error: 'PayOS cancel failed' })
  }
})

// GET /status/:orderCode — polling fallback khi SSE không hoạt động
router.get('/status/:orderCode', authenticate, async (req: AuthRequest, res: Response) => {
  const orderCode = Number(req.params.orderCode)
  if (isNaN(orderCode)) { res.status(400).json({ error: 'Invalid orderCode' }); return }

  const { rows } = await pool.query(
    'SELECT status FROM payos_orders WHERE order_code = $1 AND agent_id = $2',
    [orderCode, req.account!.agentId!]
  ).catch(() => ({ rows: [] as { status: string }[] }))

  res.json({ status: rows[0]?.status ?? 'NOT_FOUND' })
})

export default router
