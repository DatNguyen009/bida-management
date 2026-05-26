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

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api().products.getAll(),
    enabled: open,
  })

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async (product: Product) => {
    setLoadingId(product.id)
    await onSelect(product, 1)
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
          {filtered.map((product) => (
            <div key={product.id}
              className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <div>
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-xs text-green-400">{formatCurrency(product.price)}</p>
                <p className="text-xs text-gray-500">Tồn: {product.stock_quantity} {product.unit}</p>
              </div>
              <Button
                size="sm"
                disabled={loadingId === product.id || product.stock_quantity <= 0}
                onClick={() => handleAdd(product)}
                className="bg-green-700 hover:bg-green-600"
              >
                {loadingId === product.id ? '...' : '+ Thêm'}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
