// src/main/handlers/invoices.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Invoice, InvoiceCreateInput } from '../../renderer/src/types'
import { printInvoice } from './printer'

export async function getNextInvoiceNumber(): Promise<string> {
  const agentId = getAgentId()
  const result = await queryOne<{ max_num: string | null }>(
    'SELECT MAX(invoice_number) AS max_num FROM cloud_invoices WHERE agent_id = $1',
    [agentId]
  )
  const maxNum = result?.max_num ? parseInt(result.max_num, 10) : 0
  return String(maxNum + 1).padStart(5, '0')
}

export async function createInvoice(input: InvoiceCreateInput): Promise<Invoice | null> {
  const agentId = getAgentId()
  const invoiceNumber = await getNextInvoiceNumber()

  const invoice = await queryOne<Invoice>(
    `INSERT INTO cloud_invoices
       (session_id, invoice_number, play_amount, items_amount, total_amount,
        discount, points_redeemed, discount_from_points, final_amount, points_earned, agent_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      input.sessionId, invoiceNumber,
      input.playAmount, input.itemsAmount,
      input.playAmount + input.itemsAmount,
      input.discount, input.pointsRedeemed, input.discountFromPoints,
      input.finalAmount, input.pointsEarned, agentId,
    ]
  )

  if (invoice && input.customerId) {
    await query(
      `UPDATE cloud_customers
       SET points_balance = points_balance + $1 - $2,
           total_visits = total_visits + 1,
           total_spent = total_spent + $3
       WHERE id = $4 AND agent_id = $5`,
      [input.pointsEarned, input.pointsRedeemed, input.finalAmount, input.customerId, agentId]
    )
  }

  if (invoice) {
    const orderItems = await query<{ product_id: number; quantity: number; unit_price: number }>(
      'SELECT product_id, quantity, unit_price FROM cloud_order_items WHERE session_id = $1 AND agent_id = $2',
      [input.sessionId, agentId]
    )

    for (const item of orderItems) {
      const updated = await queryOne<{ stock_quantity: number }>(
        `UPDATE cloud_products SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND agent_id = $3 RETURNING stock_quantity`,
        [item.quantity, item.product_id, agentId]
      )
      if (!updated) continue

      const afterQty = updated.stock_quantity
      const beforeQty = afterQty + item.quantity

      await queryOne(
        `INSERT INTO cloud_stock_transactions
           (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [item.product_id, 'out', item.quantity, null, beforeQty, afterQty, `Hóa đơn #${invoiceNumber}`, agentId]
      )
    }
  }

  return invoice
}

export async function printAndMarkInvoice(
  invoiceId: number,
  input: InvoiceCreateInput,
  invoiceNumber: string,
  printerPath: string
): Promise<void> {
  await printInvoice(input, invoiceNumber, printerPath)
  const agentId = getAgentId()
  await queryOne(
    'UPDATE cloud_invoices SET printed_at = NOW() WHERE id = $1 AND agent_id = $2 RETURNING id',
    [invoiceId, agentId]
  )
}

export interface InvoiceListInput {
  fromDate?: string
  toDate?: string
}

export async function getInvoiceList(input: InvoiceListInput) {
  const agentId = getAgentId()
  return query(
    `SELECT i.id, i.invoice_number, i.session_id,
            i.play_amount, i.items_amount, i.final_amount,
            i.discount, i.points_redeemed, i.discount_from_points,
            i.points_earned, i.printed_at, i.created_at,
            t.name AS table_name,
            c.name AS customer_name,
            c.phone AS customer_phone
     FROM cloud_invoices i
     LEFT JOIN cloud_sessions s ON s.id = i.session_id
     LEFT JOIN cloud_tables t ON t.id = s.table_id
     LEFT JOIN cloud_customers c ON c.id = s.customer_id
     WHERE i.agent_id = $1
       AND ($2::date IS NULL OR DATE(i.created_at) >= $2)
       AND ($3::date IS NULL OR DATE(i.created_at) <= $3)
     ORDER BY i.created_at DESC
     LIMIT 300`,
    [agentId, input.fromDate ?? null, input.toDate ?? null]
  )
}

export async function getInvoiceOrderItems(sessionId: number) {
  const agentId = getAgentId()
  return query(
    `SELECT p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id
     WHERE oi.session_id = $1 AND oi.agent_id = $2
     ORDER BY oi.created_at`,
    [sessionId, agentId]
  )
}

export function registerInvoiceHandlers() {
  ipcMain.handle('invoices:create', (_e, input: InvoiceCreateInput) => createInvoice(input))
  ipcMain.handle('invoices:print',
    (_e, invoiceId: number, input: InvoiceCreateInput, invoiceNumber: string, printerPath: string) =>
      printAndMarkInvoice(invoiceId, input, invoiceNumber, printerPath)
  )
  ipcMain.handle('invoices:getList',
    (_e, input: InvoiceListInput) => getInvoiceList(input)
  )
  ipcMain.handle('invoices:getOrderItems',
    (_e, sessionId: number) => getInvoiceOrderItems(sessionId)
  )
}
