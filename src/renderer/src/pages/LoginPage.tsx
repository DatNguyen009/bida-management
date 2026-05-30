import { useState, FormEvent } from 'react'

interface Props {
  onLogin: () => void
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await window.api.auth.login(username, password)
      onLogin()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại. Kiểm tra lại thông tin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1f12]">
      <form onSubmit={handleSubmit} className="bg-[#0a1a0d] border-2 border-[#d4af37] p-8 rounded-2xl w-96 space-y-5 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎱</div>
          <h1 className="text-2xl font-bold text-[#d4af37]">Bida Manager</h1>
          <p className="text-[#6b7280] text-sm mt-1">Đăng nhập để tiếp tục</p>
        </div>

        {error && (
          <div className="bg-[#2d1515] border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="text-[#d4af37] text-xs uppercase tracking-widest block mb-1.5">Tài khoản</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            className="w-full bg-[#162a1a] border border-[#1e3d23] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4af37] transition-colors"
            placeholder="Nhập tên đăng nhập"
          />
        </div>

        <div>
          <label className="text-[#d4af37] text-xs uppercase tracking-widest block mb-1.5">Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-[#162a1a] border border-[#1e3d23] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4af37] transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#d4af37] text-[#0d1f12] font-bold py-3 rounded-xl text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
