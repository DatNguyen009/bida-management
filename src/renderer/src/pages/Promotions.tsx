// src/renderer/src/pages/Promotions.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Promotion } from '../types'
import { formatCurrency } from '../lib/utils'

type PromoTab = 'all' | 'voucher' | 'time_slot' | 'event'
type PromoForm = {
  name: string; type: 'voucher' | 'time_slot' | 'event'
  discount_type: 'percent' | 'fixed'; discount_value: number
  apply_to: 'total' | 'play' | 'items'; max_discount: number | null
  code: string; max_uses: number; valid_to: string
  days_of_week: number[]; time_from: string; time_to: string
  valid_from: string; is_active: boolean
}

const BLANK_FORM: PromoForm = {
  name: '', type: 'time_slot', discount_type: 'percent', discount_value: 10,
  apply_to: 'total', max_discount: null, code: '', max_uses: 0, valid_to: '',
  days_of_week: [1,2,3,4,5], time_from: '14:00', time_to: '17:00',
  valid_from: '', is_active: true,
}

const DAY_LABELS = ['T2','T3','T4','T5','T6','T7','CN']
const TYPE_LABELS: Record<string, string> = { voucher: 'Voucher', time_slot: 'Khung giờ', event: 'Sự kiện' }
const TYPE_BADGES: Record<string, string> = {
  voucher: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  time_slot: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  event: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

export default function PromotionsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<PromoTab>('all')
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Promotion | null>(null)
  const [form, setForm] = useState<PromoForm>(BLANK_FORM)

  const { data: promos = [] } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => window.api.promotions.getAll(),
  })

  const createMutation = useMutation({
    mutationFn: () => window.api.promotions.create(buildInput()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['promotions'] }); setModalMode(null); toast.success('Đã tạo khuyến mãi') },
    onError: () => toast.error('Tên hoặc mã đã tồn tại'),
  })

  const updateMutation = useMutation({
    mutationFn: () => selected ? window.api.promotions.update(selected.id, buildInput()) : Promise.reject(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['promotions'] }); setModalMode(null); toast.success('Đã cập nhật') },
    onError: () => toast.error('Lưu thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.promotions.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['promotions'] }); toast.success('Đã xoá') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      window.api.promotions.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  })

  function buildInput() {
    return {
      name: form.name, type: form.type, discount_type: form.discount_type,
      discount_value: form.discount_value, apply_to: form.apply_to,
      max_discount: form.discount_type === 'percent' && form.max_discount ? form.max_discount : null,
      code: form.type === 'voucher' ? form.code.toUpperCase() : null,
      max_uses: form.type === 'voucher' ? (form.max_uses || null) : null,
      days_of_week: form.type === 'time_slot' ? form.days_of_week : null,
      time_from: form.type === 'time_slot' ? form.time_from : null,
      time_to: form.type === 'time_slot' ? form.time_to : null,
      valid_from: form.type === 'event' ? form.valid_from : null,
      valid_to: (form.type === 'event' ? form.valid_to : null) ||
                (form.type === 'voucher' && form.valid_to ? form.valid_to : null),
      is_active: form.is_active,
    }
  }

  function openCreate() {
    setForm(BLANK_FORM); setSelected(null); setModalMode('create')
  }

  function openEdit(p: Promotion) {
    setForm({
      name: p.name, type: p.type, discount_type: p.discount_type,
      discount_value: p.discount_value, apply_to: p.apply_to,
      max_discount: p.max_discount, code: p.code ?? '',
      max_uses: p.max_uses ?? 0, valid_to: p.valid_to ?? '',
      days_of_week: p.days_of_week ?? [1,2,3,4,5],
      time_from: p.time_from ?? '14:00', time_to: p.time_to ?? '17:00',
      valid_from: p.valid_from ?? '', is_active: p.is_active,
    })
    setSelected(p); setModalMode('edit')
  }

  function toggleDay(day: number) {
    const days = form.days_of_week.includes(day)
      ? form.days_of_week.filter(d => d !== day)
      : [...form.days_of_week, day].sort()
    setForm({ ...form, days_of_week: days })
  }

  function formatDiscount(p: Promotion) {
    const val = p.discount_type === 'percent'
      ? `${p.discount_value}%${p.max_discount ? ` (tối đa ${formatCurrency(p.max_discount)})` : ''}`
      : formatCurrency(p.discount_value)
    const scope = p.apply_to === 'play' ? ' (giờ chơi)' : p.apply_to === 'items' ? ' (đồ uống)' : ''
    return `−${val}${scope}`
  }

  const filtered = activeTab === 'all' ? promos : promos.filter(p => p.type === activeTab)
  const TABS: { key: PromoTab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'voucher', label: 'Voucher' },
    { key: 'time_slot', label: 'Khung giờ' },
    { key: 'event', label: 'Sự kiện' },
  ]

  const canSave = form.name.trim() &&
    form.discount_value > 0 &&
    (form.type !== 'voucher' || form.code.trim()) &&
    (form.type !== 'time_slot' || (form.days_of_week.length > 0 && form.time_from && form.time_to)) &&
    (form.type !== 'event' || (form.valid_from && form.valid_to))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#d4af37]">Khuyến mãi</h1>
        <button className="btn-gold" onClick={openCreate}>+ Thêm KM</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-lg p-1 mb-4 w-fit">
        {TABS.map(({ key, label }) => (
          <button key={key}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === key ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white hover:text-[#d4af37]'}`}
            onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="backdrop-blur-xl bg-white/[0.04] rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.06] border-b-2 border-[#d4af37]">
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Loại</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Giảm</th>
              <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Chi tiết</th>
              <th className="text-center px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Bật/Tắt</th>
              <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                <td className="px-4 py-3 text-white/90 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${TYPE_BADGES[p.type]}`}>
                    {TYPE_LABELS[p.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/80">{formatDiscount(p)}</td>
                <td className="px-4 py-3 text-white/55 text-xs">
                  {p.type === 'voucher' && `Mã: ${p.code}${p.max_uses ? ` · ${p.used_count}/${p.max_uses} lượt` : ' · Không giới hạn'}`}
                  {p.type === 'time_slot' && p.days_of_week && `${p.days_of_week.map(d => DAY_LABELS[d-1]).join(', ')} · ${p.time_from?.slice(0,5)}–${p.time_to?.slice(0,5)}`}
                  {p.type === 'event' && `${p.valid_from} → ${p.valid_to}`}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleMutation.mutate({ id: p.id, is_active: !p.is_active })}
                    className={`w-10 h-5 rounded-full transition-colors relative ${p.is_active ? 'bg-[#d4af37]' : 'bg-white/20'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.is_active ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button className="btn-glass text-xs" onClick={() => openEdit(p)}>Sửa</button>
                  <button className="btn-danger text-xs" onClick={() => { if (confirm('Xoá khuyến mãi này?')) deleteMutation.mutate(p.id) }}>Xoá</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40">
                {activeTab === 'all' ? 'Chưa có chương trình khuyến mãi nào' : `Chưa có KM loại ${TYPE_LABELS[activeTab]}`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalMode(null)} />
          <div className="modal-glass relative w-full max-w-md mx-4 p-6 overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">🏷</div>
                <h2 className="text-base font-bold text-white">
                  {modalMode === 'create' ? 'Thêm khuyến mãi' : 'Sửa khuyến mãi'}
                </h2>
              </div>
            </div>
            <div className="mb-4 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }} />

            <div className="space-y-4">
              {/* Tên */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Tên chương trình</label>
                <input className="input-glass w-full px-4 py-2.5 text-sm" autoFocus
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              {/* Loại */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['time_slot', 'voucher', 'event'] as const).map(t => (
                    <button key={t}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.type === t ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white/70 hover:text-white'}`}
                      onClick={() => setForm({ ...form, type: t })}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voucher fields */}
              {form.type === 'voucher' && (
                <>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Mã code</label>
                    <input className="input-glass w-full px-4 py-2.5 text-sm uppercase"
                      value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="VD: BIDA20" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Số lần dùng tối đa</label>
                      <input type="number" min={0} className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.max_uses} onChange={e => setForm({ ...form, max_uses: Number(e.target.value) })}
                        placeholder="0 = không giới hạn" />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ngày hết hạn</label>
                      <input type="date" className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {/* Time slot fields */}
              {form.type === 'time_slot' && (
                <>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Ngày áp dụng</label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, idx) => {
                        const day = idx + 1
                        const active = form.days_of_week.includes(day)
                        return (
                          <button key={day}
                            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${active ? 'bg-[#d4af37] text-[#0f0e0f] border-[#d4af37] font-bold' : 'border-white/10 text-white/50 hover:border-white/30'}`}
                            onClick={() => toggleDay(day)}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Từ</label>
                      <input type="time" className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.time_from} onChange={e => setForm({ ...form, time_from: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Đến</label>
                      <input type="time" className="input-glass w-full px-4 py-2.5 text-sm"
                        value={form.time_to} onChange={e => setForm({ ...form, time_to: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {/* Event fields */}
              {form.type === 'event' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Từ ngày</label>
                    <input type="date" className="input-glass w-full px-4 py-2.5 text-sm"
                      value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Đến ngày</label>
                    <input type="date" className="input-glass w-full px-4 py-2.5 text-sm"
                      value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)' }} />

              {/* Discount config */}
              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Loại giảm</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['percent', 'fixed'] as const).map(t => (
                    <button key={t}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.discount_type === t ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white/70 hover:text-white'}`}
                      onClick={() => setForm({ ...form, discount_type: t })}>
                      {t === 'percent' ? '% Phần trăm' : 'Cố định đồng'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">
                    Giá trị {form.discount_type === 'percent' ? '(%)' : '(đồng)'}
                  </label>
                  <input type="number" min={0} className="input-glass w-full px-4 py-2.5 text-sm"
                    value={form.discount_value} onChange={e => setForm({ ...form, discount_value: Number(e.target.value) })} />
                </div>
                {form.discount_type === 'percent' && (
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Giảm tối đa (đồng)</label>
                    <input type="number" min={0} className="input-glass w-full px-4 py-2.5 text-sm"
                      value={form.max_discount ?? ''} placeholder="Không giới hạn"
                      onChange={e => setForm({ ...form, max_discount: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                )}
              </div>

              <div>
                <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Áp dụng vào</label>
                <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
                  {(['total', 'play', 'items'] as const).map(t => (
                    <button key={t}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${form.apply_to === t ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white/70 hover:text-white'}`}
                      onClick={() => setForm({ ...form, apply_to: t })}>
                      {t === 'total' ? 'Toàn đơn' : t === 'play' ? 'Giờ chơi' : 'Đồ uống'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="accent-[#d4af37] w-4 h-4"
                  checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                <span className="text-sm text-white/90">Kích hoạt ngay</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-glass flex-1" onClick={() => setModalMode(null)}>Huỷ</button>
              <button className="btn-gold flex-1" disabled={!canSave}
                onClick={() => modalMode === 'create' ? createMutation.mutate() : updateMutation.mutate()}>
                {modalMode === 'create' ? '＋ Thêm KM' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
