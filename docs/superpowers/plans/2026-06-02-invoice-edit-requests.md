# Invoice Edit Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép nhân viên gửi yêu cầu chỉnh sửa order items của hóa đơn (chỉ hóa đơn trong ngày), chủ quán approve/reject trên web admin; khi approve tự động điều chỉnh tồn kho và tính lại tổng tiền.

**Architecture:** Staff gửi yêu cầu từ Electron app (IPC → main process → cloud API dùng agent JWT); yêu cầu lưu vào `invoice_edit_requests` trên cloud DB; agent approve/reject qua web admin; khi approve server diff old/new items, điều chỉnh `cloud_order_items` + `cloud_products.stock_quantity` + tính lại `cloud_invoices.items_amount/final_amount`.

**Tech Stack:** PostgreSQL (cloud), Express/TypeScript (server), React+Vite+TypeScript (web admin), Electron (desktop app), node fetch (main process HTTP call).

---

## File Map

| File | Action |
|------|--------|
| `server/src/migrate.ts` | Modify — thêm `invoice_edit_requests` table vào migration |
| `server/src/routes/agentPortal.ts` | Modify — thêm 4 endpoints: create, list, approve, reject |
| `src/main/handlers/invoices.ts` | Modify — thêm IPC handler `invoices:requestEdit` |
| `src/preload/index.ts` | Modify — expose `invoices.requestEdit` qua contextBridge |
| `src/renderer/src/pages/InvoiceList.tsx` | Modify — thêm nút "Yêu cầu sửa" + modal chỉnh items |
| `src/renderer/src/types.ts` | Modify — thêm `EditRequest` type |
| `web-admin/src/pages/agent/AgentEditRequestsPage.tsx` | **Create** — trang quản lý yêu cầu |
| `web-admin/src/components/AgentLayout.tsx` | Modify — thêm nav item "Yêu cầu sửa" với badge |
| `web-admin/src/App.tsx` | Modify — thêm route `/agent/edit-requests` |

---

## Task 1: Server — DB Migration + 4 API Endpoints

**Files:**
- Modify: `server/src/migrate.ts`
- Modify: `server/src/routes/agentPortal.ts`

- [ ] **Step 1: Thêm migration tạo `invoice_edit_requests` vào `server/src/migrate.ts`**

Read file `server/src/migrate.ts` trước. Thêm vào cuối chuỗi `MIGRATION` (trước dấu backtick đóng):

```sql

CREATE TABLE IF NOT EXISTS invoice_edit_requests (
  id              SERIAL PRIMARY KEY,
  agent_id        UUID          NOT NULL REFERENCES agents(id),
  invoice_id      INT           NOT NULL,
  session_id      INT           NOT NULL,
  requested_by    VARCHAR(100)  NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  old_items       JSONB         NOT NULL,
  new_items       JSONB         NOT NULL,
  note            TEXT,
  reviewed_by     VARCHAR(100),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_requests_agent_status
  ON invoice_edit_requests (agent_id, status, created_at DESC);
```

- [ ] **Step 2: Thêm 4 endpoints vào `server/src/routes/agentPortal.ts`**

Read file trước. Thêm sau `export default router` (trước dòng đó):

```typescript
// POST /agent/invoices/:id/edit-requests
router.post('/invoices/:id/edit-requests', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { requested_by, new_items, note } = req.body
  if (!requested_by || !Array.isArray(new_items)) {
    res.status(400).json({ error: 'requested_by and new_items required' }); return
  }

  // Chỉ cho phép sửa HĐ trong ngày hôm nay (theo giờ VN)
  const invoiceRow = await pool.query(
    `SELECT id, session_id FROM cloud_invoices
     WHERE id=$1 AND agent_id=$2
       AND DATE(created_at ${VN}) = CURRENT_DATE`,
    [req.params.id, agentId]
  )
  if (!invoiceRow.rows[0]) {
    res.status(404).json({ error: 'Hóa đơn không tồn tại hoặc không trong ngày hôm nay' }); return
  }

  // Kiểm tra không có request pending nào cho HĐ này
  const existing = await pool.query(
    `SELECT id FROM invoice_edit_requests
     WHERE invoice_id=$1 AND agent_id=$2 AND status='pending'`,
    [req.params.id, agentId]
  )
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Đã có yêu cầu chỉnh sửa đang chờ duyệt' }); return
  }

  const { session_id } = invoiceRow.rows[0]

  // Snapshot order items hiện tại
  const oldItemsRow = await pool.query(
    `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id AND p.agent_id = $2
     WHERE oi.session_id=$1 AND oi.agent_id=$2`,
    [session_id, agentId]
  )

  const { rows } = await pool.query(
    `INSERT INTO invoice_edit_requests
       (agent_id, invoice_id, session_id, requested_by, old_items, new_items, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [agentId, req.params.id, session_id, requested_by, JSON.stringify(oldItemsRow.rows), JSON.stringify(new_items), note || null]
  )
  res.status(201).json(rows[0])
})

