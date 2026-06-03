// src/main/handlers/auth.ts
import { ipcMain } from 'electron'
import { authStore, getAccessToken } from '../lib/authStore'
import { ensureDefaultCategories } from './categories'
import bcrypt from 'bcryptjs'
import { queryOne } from '../db'

const API_BASE = import.meta.env.MAIN_VITE_API_URL ?? 'http://localhost:4000/api/v1'

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

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    // 1. Try external API (owner)
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      authStore.set('accessToken', data.accessToken)
      authStore.set('refreshToken', data.refreshToken)
      authStore.set('expiresAt', parseExpiry(data.accessToken))
      authStore.set('role', 'owner')
      authStore.set('agentId', data.agentId)
      authStore.set('allowedScreens', [])
      authStore.set('username', username)
      if (data.agentId) {
        await ensureDefaultCategories(data.agentId)
      }
      return { role: 'owner', agentId: data.agentId, allowedScreens: [], username }
    } catch (ownerErr) {
      // 2. Try cloud_staff
      const staff = await queryOne<{
        id: number; agent_id: string; password_hash: string; allowed_screens: string[]
      }>(
        'SELECT id, agent_id, password_hash, allowed_screens FROM cloud_staff WHERE username = $1 AND is_active = TRUE LIMIT 1',
        [username]
      )
      if (!staff) throw ownerErr

      const match = await bcrypt.compare(password, staff.password_hash)
      if (!match) throw ownerErr

      authStore.set('role', 'staff')
      authStore.set('agentId', staff.agent_id)
      authStore.set('allowedScreens', staff.allowed_screens)
      authStore.set('username', username)
      authStore.set('staffPassword', password)
      return { role: 'staff', agentId: staff.agent_id, allowedScreens: staff.allowed_screens, username }
    }
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
    const role = authStore.get('role')

    // Staff session: no refreshToken needed
    if (role === 'staff') {
      const agentId = authStore.get('agentId')
      if (!agentId) return null
      return {
        role: 'staff',
        agentId,
        allowedScreens: authStore.get('allowedScreens') ?? [],
        username: authStore.get('username') ?? '',
      }
    }

    // Owner session: use refreshToken
    const refreshToken = authStore.get('refreshToken')
    if (!refreshToken) return null

    const accessToken = getAccessToken()
    const expiresAt = authStore.get('expiresAt')

    if (accessToken && expiresAt && Date.now() < expiresAt - 60_000) {
      return { role: authStore.get('role'), agentId: authStore.get('agentId'), allowedScreens: [], username: authStore.get('username') ?? '' }
    }

    try {
      const data = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
      authStore.set('accessToken', data.accessToken)
      authStore.set('refreshToken', data.refreshToken)
      authStore.set('expiresAt', parseExpiry(data.accessToken))
      return { role: authStore.get('role'), agentId: authStore.get('agentId'), allowedScreens: [], username: authStore.get('username') ?? '' }
    } catch {
      authStore.clear()
      return null
    }
  })
}
