// src/main/handlers/products.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { PageResult, Product, StockTransaction } from '../../renderer/src/types'

interface StockTransactionRow { id: number }

export interface StockHistoryInput {
  productId?: number
  fromDate?: string
  toDate?: string
  page: number
  pageSize: number
}

export async function getAllProducts(): Promise<Product[]> {
  const agentId = getAgentId()
  return query<Product>(
    `SELECT p.id, p.name, p.category_id,
            COALESCE(c.name, 'Khác') AS category_name,
            COALESCE(c.icon, '📦') AS category_icon,
            p.price, p.cost_price, p.stock_quantity, p.min_stock_alert,
            p.unit, p.is_active, p.product_type, p.created_at
     FROM cloud_products p
     LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
     WHERE p.is_active = TRUE AND p.agent_id = $1
     ORDER BY category_name, p.name`,
    [agentId]
  )
}

export async function getProductPage(input: { page: number; pageSize: number }): Promise<PageResult<Product>> {
  const agentId = getAgentId()
  const offset = (input.page - 1) * input.pageSize

  const [rows, countRows] = await Promise.all([
    query<Product>(
      `SELECT p.id, p.name, p.category_id,
              COALESCE(c.name, 'Khác') AS category_name,
              COALESCE(c.icon, '📦') AS category_icon,
              p.price, p.cost_price, p.stock_quantity, p.min_stock_alert,
              p.unit, p.is_active, p.product_type, p.created_at
       FROM cloud_products p
       LEFT JOIN cloud_categories c ON c.id = p.category_id AND c.agent_id = p.agent_id
       WHERE p.is_active = TRUE AND p.agent_id = $1
       ORDER BY category_name, p.name
       LIMIT $2 OFFSET $3`,
      [agentId, input.pageSize, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM cloud_products WHERE is_active = TRUE AND agent_id = $1',
      [agentId]
    ),
  ])

  return { data: rows, total: parseInt(countRows[0]?.count ?? '0', 10) }
}

export async function createProduct(input: {
  name: string
  category_id: number
  price: number
  unit: string
  min_stock_alert: number
  product_type: 'stock' | 'composite'
}): Promise<Product | null> {
  const agentId = getAgentId()
  const row = await queryOne<{
    id: number; name: string; category_id: number; price: number;
    stock_quantity: number; min_stock_alert: number; unit: string;
    is_active: boolean; product_type: string; created_at: string
  }>(
    `INSERT INTO cloud_products (name, category_id, price, unit, min_stock_alert, product_type, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.name, input.category_id, input.price, input.unit, input.min_stock_alert, input.product_type, agentId]
  )
  if (!row) return null
  const cat = await queryOne<{ name: string; icon: string }>(
    'SELECT name, icon FROM cloud_categories WHERE id = $1 AND agent_id = $2',
    [input.category_id, agentId]
  )
  return {
    ...row,
    category_name: cat?.name ?? 'Khác',
    category_icon: cat?.icon ?? '📦',
  } as Product
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'created_at'>>
): Promise<Product | null> {
  const agentId = getAgentId()
  const ALLOWED = new Set(['name', 'category_id', 'price', 'unit', 'min_stock_alert', 'is_active', 'stock_quantity', 'product_type'])
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
  const updateCostPrice = type === 'in' && costPrice != null
  const costPriceClause = updateCostPrice ? ', cost_price = $4' : ''
  const queryParams: (number | string | null)[] = updateCostPrice
    ? [quantity, productId, agentId, costPrice]
    : [quantity, productId, agentId]

  const product = await queryOne<Product>(
    `UPDATE cloud_products SET stock_quantity = stock_quantity ${operator} $1${costPriceClause}
     WHERE id = $2 AND agent_id = $3 RETURNING *`,
    queryParams
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

export async function getStockHistory(input: StockHistoryInput): Promise<PageResult<StockTransaction>> {
  const agentId = getAgentId()
  const offset = (input.page - 1) * input.pageSize

  const [rows, countRows] = await Promise.all([
    query<StockTransaction>(
      `SELECT st.id, st.product_id, p.name AS product_name,
              st.type, st.quantity, st.before_qty, st.after_qty,
              st.cost_price, st.note, st.created_at
       FROM cloud_stock_transactions st
       JOIN cloud_products p ON p.id = st.product_id
       WHERE st.agent_id = $1
         AND ($2::int IS NULL OR st.product_id = $2)
         AND ($3::date IS NULL OR DATE(st.created_at) >= $3)
         AND ($4::date IS NULL OR DATE(st.created_at) <= $4)
       ORDER BY st.created_at DESC
       LIMIT $5 OFFSET $6`,
      [agentId, input.productId ?? null, input.fromDate ?? null, input.toDate ?? null, input.pageSize, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM cloud_stock_transactions st
       WHERE st.agent_id = $1
         AND ($2::int IS NULL OR st.product_id = $2)
         AND ($3::date IS NULL OR DATE(st.created_at) >= $3)
         AND ($4::date IS NULL OR DATE(st.created_at) <= $4)`,
      [agentId, input.productId ?? null, input.fromDate ?? null, input.toDate ?? null]
    ),
  ])

  return { data: rows, total: parseInt(countRows[0]?.count ?? '0', 10) }
}

export function registerProductHandlers() {
  ipcMain.handle('products:getAll', () => getAllProducts())
  ipcMain.handle('products:getPage', (_e, input: { page: number; pageSize: number }) => getProductPage(input))
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
