import { useState } from 'react'
import type { BidaTable } from '../types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <Dialog open={!!table} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Mở phiên chơi — {table.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-400">
            Giá: <span className="text-white">{formatCurrency(table.hourly_rate)}/giờ</span>
          </p>
          <div>
            <Label htmlFor="phone">Số điện thoại khách (không bắt buộc)</Label>
            <Input
              id="phone"
              className="mt-1 bg-gray-800 border-gray-600"
              placeholder="0901234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="btn-glass">Huỷ</Button>
          <Button onClick={handleConfirm} disabled={loading} className="btn-gold">
            {loading ? 'Đang mở...' : 'Bắt đầu chơi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
