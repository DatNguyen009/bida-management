import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import AgentLayout from '../../components/AgentLayout'

interface Promo { id: number; name: string; type: string; discount_type: string; discount_value: number; apply_to: string; max_discount: number | null; code: string | null; max_uses: number | null; used_count: number; days_of_week: number[] | null; time_from: string | null; time_to: string | null; valid_from: string | null; valid_to: string | null; is_active: boolean }

const TYPE_LABELS: Record<string, string> = { voucher: 'Voucher', time_slot: 'Khung giờ', event: 'Sự kiện' }
const TYPE_COLORS: Record<string, string> = { voucher: 'bg-purple-500/20 text-purple-300', time_slot: 'bg-blue-500/20 text-blue-300', event: 'bg-amber-500/20 text-amber-300' }
const DAY_LABELS = ['T2','T3','T4','T5','T6','T7','CN']

type Form = { name: string; type: 'voucher'|'time_slot'|'event'; discount_type: 'percent'|'fixed'; discount_value: string; apply_to: string; max_discount: string; code: string; max_uses: string; valid_to: string; days_of_week: number[]; time_from: string; time_to: string; valid_from: string; is_active: boolean }
const BLANK: Form = { name: '', type: 'time_slot', discount_type: 'percent', discount_value: '10', apply_to: 'total', max_discount: '', code: '', max_uses: '0', valid_to: '', days_of_week: [1,2,3,4,5], time_from: '14:00', time_to: '17:00', valid_from: '', is_active: true }

