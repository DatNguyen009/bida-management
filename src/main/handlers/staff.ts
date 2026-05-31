import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { StaffMember } from '../../renderer/src/types'

export async function getAllStaff(): Promise<StaffMember[]> {
  const agentId = getAgentId()
  return query<StaffMember>(
    `SELECT id, username, allowed_screens, is_active, created_at
     FROM cloud_staff
     WHERE agent_id = $1 AND is_active = TRUE
     ORDER BY created_at`,
    [agentId]
  )
}

export async function createStaff(input: {
  username: string
  password: string
  allowedScreens: string[]
}): Promise<StaffMember | null> {
  const agentId = getAgentId()
  const passwordHash = await bcrypt.hash(input.password, 10)
  return queryOne<StaffMember>(
    `INSERT INTO cloud_staff (agent_id, username, password_hash, allowed_screens)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, allowed_screens, is_active, created_at`,
    [agentId, input.username, passwordHash, input.allowedScreens]
  )
}

export async function updateStaff(
  id: number,
  input: { password?: string; allowedScreens: string[] }
): Promise<StaffMember | null> {
  const agentId = getAgentId()
  if (input.password) {
    const passwordHash = await bcrypt.hash(input.password, 10)
    return queryOne<StaffMember>(
      `UPDATE cloud_staff SET password_hash = $1, allowed_screens = $2
       WHERE id = $3 AND agent_id = $4
       RETURNING id, username, allowed_screens, is_active, created_at`,
      [passwordHash, input.allowedScreens, id, agentId]
    )
  }
  return queryOne<StaffMember>(
    `UPDATE cloud_staff SET allowed_screens = $1
     WHERE id = $2 AND agent_id = $3
     RETURNING id, username, allowed_screens, is_active, created_at`,
    [input.allowedScreens, id, agentId]
  )
}

export async function deleteStaff(id: number): Promise<void> {
  const agentId = getAgentId()
  await queryOne(
    'UPDATE cloud_staff SET is_active = FALSE WHERE id = $1 AND agent_id = $2 RETURNING id',
    [id, agentId]
  )
}

export function registerStaffHandlers() {
  ipcMain.handle('staff:getAll', () => getAllStaff())
  ipcMain.handle('staff:create', (_e, input: { username: string; password: string; allowedScreens: string[] }) =>
    createStaff(input)
  )
  ipcMain.handle('staff:update', (_e, id: number, input: { password?: string; allowedScreens: string[] }) =>
    updateStaff(id, input)
  )
  ipcMain.handle('staff:delete', (_e, id: number) => deleteStaff(id))
}
