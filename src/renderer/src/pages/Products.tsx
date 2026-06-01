import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Product, Category } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Pagination from '../components/Pagination'
import TableSkeleton from '../components/TableSkeleton'

type ModalMode = 'create' | 'edit' | 'stock' | null

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'products' | 'categories'>('products')
  const [mode, setMode] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', category_id: 0, price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' as 'stock' | 'composite' })
  const [stockQty, setStockQty] = useState(0)
  const [stockNote, setStockNote] = useState('')
  const [stockCostPrice, setStockCostPrice] = useState<number | ''>('')
  const [recipeItems, setRecipeItems] = useState<{ ingredientId: number; ingredientName: string; quantity: number }[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [catForm, setCatForm] = useState({ name: '', icon: '📦' })
  const [catMode, setCatMode] = useState<'create' | 'edit' | null>(null)
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)

  const { data: productResult, isLoading } = useQuery({
    queryKey: ['products', page, pageSize],
    queryFn: () => api().products.getPage({ page, pageSize }),
  })
  const products = productResult?.data ?? []
  const productTotal = productResult?.total ?? 0

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => window.api.categories.getAll(),
  })

  const { data: existingRecipe = [] } = useQuery({
    queryKey: ['recipe', selected?.id],
    queryFn: () => selected ? window.api.recipes.get(selected.id) : Promise.resolve([]),
    enabled: !!selected && selected.product_type === 'composite',
  })

  useEffect(() => {
    if (mode === 'edit' && selected?.product_type === 'composite' && existingRecipe.length > 0) {
      setRecipeItems(existingRecipe.map((r) => ({
        ingredientId: r.ingredient_id,
        ingredientName: r.ingredient_name,
        quantity: r.quantity,
      })))
    }
    if (mode === 'create') {
      setRecipeItems([])
    }
  }, [mode, existingRecipe])

  const createMutation = useMutation({
    mutationFn: () => api().products.create({ ...form, price: Number(form.price), product_type: form.product_type }),
    onSuccess: async (product) => {
      if (product && form.product_type === 'composite' && recipeItems.length > 0) {
        await window.api.recipes.save(product.id, recipeItems.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })))
      }
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setMode(null)
      toast.success('Đã tạo sản phẩm')
    },
    onError: () => toast.error('Tạo sản phẩm thất bại'),
  })

  const updateMutation = useMutation({
    mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price), product_type: form.product_type }) : Promise.resolve(null),
    onSuccess: async () => {
      if (selected && form.product_type === 'composite') {
        await window.api.recipes.save(selected.id, recipeItems.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })))
      }
      queryClient.invalidateQueries({ queryKey: ['products', selected?.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setMode(null)
      toast.success('Đã cập nhật sản phẩm')
    },
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

  const createCatMutation = useMutation({
    mutationFn: () => window.api.categories.create(catForm),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); setCatMode(null); toast.success('Đã tạo category') },
    onError: () => toast.error('Tên category đã tồn tại'),
  })

  const updateCatMutation = useMutation({
    mutationFn: () => selectedCat ? window.api.categories.update(selectedCat.id, catForm) : Promise.resolve(null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); setCatMode(null); toast.success('Đã cập nhật category') },
    onError: () => toast.error('Tên category đã tồn tại'),
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: number) => window.api.categories.delete(id),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['categories'] })
        toast.success('Đã xoá category')
      } else {
        toast.error(`Có ${res.productCount} sản phẩm đang dùng category này, không thể xoá`)
      }
    },
  })

  const lowStockProducts = products.filter((p) => {
    const qty = p.product_type === 'composite' ? (p.effective_stock ?? 0) : p.stock_quantity
    return qty <= p.min_stock_alert
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#d4af37]">Quản lý sản phẩm</h1>
        <div className="flex gap-1 backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-lg p-1">
          <button
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'products' ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-[#6b7280] hover:text-white'}`}
            onClick={() => setTab('products')}
          >
            Danh sách
          </button>
          <button
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'categories' ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-[#6b7280] hover:text-white'}`}
            onClick={() => setTab('categories')}
          >
            Category
          </button>
        </div>
      </div>

      {tab === 'products' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => { setForm({ name: '', category_id: categories[0]?.id ?? 0, price: 0, unit: 'lon', min_stock_alert: 5, product_type: 'stock' }); setMode('create') }}
              className="btn-gold"
            >
              + Thêm sản phẩm
            </Button>
          </div>

          {lowStockProducts.length > 0 && (
            <div className="bg-[#2d1515] border border-red-800 rounded-xl p-3 mb-4 text-red-400 font-medium">
              ⚠️ Sắp hết hàng: {lowStockProducts.map((p) => p.name).join(', ')}
            </div>
          )}

          <div className="bg-white/[0.04] rounded-xl overflow-hidden border border-white/10">
            {isLoading ? (
              <TableSkeleton rows={pageSize} cols={6} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.06] border-b-2 border-[#d4af37]">
                    <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên</th>
                    <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Loại</th>
                    <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá nhập</th>
                    <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giá bán</th>
                    <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tồn kho</th>
                    <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id} className={`border-b border-white/10 hover:bg-white/[0.06] transition-colors ${i % 2 === 1 ? 'bg-white/[0.03]' : ''}`}>
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
                        <span className="bg-white/10 text-[#e2e8f0] text-xs px-2 py-0.5 rounded-full">
                          {p.category_icon} {p.category_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[#6b7280] font-mono text-sm">
                        {p.cost_price != null ? formatCurrency(p.cost_price) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-green-400 font-semibold">{formatCurrency(p.price)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.product_type === 'composite' ? (
                          <span className={`${(p.effective_stock ?? 0) <= p.min_stock_alert ? 'text-red-400 font-semibold' : 'text-[#e2e8f0]'}`}>
                            {p.effective_stock != null ? p.effective_stock : '—'} {p.unit}
                            <span className="ml-1 text-[10px] text-[#6b7280]">có thể làm</span>
                          </span>
                        ) : (
                          <span className={p.stock_quantity <= p.min_stock_alert ? 'text-red-400 font-semibold' : 'text-[#e2e8f0]'}>
                            {p.stock_quantity} {p.unit}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button size="sm" variant="ghost" className="text-[#d4af37] hover:text-yellow-300 h-7 text-xs px-2"
                          onClick={() => { setSelected(p); setStockQty(0); setStockNote(''); setStockCostPrice(''); setMode('stock') }}>
                          Nhập kho
                        </Button>
                        <Button size="sm" variant="ghost" className="text-[#6b7280] hover:text-white h-7 text-xs px-2"
                          onClick={() => {
                            setSelected(p)
                            setForm({ name: p.name, category_id: p.category_id, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert, product_type: p.product_type ?? 'stock' })
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
        </div>
      )}

      {tab === 'categories' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              className="btn-gold"
              onClick={() => { setCatForm({ name: '', icon: '📦' }); setSelectedCat(null); setCatMode('create') }}
            >
              + Thêm category
            </Button>
          </div>
          <div className="bg-white/[0.04] rounded-xl overflow-hidden border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.06] border-b-2 border-[#d4af37]">
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Icon</th>
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên</th>
                  <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => (
                  <tr key={cat.id} className={`border-b border-white/10 hover:bg-white/[0.06] transition-colors ${i % 2 === 1 ? 'bg-white/[0.03]' : ''}`}>
                    <td className="px-4 py-3 text-2xl">{cat.icon}</td>
                    <td className="px-4 py-3 text-[#e2e8f0] font-medium">{cat.name}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" className="text-[#6b7280] hover:text-white h-7 text-xs px-2"
                        onClick={() => { setSelectedCat(cat); setCatForm({ name: cat.name, icon: cat.icon }); setCatMode('edit') }}>
                        Sửa
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 text-xs px-2"
                        onClick={() => deleteCatMutation.mutate(cat.id)}>
                        Xoá
                      </Button>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-[#6b7280]">Chưa có category nào</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {(catMode === 'create' || catMode === 'edit') && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCatMode(null)} />
              <div className="modal-glass relative w-full max-w-sm mx-4 p-6 overflow-hidden">
                <div className="mb-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-lg">{catForm.icon || '📦'}</div>
                    <h2 className="text-base font-bold text-white">{catMode === 'create' ? 'Thêm category' : 'Sửa category'}</h2>
                  </div>
                </div>
                <div className="mb-5 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}} />
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Icon (1 emoji)</label>
                    <input className="input-glass w-full px-4 py-2.5 text-2xl" value={catForm.icon}
                      onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} maxLength={2} autoFocus />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Tên category</label>
                    <input className="input-glass w-full px-4 py-2.5 text-sm" value={catForm.name}
                      onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="btn-glass flex-1" onClick={() => setCatMode(null)}>Huỷ</button>
                  <button className="btn-gold flex-1"
                    onClick={() => catMode === 'create' ? createCatMutation.mutate() : updateCatMutation.mutate()}>
                    {catMode === 'create' ? '＋ Thêm' : '✓ Lưu'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(mode === 'create' || mode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMode(null)} />
          <div className="modal-glass relative w-full max-w-md mx-4 p-6 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">{mode === 'create' ? '＋' : '✎'}</div>
                <h2 className="text-base font-bold text-white">{mode === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</h2>
              </div>
            </div>
            <div className="mb-5 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}} />

            <div className="space-y-4 mb-4">
              {/* Loại sản phẩm */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại sản phẩm</label>
                <div className="flex gap-4">
                  {(['stock','composite'] as const).map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={type} checked={form.product_type === type}
                        onChange={() => setForm({ ...form, product_type: type })} className="accent-[#d4af37]" />
                      <span className="text-sm text-white">{type === 'stock' ? 'Hàng nhập' : 'Chế biến'}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Category */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Category</label>
                <select className="input-glass w-full px-4 py-2.5 text-sm" value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
                  {categories.map((cat) => <option key={cat.id} value={cat.id} style={{background:'#1a1a1a'}}>{cat.icon} {cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Tên</label>
                <input className="input-glass w-full px-4 py-2.5 text-sm" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Giá (đồng)</label>
                <input type="number" className="input-glass w-full px-4 py-2.5 text-sm" value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Đơn vị</label>
                  <input className="input-glass w-full px-4 py-2.5 text-sm" value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                </div>
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Cảnh báo tồn</label>
                  <input type="number" className="input-glass w-full px-4 py-2.5 text-sm" value={form.min_stock_alert}
                    onChange={(e) => setForm({ ...form, min_stock_alert: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            {/* Recipe section */}
            {form.product_type === 'composite' && (
              <div className="border-t border-white/10 pt-4 mb-4">
                <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold mb-3">Nguyên liệu</p>
                <div className="space-y-2">
                  {recipeItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-sm text-white flex-1">{item.ingredientName}</span>
                      <input type="number" min={0.01} step={0.01}
                        className="input-glass w-20 px-2 py-1.5 text-sm text-center"
                        value={item.quantity}
                        onChange={(e) => { const u=[...recipeItems]; u[idx]={...u[idx],quantity:Number(e.target.value)}; setRecipeItems(u) }} />
                      <button className="text-red-400 hover:text-red-300 px-1 text-sm"
                        onClick={() => setRecipeItems(recipeItems.filter((_,i)=>i!==idx))}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Select value="" onValueChange={(productId) => {
                    const p = products.find((pr) => pr.id === Number(productId))
                    if (p && !recipeItems.find((r) => r.ingredientId === p.id))
                      setRecipeItems([...recipeItems, { ingredientId: p.id, ingredientName: p.name, quantity: 1 }])
                  }}>
                    <SelectTrigger className="input-glass w-full text-sm h-9">
                      <SelectValue placeholder="+ Thêm nguyên liệu..." />
                    </SelectTrigger>
                    <SelectContent style={{background:'rgba(14,12,16,0.95)',border:'1px solid rgba(255,255,255,0.15)'}}>
                      {products.filter((p) => p.product_type === 'stock' && !recipeItems.find((r) => r.ingredientId === p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={String(p.id)} className="text-white">
                            {p.name} (tồn: {p.stock_quantity} {p.unit})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button className="btn-glass flex-1" onClick={() => setMode(null)}>Huỷ</button>
              <button className="btn-gold flex-1"
                onClick={() => mode === 'create' ? createMutation.mutate() : updateMutation.mutate()}>
                {mode === 'create' ? '＋ Thêm' : '✓ Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'stock' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMode(null)} />
          <div className="modal-glass relative w-full max-w-sm mx-4 p-6 overflow-hidden">
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">📦</div>
                <h2 className="text-base font-bold text-white">Nhập kho</h2>
              </div>
              <p className="text-white/35 text-xs ml-11">{selected?.name} · Tồn: {selected?.stock_quantity} {selected?.unit}</p>
            </div>
            <div className="mb-5 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}} />
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Số lượng nhập thêm</label>
                <input type="number" className="input-glass w-full px-4 py-2.5 text-sm" value={stockQty}
                  onChange={(e) => setStockQty(Number(e.target.value))} autoFocus />
                {stockQty > 0 && (
                  <p className="text-xs text-green-400 mt-1.5">
                    → Tồn sau nhập: {(selected?.stock_quantity ?? 0) + stockQty} {selected?.unit}
                  </p>
                )}
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Giá nhập (đ/đv) — tuỳ chọn</label>
                <input type="number" className="input-glass w-full px-4 py-2.5 text-sm"
                  placeholder="Để trống nếu không theo dõi"
                  value={stockCostPrice}
                  onChange={(e) => setStockCostPrice(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ghi chú</label>
                <input className="input-glass w-full px-4 py-2.5 text-sm" value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-glass flex-1" onClick={() => setMode(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={() => stockMutation.mutate()}>
                📦 Nhập kho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
