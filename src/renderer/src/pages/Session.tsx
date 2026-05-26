import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { formatCurrency, calcPlayAmount, elapsedMinutes, formatDuration } from '../lib/utils'
import { Button } from '@/components/ui/button'
import type { Session as SessionType } from '../types'

interface Props {
  tableId: number
  onBack: () => void
  onCheckout: (session: SessionType & { table_name: string; hourly_rate: number }, playAmount: number) => void
}

export default function SessionPage({ tableId, onBack, onCheckout }: Props) {
  const [minutes, setMinutes] = useState(0)

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
  })

  const session = sessions.find((s) => s.table_id === tableId)

  useEffect(() => {
    if (!session) return
    setMinutes(elapsedMinutes(session.start_time))
    const timer = setInterval(() => {
      setMinutes(elapsedMinutes(session.start_time))
    }, 30000)
    return () => clearInterval(timer)
  }, [session?.start_time])

  if (!session) {
    return (
      <div className="p-6">
        <Button variant="outline" onClick={onBack}>← Quay lại</Button>
        <p className="mt-4 text-gray-400">Không tìm thấy phiên chơi.</p>
      </div>
    )
  }

  const playAmount = calcPlayAmount(minutes, session.hourly_rate)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={onBack} className="border-gray-600">← Quay lại</Button>
        <h1 className="text-2xl font-bold">{session.table_name}</h1>
      </div>
      <div className="bg-gray-900 rounded-xl p-6 mb-4 text-center">
        <p className="text-gray-400 mb-1">Thời gian chơi</p>
        <p className="text-5xl font-mono font-bold text-yellow-400">{formatDuration(minutes)}</p>
        <p className="text-2xl text-green-400 mt-2">{formatCurrency(playAmount)}</p>
        <p className="text-xs text-gray-500 mt-1">{formatCurrency(session.hourly_rate)}/giờ</p>
      </div>
      <div className="flex gap-4">
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700 py-6 text-lg"
          onClick={() => onCheckout(session, playAmount)}
        >
          Kết thúc & Thanh toán
        </Button>
      </div>
    </div>
  )
}
