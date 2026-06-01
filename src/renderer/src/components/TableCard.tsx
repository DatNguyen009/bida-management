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
      className={`relative rounded-xl p-3 flex items-center gap-4 cursor-pointer transition-all
        backdrop-blur-xl border
        ${isPlaying
          ? 'bg-red-950/30 border-red-500/30 hover:border-red-400/60 hover:bg-red-950/40'
          : 'bg-white/[0.06] border-white/10 hover:border-green-400/50 hover:bg-white/[0.10]'
        }`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
      onClick={() => isPlaying ? onView(table.id) : onOpen(table)}
    >
      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0
        ${isPlaying
          ? 'bg-red-500/20 border border-red-500/30'
          : 'bg-green-500/15 border border-green-500/25'
        }`}>
        🎱
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[#d4af37] font-bold text-sm">{table.name}</div>
        {isPlaying && session
          ? <PlayingTimer startTime={session.start_time} hourlyRate={session.hourly_rate} />
          : <div className="text-white/55 text-xs">{formatCurrency(table.hourly_rate)}/giờ</div>
        }
      </div>

      {/* Status + edit */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isPlaying
          ? <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] px-2.5 py-1 rounded-full font-semibold">● Đang chơi</span>
          : <span className="bg-green-500/15 border border-green-500/25 text-green-400 text-[10px] px-2.5 py-1 rounded-full font-semibold">● Trống</span>
        }
        <button
          className="relative z-10 text-white/30 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-white/10 transition-colors"
          onClick={(e) => { e.stopPropagation(); onEdit(table) }}
          title="Chỉnh sửa"
        >
          ✎
        </button>
      </div>
    </div>
  )
}
