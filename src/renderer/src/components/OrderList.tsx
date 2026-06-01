import type { OrderItem } from '../types'
import { formatCurrency } from '../lib/utils'

interface Props {
  items: (OrderItem & { product_name: string })[]
  onRemove: (itemId: number) => void
  onAdjust?: (itemId: number, delta: number) => void
  readOnly?: boolean
}

export default function OrderList({ items, onRemove, onAdjust, readOnly = false }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-white/40 text-sm py-2 text-center">Chưa có đồ uống / thức ăn</p>
    )
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
          style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)'}}>
          {/* Name */}
          <span className="text-sm text-white flex-1 truncate font-medium">{item.product_name}</span>

          {/* Qty controls */}
          {!readOnly && onAdjust ? (
            <div className="flex items-center gap-1">
              <button
                className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-all"
                style={{background:'rgba(239,68,68,0.15)', color:'#f87171', border:'1px solid rgba(239,68,68,0.25)'}}
                onMouseEnter={e => (e.currentTarget.style.background='rgba(239,68,68,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.background='rgba(239,68,68,0.15)')}
                onClick={() => onAdjust(item.id, -1)}
              >−</button>
              <span className="text-sm text-white w-7 text-center tabular-nums font-semibold">×{item.quantity}</span>
              <button
                className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-all"
                style={{background:'rgba(34,197,94,0.15)', color:'#4ade80', border:'1px solid rgba(34,197,94,0.25)'}}
                onMouseEnter={e => (e.currentTarget.style.background='rgba(34,197,94,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.background='rgba(34,197,94,0.15)')}
                onClick={() => onAdjust(item.id, 1)}
              >+</button>
            </div>
          ) : (
            <span className="text-sm text-white/70 tabular-nums">×{item.quantity}</span>
          )}

          {/* Subtotal */}
          <span className="text-green-400 text-sm font-semibold w-20 text-right tabular-nums">
            {formatCurrency(item.subtotal)}
          </span>

          {/* Remove */}
          {!readOnly && (
            <button
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
              style={{color:'rgba(255,255,255,0.3)'}}
              onMouseEnter={e => { e.currentTarget.style.color='#f87171'; e.currentTarget.style.background='rgba(239,68,68,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.3)'; e.currentTarget.style.background='transparent' }}
              onClick={() => onRemove(item.id)}
            >×</button>
          )}
        </div>
      ))}
    </div>
  )
}
