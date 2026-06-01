// src/main/handlers/promotions.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

const VN = `+ INTERVAL '7 hours'`

export async function getAllPromotions() {
  const agentId = getAgentId()
  return query(
    `SELECT * FROM promotions WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  )
}

export async function getActivePromotions(now: string) {
  const agentId = getAgentId()
  return query(
    `SELECT * FROM promotions
     WHERE agent_id = $1 AND is_active = TRUE
       AND type IN ('time_slot', 'event')
       AND (
         (type = 'time_slot'
           AND days_of_week @> ARRAY[EXTRACT(ISODOW FROM ($2::timestamptz ${VN}))::int]
           AND time_from <= (($2::timestamptz ${VN})::time)
           AND time_to   >= (($2::timestamptz ${VN})::time))
         OR
         (type = 'event'
           AND valid_from <= DATE($2::timestamptz ${VN})
           AND valid_to   >= DATE($2::timestamptz ${VN}))
       )`,
    [agentId, now]
  )
}

export async function validateVoucher(code: string) {
  const agentId = getAgentId()
  return queryOne<object>(
    `SELECT * FROM promotions
     WHERE agent_id = $1 AND code = $2 AND type = 'voucher' AND is_active = TRUE
       AND (max_uses IS NULL OR used_count < max_uses)
       AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
     LIMIT 1`,
    [agentId, code.trim().toUpperCase()]
  )
}

export async function createPromotion(input: {
  name: string; type: string; discount_type: string; discount_value: number
  apply_to: string; max_discount: number | null; code: string | null
  max_uses: number | null; days_of_week: number[] | null
  time_from: string | null; time_to: string | null
  valid_from: string | null; valid_to: string | null; is_active: boolean
}) {
  const agentId = getAgentId()
  return queryOne<object>(
    `INSERT INTO promotions
       (agent_id, name, type, discount_type, discount_value, apply_to, max_discount,
        code, max_uses, days_of_week, time_from, time_to, valid_from, valid_to, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [agentId, input.name, input.type, input.discount_type, input.discount_value,
     input.apply_to, input.max_discount,
     input.code ? input.code.trim().toUpperCase() : null,
     input.max_uses || null,
     input.days_of_week, input.time_from || null, input.time_to || null,
     input.valid_from || null, input.valid_to || null, input.is_active]
  )
}

export async function updatePromotion(id: number, input: Partial<{
  name: string; discount_type: string; discount_value: number; apply_to: string
  max_discount: number | null; code: string | null; max_uses: number | null
  days_of_week: number[] | null; time_from: string | null; time_to: string | null
  valid_from: string | null; valid_to: string | null; is_active: boolean
}>) {
  const agentId = getAgentId()
  const fields = Object.entries(input)
    .map(([k], i) => `${k} = $${i + 3}`)
    .join(', ')
  const values = Object.values(input)
  return queryOne<object>(
    `UPDATE promotions SET ${fields} WHERE id = $1 AND agent_id = $2 RETURNING *`,
    [id, agentId, ...values]
  )
}

export async function deletePromotion(id: number) {
  const agentId = getAgentId()
  await query(`DELETE FROM promotions WHERE id = $1 AND agent_id = $2`, [id, agentId])
}

export async function incrementUsedCount(id: number) {
  const agentId = getAgentId()
  await query(
    `UPDATE promotions SET used_count = used_count + 1 WHERE id = $1 AND agent_id = $2`,
    [id, agentId]
  )
}

export function registerPromotionHandlers() {
  ipcMain.handle('promotions:getAll', () => getAllPromotions())
  ipcMain.handle('promotions:getActive', (_e, now: string) => getActivePromotions(now))
  ipcMain.handle('promotions:validateVoucher', (_e, code: string) => validateVoucher(code))
  ipcMain.handle('promotions:create', (_e, input) => createPromotion(input))
  ipcMain.handle('promotions:update', (_e, id: number, input) => updatePromotion(id, input))
  ipcMain.handle('promotions:delete', (_e, id: number) => deletePromotion(id))
  ipcMain.handle('promotions:incrementUsed', (_e, id: number) => incrementUsedCount(id))
}
