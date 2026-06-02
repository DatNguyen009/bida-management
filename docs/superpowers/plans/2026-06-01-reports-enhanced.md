# Enhanced Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng trang Báo cáo với 3 tab: Tổng quan (hiện tại), Nhân viên, Sản phẩm — mỗi tab có filter ngày/tháng/năm và số liệu riêng.

**Architecture:** Thêm 2 SQL query mới vào `reports.ts` handler (`staffStats`, `productStats`), đăng ký IPC handler + cập nhật `electron.d.ts`, sau đó rewrite `Reports.tsx` với tab system — tab Tổng quan giữ chart hiện tại, tab Nhân viên hiển thị bảng doanh thu theo `completed_by`, tab Sản phẩm hiển thị top sản phẩm bán chạy nhóm theo category.

**Tech Stack:** PostgreSQL · Electron IPC · React + TanStack Query · Recharts · Tailwind + liquid glass CSS

---

## File Map

| File | Action | Mục đích |
|------|--------|---------|
| `src/main/handlers/reports.ts` | Modify | Thêm `getStaffStats()` + `getProductStats()` |
| `src/renderer/src/electron.d.ts` | Modify | Khai báo type `staffStats`, `productStats` |
| `src/renderer/src/pages/Reports.tsx` | Rewrite | 3 tab UI: Tổng quan / Nhân viên / Sản phẩm |

---

## Task 1: Thêm SQL queries backend

**Files:**
- Modify: `src/main/handlers/reports.ts`

- [ ] **Step 1: Thêm `getStaffStats()` sau `getLowStockProducts()`**