// GET /agent/edit-requests
router.get('/edit-requests', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const { status } = req.query as Record<string, string>
  const { rows } = await pool.query(
    `SELECT r.*, i.invoice_number
     FROM invoice_edit_requests r
     JOIN cloud_invoices i ON i.id = r.invoice_id AND i.agent_id = $1
     WHERE r.agent_id = $1
       AND ($2::varchar IS NULL OR r.status = $2)
     ORDER BY r.created_at DESC
     LIMIT 100`,
    [agentId, status || null]
  )
  res.json(rows)
})

// PUT /agent/edit-requests/:id/approve
router.put('/edit-requests/:id/approve', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const reviewed_by = req.body.reviewed_by ?? 'agent'

  const reqRow = await pool.query(
    `SELECT * FROM invoice_edit_requests WHERE id=$1 AND agent_id=$2 AND status='pending'`,
    [req.params.id, agentId]
  )
  if (!reqRow.rows[0]) { res.status(404).json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }); return }

  const editReq = reqRow.rows[0]
  const newItems: { product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[] = editReq.new_items
  const oldItems: { product_id: number; quantity: number }[] = editReq.old_items
  const sessionId: number = editReq.session_id
  const invoiceId: number = editReq.invoice_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Diff stock: tính chênh lệch từng sản phẩm
    const allProductIds = new Set([...oldItems.map(i => i.product_id), ...newItems.map(i => i.product_id)])
    for (const productId of allProductIds) {
      const oldQty = oldItems.find(i => i.product_id === productId)?.quantity ?? 0
      const newQty = newItems.find(i => i.product_id === productId)?.quantity ?? 0
      const diff = newQty - oldQty // >0 = thêm (trừ kho), <0 = bớt (cộng kho)
      if (diff === 0) continue

      const prodRow = await client.query(
        `SELECT stock_quantity, product_type FROM cloud_products WHERE id=$1 AND agent_id=$2`,
        [productId, agentId]
      )
      if (!prodRow.rows[0] || prodRow.rows[0].product_type !== 'stock') continue

      const before = prodRow.rows[0].stock_quantity
      const after = before - diff // trừ nếu thêm items, cộng nếu bớt items
      await client.query(
        `UPDATE cloud_products SET stock_quantity=$1 WHERE id=$2 AND agent_id=$3`,
        [after, productId, agentId]
      )
      await client.query(
        `INSERT INTO cloud_stock_transactions
           (agent_id, product_id, type, quantity, before_qty, after_qty, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [agentId, productId, diff > 0 ? 'out' : 'in', Math.abs(diff), before, after,
         `Sửa HĐ #${invoiceId} - yêu cầu ID ${editReq.id}`]
      )
    }

    // 2. Xoá order_items cũ, insert mới
    await client.query(`DELETE FROM cloud_order_items WHERE session_id=$1 AND agent_id=$2`, [sessionId, agentId])
    for (const item of newItems) {
      await client.query(
        `INSERT INTO cloud_order_items (agent_id, session_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [agentId, sessionId, item.product_id, item.quantity, item.unit_price, item.subtotal]
      )
    }

    // 3. Tính lại items_amount và final_amount
    const newItemsAmount = newItems.reduce((sum, i) => sum + i.subtotal, 0)
    await client.query(
      `UPDATE cloud_invoices
       SET items_amount=$1,
           final_amount = play_amount + $1 - discount - discount_from_points
       WHERE id=$2 AND agent_id=$3`,
      [newItemsAmount, invoiceId, agentId]
    )

    // 4. Mark request approved
    await client.query(
      `UPDATE invoice_edit_requests
       SET status='approved', reviewed_by=$1, reviewed_at=NOW()
       WHERE id=$2`,
      [reviewed_by, editReq.id]
    )

    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

// PUT /agent/edit-requests/:id/reject
router.put('/edit-requests/:id/reject', async (req: AuthRequest, res: Response) => {
  const agentId = req.account!.agentId!
  const reviewed_by = req.body.reviewed_by ?? 'agent'
  const { rows } = await pool.query(
    `UPDATE invoice_edit_requests
     SET status='rejected', reviewed_by=$1, reviewed_at=NOW()
     WHERE id=$2 AND agent_id=$3 AND status='pending'
     RETURNING id`,
    [reviewed_by, req.params.id, agentId]
  )
  if (!rows[0]) { res.status(404).json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }); return }
  res.json({ success: true })
})
```

- [ ] **Step 3: Typecheck server**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd .. && git add server/src/migrate.ts server/src/routes/agentPortal.ts
git commit -m "feat: invoice edit requests — DB migration + 4 API endpoints (create/list/approve/reject)"
```

---

## Task 2: Electron App — IPC Handler + Preload

**Files:**
- Modify: `src/main/handlers/invoices.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Đọc `src/main/handlers/invoices.ts` và thêm handler `invoices:requestEdit`**

Read file trước. Thêm vào cuối hàm `registerInvoiceHandlers()` (trước dấu `}`):

```typescript
  ipcMain.handle('invoices:requestEdit', async (_e, payload: {
    invoiceId: number
    newItems: { product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[]
    note: string
  }) => {
    const token = getAccessToken()
    if (!token) throw new Error('Chưa đăng nhập')
    const username = getUsername()
    const apiUrl = process.env.VITE_API_URL ?? 'https://bida-management.onrender.com/api/v1'
    const response = await fetch(`${apiUrl}/agent/invoices/${payload.invoiceId}/edit-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        requested_by: username,
        new_items: payload.newItems,
        note: payload.note,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'Gửi yêu cầu thất bại')
    return data
  })
