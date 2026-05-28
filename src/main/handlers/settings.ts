// src/main/handlers/settings.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import { enqueue, syncWorker } from '../sync/worker'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', () =>
    query<{ key: string; value: string }>('SELECT * FROM settings')
  )

  ipcMain.handle('settings:set', async (_e, key: string, value: string) => {
    const agentId = getAgentId()
    const setting = await queryOne<{ key: string; value: string; agent_id: string | null }>(
      `INSERT INTO settings (key, value, agent_id) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, agent_id = COALESCE(settings.agent_id, $3)
       RETURNING *`,
      [key, value, agentId]
    )
    if (setting) {
      await enqueue('settings', key, 'update', setting)
      syncWorker.flush()
    }
    return setting
  })
}
