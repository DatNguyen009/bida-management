import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { formatCurrency, calcPlayAmount, elapsedSeconds, formatDuration } from '../lib/utils'
import type { Session as SessionType } from '../types'
import OrderList from '../components/OrderList'
import ProductPicker from '../components/ProductPicker'

interface Props {
  tableId: number
  onBack: () => void
  onCheckout: (session: SessionType & { table_name: string; hourly_rate: number }, playAmount: number) => void
}

export default function SessionPage({ tableId, onBack, onCheckout }: Props) {
  const [seconds, setSeconds] = useState(0)
  const [showPicker, setShowPicker] = useState(false)
  const queryClient = useQueryClient()

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
  })

  const session = sessions.find((s) => s.table_id === tableId)

  const { data: orderItems = [] } = useQuery({
    queryKey: ['orderItems', session?.id],
    queryFn: () => session ? api().orderItems.get(session.id) : Promise.resolve([]),
    enabled: !!session,
  })

  const addItemMutation = useMutation({
    mutationFn: ({ productId, quantity, price }: { productId: number; quantity: number; price: number }) =>
      api().orderItems.add(session!.id, productId, quantity, price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session?.id] }),
  })

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) => api().orderItems.remove(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session?.id] }),
  })

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
  const itemsAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0)

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

      {/* Order section */}
      <div className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-[#e2e8f0] text-sm">Đồ uống / thức ăn</h3>
          <button
            className="bg-[#d4af37] text-[#0d1f12] font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-yellow-400"
            onClick={() => setShowPicker(true)}
          >
            + Gọi
          </button>
        </div>
        <OrderList items={orderItems} onRemove={(id) => removeItemMutation.mutate(id)} />
        {itemsAmount > 0 && (
          <div className="mt-3 pt-3 border-t border-[#1e3d23] flex justify-between text-sm">
            <span className="text-[#6b7280]">Tổng đồ uống:</span>
            <span className="text-[#d4af37] font-bold">{formatCurrency(itemsAmount)}</span>
          </div>
        )}
      </div>

      <button
        className="w-full bg-[#d4af37] text-[#0d1f12] font-bold py-4 rounded-xl text-base hover:bg-yellow-400 transition-colors"
        onClick={() => onCheckout(session, playAmount)}
      >
        Kết thúc & Thanh toán — {formatCurrency(playAmount)}
      </button>

      <ProductPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={async (product, qty) => {
          await addItemMutation.mutateAsync({
            productId: product.id,
            quantity: qty,
            price: product.price,
          })
          setShowPicker(false)
        }}
      />
    </div>
  )
}
