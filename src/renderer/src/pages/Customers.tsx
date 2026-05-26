import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    },
  })

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Khách hàng</h1>
          <Button onClick={() => setShowCreate(true)} className="bg-green-700 hover:bg-green-600">
            + Thêm khách hàng
          </Button>
        </div>

        <Input
          className="mb-4 bg-gray-800 border-gray-600"
          placeholder="Tìm theo tên hoặc SĐT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-2">
          {filtered.map((customer) => (
            <button
              key={customer.id}
              className={`w-full text-left p-4 rounded-xl border transition-all
                ${selected?.id === customer.id
                  ? 'bg-green-900 border-green-500'
                  : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}
              onClick={() => setSelected(customer)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-gray-400">{customer.phone}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-yellow-700 text-yellow-200 text-xs">
                    {customer.points_balance} điểm
                  </Badge>
                  <p className="text-xs text-gray-400 mt-1">{customer.total_visits} lần</p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-500 text-center py-8">Không tìm thấy khách hàng</p>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-gray-900 rounded-xl p-4 mb-4">
            <h2 className="text-lg font-bold mb-1">{selected.name}</h2>
            <p className="text-gray-400 text-sm">{selected.phone}</p>
            {selected.email && <p className="text-gray-400 text-sm">{selected.email}</p>}

            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-2xl font-bold text-yellow-400">{selected.points_balance}</p>
                <p className="text-xs text-gray-400">điểm</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-400">{selected.total_visits}</p>
                <p className="text-xs text-gray-400">lần đến</p>
              </div>
            </div>

            <div className="mt-3 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-400">Tổng chi tiêu</p>
              <p className="text-lg font-bold text-green-400">{formatCurrency(selected.total_spent)}</p>
            </div>

            {selected.notes && (
              <p className="mt-3 text-sm text-gray-400 italic">{selected.notes}</p>
            )}
          </div>

          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="font-semibold mb-3">Lịch sử hóa đơn</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(invoiceHistory as Array<{ id: number; invoice_number: string; final_amount: number; table_name: string; created_at: string }>).map((inv) => (
                <div key={inv.id} className="p-2 bg-gray-800 rounded text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">#{inv.invoice_number}</span>
                    <span className="text-green-400">{formatCurrency(inv.final_amount)}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {inv.table_name} — {new Date(inv.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              ))}
              {invoiceHistory.length === 0 && (
                <p className="text-gray-500 text-xs">Chưa có hóa đơn</p>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Thêm khách hàng mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Tên *</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Số điện thoại *</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Ghi chú</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-gray-600">Huỷ</Button>
            <Button className="bg-green-700 hover:bg-green-600"
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
