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
        <h1 className="text-xl font-bold text-[#d4af37]">Báo cáo</h1>
        {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
          <button key={p}
            className={period === p
              ? 'bg-[#d4af37] text-[#0f0e0f] font-bold px-3 py-1.5 rounded-lg text-sm'
              : 'bg-white/[0.06] text-[#6b7280] border border-white/10 hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm'}
            onClick={() => setPeriod(p)}>
            {p === 'today' ? 'Hôm nay' : p === 'week' ? '7 ngày' : p === 'month' ? 'Tháng này' : 'Tuỳ chọn'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded px-2 py-1 text-sm text-white"
              value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-[#6b7280]">→</span>
            <input type="date" className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded px-2 py-1 text-sm text-white"
              value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-4 text-center">
          <p className="text-[#d4af37] font-bold text-2xl">
            {summary ? formatCurrency(Number(summary.total_revenue)) : '—'}
          </p>
          <p className="text-[#6b7280] text-xs mt-1">Tổng doanh thu</p>
        </div>
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-4 text-center">
          <p className="text-[#d4af37] font-bold text-2xl">
            {summary?.total_invoices ?? '—'}
          </p>
          <p className="text-[#6b7280] text-xs mt-1">Số hóa đơn</p>
        </div>
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-4 text-center">
          <p className="text-[#d4af37] font-bold text-2xl">
            {summary ? formatCurrency(Number(summary.avg_invoice)) : '—'}
          </p>
          <p className="text-[#6b7280] text-xs mt-1">Trung bình/HĐ</p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold mb-4 text-[#e2e8f0]">Doanh thu theo ngày</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#272525" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ backgroundColor: '#1c1b1b', border: '1px solid #272525' }}
              />
              <Bar dataKey="doanh_thu" fill="#d4af37" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold mb-3 text-[#e2e8f0]">Thống kê bàn</h3>
          <div className="space-y-2">
            {(tableStats as Array<{ table_name: string; total_revenue: string; session_count: string; avg_duration_minutes: string }>).map((t, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-white/[0.04] rounded border border-white/10">
                <div>
                  <p className="text-sm font-medium text-[#e2e8f0]">{t.table_name}</p>
                  <p className="text-xs text-[#6b7280]">{t.session_count} lần • TB {Math.round(Number(t.avg_duration_minutes))} phút</p>
                </div>
                <span className="text-green-400 text-sm">{formatCurrency(Number(t.total_revenue))}</span>
              </div>
            ))}
            {tableStats.length === 0 && <p className="text-[#6b7280] text-sm">Không có dữ liệu</p>}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden"
          style={{
            background: lowStock.length > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)',
            border: `1px solid ${lowStock.length > 0 ? 'rgba(239,68,68,0.22)' : 'rgba(34,197,94,0.22)'}`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px ${lowStock.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)'}`
          }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-3"
            style={{borderBottom: lowStock.length > 0 ? '1px solid rgba(239,68,68,0.15)' : 'none'}}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
              style={{background: lowStock.length > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)',
                      border: `1px solid ${lowStock.length > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`}}>
              {lowStock.length > 0 ? '⚠️' : '✓'}
            </div>
            <div className="flex-1">
              <p className={`text-xs font-bold uppercase tracking-widest ${lowStock.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                Cảnh báo tồn kho
              </p>
              <p className="text-white/35 text-[11px] mt-0.5">
                {lowStock.length > 0 ? `${lowStock.length} sản phẩm cần nhập thêm` : 'Tất cả sản phẩm ổn định'}
              </p>
            </div>
            {lowStock.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{background:'rgba(239,68,68,0.2)', border:'1px solid rgba(239,68,68,0.3)', color:'#fca5a5'}}>
                {lowStock.length}
              </span>
            )}
          </div>

          {/* Items */}
          {lowStock.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              {(lowStock as Array<{ id: number; name: string; stock_quantity: number; unit: string; min_stock_alert: number }>).map((p) => {
                const pct = Math.round((p.stock_quantity / p.min_stock_alert) * 100)
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-sm text-white/80 flex-1 truncate">{p.name}</span>
                    {/* Progress bar */}
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
                      <div className="h-full rounded-full transition-all"
                        style={{width:`${Math.min(pct,100)}%`, background: pct < 50 ? '#ef4444' : '#f97316'}} />
                    </div>
                    <span className="text-red-400 text-xs font-mono font-semibold w-20 text-right flex-shrink-0">
                      {p.stock_quantity} / {p.min_stock_alert} {p.unit}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
