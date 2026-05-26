import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { OrderItem } from '../../renderer/src/types'

export async function addOrderItem(
  sessionId: number,
  productId: number,
  quantity: number,
  unitPrice: number
): Promise<OrderItem | null> {
  const subtotal = quantity * unitPrice
  return queryOne<OrderItem>(
    `INSERT INTO order_items (session_id, product_id, quantity, unit_price, subtotal)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [sessionId, productId, quantity, unitPrice, subtotal]
  )
}

export async function getOrderItems(sessionId: number): Promise<(OrderItem & { product_name: string })[]> {
  return query(
    `SELECT oi.*, p.name AS product_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.session_id = $1
     ORDER BY oi.created_at`,
    [sessionId]
  )
}

export async function removeOrderItem(itemId: number): Promise<void> {
  await queryOne('DELETE FROM order_items WHERE id = $1 RETURNING id', [itemId])
}

export async function getOrderTotal(sessionId: number): Promise<number> {
  const result = await queryOne<{ total: string }>(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM order_items WHERE session_id = $1',
    [sessionId]
  )
  return Number(result?.total ?? 0)
}

export function registerOrderItemHandlers() {
  ipcMain.handle(
    'orderItems:add',
    (_e, sessionId: number, productId: number, qty: number, price: number) =>
      addOrderItem(sessionId, productId, qty, price)
  )
  ipcMain.handle('orderItems:get', (_e, sessionId: number) => getOrderItems(sessionId))
  ipcMain.handle('orderItems:remove', (_e, itemId: number) => removeOrderItem(itemId))
  ipcMain.handle('orderItems:total', (_e, sessionId: number) => getOrderTotal(sessionId))
}
