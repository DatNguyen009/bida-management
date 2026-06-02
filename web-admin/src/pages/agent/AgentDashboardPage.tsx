import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface TableRow {
  id: number; name: string; status: string; hourly_rate: number
  session_id: number | null; start_time: string | null
}

function elapsed(startTime: string): string {
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

const STATUS_COLORS: Record<string, string> = {
  playing: 'bg-red-500/20 border-red-500/40 text-red-300',
  idle: 'bg-green-500/20 border-green-500/40 text-green-300',
  reserved: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
}
const STATUS_LABELS: Record<string, string> = {
  playing: 'Đang chơi', idle: 'Trống', reserved: 'Đặt trước'
}

export default function AgentDashboardPage() {
  const [tables, setTables] = useState<TableRow[]>([])
  const [tick, setTick] = useState(0)

  const fetchTables = useCallback(async () => {
    const { data } = await api.get('/agent/tables')
    setTables(data)
  }, [])

  useEffect(() => { fetchTables() }, [fetchTables])

  // Poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => { fetchTables(); setTick(t => t+1) }, 10_000)
    return () => clearInterval(interval)
  }, [fetchTables])

  // Tick every second to update elapsed timers
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t+1), 1000)
    return () => clearInterval(interval)
  }, [])

  const playing = tables.filter(t => t.status === 'playing').length
  const idle = tables.filter(t => t.status === 'idle').length

  return (
    <AgentLayout title="Dashboard">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Đang chơi', value: playing, color: 'text-red-400' },
          { label: 'Trống', value: idle, color: 'text-green-400' },
          { label: 'Tổng bàn', value: tables.length, color: 'text-[#d4af37]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-white/50 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Table grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {tables.map(table => (
          <div key={table.id} className={`glass-card p-4 border ${STATUS_COLORS[table.status] ?? 'border-white/10'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-sm">{table.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[table.status] ?? ''}`}>
                {STATUS_LABELS[table.status] ?? table.status}
              </span>
            </div>
            {table.status === 'playing' && table.start_time && (
              <p className="text-red-300 font-mono text-lg font-bold">{elapsed(table.start_time)}</p>
            )}
            <p className="text-white/30 text-xs mt-1">{(table.hourly_rate/1000).toFixed(0)}k/giờ</p>
          </div>
        ))}
      </div>
    </AgentLayout>
  )
}
