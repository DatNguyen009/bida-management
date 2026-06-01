// src/main/handlers/invoices.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId, getUsername, getRole } from '../lib/authStore'
import type { Invoice, InvoiceCreateInput, PageResult, InvoiceListRow } from '../../renderer/src/types'
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

  const completedBy = getUsername() || null

  const invoice = await queryOne<Invoice>(
    `INSERT INTO cloud_invoices
       (session_id, invoice_number, play_amount, items_amount, total_amount,
        discount, points_redeemed, discount_from_points, final_amount, points_earned,
        payment_method, agent_id, completed_by, customer_id, promotions_applied)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) RETURNING *`,
    [
      input.sessionId, invoiceNumber,
      input.playAmount, input.itemsAmount,
      input.playAmount + input.itemsAmount,
      input.discount, input.pointsRedeemed, input.discountFromPoints,
      input.finalAmount, input.pointsEarned,
      input.paymentMethod ?? 'cash', agentId, completedBy,
      input.customerId ?? null,
      JSON.stringify(input.promotionsApplied ?? []),
    ]
  )

  if (invoice && input.customerId) {
    await Promise.all([
      query(
        `UPDATE cloud_customers
         SET points_balance = points_balance + $1 - $2,
             total_visits = total_visits + 1,
             total_spent = total_spent + $3
         WHERE id = $4 AND agent_id = $5`,
        [input.pointsEarned, input.pointsRedeemed, input.finalAmount, input.customerId, agentId]
      ),
      query(
        `UPDATE cloud_sessions SET customer_id = $1 WHERE id = $2 AND agent_id = $3`,
        [input.customerId, input.sessionId, agentId]
      ),
    ])
  }

  if (invoice) {
    const orderItems = await query<{ product_id: number; quantity: number; unit_price: number }>(
      'SELECT product_id, quantity, unit_price FROM cloud_order_items WHERE session_id = $1 AND agent_id = $2',
      [input.sessionId, agentId]
    )

    for (const item of orderItems) {
      const product = await queryOne<{ product_type: string }>(
        'SELECT product_type FROM cloud_products WHERE id = $1 AND agent_id = $2',
        [item.product_id, agentId]
      )

      if (product?.product_type === 'composite') {
        // Trừ kho từng nguyên liệu theo công thức × số lượng bán
        const recipe = await query<{ ingredient_id: number; quantity: number }>(
          'SELECT ingredient_id, quantity FROM cloud_product_recipes WHERE product_id = $1 AND agent_id = $2',
          [item.product_id, agentId]
        )
        for (const ing of recipe) {
          const deductQty = ing.quantity * item.quantity
          const ingUpdated = await queryOne<{ stock_quantity: number }>(
            `UPDATE cloud_products SET stock_quantity = stock_quantity - $1
             WHERE id = $2 AND agent_id = $3 RETURNING stock_quantity`,
            [deductQty, ing.ingredient_id, agentId]
          )
          if (!ingUpdated) continue
          const ingAfterQty = ingUpdated.stock_quantity
          const ingBeforeQty = ingAfterQty + deductQty
          await queryOne(
            `INSERT INTO cloud_stock_transactions
               (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [ing.ingredient_id, 'out', deductQty, null, ingBeforeQty, ingAfterQty, `Hóa đơn #${invoiceNumber} (chế biến)`, agentId]
          )
        }
        // Ghi log xuất cho bản thân sản phẩm chế biến để thống kê sau
        await queryOne(
          `INSERT INTO cloud_stock_transactions
             (product_id, type, quantity, cost_price, before_qty, after_qty, note, agent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [item.product_id, 'out', item.quantity, null, 0, 0, `Hóa đơn #${invoiceNumber}`, agentId]
        )
      } else {
        // Hàng nhập: trừ kho bình thường
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
  completedBy?: string
  page: number
  pageSize: number
}

export async function getInvoiceList(input: InvoiceListInput): Promise<PageResult<InvoiceListRow>> {
  const agentId = getAgentId()
  const role = getRole()
  const offset = (input.page - 1) * input.pageSize

  // Staff always sees only their own invoices; owner can optionally filter by staff
  const completedByFilter = role === 'staff' ? getUsername() || null : (input.completedBy ?? null)

  const [rows, countRows] = await Promise.all([
    query<InvoiceListRow>(
      `SELECT i.id, i.invoice_number, i.session_id,
              i.play_amount, i.items_amount, i.final_amount,
              i.discount, i.points_redeemed, i.discount_from_points,
              i.points_earned, i.printed_at, i.created_at,
              i.completed_by,
              t.name AS table_name,
              c.name AS customer_name,
              c.phone AS customer_phone
       FROM cloud_invoices i
       LEFT JOIN cloud_sessions s ON s.id = i.session_id
       LEFT JOIN cloud_tables t ON t.id = s.table_id
       LEFT JOIN cloud_customers c ON c.id = COALESCE(i.customer_id, s.customer_id)
       WHERE i.agent_id = $1
         AND ($2::date IS NULL OR DATE(i.created_at) >= $2)
         AND ($3::date IS NULL OR DATE(i.created_at) <= $3)
         AND ($4::varchar IS NULL OR i.completed_by = $4)
       ORDER BY i.created_at DESC
       LIMIT $5 OFFSET $6`,
      [agentId, input.fromDate ?? null, input.toDate ?? null, completedByFilter, input.pageSize, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM cloud_invoices i
       WHERE i.agent_id = $1
         AND ($2::date IS NULL OR DATE(i.created_at) >= $2)
         AND ($3::date IS NULL OR DATE(i.created_at) <= $3)
         AND ($4::varchar IS NULL OR i.completed_by = $4)`,
      [agentId, input.fromDate ?? null, input.toDate ?? null, completedByFilter]
    ),
  ])

  return { data: rows, total: parseInt(countRows[0]?.count ?? '0', 10) }
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
