import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import CreateAgentModal from '../components/CreateAgentModal'

interface Agent {
  id: string
  name: string
  username: string
  account_status: string
  phone: string | null
  last_login_at: string | null
}

export default function AgentListPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await api.get('/agents')
      setAgents(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="font-bold text-lg">Bida Admin</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800">Đăng xuất</button>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700">Quản lý Agent</h2>
          <button onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            + Tạo agent
          </button>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Đang tải...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3">Tên quán</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Đăng nhập lần cuối</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-gray-600">{a.username}</td>
                    <td className="px-4 py-3 text-gray-600">{a.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        a.account_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {a.account_status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {a.last_login_at ? new Date(a.last_login_at).toLocaleDateString('vi') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/agents/${a.id}`)}
                        className="text-blue-600 hover:underline text-xs">Chi tiết</button>
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Chưa có agent nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {showModal && (
        <CreateAgentModal onCreated={fetchAgents} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
