import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Product } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'

type ModalMode = 'create' | 'edit' | 'stock' | null

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5 })
  const [stockQty, setStockQty] = useState(0)
  const [stockNote, setStockNote] = useState('')

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api().products.getAll(),
  })

  const createMutation = useMutation({
    mutationFn: () => api().products.create({ ...form, price: Number(form.price), category: form.category as Product['category'] }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
  })

  const updateMutation = useMutation({
    mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), category: form.category as Product['category'] }) : Promise.resolve(null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
  })

  const stockMutation = useMutation({
    mutationFn: () => selected ? api().products.adjustStock(selected.id, 'in', stockQty, stockNote) : Promise.resolve(null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => api().products.update(id, { is_active: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const lowStockProducts = products.filter((p) => p.stock_quantity <= p.min_stock_alert)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Quản lý sản phẩm</h1>
        <Button onClick={() => { setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5 }); setMode('create') }}
          className="bg-green-700 hover:bg-green-600">
          + Thêm sản phẩm
        </Button>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-red-900 border border-red-500 rounded-lg p-3 mb-4">
          <p className="text-red-300 font-medium">⚠️ Sắp hết hàng: {lowStockProducts.map((p) => p.name).join(', ')}</p>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-right p-3">Giá</th>
              <th className="text-right p-3">Tồn kho</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="p-3">{p.name}</td>
                <td className="p-3">
                  <Badge variant="outline" className="text-xs">
                    {p.category === 'drink' ? '🥤 Đồ uống' : p.category === 'food' ? '🍜 Đồ ăn' : 'Khác'}
                  </Badge>
                </td>
                <td className="p-3 text-right text-green-400">{formatCurrency(p.price)}</td>
                <td className="p-3 text-right">
                  <span className={p.stock_quantity <= p.min_stock_alert ? 'text-red-400' : ''}>
                    {p.stock_quantity} {p.unit}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                  <Button size="sm" variant="outline" className="border-gray-600 h-7 text-xs"
                    onClick={() => { setSelected(p); setStockQty(0); setStockNote(''); setMode('stock') }}>
                    Nhập kho
                  </Button>
                  <Button size="sm" variant="outline" className="border-gray-600 h-7 text-xs"
                    onClick={() => {
                      setSelected(p)
                      setForm({ name: p.name, category: p.category, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert })
                      setMode('edit')
                    }}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400 h-7 text-xs"
                    onClick={() => deactivateMutation.mutate(p.id)}>
                    Xoá
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={mode === 'create' || mode === 'edit'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Tên</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Giá (đồng)</Label>
              <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <div><Label>Đơn vị</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Cảnh báo tồn dưới</Label>
              <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={form.min_stock_alert}
                onChange={(e) => setForm({ ...form, min_stock_alert: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} className="border-gray-600">Huỷ</Button>
            <Button className="bg-green-700 hover:bg-green-600"
              onClick={() => mode === 'create' ? createMutation.mutate() : updateMutation.mutate()}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'stock'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Nhập kho — {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Tồn hiện tại: <span className="text-white">{selected?.stock_quantity} {selected?.unit}</span></p>
            <div><Label>Số lượng nhập thêm</Label>
              <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={stockQty}
                onChange={(e) => setStockQty(Number(e.target.value))} /></div>
            <div><Label>Ghi chú</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={stockNote}
                onChange={(e) => setStockNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} className="border-gray-600">Huỷ</Button>
            <Button className="bg-green-700 hover:bg-green-600" onClick={() => stockMutation.mutate()}>
              Nhập kho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
