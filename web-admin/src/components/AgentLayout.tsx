import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const NAV_ITEMS = [
  { path: '/agent', label: 'Dashboard', icon: '🏠' },
  { path: '/agent/invoices', label: 'Hóa đơn', icon: '🧾' },
  { path: '/agent/edit-requests', label: 'Sửa HĐ', icon: '✏️' },
  { path: '/agent/reports', label: 'Báo cáo', icon: '📊' },
  { path: '/agent/products', label: 'Sản phẩm', icon: '📦' },
  { path: '/agent/categories', label: 'Danh mục', icon: '🗂' },
  { path: '/agent/promotions', label: 'Khuyến mãi', icon: '🏷' },
  { path: '/agent/staff', label: 'Nhân viên', icon: '👤' },
  { path: '/agent/settings', label: 'Cài đặt', icon: '⚙️' },
]

interface Props { children: ReactNode; title?: string }

export default function AgentLayout({ children, title }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, agentId } = useAuthStore()

  const isActive = (path: string) =>
    path === '/agent' ? location.pathname === '/agent' : location.pathname.startsWith(path)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="glass-sidebar w-52 flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#f0d060,#c49a10)', boxShadow: '0 4px 12px rgba(212,175,55,0.4)' }}>
            🎱
          </div>
          <div>
            <div className="text-white font-extrabold text-sm leading-tight">Bida</div>
            <div className="text-white/50 text-[10px]">Web Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <button key={path} onClick={() => navigate(path)}
              className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2.5 transition-all
                ${isActive(path)
                  ? 'glass-nav-active text-white font-semibold'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                }`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${isActive(path) ? 'bg-white/15' : 'bg-white/[0.05]'}`}>
                {icon}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-3">
          <div className="border-t border-white/[0.06] pt-3 flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs">Agent</p>
              <p className="text-white/30 text-[10px] truncate max-w-[120px]">{agentId?.slice(0,8)}...</p>
            </div>
            <button onClick={logout}
              className="text-white/30 hover:text-red-400 transition-colors text-sm px-2">↩</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="glass-topbar h-12 flex items-center px-6 gap-2 flex-shrink-0">
          <span className="text-white/40 text-xs">Agent Portal</span>
          {title && (<><span className="text-white/20 text-xs">/</span>
            <span className="text-white text-xs font-medium">{title}</span></>)}
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
