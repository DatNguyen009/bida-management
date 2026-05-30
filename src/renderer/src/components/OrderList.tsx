import type { OrderItem } from '../types'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'

interface Props {
  items: (OrderItem & { product_name: string })[]
  onRemove: (itemId: number) => void
  onAdjust?: (itemId: number, delta: number) => void
  readOnly?: boolean
}

export default function OrderList({ items, onRemove, onAdjust, readOnly = false }: Props) {
  if (items.length === 0) {
    return <p className="text-gray-500 text-sm">Chưa có đồ uống / thức ăn</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
          <span className="text-sm flex-1">{item.product_name}</span>
          <div className="flex items-center gap-2">
            {!readOnly && onAdjust && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm" variant="ghost"
                  className="text-[#6b7280] hover:text-white h-6 w-6 p-0 text-base leading-none"
                  onClick={() => onAdjust(item.id, -1)}
                >
                  −
                </Button>
                <span className="text-sm text-white w-6 text-center">x{item.quantity}</span>
                <Button
                  size="sm" variant="ghost"
                  className="text-[#6b7280] hover:text-white h-6 w-6 p-0 text-base leading-none"
                  onClick={() => onAdjust(item.id, 1)}
                >
                  +
                </Button>
              </div>
            )}
            {(readOnly || !onAdjust) && (
              <span className="text-sm text-white">x{item.quantity}</span>
            )}
            <span className="text-green-400 text-sm w-20 text-right">{formatCurrency(item.subtotal)}</span>
            {!readOnly && (
              <Button
                size="sm" variant="ghost"
                className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                onClick={() => onRemove(item.id)}
              >
                ×
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
