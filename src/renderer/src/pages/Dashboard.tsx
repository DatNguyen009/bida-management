import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import TableCard from '../components/TableCard'
import OpenSessionModal from '../components/OpenSessionModal'
import TableFormModal from '../components/TableFormModal'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'

interface Props {
  onViewSession: (tableId: number) => void
}

export default function Dashboard({ onViewSession }: Props) {
  const queryClient = useQueryClient()
  const setActiveSessions = useSessionStore((s) => s.setActiveSessions)
  const [selectedTable, setSelectedTable] = useState<BidaTable | null>(null)
  const [editingTable, setEditingTable] = useState<BidaTable | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api().tables.getAll(),
    refetchInterval: 30000,
  })

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => api().sessions.getActive(),
    refetchInterval: 60000,
  })

  const today = new Date().toISOString().slice(0, 10)

  const { data: summaryData = [] } = useQuery({
    queryKey: ['reports', 'summary', today],
    queryFn: () => api().reports.summary(today, today),
    refetchInterval: 60000,
  })

  const { data: todayInvoices } = useQuery({
    queryKey: ['invoices', 'today'],
    queryFn: () => window.api.invoices.getList({ fromDate: today, toDate: today, pageSize: 1 }),
    refetchInterval: 60000,
  })

  useEffect(() => {
    setActiveSessions(activeSessions)
  }, [activeSessions, setActiveSessions])

  const openSessionMutation = useMutation({
    mutationFn: ({ tableId, customerId }: { tableId: number; customerId: number | null }) =>
      api().sessions.create(tableId, customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      setSelectedTable(null)
    },
  })

  const createTableMutation = useMutation({
    mutationFn: ({ name, hourlyRate }: { name: string; hourlyRate: number }) =>
      window.api.tables.create(name, hourlyRate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      setFormOpen(false)
      setEditingTable(null)
    },
  })

  const updateTableMutation = useMutation({
    mutationFn: ({ tableId, name, hourlyRate }: { tableId: number; name: string; hourlyRate: number }) =>
      window.api.tables.update(tableId, name, hourlyRate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      setFormOpen(false)
      setEditingTable(null)
    },
  })

  const handleSave = (name: string, hourlyRate: number) => {
    if (editingTable) {
      updateTableMutation.mutate({ tableId: editingTable.id, name, hourlyRate })
    } else {
      createTableMutation.mutate({ name, hourlyRate })
    }
  }

  const handleEdit = (table: BidaTable) => {
    setEditingTable(table)
    setFormOpen(true)
  }

  const handleAddNew = () => {
    setEditingTable(null)
    setFormOpen(true)
  }

  const summary = (summaryData as Array<{ total_revenue: string; total_invoices: string }>)[0]
  const idleCount = tables.filter((t) => t.status === 'idle').length
  const playingCount = tables.filter((t) => t.status === 'playing').length

  const glassCard = 'bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 relative overflow-hidden'
  const glassCardInner = { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 32px rgba(0,0,0,0.15)' }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#d4af37]">Dashboard</h1>
          <p className="text-xs text-white/60 mt-0.5">Quản lý bàn bida</p>
        </div>
        <button
          onClick={handleAddNew}
          className="btn-gold"
          style={{boxShadow:'0 4px 12px rgba(212,175,55,0.35)'}}
        >
          + Thêm bàn
        </button>
      </div>

      {/* Stats — 4 cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Bàn đang chơi */}
        <div className={glassCard} style={{...glassCardInner, borderColor:'rgba(239,68,68,0.25)'}}>
          <div className="absolute inset-0 bg-red-500/[0.04] pointer-events-none" />
          <div className="text-white/70 text-xs mb-2">Bàn đang chơi</div>
          <div className="text-red-400 text-3xl font-extrabold leading-none">{playingCount}</div>
          <div className="text-white/60 text-xs mt-2">/ {tables.length} bàn</div>
        </div>

        {/* Doanh thu hôm nay */}
        <div className={glassCard} style={{...glassCardInner, borderColor:'rgba(212,175,55,0.25)'}}>
          <div className="absolute inset-0 bg-yellow-500/[0.04] pointer-events-none" />
          <div className="text-white/70 text-xs mb-2">Doanh thu hôm nay</div>
          <div className="text-[#d4af37] text-2xl font-extrabold leading-none truncate">
            {summary ? formatCurrency(Number(summary.total_revenue)) : '—'}
          </div>
          <div className="text-white/60 text-xs mt-2">Cập nhật mỗi phút</div>
        </div>

        {/* Khách hàng */}
        <div className={glassCard} style={{...glassCardInner, borderColor:'rgba(96,165,250,0.25)'}}>
          <div className="absolute inset-0 bg-blue-500/[0.04] pointer-events-none" />
          <div className="text-white/70 text-xs mb-2">Khách hàng</div>
          <div className="text-blue-400 text-3xl font-extrabold leading-none">{activeSessions.length}</div>
          <div className="text-white/60 text-xs mt-2">đang trong quán</div>
        </div>

        {/* Hóa đơn hôm nay */}
        <div className={glassCard} style={glassCardInner}>
          <div className="text-white/70 text-xs mb-2">Hóa đơn hôm nay</div>
          <div className="text-white text-3xl font-extrabold leading-none">
            {todayInvoices ? todayInvoices.total : summary?.total_invoices ?? '—'}
          </div>
          <div className="text-white/60 text-xs mt-2">đã thanh toán</div>
        </div>
      </div>

      {/* Table cards */}
      <div className="flex flex-col gap-3">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onOpen={setSelectedTable}
            onView={onViewSession}
            onEdit={handleEdit}
          />
        ))}
      </div>

      <OpenSessionModal
        table={selectedTable}
        onConfirm={async (tableId, customerId) => {
          await openSessionMutation.mutateAsync({ tableId, customerId })
        }}
        onClose={() => setSelectedTable(null)}
      />

      <TableFormModal
        isOpen={formOpen}
        table={editingTable}
        onSave={handleSave}
        onClose={() => { setFormOpen(false); setEditingTable(null) }}
      />
    </div>
  )
}
