import { useState } from 'react'
import type { BidaTable } from '../types'
import { formatCurrency } from '../lib/utils'

interface Props {
  table: BidaTable | null
  onConfirm: (tableId: number, customerId: number | null) => Promise<void>
  onClose: () => void
}

export default function OpenSessionModal({ table, onConfirm, onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  if (!table) return null

  const handleConfirm = async () => {
    setLoading(true)
    let customerId: number | null = null
    if (phone.trim()) {
      const existing = await window.api.customers.findByPhone(phone.trim())
      if (existing) {
        customerId = existing.id
      } else {
        const name = prompt('Khách hàng mới. Nhập tên:') ?? phone.trim()
        const newCustomer = await window.api.customers.create({
          name, phone: phone.trim(), email: null, notes: null,
        })
        customerId = newCustomer?.id ?? null
      }
    }
    await onConfirm(table.id, customerId)
    setLoading(false)
    setPhone('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="modal-glass relative w-full max-w-sm mx-4 p-6 overflow-hidden">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">🎱</div>
            <h2 className="text-base font-bold text-white">Mở phiên chơi</h2>
          </div>
          <p className="text-white/40 text-xs ml-11">{table.name} · {formatCurrency(table.hourly_rate)}/giờ</p>
        </div>

        {/* Divider */}
        <div className="mb-5 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}} />

        {/* Body */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">
              Số điện thoại khách
            </label>
            <input
              className="input-glass w-full px-4 py-2.5 text-sm"
              placeholder="0901234567 (không bắt buộc)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-glass flex-1">Huỷ</button>
          <button onClick={handleConfirm} disabled={loading} className="btn-gold flex-1">
            {loading ? 'Đang mở...' : '▶ Bắt đầu chơi'}
          </button>
        </div>
      </div>
    </div>
  )
}
