import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BidaTable } from '../types'
import { useSessionStore } from '../stores/sessionStore'
import TableCard from '../components/TableCard'
import OpenSessionModal from '../components/OpenSessionModal'
import { api } from '../lib/ipc'

interface Props {
  onViewSession: (tableId: number) => void
}

export default function Dashboard({ onViewSession }: Props) {
  const queryClient = useQueryClient()
  const setActiveSessions = useSessionStore((s) => s.setActiveSessions)
  const [selectedTable, setSelectedTable] = useState<BidaTable | null>(null)

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
    mutationFn: ({ tableId, phone: _phone }: { tableId: number; phone: string | null }) =>
      api().sessions.create(tableId, null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      setSelectedTable(null)
    },
  })

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
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onOpen={setSelectedTable}
            onView={onViewSession}
          />
        ))}
      </div>
      <OpenSessionModal
        table={selectedTable}
        onConfirm={async (tableId, phone) => {
          await openSessionMutation.mutateAsync({ tableId, phone })
        }}
        onClose={() => setSelectedTable(null)}
      />
    </div>
  )
}
