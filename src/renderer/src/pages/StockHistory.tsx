import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { StockTransaction } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

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

export default function StockHistoryPage() {
  const [productFilter, setProductFilter] = useState('')
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [appliedFilter, setAppliedFilter] = useState({
    productFilter: '',
    fromDate: firstOfMonth(),
    toDate: today(),
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => window.api.products.getAll(),
  })

  const { data: transactions = [], isFetching } = useQuery({
    queryKey: ['stockHistory', appliedFilter],
    queryFn: () => {
      const matchedProduct = appliedFilter.productFilter
        ? allProducts.find((p) =>
            p.name.toLowerCase().includes(appliedFilter.productFilter.toLowerCase())
          )
        : undefined
      return window.api.products.getStockHistory({
        productId: matchedProduct?.id,
        fromDate: appliedFilter.fromDate || undefined,
        toDate: appliedFilter.toDate || undefined,
      })
    },
  })

  const handleFilter = () => {
    setAppliedFilter({ productFilter, fromDate, toDate })
  }

  const typeBadge = (type: StockTransaction['type']) => {
    if (type === 'in') return <Badge className="bg-green-700 text-green-100 text-xs">Nhập</Badge>
    if (type === 'out') return <Badge className="bg-red-700 text-red-100 text-xs">Xuất</Badge>
    return <Badge className="bg-yellow-700 text-yellow-100 text-xs">Điều chỉnh</Badge>
  }

  const qtyDisplay = (type: StockTransaction['type'], qty: number) => {
    if (type === 'out') return <span className="text-red-400">−{qty}</span>
    return <span className="text-green-400">+{qty}</span>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Lịch sử kho</h1>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <p className="text-xs text-gray-400 mb-1">Sản phẩm</p>
          <Input
            className="bg-gray-800 border-gray-600 w-48"
            placeholder="Tìm tên sản phẩm..."
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Từ ngày</p>
          <Input
            type="date"
            className="bg-gray-800 border-gray-600 w-40"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Đến ngày</p>
          <Input
            type="date"
            className="bg-gray-800 border-gray-600 w-40"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={handleFilter}
          disabled={isFetching}
        >
          {isFetching ? 'Đang tải...' : 'Lọc'}
        </Button>
      </div>

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left p-3">Thời gian</th>
              <th className="text-left p-3">Sản phẩm</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-right p-3">Số lượng</th>
              <th className="text-right p-3">Trước</th>
              <th className="text-right p-3">Sau</th>
              <th className="text-left p-3">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="p-3 text-gray-400 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                <td className="p-3 font-medium">{t.product_name}</td>
                <td className="p-3">{typeBadge(t.type)}</td>
                <td className="p-3 text-right font-mono">{qtyDisplay(t.type, t.quantity)}</td>
                <td className="p-3 text-right text-gray-400">{t.before_qty}</td>
                <td className="p-3 text-right">{t.after_qty}</td>
                <td className="p-3 text-gray-400 text-xs">{t.note ?? '—'}</td>
              </tr>
            ))}
            {transactions.length === 0 && !isFetching && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  Không có giao dịch nào trong khoảng thời gian này
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {transactions.length === 500 && (
        <p className="text-xs text-gray-500 mt-2 text-center">Hiển thị tối đa 500 bản ghi gần nhất</p>
      )}
    </div>
  )
}
