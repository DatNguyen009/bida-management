import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import RevenueChart from '../components/RevenueChart'

interface OverviewData {
  activeAgents: number
  totalTablesPlaying: number
  todayRevenue: number
  todayInvoices: number
  revenueByDay: { date: string; total: number }[]
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

export default function Overview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: () => apiFetch<OverviewData>('/master/overview'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">
          Làm mới
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Quán hoạt động hôm nay', value: data.activeAgents, color: 'text-green-600' },
              { label: 'Bàn đang chơi', value: data.totalTablesPlaying, color: 'text-red-500' },
              { label: 'Doanh thu hôm nay', value: fmtVND(data.todayRevenue), color: 'text-blue-600' },
              { label: 'Hóa đơn hôm nay', value: data.todayInvoices, color: 'text-purple-600' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-sm text-gray-500 mb-1">{kpi.label}</div>
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">
              Doanh thu 7 ngày — tất cả quán
            </h2>
            <RevenueChart data={data.revenueByDay} />
          </div>
        </>
      )}
    </div>
  )
}
