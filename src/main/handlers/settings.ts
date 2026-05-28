// src/main/handlers/settings.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', () => {
    const agentId = getAgentId()
    return query<{ key: string; value: string }>(
      'SELECT key, value FROM cloud_settings WHERE agent_id = $1',
      [agentId]
    )
  })

  ipcMain.handle('settings:set', async (_e, key: string, value: string) => {
    const agentId = getAgentId()
    return queryOne<{ key: string; value: string }>(
      `INSERT INTO cloud_settings (agent_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (agent_id, key) DO UPDATE SET value = EXCLUDED.value
       RETURNING key, value`,
      [agentId, key, value]
    )
  })
}
