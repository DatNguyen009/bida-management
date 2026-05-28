import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

interface Agent {
  id: string
  name: string
  phone: string | null
  address: string | null
  status: string
  username: string
  account_status: string
  last_login_at: string | null
}

interface AgentForm {
  name: string
  phone: string
  address: string
  username: string
}

const EMPTY_FORM: AgentForm = { name: '', phone: '', address: '', username: '' }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AgentManagement() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null)
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM)
  const [newPassword, setNewPassword] = useState<{ name: string; username: string; password: string } | null>(null)

  const { data: agents = [], isLoading, isError } = useQuery({
    queryKey: ['manage-agents'],
    queryFn: () => apiFetch<Agent[]>('/agents'),
  })

  const createMutation = useMutation({
    mutationFn: (body: AgentForm) => apiFetch<{ agentId: string; username: string; password: string }>('/agents', {
      method: 'POST', body: JSON.stringify(body),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['manage-agents'] })
      setShowCreate(false)
      setForm(EMPTY_FORM)
      setNewPassword({ name: form.name, username: data.username, password: data.password })
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AgentForm> }) =>
      apiFetch(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-agents'] })
      setEditAgent(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-agents'] })
      setDeleteAgent(null)
    },
  })

  const resetMutation = useMutation({
    mutationFn: (agent: Agent) => apiFetch<{ password: string }>(`/agents/${agent.id}/reset-password`, { method: 'POST' }),
    onSuccess: (data, agent) => {
      setNewPassword({ name: agent.name, username: agent.username, password: data.password })
    },
  })

  function openEdit(a: Agent) {
    setForm({ name: a.name, phone: a.phone ?? '', address: a.address ?? '', username: a.username })
    setEditAgent(a)
  }

  const activeAgents = agents.filter((a) => a.status !== 'inactive')
  const inactiveAgents = agents.filter((a) => a.status === 'inactive')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý quán</h1>
        <button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Thêm quán
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Đang tải...</div>}
      {isError && <div className="text-center py-12 text-red-500">Lỗi tải dữ liệu.</div>}

      {/* Active agents */}
      {activeAgents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Tên quán', 'Tài khoản', 'SĐT', 'Địa chỉ', 'Đăng nhập lần cuối', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeAgents.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.username}</td>
                  <td className="px-4 py-3 text-gray-500">{a.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{a.address ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(a.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(a)}
                        className="text-xs text-blue-600 hover:underline">Sửa</button>
                      <button onClick={() => resetMutation.mutate(a)}
                        disabled={resetMutation.isPending}
                        className="text-xs text-amber-600 hover:underline disabled:opacity-50">Đặt lại MK</button>
                      <button onClick={() => setDeleteAgent(a)}
                        className="text-xs text-red-500 hover:underline">Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeAgents.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
          Chưa có quán nào. Nhấn "+ Thêm quán" để tạo mới.
        </div>
      )}

      {/* Inactive agents */}
      {inactiveAgents.length > 0 && (
        <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <summary className="px-4 py-3 text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
            Quán đã vô hiệu hóa ({inactiveAgents.length})
          </summary>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {inactiveAgents.map((a) => (
                <tr key={a.id} className="opacity-50">
                  <td className="px-4 py-2 text-gray-600">{a.name}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{a.username}</td>
                  <td className="px-4 py-2 text-gray-400">{a.phone ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-400 flex-1" />
                  <td className="px-4 py-2">
                    <button onClick={() => editMutation.mutate({ id: a.id, body: { status: 'active' } as any })}
                      className="text-xs text-green-600 hover:underline">Kích hoạt lại</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Thêm quán mới" onClose={() => setShowCreate(false)}>
          <AgentForm
            form={form} setForm={setForm}
            showUsername
            error={createMutation.error?.message}
            loading={createMutation.isPending}
            onSubmit={() => createMutation.mutate(form)}
            submitLabel="Tạo quán"
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editAgent && (
        <Modal title={`Sửa: ${editAgent.name}`} onClose={() => setEditAgent(null)}>
          <AgentForm
            form={form} setForm={setForm}
            showUsername={false}
            error={editMutation.error?.message}
            loading={editMutation.isPending}
            onSubmit={() => editMutation.mutate({ id: editAgent.id, body: { name: form.name, phone: form.phone || undefined, address: form.address || undefined } })}
            submitLabel="Lưu thay đổi"
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteAgent && (
        <Modal title="Xác nhận xóa" onClose={() => setDeleteAgent(null)}>
          <p className="text-gray-700 mb-4">
            Vô hiệu hóa quán <strong>{deleteAgent.name}</strong>? Tài khoản <code className="bg-gray-100 px-1 rounded">{deleteAgent.username}</code> sẽ không thể đăng nhập nữa.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteAgent(null)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Hủy</button>
            <button onClick={() => deleteMutation.mutate(deleteAgent.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
            </button>
          </div>
          {deleteMutation.error && <p className="text-red-500 text-sm mt-2">{deleteMutation.error.message}</p>}
        </Modal>
      )}

      {/* New password display */}
      {newPassword && (
        <Modal title="Mật khẩu mới" onClose={() => setNewPassword(null)}>
          <p className="text-gray-600 text-sm mb-4">
            Ghi lại thông tin đăng nhập cho <strong>{newPassword.name}</strong>. Mật khẩu chỉ hiển thị một lần.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 font-mono text-sm">
            <div><span className="text-gray-500">Username:</span> <strong>{newPassword.username}</strong></div>
            <div><span className="text-gray-500">Password:</span> <strong className="text-blue-600 text-base">{newPassword.password}</strong></div>
          </div>
          <button onClick={() => setNewPassword(null)}
            className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            Đã ghi lại
          </button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function AgentForm({ form, setForm, showUsername, error, loading, onSubmit, submitLabel }: {
  form: AgentForm
  setForm: (f: AgentForm) => void
  showUsername: boolean
  error?: string
  loading: boolean
  onSubmit: () => void
  submitLabel: string
}) {
  return (
    <div className="space-y-3">
      <Field label="Tên quán *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
      {showUsername && (
        <Field label="Tên đăng nhập *" value={form.username} onChange={(v) => setForm({ ...form, username: v })} required />
      )}
      <Field label="SĐT" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      <Field label="Địa chỉ" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end pt-1">
        <button onClick={onSubmit} disabled={loading}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Đang lưu...' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}
