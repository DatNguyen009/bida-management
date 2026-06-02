import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Summary { total_revenue: string; invoice_count: string; play_revenue: string; items_revenue: string }
interface RevenueDay { date: string; total: string; count: string }
interface TableStat { table_name: string; session_count: string; total_revenue: string; avg_duration_minutes: string }
interface ProductStat { product_name: string; category_name: string; category_icon: string; total_qty: string; total_revenue: string }
interface StaffStat { staff_name: string; invoice_count: string; total_revenue: string; play_revenue: string; items_revenue: string }
interface LowStock { id: number; name: string; stock_quantity: number; min_stock_alert: number; unit: string; category_name: string; category_icon: string }

function fmt(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : `${(n/1000).toFixed(0)}k` }
function fmtFull(n: number) { return Number(n).toLocaleString('vi-VN') + 'đ' }
function fmtMin(m: number) { const h = Math.floor(m/60); const min = Math.round(m%60); return h > 0 ? `${h}g${min}p` : `${min}p` }

const today = new Date().toISOString().slice(0, 10)
const sevenDaysAgo = new Date(Date.now() - 6*86400000).toISOString().slice(0, 10)

const TABS = ['Doanh thu', 'Bàn chơi', 'Sản phẩm', 'Nhân viên', 'Tồn kho thấp'] as const
type Tab = typeof TABS[number]

