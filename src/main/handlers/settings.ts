// src/main/handlers/settings.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

// Keys stored in agents table
const AGENT_KEYS = new Set(['shop_name', 'address', 'phone'])

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', async () => {
    const agentId = getAgentId()
    const [agent, cloudRows] = await Promise.all([
      queryOne<{ name: string; phone: string | null; address: string | null }>(
        'SELECT name, phone, address FROM agents WHERE id = $1',
        [agentId]
      ),
      query<{ key: string; value: string }>(
        'SELECT key, value FROM cloud_settings WHERE agent_id = $1',
        [agentId]
      ),
    ])

    const rows: { key: string; value: string }[] = cloudRows.filter(
      (r) => !AGENT_KEYS.has(r.key)
    )
    if (agent) {
      rows.push({ key: 'shop_name', value: agent.name ?? '' })
      rows.push({ key: 'address', value: agent.address ?? '' })
      rows.push({ key: 'phone', value: agent.phone ?? '' })
    }
    return rows
  })

  ipcMain.handle('settings:set', async (_e, key: string, value: string) => {
    const agentId = getAgentId()
    if (AGENT_KEYS.has(key)) {
      const col = key === 'shop_name' ? 'name' : key
      return queryOne(
        `UPDATE agents SET ${col} = $1 WHERE id = $2 RETURNING id`,
        [value, agentId]
      )
    }
    return queryOne<{ key: string; value: string }>(
      `INSERT INTO cloud_settings (agent_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (agent_id, key) DO UPDATE SET value = EXCLUDED.value
       RETURNING key, value`,
      [agentId, key, value]
    )
  })
}
