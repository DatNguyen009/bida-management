// src/main/handlers/orderItems.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { OrderItem } from '../../renderer/src/types'

export async function addOrderItem(
  sessionId: number,
  productId: number,
  quantity: number,
  unitPrice: number
): Promise<OrderItem | null> {
  const agentId = getAgentId()
  const subtotal = quantity * unitPrice
  return queryOne<OrderItem>(
    `INSERT INTO cloud_order_items (session_id, product_id, quantity, unit_price, subtotal, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id, product_id, agent_id)
     DO UPDATE SET
       quantity = cloud_order_items.quantity + EXCLUDED.quantity,
       subtotal = cloud_order_items.subtotal + EXCLUDED.subtotal
     RETURNING *`,
    [sessionId, productId, quantity, unitPrice, subtotal, agentId]
  )
}

export async function getOrderItems(
  sessionId: number
): Promise<(OrderItem & { product_name: string })[]> {
  const agentId = getAgentId()
  return query(
    `SELECT oi.*, p.name AS product_name
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id
     WHERE oi.session_id = $1 AND oi.agent_id = $2
     ORDER BY oi.created_at`,
    [sessionId, agentId]
  )
}

export async function removeOrderItem(itemId: number): Promise<void> {
  const agentId = getAgentId()
  await queryOne(
    'DELETE FROM cloud_order_items WHERE id = $1 AND agent_id = $2 RETURNING id',
    [itemId, agentId]
  )
}

export async function getOrderTotal(sessionId: number): Promise<number> {
  const agentId = getAgentId()
  const result = await queryOne<{ total: string }>(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM cloud_order_items WHERE session_id = $1 AND agent_id = $2',
    [sessionId, agentId]
  )
  return Number(result?.total ?? 0)
}

export function registerOrderItemHandlers() {
  ipcMain.handle('orderItems:add',
    (_e, sessionId: number, productId: number, qty: number, price: number) =>
      addOrderItem(sessionId, productId, qty, price)
  )
  ipcMain.handle('orderItems:get', (_e, sessionId: number) => getOrderItems(sessionId))
  ipcMain.handle('orderItems:remove', (_e, itemId: number) => removeOrderItem(itemId))
  ipcMain.handle('orderItems:total', (_e, sessionId: number) => getOrderTotal(sessionId))
}
