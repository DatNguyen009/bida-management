import { useState } from 'react'
import { api } from '../lib/api'

interface Props {
  agentId: string
  onClose: () => void
}

export default function ResetPasswordModal({ agentId, onClose }: Props) {
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(`/agents/${agentId}/reset-password`)
      setNewPassword(data.password)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Reset thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80 space-y-4">
        {newPassword ? (
          <>
            <h2 className="font-bold text-lg">Password mới</h2>
            <p className="text-sm text-gray-600">Gửi cho agent (chỉ hiển thị một lần):</p>
            <div className="bg-gray-50 rounded p-3 font-mono text-sm break-all">{newPassword}</div>
            <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded text-sm">Đóng</button>
          </>
        ) : (
          <>
            <h2 className="font-bold text-lg">Reset password</h2>
            <p className="text-sm text-gray-600">Tạo password mới và vô hiệu tất cả session hiện tại?</p>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 border py-2 rounded text-sm">Hủy</button>
              <button onClick={handleReset} disabled={loading}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm disabled:opacity-50">
                {loading ? 'Đang reset...' : 'Reset'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
