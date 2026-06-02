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
