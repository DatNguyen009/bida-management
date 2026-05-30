import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Product } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import Pagination from '../components/Pagination'
import TableSkeleton from '../components/TableSkeleton'

type ModalMode = 'create' | 'edit' | 'stock' | null

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' as 'stock' | 'composite' })
  const [stockQty, setStockQty] = useState(0)
  const [stockNote, setStockNote] = useState('')
  const [stockCostPrice, setStockCostPrice] = useState<number | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data: productResult, isLoading } = useQuery({
    queryKey: ['products', page, pageSize],
    queryFn: () => api().products.getPage({ page, pageSize }),
  })
  const products = productResult?.data ?? []
  const productTotal = productResult?.total ?? 0

  const createMutation = useMutation({
    mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }),
    onSuccess: () => { toast.success('Đã tạo sản phẩm'); queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
    onError: () => toast.error('Tạo sản phẩm thất bại'),
  })

  const updateMutation = useMutation({
    mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'], product_type: form.product_type }) : Promise.resolve(null),
    onSuccess: () => { toast.success('Đã cập nhật sản phẩm'); queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
    onError: () => toast.error('Cập nhật sản phẩm thất bại'),
  })

  const stockMutation = useMutation({
    mutationFn: () => selected
      ? api().products.adjustStock(selected.id, 'in', stockQty, stockNote, stockCostPrice === '' ? null : stockCostPrice)
      : Promise.resolve(null),
    onSuccess: () => { toast.success('Đã nhập kho'); queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
    onError: () => toast.error('Nhập kho thất bại'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => api().products.update(id, { is_active: false }),
    onSuccess: () => { toast.success('Đã xoá sản phẩm'); queryClient.invalidateQueries({ queryKey: ['products'] }) },
    onError: () => toast.error('Xoá sản phẩm thất bại'),
  })

  const lowStockProducts = products.filter((p) => p.stock_quantity <= p.min_stock_alert)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#d4af37]">Quản lý sản phẩm</h1>
        <Button onClick={() => { setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }}
          className="bg-[#d4af37] text-[#0d1f12] font-bold text-sm px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors">
          + Thêm sản phẩm
        </Button>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-[#2d1515] border border-red-800 rounded-xl p-3 mb-4 text-red-400 font-medium">
          ⚠️ Sắp hết hàng: {lowStockProducts.map((p) => p.name).join(', ')}
        </div>
      )}

      <div className="bg-[#0a1a0d] rounded-xl overflow-hidden border border-[#1e3d23]">
        {isLoading ? (
          <TableSkeleton rows={pageSize} cols={5} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#162a1a] border-b-2 border-[#d4af37]">
                <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên</th>
                <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Loại</th>
                <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá</th>
                <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tồn kho</th>
                <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.id} className={`border-b border-[#1e3d23] hover:bg-[#162a1a] transition-colors ${i % 2 === 1 ? 'bg-[#0d1a0f]' : ''}`}>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-[#e2e8f0]">{p.name}</span>
                      {p.product_type === 'composite' && (
                        <span className="text-xs bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30 px-1.5 py-0.5 rounded">
                          Chế biến
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.category === 'drink'
                      ? <span className="bg-[#14532d] text-green-400 text-xs px-2 py-0.5 rounded-full border-0">🥤 Đồ uống</span>
                      : p.category === 'food'
                      ? <span className="bg-[#292524] text-orange-400 text-xs px-2 py-0.5 rounded-full border-0">🍜 Đồ ăn</span>
                      : <span className="bg-[#1e3d23] text-gray-400 text-xs px-2 py-0.5 rounded-full border-0">Khác</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-green-400 font-semibold">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={p.stock_quantity <= p.min_stock_alert ? 'text-red-400 font-semibold' : 'text-[#e2e8f0]'}>
                      {p.stock_quantity} {p.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" className="text-[#d4af37] hover:text-yellow-300 h-7 text-xs px-2"
                      onClick={() => { setSelected(p); setStockQty(0); setStockNote(''); setStockCostPrice(''); setMode('stock') }}>
                      Nhập kho
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[#6b7280] hover:text-white h-7 text-xs px-2"
                      onClick={() => {
                        setSelected(p)
                        setForm({ name: p.name, category: p.category, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert, product_type: p.product_type ?? 'stock' })
                        setMode('edit')
                      }}>
                      Sửa
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 text-xs px-2"
                      onClick={() => deactivateMutation.mutate(p.id)}>
                      Xoá
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={productTotal}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />

      <Dialog open={mode === 'create' || mode === 'edit'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-[#162a1a] border-[#1e3d23] text-white">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Loại sản phẩm</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="stock"
                    checked={form.product_type === 'stock'}
                    onChange={() => setForm({ ...form, product_type: 'stock' })}
                    className="accent-[#d4af37]"
                  />
                  <span className="text-sm text-white">Hàng nhập</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="composite"
                    checked={form.product_type === 'composite'}
                    onChange={() => setForm({ ...form, product_type: 'composite' })}
                    className="accent-[#d4af37]"
                  />
                  <span className="text-sm text-white">Chế biến</span>
                </label>
              </div>
            </div>
            <div><Label>Tên</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Giá (đồng)</Label>
              <Input type="number" className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <div><Label>Đơn vị</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Cảnh báo tồn dưới</Label>
              <Input type="number" className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.min_stock_alert}
                onChange={(e) => setForm({ ...form, min_stock_alert: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} className="border-[#1e3d23] text-[#6b7280]">Huỷ</Button>
            <Button className="bg-[#d4af37] text-[#0d1f12] font-bold"
              onClick={() => mode === 'create' ? createMutation.mutate() : updateMutation.mutate()}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'stock'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-[#162a1a] border-[#1e3d23] text-white">
          <DialogHeader>
            <DialogTitle>Nhập kho — {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#6b7280]">
              Tồn hiện tại: <span className="text-white">{selected?.stock_quantity} {selected?.unit}</span>
            </p>
            <div>
              <Label>Số lượng nhập thêm</Label>
              <Input type="number" className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={stockQty}
                onChange={(e) => setStockQty(Number(e.target.value))} />
            </div>
            <div>
              <Label>Giá nhập (đ/đơn vị) — tuỳ chọn</Label>
              <Input type="number" className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1"
                placeholder="Để trống nếu không cần theo dõi"
                value={stockCostPrice}
                onChange={(e) => setStockCostPrice(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={stockNote}
                onChange={(e) => setStockNote(e.target.value)} />
            </div>
            {stockQty > 0 && (
              <p className="text-sm text-green-400">
                Tồn sau khi nhập: {(selected?.stock_quantity ?? 0) + stockQty} {selected?.unit}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} className="border-[#1e3d23] text-[#6b7280]">Huỷ</Button>
            <Button className="bg-[#d4af37] text-[#0d1f12] font-bold" onClick={() => stockMutation.mutate()}>
              Nhập kho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
