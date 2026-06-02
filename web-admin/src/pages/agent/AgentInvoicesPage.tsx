import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface InvoiceRow {
  id: number; invoice_number: string; table_name: string | null
  play_amount: number; items_amount: number; final_amount: number
  payment_method: string; completed_by: string | null; created_at: string
  customer_name: string | null; customer_phone: string | null
  discount: number; points_redeemed: number; discount_from_points: number
  promotions_applied: { id: number; name: string; amount: number }[] | null
}
interface InvoiceDetail { invoice: InvoiceRow; items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[] }

function fmt(n: number) { return n.toLocaleString('vi-VN') + 'đ' }
function fmtDate(s: string) { return new Date(s).toLocaleString('vi-VN') }

export default function AgentInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selected, setSelected] = useState<InvoiceDetail | null>(null)
  const pageSize = 20

  async function fetchInvoices(p = page) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    const { data } = await api.get(`/agent/invoices?${params}`)
    setInvoices(data.data)
    setTotal(data.total)
  }

  useEffect(() => { fetchInvoices(1); setPage(1) }, [fromDate, toDate])

  async function openDetail(id: number) {
    const { data } = await api.get(`/agent/invoices/${id}`)
    setSelected(data)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AgentLayout title="Hóa đơn">
      {/* Filter */}
      <div className="flex gap-3 mb-4 items-center">
        <div className="flex items-center gap-2 glass-card px-3 py-2">
          <span className="text-white/40 text-xs">Từ</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-transparent text-white text-sm outline-none" />
        </div>
        <div className="flex items-center gap-2 glass-card px-3 py-2">
          <span className="text-white/40 text-xs">Đến</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-transparent text-white text-sm outline-none" />
        </div>
        <span className="text-white/40 text-xs ml-auto">{total} hóa đơn</span>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header">
            <tr><th>Số HĐ</th><th>Bàn</th><th>Khách</th><th>Tổng tiền</th><th>TT</th><th>Thời gian</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={inv.id} onClick={() => openDetail(inv.id)}
                className={`cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.04] transition-colors ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-[#d4af37] font-mono">#{inv.invoice_number}</td>
                <td className="px-4 py-3 text-white/80">{inv.table_name ?? '—'}</td>
                <td className="px-4 py-3 text-white/60 text-xs">{inv.customer_name ?? '—'}</td>
                <td className="px-4 py-3 text-white font-medium">{fmt(inv.final_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.payment_method==='cash'?'bg-green-500/20 text-green-300':'bg-blue-500/20 text-blue-300'}`}>
                    {inv.payment_method==='cash'?'Tiền mặt':'Chuyển khoản'}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/40 text-xs">{fmtDate(inv.created_at)}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">Không có hóa đơn</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-4">
        <button className="btn-glass text-xs px-3 py-1.5" disabled={page<=1} onClick={() => { setPage(p=>p-1); fetchInvoices(page-1) }}>←</button>
        <span className="text-white/50 text-xs self-center">Trang {page} / {totalPages}</span>
        <button className="btn-glass text-xs px-3 py-1.5" disabled={page>=totalPages} onClick={() => { setPage(p=>p+1); fetchInvoices(page+1) }}>→</button>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="modal-glass relative w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">HĐ #{selected.invoice.invoice_number}</h2>
              <button className="text-white/40 hover:text-white" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="space-y-2 text-sm mb-4">
              {[
                ['Bàn', selected.invoice.table_name ?? '—'],
                ['Khách', selected.invoice.customer_name ?? '—'],
                ['Tiền chơi', fmt(selected.invoice.play_amount)],
                ['Đồ uống', fmt(selected.invoice.items_amount)],
                ...(selected.invoice.discount > 0 ? [['Giảm giá', `-${fmt(selected.invoice.discount)}`]] : []),
                ...(selected.invoice.discount_from_points > 0 ? [['Đổi điểm', `-${fmt(selected.invoice.discount_from_points)}`]] : []),
                ['Thành tiền', fmt(selected.invoice.final_amount)],
                ['Thanh toán', selected.invoice.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'],
                ['Thời gian', fmtDate(selected.invoice.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-white/50">{k}</span>
                  <span className={k === 'Thành tiền' ? 'text-[#d4af37] font-bold' : 'text-white'}>{v}</span>
                </div>
              ))}
            </div>
            {selected.items.length > 0 && (
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Đồ uống</p>
                {selected.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-white/[0.05]">
                    <span className="text-white/70">{item.product_name} × {item.quantity}</span>
                    <span className="text-white">{fmt(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
