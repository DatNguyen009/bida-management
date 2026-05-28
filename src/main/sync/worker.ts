import { net } from 'electron'
import { query } from '../db'
import { getAgentId, getAccessToken } from '../lib/authStore'

const API_BASE = process.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

interface SyncQueueRow {
  id: number
  table_name: string
  row_id: string
  operation: string
  payload: object
  retry_count: number
}

async function postBatch(records: object[]): Promise<void> {
  const accessToken = getAccessToken()
  const res = await fetch(`${API_BASE}/sync/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ records }),
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Sync failed'), { status: res.status })
}

class SyncWorker {
  private isFlushing = false

  async flush(): Promise<void> {
    if (this.isFlushing || !net.isOnline()) return
    const agentId = getAgentId()
    if (!agentId) return

    this.isFlushing = true
    try {
      const records = await query<SyncQueueRow>(
        `SELECT * FROM sync_queue
         WHERE synced_at IS NULL AND retry_count < 10
         ORDER BY id LIMIT 100`
      )
      if (!records.length) return

      const body = records.map((r) => ({
        table: r.table_name,
        operation: r.operation,
        id: r.row_id,
        payload: r.payload,
      }))

      await postBatch(body)

      const ids = records.map((r) => r.id)
      await query(
        'UPDATE sync_queue SET synced_at = NOW() WHERE id = ANY($1)',
        [ids]
      )

      if (records.length === 100) setImmediate(() => this.flush())
    } catch (err) {
      await query(
        `UPDATE sync_queue
         SET retry_count = retry_count + 1, last_error = $1
         WHERE synced_at IS NULL AND retry_count < 10`,
        [String(err)]
      )
    } finally {
      this.isFlushing = false
    }
  }

  async initialSync(): Promise<void> {
    const agentId = getAgentId()
    if (!agentId) return

    const TABLES_INT_ID = [
      'tables', 'sessions', 'customers', 'products',
      'order_items', 'invoices', 'stock_transactions', 'loyalty_settings',
    ]

    for (const table of TABLES_INT_ID) {
      await query(
        `INSERT INTO sync_queue (table_name, row_id, operation, payload)
         SELECT $1::text, id::text, 'insert', row_to_json(t)
         FROM ${table} t
         WHERE agent_id IS NOT NULL
           AND id::text NOT IN (
             SELECT row_id FROM sync_queue WHERE table_name = $1::text
           )`,
        [table]
      )
    }

    // settings uses key as row_id
    await query(
      `INSERT INTO sync_queue (table_name, row_id, operation, payload)
       SELECT 'settings', key, 'insert', row_to_json(s)
       FROM settings s
       WHERE agent_id IS NOT NULL
         AND key NOT IN (
           SELECT row_id FROM sync_queue WHERE table_name = 'settings'
         )`
    )

    this.flush()
  }
}

export const syncWorker = new SyncWorker()

export async function enqueue(
  table: string,
  rowId: string | number,
  operation: 'insert' | 'update' | 'delete',
  payload: object
): Promise<void> {
  await query(
    `INSERT INTO sync_queue (table_name, row_id, operation, payload)
     VALUES ($1, $2, $3, $4)`,
    [table, String(rowId), operation, JSON.stringify(payload)]
  )
}
