import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import { formatCurrency, formatDuration, elapsedSeconds } from '../lib/utils'
import { useState, useEffect } from 'react'

interface Props {
  table: BidaTable
  onOpen: (table: BidaTable) => void
  onView: (tableId: number) => void
  onEdit: (table: BidaTable) => void
}

function PlayingTimer({ startTime, hourlyRate }: { startTime: string; hourlyRate: number }) {
  const [secs, setSecs] = useState(() => elapsedSeconds(startTime))
  useEffect(() => {
    const t = setInterval(() => setSecs(elapsedSeconds(startTime)), 1000)
    return () => clearInterval(t)
  }, [startTime])
  const amount = Math.round((secs / 3600) * hourlyRate)
  return (
    <div>
      <div className="text-red-400 font-mono font-bold text-sm">{formatDuration(secs)}</div>
      <div className="text-red-400 text-xs">{formatCurrency(amount)}</div>
    </div>
  )
}

export default function TableCard({ table, onOpen, onView, onEdit }: Props) {
  const session = useSessionStore((s) => s.getSessionByTableId(table.id))
  const isPlaying = table.status === 'playing'

  return (
    <div
      className={`relative rounded-xl p-3 flex items-center gap-4 cursor-pointer transition-colors
        ${isPlaying
          ? 'bg-[#2d1515] border border-[#991b1b] hover:border-red-500'
          : 'bg-[#162a1a] border border-[#1e3d23] hover:border-green-500'
        }`}
      onClick={() => isPlaying ? onView(table.id) : onOpen(table)}
    >
      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0
        ${isPlaying
          ? 'bg-gradient-to-br from-[#991b1b] to-[#7f1d1d]'
          : 'bg-gradient-to-br from-[#166534] to-[#14532d]'
        }`}>
        🎱
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[#d4af37] font-bold text-sm">{table.name}</div>
        {isPlaying && session
          ? <PlayingTimer startTime={session.start_time} hourlyRate={session.hourly_rate} />
          : <div className="text-[#6b7280] text-xs">{formatCurrency(table.hourly_rate)}/giờ</div>
        }
      </div>

      {/* Status + edit */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isPlaying
          ? <span className="bg-[#7f1d1d] text-red-400 text-[10px] px-2.5 py-1 rounded-full font-semibold">● Đang chơi</span>
          : <span className="bg-[#14532d] text-green-400 text-[10px] px-2.5 py-1 rounded-full font-semibold">● Trống</span>
        }
        <button
          className="relative z-10 text-[#6b7280] hover:text-white text-xs px-1.5 py-1 rounded hover:bg-[#1e3d23] transition-colors"
          onClick={(e) => { e.stopPropagation(); onEdit(table) }}
          title="Chỉnh sửa"
        >
          ✎
        </button>
      </div>
    </div>
  )
}
