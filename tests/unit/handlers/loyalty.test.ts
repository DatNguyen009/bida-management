import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue('test-agent-id'),
}))

import * as db from '../../../src/main/db'
import { getLoyaltySettings, saveLoyaltySettings } from '../../../src/main/handlers/loyalty'

describe('getLoyaltySettings', () => {
  it('returns settings when row exists', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({
      points_per_10k_vnd: 2,
      vnd_per_point: 200,
      min_redeem_points: 50,
    })
    const result = await getLoyaltySettings()
    expect(result).toEqual({ pointsPer10k: 2, vndPerPoint: 200, minRedeemPoints: 50 })
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('cloud_loyalty_settings'),
      ['test-agent-id']
    )
  })

  it('returns defaults when no row exists', async () => {
    vi.mocked(db.queryOne).mockResolvedValue(null)
    const result = await getLoyaltySettings()
    expect(result).toEqual({ pointsPer10k: 1, vndPerPoint: 100, minRedeemPoints: 100 })
  })
})

describe('saveLoyaltySettings', () => {
  it('upserts settings and returns saved values', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({
      points_per_10k_vnd: 2,
      vnd_per_point: 150,
      min_redeem_points: 50,
    })
    const result = await saveLoyaltySettings({ pointsPer10k: 2, vndPerPoint: 150, minRedeemPoints: 50 })
    expect(result).toEqual({ pointsPer10k: 2, vndPerPoint: 150, minRedeemPoints: 50 })
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_loyalty_settings'),
      ['test-agent-id', 2, 150, 50]
    )
  })
})