```

Note: `getAccessToken` và `getUsername` đã import sẵn trong file (`import { getAgentId, getAccessToken, getUsername } from '../lib/authStore'`). Nếu chưa có, thêm vào import.

- [ ] **Step 2: Đọc `src/preload/index.ts` và expose `invoices.requestEdit`**

Read file trước. Tìm phần expose `invoices` trong contextBridge (thường có `invoices.create`, `invoices.getList`...). Thêm vào object invoices:

```typescript
requestEdit: (payload: {
  invoiceId: number
  newItems: { product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[]
  note: string
}) => ipcRenderer.invoke('invoices:requestEdit', payload),
```

- [ ] **Step 3: Thêm type vào `src/renderer/src/types.ts`**

Read file trước. Thêm:

```typescript
export interface EditRequestItem {
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}
```

- [ ] **Step 4: Typecheck Electron**

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/invoices.ts src/preload/index.ts src/renderer/src/types.ts
git commit -m "feat: add invoices:requestEdit IPC handler + preload expose"
```

---

## Task 3: Electron App — UI trong InvoiceList

**Files:**
- Modify: `src/renderer/src/pages/InvoiceList.tsx`

- [ ] **Step 1: Đọc file `src/renderer/src/pages/InvoiceList.tsx`**

Đọc toàn bộ file để hiểu structure. State hiện tại có `selected` (InvoiceListRow | null) và `orderItems`.

- [ ] **Step 2: Thêm state + logic cho edit request modal**

Thêm vào đầu component `InvoiceListPage` (sau các state hiện có):

```typescript
  const [showEditModal, setShowEditModal] = useState(false)
  const [editItems, setEditItems] = useState<{ product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[]>([])
  const [editNote, setEditNote] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSuccess, setEditSuccess] = useState(false)

  function openEditModal() {
    // Copy order items hiện tại để chỉnh sửa
    setEditItems(orderItems.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      subtotal: i.subtotal,
    })))
    setEditNote('')
    setEditSuccess(false)
    setShowEditModal(true)
  }

  function updateEditQty(productId: number, qty: number) {
    setEditItems(items =>
      qty <= 0
        ? items.filter(i => i.product_id !== productId)
        : items.map(i => i.product_id === productId
            ? { ...i, quantity: qty, subtotal: i.unit_price * qty }
            : i
          )
    )
  }

  async function submitEditRequest() {
    if (!selected || editSubmitting) return
    setEditSubmitting(true)
    try {
      await window.api.invoices.requestEdit({
        invoiceId: selected.id,
        newItems: editItems,
        note: editNote,
      })
      setEditSuccess(true)
      setTimeout(() => setShowEditModal(false), 1500)
    } catch (err: unknown) {
      const e = err as { message?: string }
      alert(e.message ?? 'Gửi yêu cầu thất bại')
    } finally {
      setEditSubmitting(false)
    }
  }

  // Kiểm tra HĐ có trong ngày không
  function isToday(isoDate: string) {
    return new Date(isoDate).toDateString() === new Date().toDateString()
  }
```

- [ ] **Step 3: Thêm nút "Yêu cầu sửa" vào detail panel**

Trong phần detail panel (sau dòng `{selected.printed_at && (...)}` cuối panel), thêm:

```tsx
            {isToday(selected.created_at) && role !== 'owner' && (
              <button
                onClick={openEditModal}
                disabled={!orderItems.length}
                className="mt-3 w-full py-2 text-xs rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ✏️ Yêu cầu chỉnh sửa đồ uống
              </button>
            )}
```

- [ ] **Step 4: Thêm modal chỉnh sửa (sau closing `</div>` cuối cùng của return)**

```tsx
      {showEditModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !editSubmitting && setShowEditModal(false)} />
          <div className="relative bg-[rgba(14,12,16,0.95)] border border-white/15 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">Yêu cầu sửa HĐ #{selected.invoice_number}</h2>
              <button className="text-white/40 hover:text-white" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <p className="text-white/50 text-xs">Chỉnh số lượng đồ uống. Xoá hết = bỏ sản phẩm.</p>

            {editSuccess ? (
              <div className="text-center py-4">
                <p className="text-green-400 font-bold text-lg">✓ Đã gửi yêu cầu</p>
                <p className="text-white/50 text-xs mt-1">Chờ chủ quán phê duyệt</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {editItems.map(item => (
                    <div key={item.product_id} className="flex items-center justify-between gap-3">
                      <span className="text-white/80 text-sm flex-1">{item.product_name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateEditQty(item.product_id, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 text-sm font-bold"
                        >−</button>
                        <span className="text-white font-mono w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateEditQty(item.product_id, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 text-sm font-bold"
                        >+</button>
                      </div>
                      <span className="text-white/40 text-xs w-20 text-right">
                        {(item.unit_price * item.quantity).toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                  ))}
                  {editItems.length === 0 && (
                    <p className="text-white/30 text-xs text-center py-2">Tất cả sản phẩm đã bị xoá</p>
                  )}
                </div>

                <div>
                  <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Lý do chỉnh sửa</label>
                  <textarea
                    className="w-full bg-white/[0.07] border border-white/14 rounded-lg px-3 py-2 text-white text-sm resize-none outline-none focus:border-yellow-500/60"
                    rows={2}
                    placeholder="VD: nhân viên nhập nhầm số lượng..."
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 py-2 text-sm rounded-lg bg-white/[0.08] text-white/80 hover:bg-white/14 border border-white/15"
                    onClick={() => setShowEditModal(false)}>Huỷ</button>
                  <button
                    className="flex-1 py-2 text-sm rounded-lg font-bold disabled:opacity-45 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg,#f0d060,#d4af37,#b8960c)', color: '#0f0e0f' }}
                    disabled={editSubmitting || editItems.length === 0}
                    onClick={submitEditRequest}
                  >
                    {editSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Typecheck Electron renderer**

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/InvoiceList.tsx
git commit -m "feat: InvoiceList — add edit request modal for staff (same-day invoices only)"
```

---

## Task 4: Web Admin — AgentEditRequestsPage + Layout + Route

**Files:**
- Create: `web-admin/src/pages/agent/AgentEditRequestsPage.tsx`
- Modify: `web-admin/src/components/AgentLayout.tsx`
- Modify: `web-admin/src/App.tsx`

- [ ] **Step 1: Tạo `web-admin/src/pages/agent/AgentEditRequestsPage.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import AgentLayout from '../../components/AgentLayout'

interface EditItem {
  product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number
}

interface EditRequest {
  id: number; invoice_id: number; invoice_number: string; session_id: number
  requested_by: string; status: 'pending' | 'approved' | 'rejected'
  old_items: EditItem[]; new_items: EditItem[]
  note: string | null; reviewed_by: string | null; reviewed_at: string | null
  created_at: string
}

function fmt(n: number) { return Number(n).toLocaleString('vi-VN') + 'đ' }
function fmtDate(s: string) { return new Date(s).toLocaleString('vi-VN') }

const STATUS_LABEL: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-300 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
}

export default function AgentEditRequestsPage() {
  const [requests, setRequests] = useState<EditRequest[]>([])
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [selected, setSelected] = useState<EditRequest | null>(null)
  const [processing, setProcessing] = useState(false)
  const { role } = useAuthStore()

  const load = useCallback(async () => {
    const params = filter === 'pending' ? '?status=pending' : ''
    const { data } = await api.get(`/agent/edit-requests${params}`)
    setRequests(data)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function approve(id: number) {
    if (!confirm('Duyệt yêu cầu này? Tồn kho và hóa đơn sẽ được cập nhật.')) return
    setProcessing(true)
    try {
      await api.put(`/agent/edit-requests/${id}/approve`, { reviewed_by: role })
      setSelected(null)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error ?? 'Lỗi khi duyệt')
    } finally { setProcessing(false) }
  }

  async function reject(id: number) {
    if (!confirm('Từ chối yêu cầu này?')) return
    setProcessing(true)
    try {
      await api.put(`/agent/edit-requests/${id}/reject`, { reviewed_by: role })
      setSelected(null)
      await load()
    } catch { alert('Lỗi khi từ chối') }
    finally { setProcessing(false) }
  }

  // Tính diff giữa old và new items để hiển thị thay đổi
  function diffItems(oldItems: EditItem[], newItems: EditItem[]) {
    const allIds = new Set([...oldItems.map(i => i.product_id), ...newItems.map(i => i.product_id)])
    return Array.from(allIds).map(id => {
      const old = oldItems.find(i => i.product_id === id)
      const neu = newItems.find(i => i.product_id === id)
      const name = old?.product_name ?? neu?.product_name ?? ''
      const oldQty = old?.quantity ?? 0
      const newQty = neu?.quantity ?? 0
      return { id, name, oldQty, newQty, diff: newQty - oldQty }
    }).filter(d => d.diff !== 0)
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <AgentLayout title="Yêu cầu sửa hóa đơn">
      {/* Filter tabs */}
      <div className="flex gap-3 mb-5 items-center">
        <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-xs rounded-lg transition-colors font-medium
                ${filter === f ? 'bg-[#d4af37] text-black' : 'text-white/50 hover:text-white'}`}>
              {f === 'pending' ? `Chờ duyệt${pendingCount > 0 ? ` (${pendingCount})` : ''}` : 'Tất cả'}
            </button>
          ))}
        </div>
        <button onClick={load} className="btn-glass text-xs px-3">↻ Làm mới</button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header">
            <tr><th>HĐ #</th><th>Nhân viên</th><th>Lý do</th><th>Thời gian</th><th>Trạng thái</th><th className="text-right pr-4">Thao tác</th></tr>
          </thead>
          <tbody>
            {requests.map((r, i) => (
              <tr key={r.id} onClick={() => setSelected(r)}
                className={`border-b border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-colors ${i%2===1?'bg-white/[0.02]':''} ${selected?.id===r.id?'bg-white/[0.06]':''}`}>
                <td className="px-4 py-3 text-[#d4af37] font-mono">#{r.invoice_number}</td>
                <td className="px-4 py-3 text-white/80">{r.requested_by}</td>
                <td className="px-4 py-3 text-white/50 text-xs max-w-[160px] truncate">{r.note ?? '—'}</td>
                <td className="px-4 py-3 text-white/40 text-xs">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  {r.status === 'pending' && (
                    <>
                      <button className="btn-gold text-xs" disabled={processing}
                        onClick={e => { e.stopPropagation(); approve(r.id) }}>✓ Duyệt</button>
                      <button className="btn-danger text-xs" disabled={processing}
                        onClick={e => { e.stopPropagation(); reject(r.id) }}>✗ Từ chối</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">
                {filter === 'pending' ? 'Không có yêu cầu nào đang chờ duyệt ✓' : 'Chưa có yêu cầu nào'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="modal-glass relative w-full max-w-md mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">Yêu cầu sửa HĐ #{selected.invoice_number}</h2>
              <button className="text-white/40 hover:text-white" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="space-y-1 text-sm">
              {[
                ['Nhân viên', selected.requested_by],
                ['Lý do', selected.note ?? '—'],
                ['Thời gian gửi', fmtDate(selected.created_at)],
                ...(selected.reviewed_at ? [['Xử lý bởi', `${selected.reviewed_by} lúc ${fmtDate(selected.reviewed_at)}`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-white/40">{k}</span>
                  <span className="text-white/80 text-right">{v}</span>
                </div>
              ))}
            </div>

            {/* Thay đổi */}
            <div>
              <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Thay đổi đề xuất</p>
              {diffItems(selected.old_items, selected.new_items).map(d => (
                <div key={d.id} className="flex justify-between text-sm py-1.5 border-b border-white/[0.05]">
                  <span className="text-white/70">{d.name}</span>
                  <span className={d.diff > 0 ? 'text-red-300' : 'text-green-300'}>
                    {d.oldQty} → {d.newQty} ({d.diff > 0 ? `+${d.diff}` : d.diff})
                  </span>
                </div>
              ))}
              {diffItems(selected.old_items, selected.new_items).length === 0 && (
                <p className="text-white/30 text-xs">Không có thay đổi</p>
              )}
            </div>

            {/* New items total */}
            <div className="flex justify-between text-sm pt-1">
              <span className="text-white/50">Tổng đồ uống mới</span>
              <span className="text-[#d4af37] font-bold">
                {fmt(selected.new_items.reduce((s, i) => s + i.subtotal, 0))}
              </span>
            </div>

            {selected.status === 'pending' && (
              <div className="flex gap-3 pt-2">
                <button className="btn-danger flex-1" disabled={processing}
                  onClick={() => reject(selected.id)}>✗ Từ chối</button>
                <button className="btn-gold flex-1" disabled={processing}
                  onClick={() => approve(selected.id)}>✓ Phê duyệt</button>
              </div>
            )}
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
```

- [ ] **Step 2: Thêm nav item vào `web-admin/src/components/AgentLayout.tsx`**

Read file trước. Trong mảng `NAV_ITEMS`, thêm sau mục Hóa đơn:

```typescript
  { path: '/agent/edit-requests', label: 'Sửa HĐ', icon: '✏️' },
```

- [ ] **Step 3: Thêm route vào `web-admin/src/App.tsx`**

Read file trước. Thêm import:
```typescript
import AgentEditRequestsPage from './pages/agent/AgentEditRequestsPage'
```

Thêm route (sau route `/agent/invoices`):
```tsx
<Route path="/agent/edit-requests" element={<RequireAgent><AgentEditRequestsPage /></RequireAgent>} />
```

- [ ] **Step 4: Typecheck web-admin**

```bash
cd web-admin && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd .. && git add web-admin/src/pages/agent/AgentEditRequestsPage.tsx web-admin/src/components/AgentLayout.tsx web-admin/src/App.tsx
git commit -m "feat: AgentEditRequestsPage — list, approve, reject with diff view"
```

---

## Task 5: Build + Deploy

**Files:**
- `server/public/agent-admin/` (rebuilt output)

- [ ] **Step 1: Build web-admin**

```bash
cd web-admin && npm run build
```

Expected: `dist/` folder created, no errors.

- [ ] **Step 2: Copy sang server và typecheck**

```bash
mkdir -p ../server/public/agent-admin
cp -r dist/* ../server/public/agent-admin/
cd ../server && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit + push**

```bash
cd ..
git add server/public/agent-admin/ web-admin/
git commit -m "feat: invoice edit requests — complete feature (Electron + web admin + server)"
git push origin main
```

Expected: push thành công, Render auto-deploy.

---

## Self-Review

**Spec coverage:**
- ✅ Staff tạo yêu cầu từ Electron app (Task 2, 3)
- ✅ Chỉ HĐ trong ngày hôm nay (Task 1 server check + Task 3 UI guard)
- ✅ Chỉ edit order items (new_items array)
- ✅ Agent approve/reject trên web admin (Task 4)
- ✅ Khi approve: tồn kho điều chỉnh + order_items cập nhật + invoice recalculate (Task 1 approve endpoint)
- ✅ Không cho phép 2 pending request cho cùng 1 HĐ (Task 1 conflict check)

**Business logic đặc biệt:**
- Composite products bị skip khi adjust stock (chỉ type='stock' mới điều chỉnh)
- `final_amount = play_amount + new_items_amount - discount - discount_from_points` — không sửa tiền chơi hay điểm
- Diff được tính theo product_id để xác định tăng/giảm chính xác
