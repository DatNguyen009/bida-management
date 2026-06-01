import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/Session'
import InvoicePage from './pages/Invoice'
import ProductsPage from './pages/Products'
import CustomersPage from './pages/Customers'
import ReportsPage from './pages/Reports'
import SettingsPage from './pages/Settings'
import type { Session } from './types'
import LoginPage from './pages/LoginPage'
import StockHistoryPage from './pages/StockHistory'
import InvoiceListPage from './pages/InvoiceList'
import AccessDenied from './components/AccessDenied'
import bgV1 from './assets/bg-v1.jpg'
import bgV2 from './assets/bg-v2.jpg'
import { useThemeStore } from './stores/themeStore'

type View =
  | { page: 'dashboard' }
  | { page: 'session'; tableId: number }
  | { page: 'invoice'; session: Session & { table_name: string; hourly_rate: number }; playAmount: number }
  | { page: 'products' }
  | { page: 'stock' }
  | { page: 'invoices' }
  | { page: 'customers' }
  | { page: 'reports' }
  | { page: 'settings' }

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' })
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')
  const [allowedScreens, setAllowedScreens] = useState<string[]>([])
  const [role, setRole] = useState<string>('owner')
  const [username, setUsername] = useState<string>('')
  const isOwner = allowedScreens.length === 0
  const theme = useThemeStore((s) => s.theme)
  const bgImage = theme === 'v1' ? bgV1 : bgV2

  // Inject bg div directly into body (outside #root) — most reliable in Electron
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

  useEffect(() => {
    window.api.auth.getSession()
      .then((session) => {
        if (session) {
          setAllowedScreens(session.allowedScreens ?? [])
          setRole(session.role ?? 'owner')
          setUsername(session.username ?? '')
          setAuthState('authenticated')
        } else {
          setAuthState('unauthenticated')
        }
      })
      .catch(() => {
        setAuthState('unauthenticated')
      })
  }, [])

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Đang tải...</p>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLogin={(screens, r, u) => { setAllowedScreens(screens); setRole(r); setUsername(u); setAuthState('authenticated') }} />
  }

  const handleCheckout = (
    session: Session & { table_name: string; hourly_rate: number },
    playAmount: number
  ) => {
    setView({ page: 'invoice', session, playAmount })
  }

  type NavPage = Exclude<View['page'], 'session' | 'invoice'>
  const navItems: { page: NavPage; label: string; icon: string }[] = [
    { page: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { page: 'products', label: 'Sản phẩm', icon: '📦' },
    { page: 'stock', label: 'Kho', icon: '🏪' },
    { page: 'invoices', label: 'Hóa đơn', icon: '🧾' },
    { page: 'customers', label: 'Khách hàng', icon: '👥' },
    { page: 'reports', label: 'Báo cáo', icon: '📊' },
  ]

  const visibleNavItems = isOwner
    ? navItems
    : navItems.filter(({ page }) => allowedScreens.includes(page))

  function canAccess(page: string): boolean {
    return isOwner || page === 'session' || page === 'invoice' || allowedScreens.includes(page)
  }

  const currentPage: string = view.page === 'session' || view.page === 'invoice' ? 'dashboard' : view.page

  const pageLabels: Record<string, string> = {
    dashboard: 'Dashboard', products: 'Sản phẩm', stock: 'Kho',
    invoices: 'Hóa đơn', customers: 'Khách hàng', reports: 'Báo cáo',
    settings: 'Cài đặt', session: 'Phiên chơi', invoice: 'Thanh toán',
  }

  return (
    <div className="flex h-screen text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="glass-sidebar w-56 flex-shrink-0 flex flex-col relative">

        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 relative">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{background:'linear-gradient(135deg,#f0d060,#c49a10)', boxShadow:'0 4px 12px rgba(212,175,55,0.45),inset 0 1px 0 rgba(255,255,255,0.4)'}}>
            🎱
          </div>
          <div>
            <div className="text-white font-extrabold text-sm leading-tight tracking-tight">Bida</div>
            <div className="text-white/35 text-[10px] tracking-wide">Management System</div>
          </div>
          {/* bottom divider */}
          <div className="absolute bottom-0 left-4 right-4 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}} />
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 bg-white/[0.07] border border-white/10 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/[0.10] transition-colors"
            style={{boxShadow:'inset 0 1px 0 rgba(255,255,255,0.1)'}}>
            <span className="text-white/30 text-xs">⌕</span>
            <span className="text-white/30 text-xs flex-1">Tìm kiếm...</span>
            <span className="text-white/20 text-[10px] bg-white/[0.07] border border-white/10 rounded px-1.5 py-0.5">⌘K</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 overflow-y-auto py-2">

          {/* Workspace section */}
          <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/25">Workspace</p>
          {visibleNavItems.filter(i => !['reports'].includes(i.page)).map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => setView({ page: page as NavPage } as View)}
              className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2.5 mb-0.5
                ${currentPage === page
                  ? 'glass-nav-active text-white font-semibold'
                  : 'text-white/45 hover:bg-white/[0.07] hover:text-white/85'
                }`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0
                ${currentPage === page ? 'bg-white/15' : 'bg-white/[0.05]'}`}
                style={{transition:'background 0.18s ease'}}>
                {icon}
              </span>
              <span className="flex-1">{label}</span>
            </button>
          ))}

          {/* Divider */}
          <div className="my-2 mx-2 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)'}} />

          {/* Manage section */}
          {(isOwner || visibleNavItems.some(i => i.page === 'reports')) && (
            <>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/25">Quản lý</p>
              {visibleNavItems.filter(i => ['reports'].includes(i.page)).map(({ page, label, icon }) => (
                <button
                  key={page}
                  onClick={() => setView({ page: page as NavPage } as View)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-all flex items-center gap-2.5 mb-0.5
                    ${currentPage === page
                      ? 'glass-nav-active text-white font-semibold'
                      : 'text-white/45 hover:bg-white/[0.07] hover:text-white/85'
                    }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0
                    ${currentPage === page ? 'bg-white/15' : 'bg-white/[0.05]'}`}>
                    {icon}
                  </span>
                  <span className="flex-1">{label}</span>
                </button>
              ))}
            </>
          )}

          {/* Settings */}
          <div className="my-2 mx-2 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)'}} />
          <button
            onClick={() => setView({ page: 'settings' })}
            className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-all flex items-center gap-2.5
              ${currentPage === 'settings'
                ? 'glass-nav-active text-white font-semibold'
                : 'text-white/45 hover:bg-white/[0.07] hover:text-white/85'
              }`}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0
              ${currentPage === 'settings' ? 'bg-white/15' : 'bg-white/[0.05]'}`}>
              ⚙️
            </span>
            <span className="flex-1">Cài đặt</span>
          </button>
        </nav>

        {/* Status pill */}
        <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)'}}>
          <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 status-pulse"
            style={{boxShadow:'0 0 6px rgba(74,222,128,0.8)'}} />
          <span className="text-white/55 text-[11px] flex-1">Quán đang mở</span>
        </div>

        {/* Footer user */}
        <div className="px-3 pb-3 relative">
          <div className="absolute top-0 left-3 right-3 h-px" style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)'}} />
          <div className="sidebar-footer-card flex items-center gap-2.5 px-3 py-2.5 mt-2 cursor-pointer hover:bg-white/[0.09] transition-colors rounded-xl">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#0f0e0f] text-[11px] font-bold flex-shrink-0"
              style={{background:'linear-gradient(135deg,rgba(212,175,55,0.9),rgba(196,154,16,0.8))',border:'1px solid rgba(212,175,55,0.5)',boxShadow:'0 0 10px rgba(212,175,55,0.25)'}}>
              {username ? username[0].toUpperCase() : 'O'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-semibold truncate">{username || 'Owner'}</p>
              <p className="text-[10px] text-white/35 capitalize">{role}</p>
            </div>
            <button
              title="Đăng xuất"
              onClick={async () => {
                try { await window.api.auth.logout() } catch { /* always logout locally */ }
                setAllowedScreens([])
                setRole('owner')
                setUsername('')
                setAuthState('unauthenticated')
                setView({ page: 'dashboard' })
              }}
              className="text-white/25 hover:text-red-400 transition-colors text-sm pl-1"
            >↩</button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Topbar */}
        <header className="glass-topbar flex-shrink-0 h-12 flex items-center px-6 gap-2">
          <span className="text-[#555353] text-xs">Workspace</span>
          <span className="text-[#333131] text-xs">/</span>
          <span className="text-white text-xs font-medium">{pageLabels[currentPage] ?? currentPage}</span>
        </header>
      <main key={currentPage} className="page-enter flex-1 overflow-auto p-6">
        {view.page === 'dashboard' && (
          <Dashboard onViewSession={(tableId) => setView({ page: 'session', tableId })} />
        )}
        {view.page === 'session' && (
          <SessionPage
            tableId={view.tableId}
            onBack={() => setView({ page: 'dashboard' })}
            onCheckout={handleCheckout}
          />
        )}
        {view.page === 'invoice' && (
          <InvoicePage
            session={view.session}
            playAmount={view.playAmount}
            onComplete={() => setView({ page: 'dashboard' })}
          />
        )}
        {view.page === 'products' && (
          canAccess('products')
            ? <ProductsPage />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
        {view.page === 'stock' && (
          canAccess('stock')
            ? <StockHistoryPage />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
        {view.page === 'invoices' && (
          canAccess('invoices')
            ? <InvoiceListPage role={role} username={username} />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
        {view.page === 'customers' && (
          canAccess('customers')
            ? <CustomersPage />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
        {view.page === 'reports' && (
          canAccess('reports')
            ? <ReportsPage />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
        {view.page === 'settings' && (
          canAccess('settings')
            ? <SettingsPage />
            : <AccessDenied onBack={() => setView({ page: 'dashboard' })} />
        )}
      </main>
      </div>
    </div>
  )
}
