import { ipcMain } from 'electron'
import { queryOne } from '../db'
import { getAgentId } from '../lib/authStore'

export interface LoyaltySettings {
  pointsPer10k: number
  vndPerPoint: number
  minRedeemPoints: number
}

const DEFAULTS: LoyaltySettings = { pointsPer10k: 1, vndPerPoint: 100, minRedeemPoints: 100 }

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const agentId = getAgentId()
  const row = await queryOne<{
    points_per_10k_vnd: number
    vnd_per_point: number
    min_redeem_points: number
  }>(
    'SELECT points_per_10k_vnd, vnd_per_point, min_redeem_points FROM cloud_loyalty_settings WHERE agent_id = $1',
    [agentId]
  )
  if (!row) return DEFAULTS
  return {
    pointsPer10k: row.points_per_10k_vnd,
    vndPerPoint: row.vnd_per_point,
    minRedeemPoints: row.min_redeem_points,
  }
}

export async function saveLoyaltySettings(settings: LoyaltySettings): Promise<LoyaltySettings> {
  if (settings.pointsPer10k <= 0 || settings.vndPerPoint <= 0 || settings.minRedeemPoints < 0) {
    throw new Error('invalid loyalty settings values')
  }
  const agentId = getAgentId()
  const row = await queryOne<{
    points_per_10k_vnd: number
    vnd_per_point: number
    min_redeem_points: number
  }>(
    `INSERT INTO cloud_loyalty_settings (agent_id, points_per_10k_vnd, vnd_per_point, min_redeem_points)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id) DO UPDATE
       SET points_per_10k_vnd = EXCLUDED.points_per_10k_vnd,
           vnd_per_point = EXCLUDED.vnd_per_point,
           min_redeem_points = EXCLUDED.min_redeem_points
     RETURNING points_per_10k_vnd, vnd_per_point, min_redeem_points`,
    [agentId, settings.pointsPer10k, settings.vndPerPoint, settings.minRedeemPoints]
  )
  if (!row) throw new Error('loyalty settings upsert returned no row')
  return { pointsPer10k: row.points_per_10k_vnd, vndPerPoint: row.vnd_per_point, minRedeemPoints: row.min_redeem_points }
}

export function registerLoyaltyHandlers(): void {
  ipcMain.handle('loyalty:getSettings', () => getLoyaltySettings())
  ipcMain.handle('loyalty:saveSettings', (_e, settings: LoyaltySettings) => saveLoyaltySettings(settings))
}
