import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Category { id: number; name: string; icon: string }

export default function AgentCategoriesPage() {
  const [cats, setCats] = useState<Category[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Category | null>(null)
  const [name, setName] = useState(''); const [icon, setIcon] = useState('📦')
  const [error, setError] = useState('')

  async function load() { const { data } = await api.get('/agent/categories'); setCats(data) }
  useEffect(() => { load() }, [])

  function openCreate() { setName(''); setIcon('📦'); setSelected(null); setModal('create'); setError('') }
  function openEdit(c: Category) { setName(c.name); setIcon(c.icon); setSelected(c); setModal('edit'); setError('') }

  async function save() {
    try {
      if (modal === 'create') await api.post('/agent/categories', { name, icon })
      else if (selected) await api.put(`/agent/categories/${selected.id}`, { name, icon })
      await load(); setModal(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error ?? 'Lỗi')
    }
  }

  async function del(id: number) {
    try { await api.delete(`/agent/categories/${id}`); load() }
    catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error ?? 'Không thể xoá')
    }
  }

  return (
    <AgentLayout title="Danh mục">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm danh mục</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cats.map(c => (
          <div key={c.id} className="glass-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{c.icon}</span>
              <span className="text-white font-medium text-sm">{c.name}</span>
            </div>
            <div className="flex gap-1">
              <button className="btn-glass text-xs" onClick={() => openEdit(c)}>✏️</button>
              <button className="btn-danger text-xs" onClick={() => del(c.id)}>✕</button>
            </div>
          </div>
        ))}
        {cats.length === 0 && <p className="col-span-4 text-center text-white/30 py-10">Chưa có danh mục</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-xs mx-4 p-6 space-y-4">
            <h2 className="text-white font-bold">{modal === 'create' ? 'Thêm danh mục' : 'Sửa danh mục'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Icon (emoji)</label>
              <input className="input-glass" value={icon} onChange={e => setIcon(e.target.value)} maxLength={4} />
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Tên danh mục</label>
              <input className="input-glass" value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={!name}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
