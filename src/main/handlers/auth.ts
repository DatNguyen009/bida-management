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

function parseExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return (payload.exp ?? 0) * 1000
  } catch {
    return 0 // treat as expired
  }
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
      store.set('refreshToken', data.refreshToken)
      store.set('expiresAt', parseExpiry(data.accessToken))
      return { role: store.get('role'), agentId: store.get('agentId') }
    } catch {
      store.clear()
      return null
    }
  })
}
