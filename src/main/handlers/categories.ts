import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Category } from '../../renderer/src/types'

export async function getAllCategories(): Promise<Category[]> {
  const agentId = getAgentId()
  return query<Category>(
    'SELECT id, name, icon FROM cloud_categories WHERE agent_id = $1 ORDER BY name',
    [agentId]
  )
}

export async function createCategory(input: { name: string; icon: string }): Promise<Category | null> {
  const agentId = getAgentId()
  return queryOne<Category>(
    'INSERT INTO cloud_categories (name, icon, agent_id) VALUES ($1, $2, $3) RETURNING id, name, icon',
    [input.name, input.icon, agentId]
  )
}

export async function updateCategory(id: number, input: { name: string; icon: string }): Promise<Category | null> {
  const agentId = getAgentId()
  return queryOne<Category>(
    'UPDATE cloud_categories SET name = $1, icon = $2 WHERE id = $3 AND agent_id = $4 RETURNING id, name, icon',
    [input.name, input.icon, id, agentId]
  )
}

export async function deleteCategory(id: number): Promise<{ success: boolean; productCount: number }> {
  const agentId = getAgentId()
  const countRow = await queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM cloud_products WHERE category_id = $1 AND agent_id = $2',
    [id, agentId]
  )
  const productCount = parseInt(countRow?.count ?? '0', 10)
  if (productCount > 0) return { success: false, productCount }

  await queryOne(
    'DELETE FROM cloud_categories WHERE id = $1 AND agent_id = $2 RETURNING id',
    [id, agentId]
  )
  return { success: true, productCount: 0 }
}

export async function ensureDefaultCategories(agentId: string): Promise<void> {
  const countRow = await queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM cloud_categories WHERE agent_id = $1',
    [agentId]
  )
  if (parseInt(countRow?.count ?? '0', 10) > 0) return

  await query(
    `INSERT INTO cloud_categories (name, icon, agent_id) VALUES
     ('Đồ uống', '🥤', $1),
     ('Đồ ăn', '🍜', $1),
     ('Khác', '📦', $1)
     ON CONFLICT DO NOTHING`,
    [agentId]
  )
}

export function registerCategoryHandlers() {
  ipcMain.handle('categories:getAll', () => getAllCategories())
  ipcMain.handle('categories:create', (_e, input: { name: string; icon: string }) => createCategory(input))
  ipcMain.handle('categories:update', (_e, id: number, input: { name: string; icon: string }) => updateCategory(id, input))
  ipcMain.handle('categories:delete', (_e, id: number) => deleteCategory(id))
}
