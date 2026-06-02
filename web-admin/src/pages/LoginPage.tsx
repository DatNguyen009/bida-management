import { useState, FormEvent } from 'react'
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${BASE_URL}/auth/login`, { username, password })
      if (data.role !== 'master' && data.role !== 'agent') {
        setError('Tài khoản không có quyền truy cập')
        return
      }
      setAuth(data.accessToken, data.refreshToken, data.role, data.agentId ?? null)
      navigate(data.role === 'agent' ? '/agent' : '/')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="modal-glass p-8 w-80 space-y-5">
        <div className="text-center">
          <div className="text-3xl mb-2">🎱</div>
          <h1 className="text-xl font-bold text-white">Bida Admin</h1>
          <p className="text-white/40 text-xs mt-1">Đăng nhập để quản lý</p>
        </div>
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div>
          <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="input-glass" required autoFocus />
        </div>
        <div>
          <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Mật khẩu</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="input-glass" required />
        </div>
        <button type="submit" disabled={loading} className="btn-gold w-full">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
