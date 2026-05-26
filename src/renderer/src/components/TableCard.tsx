import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import SessionTimer from './SessionTimer'
import { formatCurrency } from '../lib/utils'

interface Props {
  table: BidaTable
  onOpen: (table: BidaTable) => void
  onView: (tableId: number) => void
  onEdit: (table: BidaTable) => void
}

const STATUS_BG = {
  idle: 'bg-green-900 border-green-500',
  playing: 'bg-red-900 border-red-500',
  reserved: 'bg-yellow-900 border-yellow-500',
} as const

const STATUS_LABELS = {
  idle: 'Trống',
  playing: 'Đang chơi',
  reserved: 'Đã đặt',
} as const

export default function TableCard({ table, onOpen, onView, onEdit }: Props) {
  const session = useSessionStore((s) => s.getSessionByTableId(table.id))

  return (
    <div
      className={`relative w-full rounded-xl border-2 p-4 text-left transition-colors ${STATUS_BG[table.status]}`}
    >
      <button
        data-testid="table-card"
        className="absolute inset-0 rounded-xl"
        onClick={() => (table.status === 'idle' ? onOpen(table) : onView(table.id))}
        aria-label={`Bàn ${table.name}`}
      />
      <div className="relative flex justify-between items-start mb-2">
        <span className="text-lg font-bold">{table.name}</span>
        <div className="flex items-center gap-1">
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium text-white ${
              table.status === 'idle'
                ? 'bg-green-500'
                : table.status === 'playing'
                  ? 'bg-red-500'
                  : 'bg-yellow-500'
            }`}
          >
            {STATUS_LABELS[table.status]}
          </span>
          <button
            className="relative z-10 text-gray-300 hover:text-white text-sm px-1.5 py-0.5 rounded hover:bg-gray-700"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(table)
            }}
            title="Chỉnh sửa"
          >
            ✎
          </button>
        </div>
      </div>
      {table.status === 'idle' && (
        <p className="relative text-sm text-gray-400">{formatCurrency(table.hourly_rate)}/giờ</p>
      )}
      {table.status === 'playing' && session && (
        <SessionTimer startTime={session.start_time} hourlyRate={session.hourly_rate} />
      )}
    </div>
  )
}
