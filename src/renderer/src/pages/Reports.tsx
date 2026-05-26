import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'

type Period = 'today' | 'week' | 'month' | 'custom'

function getPeriodDates(period: Period, customFrom: string, customTo: string): [string, string] {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (period === 'today') return [fmt(today), fmt(today)]
  if (period === 'week') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    return [fmt(from), fmt(today)]
  }
  if (period === 'month') {
    return [`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, fmt(today)]
  }
  return [customFrom, customTo]
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [fromDate, toDate] = getPeriodDates(period, customFrom, customTo)

  const { data: revenueData = [] } = useQuery({
    queryKey: ['reports', 'revenue', fromDate, toDate],
    queryFn: () => api().reports.revenue(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  })

  const { data: summaryData = [] } = useQuery({
    queryKey: ['reports', 'summary', fromDate, toDate],
    queryFn: () => api().reports.summary(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  })

  const { data: tableStats = [] } = useQuery({
    queryKey: ['reports', 'tableStats', fromDate, toDate],
    queryFn: () => api().reports.tableStats(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  })

  const { data: lowStock = [] } = useQuery({
    queryKey: ['reports', 'lowStock'],
    queryFn: () => api().reports.lowStock(),
  })

  const summary = summaryData[0] as { total_revenue: string; total_invoices: string; avg_invoice: string } | undefined

  const chartData = (revenueData as Array<{ date: string; total: string; invoice_count: string }>).map((d) => ({
    date: new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    doanh_thu: Number(d.total),
    so_hd: Number(d.invoice_count),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Báo cáo</h1>
        {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
          <button key={p}
            className={`px-3 py-1 rounded-full text-sm border transition-all
              ${period === p ? 'bg-green-700 border-green-500 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}
            onClick={() => setPeriod(p)}>
            {p === 'today' ? 'Hôm nay' : p === 'week' ? '7 ngày' : p === 'month' ? 'Tháng này' : 'Tuỳ chọn'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-gray-400">→</span>
            <input type="date" className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">
            {summary ? formatCurrency(Number(summary.total_revenue)) : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Tổng doanh thu</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">
            {summary?.total_invoices ?? '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Số hóa đơn</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">
            {summary ? formatCurrency(Number(summary.avg_invoice)) : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Trung bình/HĐ</p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <h3 className="font-semibold mb-4">Doanh thu theo ngày</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
              <Bar dataKey="doanh_thu" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl p-4">
          <h3 className="font-semibold mb-3">Thống kê bàn</h3>
          <div className="space-y-2">
            {(tableStats as Array<{ table_name: string; total_revenue: string; session_count: string; avg_duration_minutes: string }>).map((t, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                <div>
                  <p className="text-sm font-medium">{t.table_name}</p>
                  <p className="text-xs text-gray-400">{t.session_count} lần • TB {Math.round(Number(t.avg_duration_minutes))} phút</p>
                </div>
                <span className="text-green-400 text-sm">{formatCurrency(Number(t.total_revenue))}</span>
              </div>
            ))}
            {tableStats.length === 0 && <p className="text-gray-500 text-sm">Không có dữ liệu</p>}
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-4">
          <h3 className="font-semibold mb-3">
            Cảnh báo tồn kho
            {lowStock.length > 0 && (
              <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{lowStock.length}</span>
            )}
          </h3>
          <div className="space-y-2">
            {(lowStock as Array<{ id: number; name: string; stock_quantity: number; unit: string; min_stock_alert: number }>).map((p) => (
              <div key={p.id} className="flex justify-between items-center p-2 bg-red-900/30 border border-red-800 rounded">
                <span className="text-sm">{p.name}</span>
                <span className="text-red-400 text-sm font-medium">
                  {p.stock_quantity}/{p.min_stock_alert} {p.unit}
                </span>
              </div>
            ))}
            {lowStock.length === 0 && (
              <p className="text-green-400 text-sm">✓ Tồn kho ổn định</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
