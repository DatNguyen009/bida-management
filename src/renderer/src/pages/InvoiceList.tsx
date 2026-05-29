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
          <h1 className="text-2xl font-bold w-full">Hóa đơn</h1>
          <div>
            <p className="text-xs text-gray-400 mb-1">Từ ngày</p>
            <Input type="date" className="bg-gray-800 border-gray-600 w-40"
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Đến ngày</p>
            <Input type="date" className="bg-gray-800 border-gray-600 w-40"
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700"
            onClick={handleFilter} disabled={isFetching}>
            {isFetching ? 'Đang tải...' : 'Lọc'}
          </Button>
        </div>

        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Thời gian</th>
                <th className="text-left p-3">Bàn</th>
                <th className="text-left p-3">Khách hàng</th>
                <th className="text-right p-3">Chơi</th>
                <th className="text-right p-3">Đồ uống</th>
                <th className="text-right p-3">Tổng</th>
                <th className="text-right p-3">Điểm</th>
                <th className="text-center p-3">In</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={`border-b border-gray-800 cursor-pointer transition-colors
                    ${selected?.id === inv.id ? 'bg-blue-900' : 'hover:bg-gray-800'}`}
                  onClick={() => setSelected(inv)}
                >
                  <td className="p-3 font-mono text-gray-400">{inv.invoice_number}</td>
                  <td className="p-3 whitespace-nowrap">{formatDateTime(inv.created_at)}</td>
                  <td className="p-3">{inv.table_name ?? '—'}</td>
                  <td className="p-3">{inv.customer_name ?? '—'}</td>
                  <td className="p-3 text-right">{formatCurrency(inv.play_amount)}</td>
                  <td className="p-3 text-right">{formatCurrency(inv.items_amount)}</td>
                  <td className="p-3 text-right font-semibold text-green-400">{formatCurrency(inv.final_amount)}</td>
                  <td className="p-3 text-right text-yellow-400">+{inv.points_earned}</td>
                  <td className="p-3 text-center">{inv.printed_at ? '✓' : '—'}</td>
                </tr>
              ))}
              {invoices.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    Không có hóa đơn nào trong khoảng thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {invoices.length === 300 && (
          <p className="text-xs text-gray-500 mt-2 text-center">Hiển thị tối đa 300 hóa đơn gần nhất</p>
        )}
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-gray-900 rounded-xl p-4 sticky top-0">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-lg">HĐ #{selected.invoice_number}</p>
                <p className="text-sm text-gray-400">{selected.table_name ?? '—'}</p>
                <p className="text-xs text-gray-500">{formatDateTime(selected.created_at)}</p>
              </div>
              <button className="text-gray-500 hover:text-gray-300"
                onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.customer_name && (
              <div className="mb-3 p-2 bg-gray-800 rounded text-sm">
                <p className="font-medium">{selected.customer_name}</p>
                <p className="text-gray-400 text-xs">{selected.customer_phone}</p>
              </div>
            )}

            <div className="space-y-1 text-sm border-t border-gray-700 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Tiền chơi</span>
                <span>{formatCurrency(selected.play_amount)}</span>
              </div>

              {orderItems.length > 0 && (
                <div className="pt-1 pb-1">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-300 py-0.5">
                      <span>{item.product_name} x{item.quantity}</span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-700 pt-1 space-y-1">
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
                  <div className="flex justify-between text-yellow-400 text-xs">
                    <span>Điểm tích lũy</span>
                    <span>+{selected.points_earned}</span>
                  </div>
                )}
              </div>
            </div>

            {selected.printed_at && (
              <p className="text-xs text-gray-500 mt-3 text-center">
                Đã in lúc {new Date(selected.printed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
