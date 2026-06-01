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
