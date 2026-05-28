import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { requireAgent } from '../middleware/requireAgent'
import { pool } from '../db'

const router = Router()
router.use(authenticate, requireAgent)

const TABLE_MAP: Record<string, string> = {
  tables: 'cloud_tables',
  sessions: 'cloud_sessions',
  customers: 'cloud_customers',
  products: 'cloud_products',
  order_items: 'cloud_order_items',
  invoices: 'cloud_invoices',
  stock_transactions: 'cloud_stock_transactions',
  loyalty_settings: 'cloud_loyalty_settings',
  settings: 'cloud_settings',
}
const ALLOWED_TABLES = new Set(Object.keys(TABLE_MAP))

router.post('/batch', async (req: AuthRequest, res: Response) => {
  const { records } = req.body
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ error: 'records must be a non-empty array' })
    return
  }
  if (records.length > 100) {
    res.status(400).json({ error: 'Maximum 100 records per batch' })
    return
  }
  for (const r of records) {
    if (!ALLOWED_TABLES.has(r.table)) {
      res.status(400).json({ error: `Unknown table: ${r.table}` })
      return
    }
  }

  const agentId = req.account!.agentId!
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const { table, operation, id, payload } of records) {
      const cloudTable = TABLE_MAP[table]
      if (operation === 'delete') {
        if (table === 'settings') {
          await client.query(
            `DELETE FROM ${cloudTable} WHERE agent_id = $1 AND key = $2`,
            [agentId, id]
          )
        } else {
          await client.query(
            `DELETE FROM ${cloudTable} WHERE agent_id = $1 AND id = $2`,
            [agentId, id]
          )
        }
      } else {
        if (table === 'settings') {
          await client.query(
            `INSERT INTO cloud_settings (agent_id, key, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (agent_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [agentId, (payload as any).key, (payload as any).value]
          )
        } else {
          const cols = Object.keys(payload as object)
          const vals = Object.values(payload as object)
          const allCols = ['agent_id', ...cols]
          const allVals = [agentId, ...vals]
          const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ')
          const updateCols = cols.filter((c) => c !== 'id')
          const updateClause = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')
          await client.query(
            `INSERT INTO ${cloudTable} (${allCols.join(', ')})
             VALUES (${placeholders})
             ON CONFLICT (agent_id, id) DO UPDATE SET ${updateClause}`,
            allVals
          )
        }
      }
    }
    await client.query('COMMIT')
    res.json({ synced: records.length, failed: 0 })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Sync failed' })
  } finally {
    client.release()
  }
})

export default router