export default function AgentReportsPage() {
  const [tab, setTab] = useState<Tab>('Doanh thu')
  const [fromDate, setFromDate] = useState(sevenDaysAgo)
  const [toDate, setToDate] = useState(today)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [revenue, setRevenue] = useState<RevenueDay[]>([])
  const [tables, setTables] = useState<TableStat[]>([])
  const [products, setProducts] = useState<ProductStat[]>([])
  const [staff, setStaff] = useState<StaffStat[]>([])
  const [lowStock, setLowStock] = useState<LowStock[]>([])

  useEffect(() => {
    const params = `fromDate=${fromDate}&toDate=${toDate}`
    if (tab === 'Doanh thu') {
      Promise.all([
        api.get(`/agent/reports/summary?${params}`),
        api.get(`/agent/reports/revenue?${params}`),
      ]).then(([s, r]) => { setSummary(s.data); setRevenue(r.data) })
    } else if (tab === 'Bàn chơi') {
      api.get(`/agent/reports/tables?${params}`).then(r => setTables(r.data))
    } else if (tab === 'Sản phẩm') {
      api.get(`/agent/reports/products?${params}`).then(r => setProducts(r.data))
    } else if (tab === 'Nhân viên') {
      api.get(`/agent/reports/staff?${params}`).then(r => setStaff(r.data))
    } else if (tab === 'Tồn kho thấp') {
      api.get('/agent/reports/lowstock').then(r => setLowStock(r.data))
    }
  }, [tab, fromDate, toDate])

  const chartData = revenue.map(r => ({
    date: new Date(r.date).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' }),
    'Doanh thu': Number(r.total),
  }))

  const showDateFilter = tab !== 'Tồn kho thấp'

  return (
    <AgentLayout title="Báo cáo">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white/[0.04] border border-white/10 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs rounded-lg transition-colors font-medium
              ${tab === t ? 'bg-[#d4af37] text-black' : 'text-white/50 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Date filter */}
      {showDateFilter && (
        <div className="flex gap-3 mb-5">
          {([['Từ', fromDate, setFromDate], ['Đến', toDate, setToDate]] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={String(label)} className="flex items-center gap-2 glass-card px-3 py-2">
              <span className="text-white/40 text-xs">{label}</span>
              <input type="date" value={String(val)} onChange={e => setter(e.target.value)}
                className="bg-transparent text-white text-sm outline-none" />
            </div>
          ))}
        </div>
      )}

      {/* Tab: Doanh thu */}
      {tab === 'Doanh thu' && summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[
              { label: 'Doanh thu', value: fmtFull(Number(summary.total_revenue)), color: 'text-[#d4af37]' },
              { label: 'Số hóa đơn', value: summary.invoice_count, color: 'text-white' },
              { label: 'Tiền giờ', value: fmtFull(Number(summary.play_revenue)), color: 'text-blue-300' },
              { label: 'Đồ uống', value: fmtFull(Number(summary.items_revenue)), color: 'text-green-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass-card p-4">
                <p className="text-white/40 text-xs mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="glass-card p-5">
            <p className="text-white/50 text-xs uppercase tracking-widest mb-4">Doanh thu theo ngày</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: unknown) => [fmtFull(Array.isArray(v) ? Number(v[0]) : Number(v)), 'Doanh thu']}
                  contentStyle={{ background: 'rgba(14,12,16,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff' }} />
                <Bar dataKey="Doanh thu" fill="#d4af37" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Tab: Bàn chơi */}
      {tab === 'Bàn chơi' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="gold-table-header">
              <tr><th>Bàn</th><th>Số phiên</th><th>Doanh thu</th><th>TB thời gian</th></tr>
            </thead>
            <tbody>
              {tables.map((t, i) => (
                <tr key={t.table_name} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                  <td className="px-4 py-3 text-white font-medium">{t.table_name}</td>
                  <td className="px-4 py-3 text-white/70">{t.session_count}</td>
                  <td className="px-4 py-3 text-[#d4af37] font-medium">{fmtFull(Number(t.total_revenue))}</td>
                  <td className="px-4 py-3 text-white/50">{fmtMin(Number(t.avg_duration_minutes))}</td>
                </tr>
              ))}
              {tables.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-white/30">Không có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Sản phẩm */}
      {tab === 'Sản phẩm' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="gold-table-header">
              <tr><th>#</th><th>Sản phẩm</th><th>Danh mục</th><th>Số lượng</th><th>Doanh thu</th></tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.product_name} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                  <td className="px-4 py-3 text-white/30 text-xs">{i+1}</td>
                  <td className="px-4 py-3 text-white font-medium">{p.product_name}</td>
                  <td className="px-4 py-3 text-white/50 text-xs">{p.category_icon} {p.category_name}</td>
                  <td className="px-4 py-3 text-white/70">{p.total_qty}</td>
                  <td className="px-4 py-3 text-[#d4af37] font-medium">{fmtFull(Number(p.total_revenue))}</td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-white/30">Không có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Nhân viên */}
      {tab === 'Nhân viên' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="gold-table-header">
              <tr><th>Nhân viên</th><th>Số HĐ</th><th>Tiền giờ</th><th>Đồ uống</th><th>Tổng</th></tr>
            </thead>
            <tbody>
              {staff.map((s, i) => (
                <tr key={s.staff_name} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                  <td className="px-4 py-3 text-white font-medium">{s.staff_name}</td>
                  <td className="px-4 py-3 text-white/70">{s.invoice_count}</td>
                  <td className="px-4 py-3 text-blue-300">{fmtFull(Number(s.play_revenue))}</td>
                  <td className="px-4 py-3 text-green-300">{fmtFull(Number(s.items_revenue))}</td>
                  <td className="px-4 py-3 text-[#d4af37] font-medium">{fmtFull(Number(s.total_revenue))}</td>
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-white/30">Không có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Tồn kho thấp */}
      {tab === 'Tồn kho thấp' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="gold-table-header">
              <tr><th>Sản phẩm</th><th>Danh mục</th><th>Tồn kho</th><th>Cảnh báo</th></tr>
            </thead>
            <tbody>
              {lowStock.map((p, i) => (
                <tr key={p.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-white/50 text-xs">{p.category_icon} {p.category_name}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${p.stock_quantity === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {p.stock_quantity} {p.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">≤ {p.min_stock_alert}</td>
                </tr>
              ))}
              {lowStock.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-white/30">Tất cả sản phẩm đủ hàng ✓</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </AgentLayout>
  )
}
