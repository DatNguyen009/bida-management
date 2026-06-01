import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Product } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'

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

  if (!open) return null

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const getQty = (id: number) => quantities[id] ?? 1
  const setQty = (id: number, value: number, max: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.min(Math.max(1, value), max) }))

  const handleAdd = async (product: Product) => {
    const qty = getQty(product.id)
    setLoadingId(product.id)
    await onSelect(product, qty)
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }))
    setLoadingId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-glass relative w-full max-w-md mx-4 flex flex-col overflow-hidden"
        style={{maxHeight:'85vh'}}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">🍺</div>
            <h2 className="text-base font-bold text-white">Gọi đồ uống / thức ăn</h2>
            <button onClick={onClose} className="ml-auto text-white/30 hover:text-white transition-colors text-lg">✕</button>
          </div>
          {/* Search */}
          <input
            className="input-glass w-full px-4 py-2.5 text-sm"
            placeholder="🔍 Tìm sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="mb-4 mx-5 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)'}} />

        {/* Product list */}
        <div className="overflow-y-auto px-5 pb-5 space-y-2 flex-1">
          {filtered.length === 0 && (
            <p className="text-white/40 text-sm text-center py-6">Không tìm thấy sản phẩm</p>
          )}
          {filtered.map((product) => {
            const qty = getQty(product.id)
            const outOfStock = product.stock_quantity <= 0
            const loading = loadingId === product.id
            return (
              <div key={product.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                style={{
                  background: outOfStock ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  opacity: outOfStock ? 0.5 : 1,
                }}>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-green-400 text-xs font-semibold">{formatCurrency(product.price)}</span>
                    <span className="text-white/35 text-xs">·</span>
                    <span className={`text-xs ${outOfStock ? 'text-red-400' : 'text-white/45'}`}>
                      Tồn: {product.stock_quantity} {product.unit}
                    </span>
                  </div>
                </div>

                {/* Qty stepper */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold transition-all disabled:opacity-30"
                    style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
                    disabled={qty <= 1 || outOfStock || loading}
                    onClick={() => setQty(product.id, qty - 1, product.stock_quantity)}
                  >−</button>
                  <span className="w-7 text-center text-sm tabular-nums font-semibold text-white">{qty}</span>
                  <button
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold transition-all disabled:opacity-30"
                    style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
                    disabled={qty >= product.stock_quantity || outOfStock || loading}
                    onClick={() => setQty(product.id, qty + 1, product.stock_quantity)}
                  >+</button>
                </div>

                {/* Add button */}
                <button
                  className="btn-gold flex-shrink-0 text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={outOfStock || loading}
                  onClick={() => handleAdd(product)}
                >
                  {loading ? '...' : '+ Thêm'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
