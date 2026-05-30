import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { InvoiceListRow, InvoiceOrderItem } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '../lib/utils'

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

export default function InvoiceListPage() {
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [appliedFilter, setAppliedFilter] = useState({ fromDate: firstOfMonth(), toDate: today() })
  const [selected, setSelected] = useState<InvoiceListRow | null>(null)

  const { data: invoices = [], isFetching } = useQuery({
    queryKey: ['invoiceList', appliedFilter],
    queryFn: () => window.api.invoices.getList({
      fromDate: appliedFilter.fromDate || undefined,
      toDate: appliedFilter.toDate || undefined,
    }),
  })

  const { data: orderItems = [] } = useQuery({
    queryKey: ['invoiceOrderItems', selected?.session_id],
    queryFn: () => selected
      ? window.api.invoices.getOrderItems(selected.session_id)
      : Promise.resolve([] as InvoiceOrderItem[]),
    enabled: !!selected,
  })

  const handleFilter = () => {
    setAppliedFilter({ fromDate, toDate })
    setSelected(null)
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <h1 className="text-2xl font-bold text-[#d4af37] w-full">Hóa đơn</h1>
          <div>
            <p className="text-xs text-[#6b7280] mb-1">Từ ngày</p>
            <Input type="date" className="bg-[#162a1a] border-[#1e3d23] text-white w-40"
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-[#6b7280] mb-1">Đến ngày</p>
            <Input type="date" className="bg-[#162a1a] border-[#1e3d23] text-white w-40"
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button className="bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400"
            onClick={handleFilter} disabled={isFetching}>
            {isFetching ? 'Đang tải...' : 'Lọc'}
          </Button>
        </div>

        <div className="bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#162a1a] border-b-2 border-[#d4af37]">
                <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">#</th>
                <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thời gian</th>
                <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Bàn</th>
                <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Khách hàng</th>
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
                  className={`border-b border-[#1e3d23] cursor-pointer transition-colors
                    ${selected?.id === inv.id
                      ? 'bg-[#1e3d23]'
                      : `hover:bg-[#162a1a] ${i % 2 === 1 ? 'bg-[#0d1a0f]' : ''}`}`}
                  onClick={() => setSelected(inv)}
                >
                  <td className="px-4 py-3 font-mono text-[#6b7280]">{inv.invoice_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#e2e8f0]">{formatDateTime(inv.created_at)}</td>
                  <td className="px-4 py-3 text-[#e2e8f0]">{inv.table_name ?? '—'}</td>
                  <td className="px-4 py-3 text-[#e2e8f0]">{inv.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-[#e2e8f0]">{formatCurrency(inv.play_amount)}</td>
                  <td className="px-4 py-3 text-right text-[#e2e8f0]">{formatCurrency(inv.items_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-400">{formatCurrency(inv.final_amount)}</td>
                  <td className="px-4 py-3 text-right text-[#d4af37]">+{inv.points_earned}</td>
                  <td className="px-4 py-3 text-center text-[#e2e8f0]">{inv.printed_at ? '✓' : '—'}</td>
                </tr>
              ))}
              {invoices.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#6b7280]">
                    Không có hóa đơn nào trong khoảng thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {invoices.length === 300 && (
          <p className="text-xs text-[#6b7280] mt-2 text-center">Hiển thị tối đa 300 hóa đơn gần nhất</p>
        )}
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-[#162a1a] rounded-xl p-4 sticky top-0 border border-[#1e3d23]">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-lg text-[#d4af37]">HĐ #{selected.invoice_number}</p>
                <p className="text-sm text-[#6b7280]">{selected.table_name ?? '—'}</p>
                <p className="text-xs text-[#6b7280]">{formatDateTime(selected.created_at)}</p>
              </div>
              <button className="text-[#6b7280] hover:text-white"
                onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.customer_name && (
              <div className="mb-3 p-2 bg-[#0a1a0d] rounded text-sm border border-[#1e3d23]">
                <p className="font-medium text-[#e2e8f0]">{selected.customer_name}</p>
                <p className="text-[#6b7280] text-xs">{selected.customer_phone}</p>
              </div>
            )}

            <div className="space-y-1 text-sm border-t border-[#d4af37] pt-3">
              <div className="flex justify-between">
                <span className="text-[#6b7280]">Tiền chơi</span>
                <span className="text-[#e2e8f0]">{formatCurrency(selected.play_amount)}</span>
              </div>

              {orderItems.length > 0 && (
                <div className="pt-1 pb-1">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs text-[#6b7280] py-0.5">
                      <span>{item.product_name} x{item.quantity}</span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-[#1e3d23] pt-1 space-y-1">
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
              <p className="text-xs text-[#6b7280] mt-3 text-center">
                Đã in lúc {new Date(selected.printed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
