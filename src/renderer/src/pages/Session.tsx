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

  const adjustQtyMutation = useMutation({
    mutationFn: ({ itemId, delta }: { itemId: number; delta: number }) =>
      api().orderItems.adjustQty(itemId, delta),
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
        <button onClick={onBack} className="text-white/55 hover:text-white text-sm flex items-center gap-1 mb-4">← Quay lại</button>
        <p className="text-white/55">Không tìm thấy phiên chơi.</p>
      </div>
    )
  }

  const playAmount = calcPlayAmount(seconds / 60, session.hourly_rate)
  const itemsAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-white/55 hover:text-white text-sm flex items-center gap-1">← Quay lại</button>
        <h1 className="text-xl font-bold text-[#d4af37]">{session.table_name}</h1>
      </div>

      {/* Timer card */}
      <div className="rounded-2xl p-8 mb-4 text-center relative overflow-hidden"
        style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(239,68,68,0.1)'}}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
        <p className="text-white/40 text-[10px] uppercase tracking-widest mb-3">Thời gian chơi</p>
        <p className="text-6xl font-mono font-bold text-red-400 tracking-wider relative">{formatDuration(seconds)}</p>
        <p className="text-2xl font-bold text-red-400 mt-3 relative">{formatCurrency(playAmount)}</p>
        <p className="text-xs text-white/40 mt-1 relative">{formatCurrency(session.hourly_rate)}/giờ</p>
      </div>

      {/* Order section */}
      <div className="rounded-2xl p-4 mb-4"
        style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08)'}}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-white text-sm">🍺 Đồ uống / thức ăn</h3>
          <button className="btn-gold text-xs px-3 py-2" onClick={() => setShowPicker(true)}>
            + Gọi
          </button>
        </div>
        <OrderList
          items={orderItems}
          onRemove={(id) => removeItemMutation.mutate(id)}
          onAdjust={(id, delta) => adjustQtyMutation.mutate({ itemId: id, delta })}
        />
        {itemsAmount > 0 && (
          <div className="mt-3 pt-3 flex justify-between items-center text-sm"
            style={{borderTop:'1px solid rgba(255,255,255,0.08)'}}>
            <span className="text-white/55">Tổng đồ uống</span>
            <span className="text-[#d4af37] font-bold text-base">{formatCurrency(itemsAmount)}</span>
          </div>
        )}
      </div>

      {/* Summary + checkout */}
      <div className="rounded-2xl p-4 mb-4"
        style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)'}}>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-white/55">Tiền chơi</span>
          <span className="text-red-400 font-semibold">{formatCurrency(playAmount)}</span>
        </div>
        {itemsAmount > 0 && (
          <div className="flex justify-between text-sm mb-1">
            <span className="text-white/55">Đồ uống</span>
            <span className="text-[#d4af37] font-semibold">{formatCurrency(itemsAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold mt-2 pt-2"
          style={{borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <span className="text-white">Tổng cộng</span>
          <span className="text-[#d4af37]">{formatCurrency(playAmount + itemsAmount)}</span>
        </div>
      </div>

      <button
        className="btn-gold w-full py-3 text-sm font-bold"
        onClick={() => onCheckout(session, playAmount)}
      >
        Kết thúc & Thanh toán — {formatCurrency(playAmount + itemsAmount)}
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
