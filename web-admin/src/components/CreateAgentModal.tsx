import { useState, FormEvent } from 'react'
import { api } from '../lib/api'

interface Props {
  onCreated: () => void
  onClose: () => void
}

export default function CreateAgentModal({ onCreated, onClose }: Props) {
  const [form, setForm] = useState({ name: '', phone: '', address: '', username: '' })
  const [result, setResult] = useState<{ username: string; password: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/agents', form)
      setResult({ username: data.username, password: data.password })
      onCreated()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Tạo agent thất bại')
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { label: 'Tên quán *', key: 'name', required: true },
    { label: 'SĐT', key: 'phone', required: false },
    { label: 'Địa chỉ', key: 'address', required: false },
    { label: 'Username *', key: 'username', required: true },
  ] as const

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-96 space-y-4">
          <h2 className="font-bold text-lg">Tạo agent thành công</h2>
          <p className="text-sm text-gray-600">Gửi thông tin này cho chủ quán (chỉ hiển thị một lần):</p>
          <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div><span className="font-medium">Username:</span> {result.username}</div>
            <div><span className="font-medium">Password:</span> <span className="font-mono">{result.password}</span></div>
          </div>
          <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded text-sm">Đóng</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 w-96 space-y-3">
        <h2 className="font-bold text-lg">Tạo agent mới</h2>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {fields.map(({ label, key, required }) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input type="text" value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm" required={required} />
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border py-2 rounded text-sm">Hủy</button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded text-sm disabled:opacity-50">
            {loading ? 'Đang tạo...' : 'Tạo'}
          </button>
        </div>
      </form>
    </div>
  )
}