export default function AgentPromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([])
  const [modal, setModal] = useState<'create'|'edit'|null>(null)
  const [selected, setSelected] = useState<Promo|null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [error, setError] = useState('')

  async function load() { const { data } = await api.get('/agent/promotions'); setPromos(data) }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(BLANK); setSelected(null); setModal('create'); setError('') }
  function openEdit(p: Promo) {
    setForm({ name: p.name, type: p.type as Form['type'], discount_type: p.discount_type as Form['discount_type'], discount_value: String(p.discount_value), apply_to: p.apply_to, max_discount: p.max_discount ? String(p.max_discount) : '', code: p.code ?? '', max_uses: p.max_uses ? String(p.max_uses) : '0', valid_to: p.valid_to ?? '', days_of_week: p.days_of_week ?? [1,2,3,4,5], time_from: p.time_from ?? '14:00', time_to: p.time_to ?? '17:00', valid_from: p.valid_from ?? '', is_active: p.is_active })
    setSelected(p); setModal('edit'); setError('')
  }

  function toggleDay(d: number) { const days = form.days_of_week.includes(d) ? form.days_of_week.filter(x=>x!==d) : [...form.days_of_week, d].sort(); setForm({...form, days_of_week: days}) }

  function buildInput() {
    return {
      name: form.name, type: form.type, discount_type: form.discount_type, discount_value: Number(form.discount_value),
      apply_to: form.apply_to, max_discount: form.max_discount ? Number(form.max_discount) : null,
      code: form.type==='voucher' ? form.code.toUpperCase() : null,
      max_uses: form.type==='voucher' ? (Number(form.max_uses)||null) : null,
      days_of_week: form.type==='time_slot' ? form.days_of_week : null,
      time_from: form.type==='time_slot' ? form.time_from : null,
      time_to: form.type==='time_slot' ? form.time_to : null,
      valid_from: form.type==='event' ? form.valid_from : null,
      valid_to: (form.type==='event' ? form.valid_to : null) || (form.type==='voucher' && form.valid_to ? form.valid_to : null),
      is_active: form.is_active,
    }
  }

  async function save() {
    try {
      if (modal==='create') await api.post('/agent/promotions', buildInput())
      else if (selected) await api.put(`/agent/promotions/${selected.id}`, buildInput())
      await load(); setModal(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error ?? 'Lỗi')
    }
  }

  async function toggle(p: Promo) { await api.put(`/agent/promotions/${p.id}`, { is_active: !p.is_active }); load() }
  async function del(id: number) { if (!confirm('Xoá?')) return; await api.delete(`/agent/promotions/${id}`); load() }

  const canSave = form.name && Number(form.discount_value) > 0 && (form.type !== 'voucher' || form.code) && (form.type !== 'time_slot' || form.days_of_week.length > 0) && (form.type !== 'event' || (form.valid_from && form.valid_to))

  return (
    <AgentLayout title="Khuyến mãi">
      <div className="flex justify-end mb-4">
        <button className="btn-gold" onClick={openCreate}>+ Thêm KM</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="gold-table-header"><tr><th>Tên</th><th>Loại</th><th>Giảm</th><th>Chi tiết</th><th className="text-center">Bật/Tắt</th><th className="text-right pr-4">Thao tác</th></tr></thead>
          <tbody>
            {promos.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/[0.05] ${i%2===1?'bg-white/[0.02]':''}`}>
                <td className="px-4 py-3 text-white/90 font-medium">{p.name}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[p.type]??''}`}>{TYPE_LABELS[p.type]}</span></td>
                <td className="px-4 py-3 text-white/80">{p.discount_type==='percent'?`${p.discount_value}%`:`${Number(p.discount_value).toLocaleString('vi-VN')}đ`}</td>
                <td className="px-4 py-3 text-white/50 text-xs">
                  {p.type==='voucher'&&`${p.code} · ${p.max_uses?`${p.used_count}/${p.max_uses}lượt`:'Không giới hạn'}`}
                  {p.type==='time_slot'&&p.days_of_week&&`${p.days_of_week.map(d=>DAY_LABELS[d-1]).join(',')} ${p.time_from?.slice(0,5)}–${p.time_to?.slice(0,5)}`}
                  {p.type==='event'&&`${p.valid_from}→${p.valid_to}`}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggle(p)} className={`w-10 h-5 rounded-full relative transition-colors ${p.is_active?'bg-yellow-500':'bg-white/20'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.is_active?'left-5':'left-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(p)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => del(p.id)}>Xoá</button>
                </td>
              </tr>
            ))}
            {promos.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">Chưa có khuyến mãi</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-glass relative w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-bold">{modal==='create'?'Thêm KM':'Sửa KM'}</h2>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Tên</label>
              <input className="input-glass" value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus />
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại</label>
              <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                {(['time_slot','voucher','event'] as const).map(t => (
                  <button key={t} className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.type===t?'bg-yellow-500 text-black font-bold':'text-white/60 hover:text-white'}`} onClick={() => setForm({...form, type: t})}>{TYPE_LABELS[t]}</button>
                ))}
              </div>
            </div>
            {form.type==='voucher' && (
              <><div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Mã code</label><input className="input-glass uppercase" value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="VD: BIDA20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Số lần dùng (0=∞)</label><input type="number" className="input-glass" value={form.max_uses} onChange={e => setForm({...form, max_uses: e.target.value})} /></div>
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Ngày HH</label><input type="date" className="input-glass" value={form.valid_to} onChange={e => setForm({...form, valid_to: e.target.value})} /></div>
              </div></>
            )}
            {form.type==='time_slot' && (
              <><div><label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ngày áp dụng</label>
                <div className="flex gap-1">{DAY_LABELS.map((l,i) => { const d=i+1; const on=form.days_of_week.includes(d); return <button key={d} className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${on?'bg-yellow-500 text-black border-yellow-500 font-bold':'border-white/10 text-white/50'}`} onClick={() => toggleDay(d)}>{l}</button> })}</div></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Từ</label><input type="time" className="input-glass" value={form.time_from} onChange={e => setForm({...form, time_from: e.target.value})} /></div>
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Đến</label><input type="time" className="input-glass" value={form.time_to} onChange={e => setForm({...form, time_to: e.target.value})} /></div>
              </div></>
            )}
            {form.type==='event' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Từ ngày</label><input type="date" className="input-glass" value={form.valid_from} onChange={e => setForm({...form, valid_from: e.target.value})} /></div>
                <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Đến ngày</label><input type="date" className="input-glass" value={form.valid_to} onChange={e => setForm({...form, valid_to: e.target.value})} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Loại giảm</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['percent','fixed'] as const).map(t => <button key={t} className={`flex-1 py-1.5 text-xs rounded-md ${form.discount_type===t?'bg-yellow-500 text-black font-bold':'text-white/60'}`} onClick={() => setForm({...form, discount_type: t})}>{t==='percent'?'%':'Cố định'}</button>)}
                </div>
              </div>
              <div><label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Giá trị</label><input type="number" className="input-glass" value={form.discount_value} onChange={e => setForm({...form, discount_value: e.target.value})} /></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-yellow-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <span className="text-white/80 text-sm">Kích hoạt</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-glass flex-1" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn-gold flex-1" onClick={save} disabled={!canSave}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </AgentLayout>
  )
}
