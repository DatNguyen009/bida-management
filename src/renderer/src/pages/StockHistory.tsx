import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { StockTransaction } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '../lib/utils'
import Pagination from '../components/Pagination'
import TableSkeleton from '../components/TableSkeleton'

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => window.api.products.getAll(),
  })

  const { data: stockResult, isFetching, isLoading } = useQuery({
    queryKey: ['stockHistory', appliedFilter, page, pageSize],
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
        page,
        pageSize,
      })
    },
  })
  const transactions = stockResult?.data ?? []
  const stockTotal = stockResult?.total ?? 0

  const handleFilter = () => {
    setAppliedFilter({ productFilter, fromDate, toDate })
    setPage(1)
  }

  const typeBadge = (type: StockTransaction['type']) => {
    if (type === 'in') return <span className="bg-[#14532d] text-green-400 text-xs border-0 px-2 py-0.5 rounded-full">Nhập</span>
    if (type === 'out') return <span className="bg-[#7f1d1d] text-red-400 text-xs border-0 px-2 py-0.5 rounded-full">Xuất</span>
    return <span className="bg-[#292524] text-yellow-400 text-xs border-0 px-2 py-0.5 rounded-full">Điều chỉnh</span>
  }

  const qtyDisplay = (type: StockTransaction['type'], qty: number) => {
    if (type === 'out') return <span className="text-red-400 font-mono">−{qty}</span>
    return <span className="text-green-400 font-mono">+{qty}</span>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#d4af37] mb-6">Lịch sử kho</h1>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <p className="text-xs text-[#6b7280] mb-1">Sản phẩm</p>
          <Input
            className="bg-[#162a1a] border-[#1e3d23] text-white w-48"
            placeholder="Tìm tên sản phẩm..."
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <div>
          <p className="text-xs text-[#6b7280] mb-1">Từ ngày</p>
          <Input
            type="date"
            className="bg-[#162a1a] border-[#1e3d23] text-white w-40"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <p className="text-xs text-[#6b7280] mb-1">Đến ngày</p>
          <Input
            type="date"
            className="bg-[#162a1a] border-[#1e3d23] text-white w-40"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <Button
          className="bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400"
          onClick={handleFilter}
          disabled={isFetching}
        >
          {isFetching ? 'Đang tải...' : 'Lọc'}
        </Button>
      </div>

      <div className="bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#162a1a] border-b-2 border-[#d4af37]">
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thời gian</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Sản phẩm</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Loại</th>
              <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Số lượng</th>
              <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Trước</th>
              <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Sau</th>
              <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá nhập</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8}>
                  <TableSkeleton rows={pageSize} cols={5} />
                </td>
              </tr>
            ) : (
              <>
                {transactions.map((t, i) => (
                  <tr key={t.id} className={`border-b border-[#1e3d23] hover:bg-[#162a1a] transition-colors ${i % 2 === 1 ? 'bg-[#0d1a0f]' : ''}`}>
                    <td className="px-4 py-3 text-[#6b7280] whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-[#e2e8f0]">{t.product_name}</td>
                    <td className="px-4 py-3">{typeBadge(t.type)}</td>
                    <td className="px-4 py-3 text-right">{qtyDisplay(t.type, t.quantity)}</td>
                    <td className="px-4 py-3 text-right text-[#6b7280]">{t.before_qty}</td>
                    <td className="px-4 py-3 text-right text-[#e2e8f0]">{t.after_qty}</td>
                    <td className="px-4 py-3 text-right text-[#e2e8f0] font-mono text-xs">
                      {t.cost_price != null ? formatCurrency(t.cost_price) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#6b7280] text-xs">{t.note ?? '—'}</td>
                  </tr>
                ))}
                {transactions.length === 0 && !isFetching && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#6b7280]">
                      Không có giao dịch nào trong khoảng thời gian này
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={stockTotal}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />
    </div>
  )
}
