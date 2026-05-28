// src/main/handlers/products.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import { enqueue, syncWorker } from '../sync/worker'
import type { Product } from '../../renderer/src/types'

interface StockTransaction { id: number }

export async function getAllProducts(): Promise<Product[]> {
  return query<Product>(
    'SELECT * FROM products WHERE is_active = TRUE ORDER BY category, name'
  )
}

export async function createProduct(input: {
  name: string
  category: Product['category']
  price: number
  unit: string
  min_stock_alert: number
}): Promise<Product | null> {
  const agentId = getAgentId()
  const product = await queryOne<Product>(
    `INSERT INTO products (name, category, price, unit, min_stock_alert, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.name, input.category, input.price, input.unit, input.min_stock_alert, agentId]
  )
  if (product) {
    await enqueue('products', product.id, 'insert', product)
    syncWorker.flush()
  }
  return product
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'created_at'>>
): Promise<Product | null> {
  const fields = Object.keys(input)
  if (fields.length === 0) return null
  const values = Object.values(input)
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  const product = await queryOne<Product>(
    `UPDATE products SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
  if (product) {
    await enqueue('products', product.id, 'update', product)
    syncWorker.flush()
  }
  return product
}

export async function adjustStock(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note: string,
  costPrice: number | null = null
): Promise<Product | null> {
  const agentId = getAgentId()
  const operator = type === 'out' ? '-' : '+'
  const product = await queryOne<Product>(
    `UPDATE products SET stock_quantity = stock_quantity ${operator} $1
     WHERE id = $2 RETURNING *`,
    [quantity, productId]
  )
  if (!product) return null

  const afterQty = product.stock_quantity
  // For 'in'/'adjust': afterQty = oldQty + quantity → beforeQty = afterQty - quantity
  // For 'out': afterQty = oldQty - quantity → beforeQty = afterQty + quantity
  const beforeQty = type === 'out' ? afterQty + quantity : afterQty - quantity

  const tx = await queryOne<StockTransaction>(
    `INSERT INTO stock_transactions
       (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [productId, type, quantity, costPrice, beforeQty, afterQty, note, agentId]
  )

  await enqueue('products', product.id, 'update', product)
  if (tx) await enqueue('stock_transactions', tx.id, 'insert', tx)
  syncWorker.flush()

  return product
}

export function registerProductHandlers() {
  ipcMain.handle('products:getAll', () => getAllProducts())
  ipcMain.handle('products:create', (_e, input) => createProduct(input))
  ipcMain.handle('products:update', (_e, id: number, input) => updateProduct(id, input))
  ipcMain.handle(
    'products:adjustStock',
    (_e, id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string, costPrice: number | null) =>
      adjustStock(id, type, qty, note, costPrice)
  )
}