```ts
export async function getStaffStats(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT
       i.completed_by AS staff_name,
       COUNT(*) AS invoice_count,
       SUM(i.final_amount) AS total_revenue,
       AVG(i.final_amount) AS avg_invoice,
       SUM(i.play_amount) AS play_revenue,
       SUM(i.items_amount) AS items_revenue
     FROM cloud_invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2
       AND i.agent_id = $3
       AND i.completed_by IS NOT NULL
     GROUP BY i.completed_by
     ORDER BY total_revenue DESC`,
    [fromDate, toDate, agentId]
  )
}
```

- [ ] **Step 2: Thêm `getProductStats()` sau `getStaffStats()`**

```ts
export async function getProductStats(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT
       p.name AS product_name,
       c.name AS category_name,
       c.icon AS category_icon,
       SUM(oi.quantity) AS total_qty,
       SUM(oi.subtotal) AS total_revenue,
       AVG(oi.unit_price) AS avg_price
     FROM cloud_order_items oi
     JOIN cloud_products p ON p.id = oi.product_id
     LEFT JOIN cloud_categories c ON c.id = p.category_id
     JOIN cloud_sessions s ON s.id = oi.session_id
     JOIN cloud_invoices i ON i.session_id = s.id
     WHERE DATE(i.created_at) BETWEEN $1 AND $2
       AND oi.agent_id = $3
     GROUP BY p.id, p.name, c.name, c.icon
     ORDER BY total_revenue DESC
     LIMIT 50`,
    [fromDate, toDate, agentId]
  )
}
```

- [ ] **Step 3: Đăng ký 2 handler mới trong `registerReportHandlers()`**

Thêm vào cuối hàm `registerReportHandlers()`:
```ts
ipcMain.handle('reports:staffStats', (_e, from: string, to: string) => getStaffStats(from, to))
ipcMain.handle('reports:productStats', (_e, from: string, to: string) => getProductStats(from, to))
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/reports.ts
git commit -m "feat: add staffStats and productStats SQL queries to reports handler"
```

---

## Task 2: Cập nhật electron.d.ts

**Files:**
- Modify: `src/renderer/src/electron.d.ts`

- [ ] **Step 1: Thêm 2 method mới vào `reports:` block**

Tìm:
```ts
      reports: {
        revenue(from: string, to: string): Promise<unknown[]>
        summary(from: string, to: string): Promise<unknown[]>
        tableStats(from: string, to: string): Promise<unknown[]>
        lowStock(): Promise<unknown[]>
      }
```

Đổi thành:
```ts
      reports: {
        revenue(from: string, to: string): Promise<unknown[]>
        summary(from: string, to: string): Promise<unknown[]>
        tableStats(from: string, to: string): Promise<unknown[]>
        lowStock(): Promise<unknown[]>
        staffStats(from: string, to: string): Promise<unknown[]>
        productStats(from: string, to: string): Promise<unknown[]>
      }
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/electron.d.ts
git commit -m "feat: expose staffStats and productStats in electron.d.ts"
```

---

## Task 3: Rewrite Reports.tsx — Tab system + Tổng quan

**Files:**
- Modify: `src/renderer/src/pages/Reports.tsx`

Mục tiêu task này: thêm tab switcher (Tổng quan / Nhân viên / Sản phẩm), giữ nguyên nội dung Tổng quan hiện tại, cải thiện header period filter.

- [ ] **Step 1: Thêm `activeTab` state và tab switcher**

Thay toàn bộ nội dung `Reports.tsx` bằng code sau:

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'
type ReportTab = 'overview' | 'staff' | 'products'

function getPeriodDates(period: Period, customFrom: string, customTo: string): [string, string] {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (period === 'today') return [fmt(today), fmt(today)]
  if (period === 'week') {
    const from = new Date(today); from.setDate(today.getDate() - 6)
    return [fmt(from), fmt(today)]
  }
  if (period === 'month') {
    return [`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, fmt(today)]
  }
  if (period === 'year') {
    return [`${today.getFullYear()}-01-01`, fmt(today)]
  }
  return [customFrom, customTo]
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hôm nay', week: '7 ngày', month: 'Tháng này', year: 'Năm này', custom: 'Tuỳ chọn'
}
const TAB_LABELS: Record<ReportTab, string> = {
  overview: '📊 Tổng quan', staff: '👤 Nhân viên', products: '📦 Sản phẩm'
}

const GLASS_CARD = 'backdrop-blur-xl bg-black/35 border border-white/10 rounded-2xl'

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')

  const [fromDate, toDate] = getPeriodDates(period, customFrom, customTo)
  const enabled = !!fromDate && !!toDate

  const { data: revenueData = [] } = useQuery({
    queryKey: ['reports', 'revenue', fromDate, toDate],
    queryFn: () => api().reports.revenue(fromDate, toDate),
    enabled,
  })
  const { data: summaryData = [] } = useQuery({
    queryKey: ['reports', 'summary', fromDate, toDate],
    queryFn: () => api().reports.summary(fromDate, toDate),
    enabled,
  })
  const { data: tableStats = [] } = useQuery({
    queryKey: ['reports', 'tableStats', fromDate, toDate],
    queryFn: () => api().reports.tableStats(fromDate, toDate),
    enabled,
  })
  const { data: lowStock = [] } = useQuery({
    queryKey: ['reports', 'lowStock'],
    queryFn: () => api().reports.lowStock(),
  })
  const { data: staffData = [] } = useQuery({
    queryKey: ['reports', 'staffStats', fromDate, toDate],
    queryFn: () => api().reports.staffStats(fromDate, toDate),
    enabled,
  })
  const { data: productData = [] } = useQuery({
    queryKey: ['reports', 'productStats', fromDate, toDate],
    queryFn: () => api().reports.productStats(fromDate, toDate),
    enabled,
  })

  const summary = summaryData[0] as { total_revenue: string; total_invoices: string; avg_invoice: string } | undefined
  const chartData = (revenueData as Array<{ date: string; total: string; invoice_count: string }>).map((d) => ({
    date: new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    doanh_thu: Number(d.total),
    so_hd: Number(d.invoice_count),
  }))

  type StaffRow = { staff_name: string; invoice_count: string; total_revenue: string; avg_invoice: string; play_revenue: string; items_revenue: string }
  type ProductRow = { product_name: string; category_name: string; category_icon: string; total_qty: string; total_revenue: string; avg_price: string }

  const staffRows = staffData as StaffRow[]
  const productRows = productData as ProductRow[]

  // Group products by category for pie chart
  const categoryMap = new Map<string, { name: string; icon: string; revenue: number }>()
  productRows.forEach((p) => {
    const key = p.category_name || 'Không có'
    const existing = categoryMap.get(key)
    if (existing) existing.revenue += Number(p.total_revenue)
    else categoryMap.set(key, { name: key, icon: p.category_icon || '📦', revenue: Number(p.total_revenue) })
  })
  const categoryData = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue)
  const PIE_COLORS = ['#d4af37', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c']

  return (
    <div className="space-y-5">
      {/* Header: period filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#d4af37] mr-2">Báo cáo</h1>
        {(['today', 'week', 'month', 'year', 'custom'] as Period[]).map((p) => (
          <button key={p}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${period === p
              ? 'btn-gold'
              : 'bg-white/[0.06] text-white border border-white/10 hover:bg-white/10'}`}
            onClick={() => setPeriod(p)}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input-glass px-3 py-1.5 text-xs"
              value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-white/55 text-xs">→</span>
            <input type="date" className="input-glass px-3 py-1.5 text-xs"
              value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {/* Summary stats — always visible */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Tổng doanh thu', value: summary ? formatCurrency(Number(summary.total_revenue)) : '—', color: 'text-[#d4af37]' },
          { label: 'Số hóa đơn', value: summary?.total_invoices ?? '—', color: 'text-blue-400' },
          { label: 'Trung bình / HĐ', value: summary ? formatCurrency(Number(summary.avg_invoice)) : '—', color: 'text-green-400' },
        ].map((s) => (
          <div key={s.label} className={`${GLASS_CARD} p-4 text-center`}
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
            <p className={`font-extrabold text-2xl ${s.color}`}>{s.value}</p>
            <p className="text-white/55 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-black/25 border border-white/10 rounded-2xl p-1 w-fit">
        {(['overview', 'staff', 'products'] as ReportTab[]).map((t) => (
          <button key={t}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === t
              ? 'glass-nav-active text-white'
              : 'text-white/55 hover:text-white hover:bg-white/[0.06]'}`}
            onClick={() => setActiveTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── TAB: TỔNG QUAN ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {chartData.length > 0 && (
            <div className={`${GLASS_CARD} p-5`}>
              <h3 className="font-semibold mb-4 text-white text-sm">Doanh thu theo ngày</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ backgroundColor: 'rgba(14,12,16,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff' }}
                  />
                  <Bar dataKey="doanh_thu" fill="#d4af37" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-2 gap-5">
            {/* Table stats */}
            <div className={`${GLASS_CARD} p-4`}>
              <h3 className="font-semibold mb-3 text-white text-sm">Thống kê bàn</h3>
              <div className="space-y-2">
                {(tableStats as Array<{ table_name: string; total_revenue: string; session_count: string; avg_duration_minutes: string }>).map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.07]">
                    <div>
                      <p className="text-sm font-medium text-white">{t.table_name}</p>
                      <p className="text-xs text-white/55">{t.session_count} lần · TB {Math.round(Number(t.avg_duration_minutes))} phút</p>
                    </div>
                    <span className="text-green-400 text-sm font-semibold">{formatCurrency(Number(t.total_revenue))}</span>
                  </div>
                ))}
                {tableStats.length === 0 && <p className="text-white/55 text-sm">Không có dữ liệu</p>}
              </div>
            </div>

            {/* Low stock */}
            <div className="rounded-2xl overflow-hidden"
              style={{
                background: lowStock.length > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)',
                border: `1px solid ${lowStock.length > 0 ? 'rgba(239,68,68,0.22)' : 'rgba(34,197,94,0.22)'}`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`
              }}>
              <div className="px-4 py-3 flex items-center gap-3"
                style={{ borderBottom: lowStock.length > 0 ? '1px solid rgba(239,68,68,0.15)' : 'none' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: lowStock.length > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)', border: `1px solid ${lowStock.length > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}` }}>
                  {lowStock.length > 0 ? '⚠️' : '✓'}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-bold uppercase tracking-widest ${lowStock.length > 0 ? 'text-red-400' : 'text-green-400'}`}>Cảnh báo tồn kho</p>
                  <p className="text-white/60 text-[11px] mt-0.5">{lowStock.length > 0 ? `${lowStock.length} sản phẩm cần nhập thêm` : 'Tất cả sản phẩm ổn định'}</p>
                </div>
                {lowStock.length > 0 && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                    {lowStock.length}
                  </span>
                )}
              </div>
              {lowStock.length > 0 && (
                <div className="px-4 py-3 space-y-2">
                  {(lowStock as Array<{ id: number; name: string; stock_quantity: number; unit: string; min_stock_alert: number }>).map((p) => {
                    const pct = Math.round((p.stock_quantity / p.min_stock_alert) * 100)
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="text-sm text-white/80 flex-1 truncate">{p.name}</span>
                        <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct < 50 ? '#ef4444' : '#f97316' }} />
                        </div>
                        <span className="text-red-400 text-xs font-mono font-semibold w-20 text-right flex-shrink-0">{p.stock_quantity} / {p.min_stock_alert} {p.unit}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: NHÂN VIÊN ── */}
      {activeTab === 'staff' && (
        <div className="space-y-5">
          {staffRows.length === 0 ? (
            <div className={`${GLASS_CARD} p-8 text-center`}>
              <p className="text-white/55">Không có dữ liệu nhân viên trong khoảng thời gian này</p>
            </div>
          ) : (
            <>
              {/* Staff bar chart */}
              <div className={`${GLASS_CARD} p-5`}>
                <h3 className="font-semibold mb-4 text-white text-sm">Doanh thu theo nhân viên</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={staffRows.map((s) => ({ name: s.staff_name, doanh_thu: Number(s.total_revenue), so_hd: Number(s.invoice_count) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) => [
                        name === 'doanh_thu' ? formatCurrency(Number(value)) : value,
                        name === 'doanh_thu' ? 'Doanh thu' : 'Số HĐ'
                      ]}
                      contentStyle={{ backgroundColor: 'rgba(14,12,16,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff' }}
                    />
                    <Bar dataKey="doanh_thu" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Staff table */}
              <div className={`${GLASS_CARD} overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.06] border-b border-white/10">
                      <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Nhân viên</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Số HĐ</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Doanh thu</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">TB/HĐ</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Tiền chơi</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Đồ uống</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffRows.map((s, i) => (
                      <tr key={s.staff_name} className={`border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">
                              {s.staff_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span className="text-white font-medium">{s.staff_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-white/80">{s.invoice_count}</td>
                        <td className="px-4 py-3 text-right text-[#d4af37] font-semibold">{formatCurrency(Number(s.total_revenue))}</td>
                        <td className="px-4 py-3 text-right text-white/65">{formatCurrency(Number(s.avg_invoice))}</td>
                        <td className="px-4 py-3 text-right text-white/65">{formatCurrency(Number(s.play_revenue))}</td>
                        <td className="px-4 py-3 text-right text-green-400">{formatCurrency(Number(s.items_revenue))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: SẢN PHẨM ── */}
      {activeTab === 'products' && (
        <div className="space-y-5">
          {productRows.length === 0 ? (
            <div className={`${GLASS_CARD} p-8 text-center`}>
              <p className="text-white/55">Không có dữ liệu sản phẩm trong khoảng thời gian này</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-5">
                {/* Pie chart by category */}
                <div className={`${GLASS_CARD} p-5`}>
                  <h3 className="font-semibold mb-3 text-white text-sm">Doanh thu theo category</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {categoryData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(Number(v))}
                        contentStyle={{ backgroundColor: 'rgba(14,12,16,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff' }} />
                      <Legend formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Top 5 products */}
                <div className={`${GLASS_CARD} p-5`}>
                  <h3 className="font-semibold mb-3 text-white text-sm">Top sản phẩm bán chạy</h3>
                  <div className="space-y-2.5">
                    {productRows.slice(0, 5).map((p, i) => (
                      <div key={p.product_name} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-white/30 w-4">#{i + 1}</span>
                        <span className="text-sm text-white flex-1 truncate">{p.category_icon} {p.product_name}</span>
                        <span className="text-xs text-white/55">{p.total_qty} cái</span>
                        <span className="text-[#d4af37] text-sm font-semibold">{formatCurrency(Number(p.total_revenue))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Full product table */}
              <div className={`${GLASS_CARD} overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.06] border-b border-white/10">
                      <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Sản phẩm</th>
                      <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Category</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">SL bán</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Giá TB</th>
                      <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest">Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((p, i) => (
                      <tr key={p.product_name} className={`border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                        <td className="px-4 py-3 text-white font-medium">{p.product_name}</td>
                        <td className="px-4 py-3">
                          <span className="bg-white/10 text-white/80 text-xs px-2 py-0.5 rounded-full">
                            {p.category_icon} {p.category_name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-white/80">{p.total_qty}</td>
                        <td className="px-4 py-3 text-right text-white/65">{formatCurrency(Number(p.avg_price))}</td>
                        <td className="px-4 py-3 text-right text-[#d4af37] font-semibold">{formatCurrency(Number(p.total_revenue))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 3: Chạy app kiểm tra**

```bash
npm run dev
```

Kiểm tra:
- Tab Tổng quan: chart + bảng bàn + cảnh báo tồn kho hiển thị đúng
- Tab Nhân viên: hiển thị bảng và chart (hoặc "không có dữ liệu")
- Tab Sản phẩm: hiển thị pie chart category + bảng sản phẩm
- Period filter: Năm này hoạt động (mới thêm)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/Reports.tsx
git commit -m "feat: reports page with 3 tabs — overview, staff, products + year period filter"
```
