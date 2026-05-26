import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import SessionTimer from './SessionTimer'
import { formatCurrency } from '../lib/utils'

interface Props {
  table: BidaTable
  onOpen: (table: BidaTable) => void
  onView: (tableId: number) => void
}

const STATUS_COLORS = {
  idle: 'bg-green-900 border-green-500 hover:bg-green-800',
  playing: 'bg-red-900 border-red-500 hover:bg-red-800',
  reserved: 'bg-yellow-900 border-yellow-500 hover:bg-yellow-800',
} as const

const STATUS_LABELS = {
  idle: 'Trống',
  playing: 'Đang chơi',
  reserved: 'Đã đặt',
} as const

export default function TableCard({ table, onOpen, onView }: Props) {
  const session = useSessionStore((s) => s.getSessionByTableId(table.id))

  return (
    <button
      data-testid="table-card"
      className={`relative w-full rounded-xl border-2 p-4 text-left transition-all ${STATUS_COLORS[table.status]}`}
      onClick={() => table.status === 'idle' ? onOpen(table) : onView(table.id)}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-lg font-bold">{table.name}</span>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          table.status === 'idle' ? 'bg-green-500' :
          table.status === 'playing' ? 'bg-red-500' : 'bg-yellow-500'
        } text-white`}>
          {STATUS_LABELS[table.status]}
        </span>
      </div>
      {table.status === 'idle' && (
        <p className="text-sm text-gray-400">{formatCurrency(table.hourly_rate)}/giờ</p>
      )}
      {table.status === 'playing' && session && (
        <SessionTimer startTime={session.start_time} hourlyRate={session.hourly_rate} />
      )}
    </button>
  )
}
