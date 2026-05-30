import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { formatCurrency, calcPlayAmount, elapsedSeconds, formatDuration } from '../lib/utils'
import type { Session as SessionType } from '../types'

interface Props {
  tableId: number
  onBack: () => void
  onCheckout: (session: SessionType & { table_name: string; hourly_rate: number }, playAmount: number) => void
}

export default function SessionPage({ tableId, onBack, onCheckout }: Props) {
  const [seconds, setSeconds] = useState(0)

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
  })

  const session = sessions.find((s) => s.table_id === tableId)

  useEffect(() => {
    if (!session) return
    setSeconds(elapsedSeconds(session.start_time))
    const timer = setInterval(() => {
      setSeconds(elapsedSeconds(session.start_time))
    }, 1000)
    return () => clearInterval(timer)
  }, [session?.start_time])

  if (!session) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-[#6b7280] hover:text-white text-sm flex items-center gap-1 mb-4">← Quay lại</button>
        <p className="text-[#6b7280]">Không tìm thấy phiên chơi.</p>
      </div>
    )
  }

  const playAmount = calcPlayAmount(seconds / 60, session.hourly_rate)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-[#6b7280] hover:text-white text-sm flex items-center gap-1">← Quay lại</button>
        <h1 className="text-xl font-bold text-[#d4af37]">{session.table_name}</h1>
      </div>

      <div className="bg-[#2d1515] border border-[#7f1d1d] rounded-xl p-8 mb-4 text-center">
        <p className="text-[#6b7280] text-[10px] uppercase tracking-widest mb-3">Thời gian chơi</p>
        <p className="text-6xl font-mono font-bold text-red-400 tracking-wider">{formatDuration(seconds)}</p>
        <p className="text-2xl font-bold text-red-400 mt-3">{formatCurrency(playAmount)}</p>
        <p className="text-xs text-[#6b7280] mt-1">{formatCurrency(session.hourly_rate)}/giờ</p>
      </div>

      <button
        className="w-full bg-[#d4af37] text-[#0d1f12] font-bold py-4 rounded-xl text-base hover:bg-yellow-400 transition-colors"
        onClick={() => onCheckout(session, playAmount)}
      >
        Kết thúc & Thanh toán — {formatCurrency(playAmount)}
      </button>
    </div>
  )
}
