import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Summary { total_revenue: string; invoice_count: string; play_revenue: string; items_revenue: string }
interface RevenueDay { date: string; total: string; count: string }

function fmt(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : `${(n/1000).toFixed(0)}k` }
function fmtFull(n: number) { return Number(n).toLocaleString('vi-VN') + 'đ' }

const today = new Date().toISOString().slice(0, 10)
const sevenDaysAgo = new Date(Date.now() - 6*86400000).toISOString().slice(0, 10)

export default function AgentReportsPage() {
  const [fromDate, setFromDate] = useState(sevenDaysAgo)
  const [toDate, setToDate] = useState(today)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [revenue, setRevenue] = useState<RevenueDay[]>([])

  useEffect(() => {
    const params = `fromDate=${fromDate}&toDate=${toDate}`
    Promise.all([
      api.get(`/agent/reports/summary?${params}`),
      api.get(`/agent/reports/revenue?${params}`),
    ]).then(([s, r]) => { setSummary(s.data); setRevenue(r.data) })
  }, [fromDate, toDate])

  const chartData = revenue.map(r => ({
    date: new Date(r.date).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' }),
    'Doanh thu': Number(r.total),
  }))

  const stats = summary ? [
    { label: 'Doanh thu', value: fmtFull(Number(summary.total_revenue)), color: 'text-[#d4af37]' },
    { label: 'Số hóa đơn', value: summary.invoice_count, color: 'text-white' },
    { label: 'Tiền giờ', value: fmtFull(Number(summary.play_revenue)), color: 'text-blue-300' },
    { label: 'Đồ uống', value: fmtFull(Number(summary.items_revenue)), color: 'text-green-300' },
  ] : []

  return (
    <AgentLayout title="Báo cáo">
      {/* Date filter */}
      <div className="flex gap-3 mb-6">
        {([['Từ', fromDate, setFromDate], ['Đến', toDate, setToDate]] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
          <div key={String(label)} className="flex items-center gap-2 glass-card px-3 py-2">
            <span className="text-white/40 text-xs">{label}</span>
            <input type="date" value={String(val)} onChange={e => setter(e.target.value)}
              className="bg-transparent text-white text-sm outline-none" />
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="glass-card p-4">
            <p className="text-white/40 text-xs mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="glass-card p-5">
        <p className="text-white/50 text-xs uppercase tracking-widest mb-4">Doanh thu theo ngày</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [fmtFull(Array.isArray(v) ? Number(v[0]) : Number(v ?? 0)), 'Doanh thu']}
              contentStyle={{ background: 'rgba(14,12,16,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff' }} />
            <Bar dataKey="Doanh thu" fill="#d4af37" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AgentLayout>
  )
}
