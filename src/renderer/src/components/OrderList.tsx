import type { OrderItem } from '../types'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'

interface Props {
  items: (OrderItem & { product_name: string })[]
  onRemove: (itemId: number) => void
  readOnly?: boolean
}

export default function OrderList({ items, onRemove, readOnly = false }: Props) {
  if (items.length === 0) {
    return <p className="text-gray-500 text-sm">Chưa có đồ uống / thức ăn</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
          <span className="text-sm">{item.product_name} x{item.quantity}</span>
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-sm">{formatCurrency(item.subtotal)}</span>
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
