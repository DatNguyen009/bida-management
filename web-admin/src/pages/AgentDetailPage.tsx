import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import ResetPasswordModal from '../components/ResetPasswordModal'

interface AgentDetail {
  id: string; name: string; username: string
  phone: string | null; address: string | null
  status: string; account_status: string
  created_at: string; last_login_at: string | null
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    api.get(`/agents/${id}`).then(({ data }) => setAgent(data))
  }, [id])

  async function toggleStatus() {
    if (!agent) return
    const newStatus = agent.account_status === 'active' ? 'suspended' : 'active'
    setToggling(true)
    try {
      await api.patch(`/agents/${id}`, { status: newStatus })
      setAgent({ ...agent, status: newStatus, account_status: newStatus })
    } finally {
      setToggling(false)
    }
  }

  if (!agent) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Đang tải...</div>

  const isSuspended = agent.account_status === 'suspended'
  const infoRows: [string, string][] = [
    ['Tên quán', agent.name],
    ['Username', agent.username],
    ['SĐT', agent.phone ?? '—'],
    ['Địa chỉ', agent.address ?? '—'],
    ['Ngày tạo', new Date(agent.created_at).toLocaleDateString('vi')],
    ['Đăng nhập lần cuối', agent.last_login_at ? new Date(agent.last_login_at).toLocaleDateString('vi') : '—'],
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800 text-sm">← Quay lại</button>
        <h1 className="font-bold text-lg">{agent.name}</h1>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-3 text-sm">
          <h2 className="font-semibold text-gray-700 mb-2">Thông tin quán</h2>
          {infoRows.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-gray-500 w-44 shrink-0">{label}</span>
              <span>{value}</span>
            </div>
          ))}
          <div className="flex gap-2">
            <span className="text-gray-500 w-44 shrink-0">Trạng thái</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {isSuspended ? 'Suspended' : 'Active'}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={toggleStatus} disabled={toggling}
            className={`px-4 py-2 rounded text-sm font-medium disabled:opacity-50 ${isSuspended ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-yellow-500 text-white hover:bg-yellow-600'}`}>
            {isSuspended ? 'Kích hoạt' : 'Tạm khóa'}
          </button>
          <button onClick={() => setShowReset(true)}
            className="px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700">
            Reset password
          </button>
        </div>
      </main>
      {showReset && <ResetPasswordModal agentId={agent.id} onClose={() => setShowReset(false)} />}
    </div>
  )
}
