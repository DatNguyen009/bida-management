import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Product { id: number; name: string; category_name: string | null; category_icon: string | null; price: number; stock_quantity: number; unit: string; is_active: boolean; product_type: string }
interface Category { id: number; name: string; icon: string }

type Form = { name: string; category_id: string; price: string; unit: string; min_stock_alert: string; product_type: string; is_active: boolean }
const BLANK: Form = { name: '', category_id: '', price: '', unit: 'cái', min_stock_alert: '5', product_type: 'stock', is_active: true }

export default function AgentProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [error, setError] = useState('')

  async function load() {
    const [p, c] = await Promise.all([api.get('/agent/products'), api.get('/agent/categories')])
    setProducts(p.data); setCategories(c.data)
  }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(BLANK); setSelected(null); setModal('create'); setError('') }
  function openEdit(p: Product) {
    setForm({ name: p.name, category_id: String(p.category_name ? categories.find(c => c.name === p.category_name)?.id ?? '' : ''), price: String(p.price), unit: p.unit, min_stock_alert: '5', product_type: p.product_type, is_active: p.is_active })
    setSelected(p); setModal('edit'); setError('')
  }

  async function save() {
    const body = { name: form.name, category_id: form.category_id ? Number(form.category_id) : null, price: Number(form.price), unit: form.unit, min_stock_alert: Number(form.min_stock_alert), product_type: form.product_type, is_active: form.is_active }
    try {
      if (modal === 'create') await api.post('/agent/products', body)
      else if (selected) await api.put(`/agent/products/${selected.id}`, body)
      await load(); setModal(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error ?? 'Lỗi')
    }
  }

  async function del(id: number) {
    if (!confirm('Xoá sản phẩm này?')) return
    await api.delete(`/agent/products/${id}`); load()
  }

  return (
    <AgentLayout title="Sản phẩm">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm sản phẩm</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header">
            <tr><th>Tên</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th className="text-right pr-4">Thao tác</th></tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-white/90 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-white/50 text-xs">{p.category_icon} {p.category_name ?? '—'}</td>
                <td className="px-4 py-3 text-white">{p.price.toLocaleString('vi-VN')}đ</td>
                <td className="px-4 py-3 text-white/70">{p.stock_quantity} {p.unit}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active?'bg-green-500/20 text-green-300':'bg-white/10 text-white/40'}`}>{p.is_active?'Hoạt động':'Ẩn'}</span></td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(p)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => del(p.id)}>Xoá</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">Chưa có sản phẩm</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-white font-bold">{modal === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {([['Tên sản phẩm', 'name', 'text'], ['Giá (đồng)', 'price', 'number'], ['Đơn vị', 'unit', 'text']] as [string, keyof Form, string][]).map(([label, key, type]) => (
              <div key={key}>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">{label}</label>
                <input type={type} className="input-glass" value={form[key] as string} onChange={e => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Danh mục</label>
              <select className="input-glass" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Không có —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-yellow-500" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <span className="text-white/80 text-sm">Đang hoạt động</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={!form.name || !form.price}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
