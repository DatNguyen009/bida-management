import { useState, useEffect } from 'react'
import type { BidaTable } from '../types'

interface Props {
  isOpen: boolean
  table: BidaTable | null
  onSave: (name: string, hourlyRate: number) => void
  onClose: () => void
}

export default function TableFormModal({ isOpen, table, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [hourlyRate, setHourlyRate] = useState(50000)

  useEffect(() => {
    if (isOpen) {
      setName(table?.name ?? '')
      setHourlyRate(table?.hourly_rate ?? 50000)
    }
  }, [isOpen, table])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || hourlyRate <= 0) return
    onSave(name.trim(), hourlyRate)
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
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">
              {table ? '✎' : '＋'}
            </div>
            <h2 className="text-base font-bold text-white">
              {table ? 'Chỉnh sửa bàn' : 'Thêm bàn mới'}
            </h2>
          </div>
          {table && <p className="text-white/65 text-xs ml-11">ID #{table.id}</p>}
        </div>

        {/* Divider */}
        <div className="mb-5 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}} />

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Tên bàn</label>
            <input
              className="input-glass w-full px-4 py-2.5 text-sm"
              placeholder="VD: Bàn 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Giá / giờ (đồng)</label>
            <input
              type="number"
              className="input-glass w-full px-4 py-2.5 text-sm"
              placeholder="VD: 50000"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-glass flex-1">Hủy</button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="btn-gold flex-1"
          >
            {table ? '✓ Lưu thay đổi' : '＋ Thêm bàn'}
          </button>
        </div>
      </div>
    </div>
  )
}
