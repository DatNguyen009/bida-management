import { useState, FormEvent, useEffect } from 'react'
import { toast } from 'sonner'
import { useThemeStore } from '../stores/themeStore'
import bgV1 from '../assets/bg-v1.jpg'
import bgV2 from '../assets/bg-v2.jpg'

interface Props {
  onLogin: (allowedScreens: string[], role: string, username: string) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const theme = useThemeStore((s) => s.theme)
  const bgImage = theme === 'v1' ? bgV1 : bgV2

  useEffect(() => {
    let bg = document.getElementById('bida-bg')
    if (!bg) {
      bg = document.createElement('div')
      bg.id = 'bida-bg'
      document.body.insertBefore(bg, document.body.firstChild)
    }
    bg.style.backgroundImage = `url(${bgImage})`
    bg.className = theme
    let overlay = document.getElementById('bida-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'bida-overlay'
      document.body.insertBefore(overlay, document.body.firstChild)
    }
    overlay.className = theme
  }, [bgImage, theme])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await window.api.auth.login(username, password)
      toast.success('Đăng nhập thành công')
      onLogin(result.allowedScreens, result.role, result.username)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại. Kiểm tra lại thông tin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="relative bg-white/[0.08] backdrop-blur-xl border border-white/20 p-8 rounded-2xl w-96 space-y-5 shadow-2xl" style={{boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 20px 60px rgba(0,0,0,0.4)'}}>
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎱</div>
          <h1 className="text-2xl font-bold text-[#d4af37]">Bida Manager</h1>
          <p className="text-[#6b7280] text-sm mt-1">Đăng nhập để tiếp tục</p>
        </div>

        <div>
          <label className="text-[#d4af37] text-xs uppercase tracking-widest block mb-1.5">Tài khoản</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            className="w-full backdrop-blur-xl bg-white/[0.07] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4af37] transition-colors"
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
            className="w-full backdrop-blur-xl bg-white/[0.07] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4af37] transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-gold"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
