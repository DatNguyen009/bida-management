import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { apiFetch } from '../lib/api'

interface ReportsData {
  summary: { totalRevenue: number; totalInvoices: number; avgInvoice: number }
  byAgent: { agentId: string; name: string; revenue: number; invoices: number }[]
  byDay: { date: string; total: number }[]
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

function fmtDate(s: string) {
  const d = new Date(s)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function toISO(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export default function Reports() {
  const [from, setFrom] = useState(() => toISO(6))
  const [to, setTo] = useState(() => toISO(0))
  const [queryKey, setQueryKey] = useState(() => [from, to])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', ...queryKey],
    queryFn: () => apiFetch<ReportsData>(`/master/reports?from=${queryKey[0]}&to=${queryKey[1]}`),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Báo cáo</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Từ ngày</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Đến ngày</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setQueryKey([from, to])}
          className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          Xem báo cáo
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Tổng doanh thu', value: fmtVND(data.summary.totalRevenue) },
              { label: 'Tổng hóa đơn', value: data.summary.totalInvoices },
              { label: 'Trung bình / HĐ', value: fmtVND(Math.round(data.summary.avgInvoice)) },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-medium">{s.label}</div>
                <div className="text-xl font-bold text-gray-900">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">So sánh doanh thu giữa các quán</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byAgent} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v: number) => fmtVND(v)} />
                <Bar dataKey="revenue" name="Doanh thu" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Quán', 'Doanh thu', 'Hóa đơn', 'Trung bình/HĐ'].map((h) => (
                    <th key={h} className={`px-4 py-3 text-gray-600 font-medium ${h === 'Quán' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byAgent.map((a) => (
                  <tr key={a.agentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtVND(a.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{a.invoices}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {a.invoices > 0 ? fmtVND(Math.round(a.revenue / a.invoices)) : '—'}
                    </td>
                  </tr>
                ))}
                {data.byAgent.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu trong khoảng thời gian này.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
