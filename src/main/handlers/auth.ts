import { ipcMain } from 'electron'
import { authStore, getAccessToken } from '../lib/authStore'
import { query } from '../db'

const API_BASE = process.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status })
  return data
}

function parseExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return (payload.exp ?? 0) * 1000
  } catch {
    return 0
  }
}

async function backfillAgentId(agentId: string): Promise<void> {
  const TABLES = [
    'tables', 'sessions', 'customers', 'products', 'order_items',
    'invoices', 'stock_transactions', 'loyalty_settings', 'settings',
  ]
  for (const table of TABLES) {
    await query(`UPDATE ${table} SET agent_id = $1 WHERE agent_id IS NULL`, [agentId])
  }
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    authStore.set('accessToken', data.accessToken)
    authStore.set('refreshToken', data.refreshToken)
    authStore.set('expiresAt', parseExpiry(data.accessToken))
    authStore.set('role', data.role)
    authStore.set('agentId', data.agentId)
    if (data.agentId) {
      await backfillAgentId(data.agentId)
    }
    return { role: data.role, agentId: data.agentId }
  })

  ipcMain.handle('auth:logout', async () => {
    const refreshToken = authStore.get('refreshToken')
    const accessToken = getAccessToken()
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ refreshToken }),
      })
    } catch { /* logout locally even if server call fails */ }
    authStore.clear()
  })

  ipcMain.handle('auth:getSession', async () => {
    const refreshToken = authStore.get('refreshToken')
    if (!refreshToken) return null

    const accessToken = getAccessToken()
    const expiresAt = authStore.get('expiresAt')

    if (accessToken && expiresAt && Date.now() < expiresAt - 60_000) {
      return { role: authStore.get('role'), agentId: authStore.get('agentId') }
    }

    try {
      const data = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
      authStore.set('accessToken', data.accessToken)
      authStore.set('refreshToken', data.refreshToken)
      authStore.set('expiresAt', parseExpiry(data.accessToken))
      return { role: authStore.get('role'), agentId: authStore.get('agentId') }
    } catch {
      authStore.clear()
      return null
    }
  })
}
