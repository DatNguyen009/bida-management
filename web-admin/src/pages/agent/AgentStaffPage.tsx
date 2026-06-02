import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Staff { id: number; username: string; allowed_screens: string[]; is_active: boolean; created_at: string }

const SCREENS = [
  { key: 'dashboard', label: '🏠 Dashboard' }, { key: 'products', label: '📦 Sản phẩm' },
  { key: 'stock', label: '🏪 Kho' }, { key: 'invoices', label: '🧾 Hóa đơn' },
  { key: 'customers', label: '👥 Khách hàng' }, { key: 'reports', label: '📊 Báo cáo' },
  { key: 'settings', label: '⚙️ Cài đặt' }, { key: 'promotions', label: '🏷 Khuyến mãi' },
]

type Form = { username: string; password: string; allowedScreens: string[]; is_active: boolean }
const BLANK: Form = { username: '', password: '', allowedScreens: [], is_active: true }

export default function AgentStaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Staff | null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [error, setError] = useState('')

  async function load() { const { data } = await api.get('/agent/staff'); setStaff(data) }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(BLANK); setSelected(null); setModal('create'); setError('') }
  function openEdit(s: Staff) { setForm({ username: s.username, password: '', allowedScreens: s.allowed_screens, is_active: s.is_active }); setSelected(s); setModal('edit'); setError('') }

  function toggleScreen(key: string) {
    const screens = form.allowedScreens.includes(key) ? form.allowedScreens.filter(s => s !== key) : [...form.allowedScreens, key]
    setForm({ ...form, allowedScreens: screens })
  }

  async function save() {
    const body: Record<string, unknown> = { allowedScreens: form.allowedScreens, is_active: form.is_active }
    if (modal === 'create') { body.username = form.username; body.password = form.password }
    else if (form.password) body.password = form.password
    try {
      if (modal === 'create') await api.post('/agent/staff', body)
      else if (selected) await api.put(`/agent/staff/${selected.id}`, body)
      await load(); setModal(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error ?? 'Lỗi')
    }
  }

  async function del(id: number) {
    if (!confirm('Xoá nhân viên này?')) return
    await api.delete(`/agent/staff/${id}`); load()
  }

  return (
    <AgentLayout title="Nhân viên">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm nhân viên</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header"><tr><th>Username</th><th>Màn hình</th><th>Trạng thái</th><th className="text-right pr-4">Thao tác</th></tr></thead>
          <tbody>
            {staff.map((s, i) => (
              <tr key={s.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-white font-medium">{s.username}</td>
                <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{s.allowed_screens.slice(0,3).map(sc => <span key={sc} className="bg-yellow-500/20 text-yellow-300 text-[10px] px-1.5 py-0.5 rounded-full">{SCREENS.find(x=>x.key===sc)?.label.split(' ')[0] ?? sc}</span>)}{s.allowed_screens.length > 3 && <span className="text-white/40 text-xs">+{s.allowed_screens.length-3}</span>}</div></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active?'bg-green-500/20 text-green-300':'bg-white/10 text-white/40'}`}>{s.is_active?'Hoạt động':'Tạm khoá'}</span></td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(s)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => del(s.id)}>Xoá</button>
                </td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-white/30">Chưa có nhân viên</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-sm mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-white font-bold">{modal==='create'?'Thêm nhân viên':'Sửa nhân viên'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {modal === 'create' && (
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Username</label>
                <input className="input-glass" value={form.username} onChange={e => setForm({...form, username: e.target.value})} autoFocus />
              </div>
            )}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">{modal==='edit'?'Mật khẩu mới (để trống = không đổi)':'Mật khẩu'}</label>
              <input type="password" className="input-glass" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Màn hình được phép</label>
              <div className="space-y-2">
                {SCREENS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-yellow-500" checked={form.allowedScreens.includes(key)} onChange={() => toggleScreen(key)} />
                    <span className="text-white/80 text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-yellow-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <span className="text-white/80 text-sm">Đang hoạt động</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={modal==='create'&&(!form.username||!form.password)}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
