import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import TableCard from '../components/TableCard'
import OpenSessionModal from '../components/OpenSessionModal'
import TableFormModal from '../components/TableFormModal'
import { api } from '../lib/ipc'

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#6b7280]">Đang tải...</p>
      </div>
    )
  }

  const idleCount = tables.filter((t) => t.status === 'idle').length
  const playingCount = tables.filter((t) => t.status === 'playing').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#d4af37]">Dashboard</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">Quản lý bàn bida</p>
        </div>
        <button
          onClick={handleAddNew}
          className="bg-[#d4af37] text-[#0d1f12] text-xs font-bold px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
        >
          + Thêm bàn
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 text-center">
          <div className="text-green-400 text-2xl font-bold">{idleCount}</div>
          <div className="text-[#6b7280] text-xs mt-1">Bàn trống</div>
        </div>
        <div className="bg-[#2d1515] border border-[#7f1d1d] rounded-xl p-4 text-center">
          <div className="text-red-400 text-2xl font-bold">{playingCount}</div>
          <div className="text-[#6b7280] text-xs mt-1">Đang chơi</div>
        </div>
        <div className="bg-[#162a1a] border border-[#d4af37] rounded-xl p-4 text-center">
          <div className="text-[#d4af37] text-2xl font-bold">{tables.length}</div>
          <div className="text-[#6b7280] text-xs mt-1">Tổng số bàn</div>
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
