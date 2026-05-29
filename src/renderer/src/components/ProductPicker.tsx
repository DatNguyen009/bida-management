import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Product } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (product: Product, quantity: number) => Promise<void>
}

export default function ProductPicker({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [quantities, setQuantities] = useState<Record<number, number>>({})

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api().products.getAll(),
    enabled: open,
  })

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const getQty = (id: number) => quantities[id] ?? 1

  const setQty = (id: number, value: number, max: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.min(Math.max(1, value), max) }))
  }

  const handleAdd = async (product: Product) => {
    const qty = getQty(product.id)
    setLoadingId(product.id)
    await onSelect(product, qty)
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }))
    setLoadingId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Chọn đồ uống / thức ăn</DialogTitle>
        </DialogHeader>
        <Input
          className="bg-gray-800 border-gray-600"
          placeholder="Tìm sản phẩm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.map((product) => {
            const qty = getQty(product.id)
            const outOfStock = product.stock_quantity <= 0
            const loading = loadingId === product.id
            return (
              <div key={product.id}
                className="flex items-center justify-between p-2 bg-gray-800 rounded gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-green-400">{formatCurrency(product.price)}</p>
                  <p className="text-xs text-gray-500">Tồn: {product.stock_quantity} {product.unit}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-white text-base disabled:opacity-40"
                    disabled={qty <= 1 || outOfStock || loading}
                    onClick={() => setQty(product.id, qty - 1, product.stock_quantity)}
                  >−</button>
                  <span className="w-7 text-center text-sm tabular-nums">{qty}</span>
                  <button
                    className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-white text-base disabled:opacity-40"
                    disabled={qty >= product.stock_quantity || outOfStock || loading}
                    onClick={() => setQty(product.id, qty + 1, product.stock_quantity)}
                  >+</button>
                  <Button
                    size="sm"
                    disabled={outOfStock || loading}
                    onClick={() => handleAdd(product)}
                    className="bg-green-700 hover:bg-green-600 ml-1"
                  >
                    {loading ? '...' : 'Thêm'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
