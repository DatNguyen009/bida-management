import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Product } from '../../renderer/src/types'

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
  return queryOne<Product>(
    `INSERT INTO products (name, category, price, unit, min_stock_alert)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.category, input.price, input.unit, input.min_stock_alert]
  )
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'created_at'>>
): Promise<Product | null> {
  const fields = Object.keys(input)
  const values = Object.values(input)
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Product>(
    `UPDATE products SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
}

export async function adjustStock(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note: string,
  costPrice: number | null = null
): Promise<Product | null> {
  const operator = type === 'out' ? '-' : '+'
  const product = await queryOne<Product>(
    `UPDATE products SET stock_quantity = stock_quantity ${operator} $1
     WHERE id = $2 RETURNING *`,
    [quantity, productId]
  )

  // Product not found — don't log a phantom transaction
  if (!product) return null

  // Derive before/after from the UPDATE result (race-free, single round-trip)
  const afterQty = product.stock_quantity
  const beforeQty = type === 'out' ? afterQty + quantity : afterQty - quantity

  await query(
    `INSERT INTO stock_transactions (product_id, type, quantity, cost_price, before_qty, after_qty, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [productId, type, quantity, costPrice, beforeQty, afterQty, note]
  )
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
