// src/main/handlers/products.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Product } from '../../renderer/src/types'

interface StockTransactionRow { id: number }

export interface StockHistoryInput {
  productId?: number
  fromDate?: string
  toDate?: string
}

export async function getAllProducts(): Promise<Product[]> {
  const agentId = getAgentId()
  return query<Product>(
    'SELECT * FROM cloud_products WHERE is_active = TRUE AND agent_id = $1 ORDER BY category, name',
    [agentId]
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
  return queryOne<Product>(
    `INSERT INTO cloud_products (name, category, price, unit, min_stock_alert, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.name, input.category, input.price, input.unit, input.min_stock_alert, agentId]
  )
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'created_at'>>
): Promise<Product | null> {
  const agentId = getAgentId()
  const ALLOWED = new Set(['name', 'category', 'price', 'unit', 'min_stock_alert', 'is_active', 'stock_quantity'])
  const fields = Object.keys(input).filter((f) => ALLOWED.has(f))
  if (fields.length === 0) return null
  const values = fields.map((f) => (input as any)[f])
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Product>(
    `UPDATE cloud_products SET ${setClause} WHERE id = $${fields.length + 1} AND agent_id = $${fields.length + 2} RETURNING *`,
    [...values, id, agentId]
  )
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
    `UPDATE cloud_products SET stock_quantity = stock_quantity ${operator} $1
     WHERE id = $2 AND agent_id = $3 RETURNING *`,
    [quantity, productId, agentId]
  )
  if (!product) return null

  const afterQty = product.stock_quantity
  const beforeQty = type === 'out' ? afterQty + quantity : afterQty - quantity

  await queryOne<StockTransactionRow>(
    `INSERT INTO cloud_stock_transactions
       (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [productId, type, quantity, costPrice, beforeQty, afterQty, note, agentId]
  )

  return product
}

export async function getStockHistory(input: StockHistoryInput) {
  const agentId = getAgentId()
  return query(
    `SELECT st.id, st.product_id, p.name AS product_name,
            st.type, st.quantity, st.before_qty, st.after_qty,
            st.note, st.created_at
     FROM cloud_stock_transactions st
     JOIN cloud_products p ON p.id = st.product_id
     WHERE st.agent_id = $1
       AND ($2::int IS NULL OR st.product_id = $2)
       AND ($3::date IS NULL OR DATE(st.created_at) >= $3)
       AND ($4::date IS NULL OR DATE(st.created_at) <= $4)
     ORDER BY st.created_at DESC
     LIMIT 500`,
    [agentId, input.productId ?? null, input.fromDate ?? null, input.toDate ?? null]
  )
}

export function registerProductHandlers() {
  ipcMain.handle('products:getAll', () => getAllProducts())
  ipcMain.handle('products:create', (_e, input) => createProduct(input))
  ipcMain.handle('products:update', (_e, id: number, input) => updateProduct(id, input))
  ipcMain.handle('products:adjustStock',
    (_e, id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string, costPrice: number | null) =>
      adjustStock(id, type, qty, note, costPrice)
  )
  ipcMain.handle('products:getStockHistory',
    (_e, input: StockHistoryInput) => getStockHistory(input)
  )
}
