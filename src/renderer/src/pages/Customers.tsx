import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Customer } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', notes: '' })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api().customers.getAll(),
  })

  const { data: invoiceHistory = [] } = useQuery({
    queryKey: ['customers', selected?.id, 'invoices'],
    queryFn: () => selected ? api().customers.invoices(selected.id) : Promise.resolve([]),
    enabled: !!selected,
  })

  const createMutation = useMutation({
    mutationFn: () => api().customers.create({
      name: form.name, phone: form.phone,
      email: form.email || null, notes: form.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowCreate(false)
      setForm({ name: '', phone: '', email: '', notes: '' })
      toast.success('Đã tạo khách hàng')
    },
    onError: () => toast.error('Tạo khách hàng thất bại'),
  })

  const updateMutation = useMutation({
    mutationFn: () => window.api.customers.update(selected!.id, {
      name: editForm.name || undefined,
      email: editForm.email || null,
      notes: editForm.notes || null,
    }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      if (updated) setSelected(updated)
      setEditMode(false)
      toast.success('Đã cập nhật khách hàng')
    },
    onError: () => toast.error('Cập nhật khách hàng thất bại'),
  })

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#d4af37]">Khách hàng</h1>
          <Button onClick={() => setShowCreate(true)} className="bg-[#d4af37] text-[#0d1f12] font-bold text-sm px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors">
            + Thêm khách hàng
          </Button>
        </div>

        <Input
          className="mb-4 bg-[#162a1a] border-[#1e3d23] text-white"
          placeholder="Tìm theo tên hoặc SĐT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-2">
          {filtered.map((customer) => (
            <button
              key={customer.id}
              className={selected?.id === customer.id
                ? 'w-full text-left p-4 rounded-xl border bg-[#1e3d23] border-[#d4af37] transition-all'
                : 'w-full text-left p-4 rounded-xl border bg-[#162a1a] border-[#1e3d23] hover:bg-[#1e3d23] transition-all'}
              onClick={() => { setSelected(customer); setEditMode(false) }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-[#e2e8f0]">{customer.name}</p>
                  <p className="text-sm text-[#6b7280]">{customer.phone}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-[#7f3f00] text-yellow-300 text-xs">
                    {customer.points_balance} điểm
                  </Badge>
                  <p className="text-xs text-[#6b7280] mt-1">{customer.total_visits} lần</p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-[#6b7280] text-center py-8">Không tìm thấy khách hàng</p>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-[#162a1a] rounded-xl p-4 mb-4 border border-[#1e3d23]">
            <div className="flex justify-between items-start mb-1">
              <div className="flex-1 mr-2">
                {editMode ? (
                  <div className="space-y-2">
                    <Input
                      className="bg-[#0a1a0d] border-[#1e3d23] text-white text-sm"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Tên"
                    />
                    <Input
                      className="bg-[#0a1a0d] border-[#1e3d23] text-white text-sm"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      placeholder="Email"
                    />
                    <Input
                      className="bg-[#0a1a0d] border-[#1e3d23] text-white text-sm"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Ghi chú"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-green-700 hover:bg-green-600"
                        disabled={!editForm.name || updateMutation.isPending}
                        onClick={() => updateMutation.mutate()}>
                        Lưu
                      </Button>
                      <Button size="sm" variant="outline" className="border-[#1e3d23] text-[#6b7280]"
                        onClick={() => setEditMode(false)}>
                        Huỷ
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-[#e2e8f0]">{selected.name}</h2>
                    <p className="text-[#6b7280] text-sm">{selected.phone}</p>
                    {selected.email && <p className="text-[#6b7280] text-sm">{selected.email}</p>}
                  </>
                )}
              </div>
              {!editMode && (
                <Button size="sm" variant="outline" className="border-[#1e3d23] text-[#6b7280] text-xs"
                  onClick={() => {
                    setEditForm({ name: selected.name, email: selected.email ?? '', notes: selected.notes ?? '' })
                    setEditMode(true)
                  }}>
                  Sửa
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="bg-[#0a1a0d] rounded-lg p-3">
                <p className="text-2xl font-bold text-[#d4af37]">{selected.points_balance}</p>
                <p className="text-xs text-[#6b7280]">điểm</p>
              </div>
              <div className="bg-[#0a1a0d] rounded-lg p-3">
                <p className="text-2xl font-bold text-green-400">{selected.total_visits}</p>
                <p className="text-xs text-[#6b7280]">lần đến</p>
              </div>
            </div>

            <div className="mt-3 p-3 bg-[#0a1a0d] rounded-lg">
              <p className="text-xs text-[#6b7280]">Tổng chi tiêu</p>
              <p className="text-lg font-bold text-green-400">{formatCurrency(selected.total_spent)}</p>
            </div>

            {selected.notes && (
              <p className="mt-3 text-sm text-[#6b7280] italic">{selected.notes}</p>
            )}
          </div>

          <div className="bg-[#162a1a] rounded-xl p-4 border border-[#1e3d23]">
            <h3 className="font-semibold mb-3 text-[#e2e8f0]">Lịch sử hóa đơn</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(invoiceHistory as Array<{ id: number; invoice_number: string; final_amount: number; table_name: string; created_at: string }>).map((inv) => (
                <div key={inv.id} className="p-2 bg-[#0a1a0d] rounded text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6b7280]">#{inv.invoice_number}</span>
                    <span className="text-green-400">{formatCurrency(inv.final_amount)}</span>
                  </div>
                  <p className="text-xs text-[#6b7280]">
                    {inv.table_name} — {new Date(inv.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              ))}
              {invoiceHistory.length === 0 && (
                <p className="text-[#6b7280] text-xs">Chưa có hóa đơn</p>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="bg-[#162a1a] border-[#1e3d23] text-white">
          <DialogHeader>
            <DialogTitle>Thêm khách hàng mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Tên *</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Số điện thoại *</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Ghi chú</Label>
              <Input className="bg-[#0a1a0d] border-[#1e3d23] text-white mt-1" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-[#1e3d23] text-[#6b7280]">Huỷ</Button>
            <Button className="bg-[#d4af37] text-[#0d1f12] font-bold"
              disabled={!form.name || !form.phone}
              onClick={() => createMutation.mutate()}>
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
