// server/src/routes/staffPortal.ts
import { Router, Request, Response } from 'express'
import { pool } from '../db'
import bcrypt from 'bcrypt'

const router = Router()

const VN = `+ INTERVAL '7 hours'`

// POST /staff/edit-requests — tạo yêu cầu sửa HĐ (staff dùng username/password thay JWT)
router.post('/edit-requests', async (req: Request, res: Response) => {
  const { agent_id, username, password, invoice_id, new_items, note } = req.body

  if (!agent_id || !username || !password || !invoice_id || !Array.isArray(new_items)) {
    res.status(400).json({ error: 'Thiếu thông tin bắt buộc' }); return
  }

  // 1. Verify staff credentials
  const staffRow = await pool.query(
    `SELECT id, password_hash FROM cloud_staff
     WHERE agent_id=$1 AND username=$2 AND is_active=TRUE LIMIT 1`,
    [agent_id, username]
  )
  if (!staffRow.rows[0]) { res.status(401).json({ error: 'Sai thông tin đăng nhập' }); return }

  const match = await bcrypt.compare(password, staffRow.rows[0].password_hash)
  if (!match) { res.status(401).json({ error: 'Sai thông tin đăng nhập' }); return }

  // 2. Kiểm tra hóa đơn tồn tại và trong ngày hôm nay
  const invoiceRow = await pool.query(
    `SELECT id, session_id FROM cloud_invoices
     WHERE id=$1 AND agent_id=$2
       AND DATE(created_at ${VN}) = CURRENT_DATE`,
    [invoice_id, agent_id]
  )
  if (!invoiceRow.rows[0]) {
    res.status(404).json({ error: 'Hóa đơn không tồn tại hoặc không trong ngày hôm nay' }); return
  }

  const { session_id } = invoiceRow.rows[0]

  // 3. Không cho 2 pending request cho cùng 1 HĐ
  const existing = await pool.query(
    `SELECT id FROM invoice_edit_requests WHERE invoice_id=$1 AND agent_id=$2 AND status='pending'`,
    [invoice_id, agent_id]
  )
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Đã có yêu cầu chỉnh sửa đang chờ duyệt' }); return
  }

  // 4. Snapshot order items hiện tại
  const oldItemsRow = await pool.query(
    `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id AND p.agent_id = $2
     WHERE oi.session_id=$1 AND oi.agent_id=$2`,
    [session_id, agent_id]
  )

  // 5. Insert edit request
  const { rows } = await pool.query(
    `INSERT INTO invoice_edit_requests
       (agent_id, invoice_id, session_id, requested_by, old_items, new_items, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [agent_id, invoice_id, session_id, username,
     JSON.stringify(oldItemsRow.rows), JSON.stringify(new_items), note || null]
  )

  res.status(201).json({ success: true, id: rows[0].id })
})

export default router
