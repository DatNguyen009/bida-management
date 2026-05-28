import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'

interface AgentSummary {
  agentId: string
  name: string
  tablesPlaying: number
  totalTables: number
  todayRevenue: number
  todayInvoices: number
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

export default function Agents() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiFetch<AgentSummary[]>('/master/agents'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách quán</h1>
        <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">Làm mới</button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(data ?? []).map((agent) => (
          <Link key={agent.agentId} to={`/agents/${agent.agentId}`}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all block">
            <div className="font-semibold text-gray-900 text-lg mb-3">{agent.name}</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-400 text-xs mb-1">Bàn đang chơi</div>
                <div className="font-semibold text-red-500">{agent.tablesPlaying} / {agent.totalTables}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">Doanh thu hôm nay</div>
                <div className="font-semibold text-green-600">{fmtVND(agent.todayRevenue)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">Hóa đơn</div>
                <div className="font-semibold text-blue-600">{agent.todayInvoices}</div>
              </div>
            </div>
          </Link>
        ))}
        {data?.length === 0 && (
          <p className="text-gray-400 col-span-2 text-center py-8">Chưa có quán nào.</p>
        )}
      </div>
    </div>
  )
}
