import { useState, useEffect } from 'react'
import type { BidaTable } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-sm"
      >
        <h2 className="text-lg font-bold mb-4">
          {table ? 'Chỉnh sửa bàn' : 'Thêm bàn mới'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Tên bàn</Label>
            <Input
              className="mt-1 bg-gray-800 border-gray-600"
              placeholder="VD: Bàn 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label>Giá/giờ (đồng)</Label>
            <Input
              type="number"
              className="mt-1 bg-gray-800 border-gray-600"
              placeholder="VD: 50000"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 bg-green-700 hover:bg-green-600">
              Lưu
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-gray-600"
              onClick={onClose}
            >
              Hủy
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
