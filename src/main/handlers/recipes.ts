import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { RecipeItem } from '../../renderer/src/types'

export async function getRecipe(productId: number): Promise<RecipeItem[]> {
  const agentId = getAgentId()
  return query<RecipeItem>(
    `SELECT r.id, r.product_id, r.ingredient_id, p.name AS ingredient_name, r.quantity
     FROM cloud_product_recipes r
     JOIN cloud_products p ON p.id = r.ingredient_id
     WHERE r.product_id = $1 AND r.agent_id = $2
     ORDER BY r.id`,
    [productId, agentId]
  )
}

export async function saveRecipe(
  productId: number,
  items: { ingredientId: number; quantity: number }[]
): Promise<void> {
  const agentId = getAgentId()
  await queryOne(
    'DELETE FROM cloud_product_recipes WHERE product_id = $1 AND agent_id = $2 RETURNING id',
    [productId, agentId]
  )
  for (const item of items) {
    await queryOne(
      `INSERT INTO cloud_product_recipes (product_id, ingredient_id, quantity, agent_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [productId, item.ingredientId, item.quantity, agentId]
    )
  }
}

export function registerRecipeHandlers() {
  ipcMain.handle('recipes:get', (_e, productId: number) => getRecipe(productId))
  ipcMain.handle('recipes:save',
    (_e, productId: number, items: { ingredientId: number; quantity: number }[]) =>
      saveRecipe(productId, items)
  )
}
