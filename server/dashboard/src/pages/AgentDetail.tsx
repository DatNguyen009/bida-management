import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import TableGrid from '../components/TableGrid'
import RevenueChart from '../components/RevenueChart'

interface AgentDetailData {
  agent: { id: string; name: string; phone: string | null; address: string | null }
  tables: { id: number; name: string; status: string; hourly_rate: number }[]
  recentInvoices: { invoice_number: string; final_amount: number; created_at: string }[]
  revenueByDay: { date: string; total: number }[]
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => apiFetch<AgentDetailData>(`/master/agents/${id}`),
  })

  if (isLoading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>
  if (isError || !data) return <div className="text-center py-12 text-red-500">Không tìm thấy quán.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/agents" className="text-sm text-blue-600 hover:underline">← Danh sách quán</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{data.agent.name}</h1>
          {data.agent.address && <p className="text-sm text-gray-500 mt-0.5">{data.agent.address}</p>}
        </div>
        <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">Làm mới</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Trạng thái bàn</h2>
        <TableGrid tables={data.tables} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Hóa đơn gần nhất</h2>
          <div className="space-y-2">
            {data.recentInvoices.map((inv) => (
              <div key={inv.invoice_number} className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-mono">HD#{inv.invoice_number}</span>
                <span className="text-gray-400">{fmtTime(inv.created_at)}</span>
                <span className="font-medium text-gray-900">{fmtVND(inv.final_amount)}</span>
              </div>
            ))}
            {data.recentInvoices.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">Chưa có hóa đơn hôm nay.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Doanh thu 7 ngày</h2>
          <RevenueChart data={data.revenueByDay} color="#10b981" />
        </div>
      </div>
    </div>
  )
}
