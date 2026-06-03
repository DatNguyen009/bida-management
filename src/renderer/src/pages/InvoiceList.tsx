import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { InvoiceListRow, InvoiceOrderItem, StaffMember } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Pagination from '../components/Pagination'
import TableSkeleton from '../components/TableSkeleton'
import { formatCurrency } from '../lib/utils'

interface Props {
  role: string
  username: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function InvoiceListPage({ role, username }: Props) {
  const isOwner = role === 'owner'

  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [appliedFilter, setAppliedFilter] = useState({
    fromDate: firstOfMonth(),
    toDate: today(),
    completedBy: '',
  })
  const [selected, setSelected] = useState<InvoiceListRow | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['staffList'],
    queryFn: () => window.api.staff.getAll(),
    enabled: isOwner,
  })

  const { data: invoiceResult, isFetching, isLoading } = useQuery({
    queryKey: ['invoiceList', appliedFilter, page, pageSize],
    queryFn: () => window.api.invoices.getList({
      fromDate: appliedFilter.fromDate || undefined,
      toDate: appliedFilter.toDate || undefined,
      completedBy: appliedFilter.completedBy || undefined,
      page,
      pageSize,
    }),
  })
  const invoices = invoiceResult?.data ?? []
  const invoiceTotal = invoiceResult?.total ?? 0

  const { data: orderItems = [] } = useQuery({
    queryKey: ['invoiceOrderItems', selected?.session_id],
    queryFn: () => selected
      ? window.api.invoices.getOrderItems(selected.session_id)
      : Promise.resolve([] as InvoiceOrderItem[]),
    enabled: !!selected,
  })

  const [showEditModal, setShowEditModal] = useState(false)
  const [editItems, setEditItems] = useState<{ product_id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[]>([])
  const [editNote, setEditNote] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSuccess, setEditSuccess] = useState(false)

  function openEditModal() {
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

  function isToday(isoDate: string) {
    return new Date(isoDate).toDateString() === new Date().toDateString()
  }

  const handleFilter = () => {
    setAppliedFilter({ fromDate, toDate, completedBy: isOwner ? selectedStaff : username })
    setSelected(null)
    setPage(1)
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <h1 className="text-2xl font-bold text-[#d4af37] w-full">Hóa đơn</h1>
          <div>
            <p className="text-xs text-white/55 mb-1">Từ ngày</p>
            <Input type="date" className="backdrop-blur-xl bg-white/[0.07] border-white/10 text-white w-40"
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-white/55 mb-1">Đến ngày</p>
            <Input type="date" className="backdrop-blur-xl bg-white/[0.07] border-white/10 text-white w-40"
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {isOwner && (
            <div>
              <p className="text-xs text-white/55 mb-1">Nhân viên</p>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="backdrop-blur-xl bg-white/[0.07] border border-white/10 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#d4af37]"
              >
                <option value="">Tất cả</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.username}>{s.username}</option>
                ))}
              </select>
            </div>
          )}
          <Button className="btn-gold"
            onClick={handleFilter} disabled={isFetching}>
            {isFetching ? 'Đang tải...' : 'Lọc'}
          </Button>
        </div>

        <div className="bg-white/[0.04] rounded-xl overflow-hidden border border-white/10">
          {isLoading ? (
            <TableSkeleton rows={pageSize} cols={isOwner ? 6 : 5} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.06] border-b-2 border-[#d4af37]">
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">#</th>
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thời gian</th>
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Bàn</th>
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Khách hàng</th>
                  {isOwner && (
                    <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Nhân viên</th>
                  )}
                  <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Chơi</th>
                  <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Đồ uống</th>
                  <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tổng</th>
                  <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Điểm</th>
                  <th className="text-center px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">In</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-white/10 cursor-pointer transition-colors
                      ${selected?.id === inv.id
                        ? 'bg-white/10'
                        : `hover:bg-white/[0.06] ${i % 2 === 1 ? 'bg-white/[0.03]' : ''}`}`}
                    onClick={() => setSelected(inv)}
                  >
                    <td className="px-4 py-3 font-mono text-white/55">{inv.invoice_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/90">{formatDateTime(inv.created_at)}</td>
                    <td className="px-4 py-3 text-white/90">{inv.table_name ?? '—'}</td>
                    <td className="px-4 py-3 text-white/90">{inv.customer_name ?? '—'}</td>
                    {isOwner && (
                      <td className="px-4 py-3 text-white/55 text-xs">{inv.completed_by ?? '—'}</td>
                    )}
                    <td className="px-4 py-3 text-right text-white/90">{formatCurrency(inv.play_amount)}</td>
                    <td className="px-4 py-3 text-right text-white/90">{formatCurrency(inv.items_amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-400">{formatCurrency(inv.final_amount)}</td>
                    <td className="px-4 py-3 text-right text-[#d4af37]">+{inv.points_earned}</td>
                    <td className="px-4 py-3 text-center text-white/90">{inv.printed_at ? '✓' : '—'}</td>
                  </tr>
                ))}
                {invoices.length === 0 && !isFetching && (
                  <tr>
                    <td colSpan={isOwner ? 10 : 9} className="p-8 text-center text-white/55">
                      Không có hóa đơn nào trong khoảng thời gian này
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={invoiceTotal}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-white/[0.06] rounded-xl p-4 sticky top-0 border border-white/10">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-lg text-[#d4af37]">HĐ #{selected.invoice_number}</p>
                <p className="text-sm text-white/55">{selected.table_name ?? '—'}</p>
                <p className="text-xs text-white/55">{formatDateTime(selected.created_at)}</p>
                {selected.completed_by && (
                  <p className="text-xs text-white/70 mt-0.5">NV: {selected.completed_by}</p>
                )}
              </div>
              <button className="text-white/55 hover:text-white"
                onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.customer_name && (
              <div className="mb-3 p-2 bg-white/[0.04] rounded text-sm border border-white/10">
                <p className="font-medium text-white/90">{selected.customer_name}</p>
                <p className="text-white/55 text-xs">{selected.customer_phone}</p>
              </div>
            )}

            <div className="space-y-1 text-sm border-t border-[#d4af37] pt-3">
              <div className="flex justify-between">
                <span className="text-white/55">Tiền chơi</span>
                <span className="text-white/90">{formatCurrency(selected.play_amount)}</span>
              </div>

              {orderItems.length > 0 && (
                <div className="pt-1 pb-1">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs text-white/55 py-0.5">
                      <span>{item.product_name} x{item.quantity}</span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-white/10 pt-1 space-y-1">
                {selected.discount > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Giảm giá</span>
                    <span>-{formatCurrency(selected.discount)}</span>
                  </div>
                )}
                {selected.discount_from_points > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Đổi điểm ({selected.points_redeemed}đ)</span>
                    <span>-{formatCurrency(selected.discount_from_points)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-green-400 text-base pt-1">
                  <span>Thanh toán</span>
                  <span>{formatCurrency(selected.final_amount)}</span>
                </div>
                {selected.points_earned > 0 && (
                  <div className="flex justify-between text-[#d4af37] text-xs">
                    <span>Điểm tích lũy</span>
                    <span>+{selected.points_earned}</span>
                  </div>
                )}
              </div>
            </div>

            {selected.printed_at && (
              <p className="text-xs text-white/55 mt-3 text-center">
                Đã in lúc {new Date(selected.printed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {role !== 'owner' && (
              <button
                onClick={openEditModal}
                disabled={!isToday(selected.created_at)}
                title={!isToday(selected.created_at) ? 'Chỉ có thể yêu cầu sửa hóa đơn trong ngày hôm nay' : ''}
                className="mt-3 w-full py-2 text-xs rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ✏️ Yêu cầu chỉnh sửa đồ uống
                {!isToday(selected.created_at) && (
                  <span className="block text-[10px] text-yellow-400/50 mt-0.5">Chỉ áp dụng cho HĐ hôm nay</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}

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
    </div>
  )
}
