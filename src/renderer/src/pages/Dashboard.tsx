import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import TableCard from '../components/TableCard'
import OpenSessionModal from '../components/OpenSessionModal'
import TableFormModal from '../components/TableFormModal'
import { Button } from '@/components/ui/button'
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
        <p className="text-gray-400">Đang tải...</p>
      </div>
    )
  }

  const idleCount = tables.filter((t) => t.status === 'idle').length
  const playingCount = tables.filter((t) => t.status === 'playing').length

  return (
    <div>
      <div className="flex items-center gap-6 mb-6">
        <h1 className="text-2xl font-bold">Quản lý bàn</h1>
        <span className="text-sm text-green-400">{idleCount} bàn trống</span>
        <span className="text-sm text-red-400">{playingCount} bàn đang chơi</span>
        <Button
          size="sm"
          className="ml-auto bg-green-700 hover:bg-green-600"
          onClick={handleAddNew}
        >
          + Thêm bàn
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
        onClose={() => {
          setFormOpen(false)
          setEditingTable(null)
        }}
      />
    </div>
  )
}
