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
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div
          className={`theme-bg theme-bg-${theme}`}
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <p className="text-gray-500 text-sm relative z-10">Đang tải...</p>
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
    <div className="flex h-screen text-white overflow-hidden relative">
      <div
        className={`theme-bg theme-bg-${theme}`}
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      {/* Sidebar */}
      <aside className="glass-sidebar w-48 flex-shrink-0 flex flex-col relative z-10">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#d4af37] flex items-center justify-center text-sm flex-shrink-0">🎱</div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Bida</div>
            <div className="text-[#555353] text-[10px]">Manager</div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 mb-2">
          <div className="flex items-center gap-2 bg-white/[0.07] border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-[#555353] text-xs">🔍</span>
            <span className="text-[#555353] text-xs">Tìm kiếm...</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 overflow-y-auto space-y-4 py-2">
          {/* Workspace section */}
          <div>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#444242]">Workspace</p>
            {visibleNavItems.filter(i => !['reports'].includes(i.page)).map(({ page, label, icon }) => (
              <button
                key={page}
                onClick={() => setView({ page: page as NavPage } as View)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2.5 mb-0.5
                  ${currentPage === page
                    ? 'glass-nav-active text-white font-medium'
                    : 'text-white/40 hover:bg-white/[0.06] hover:text-white/80'
                  }`}
              >
                <span className="text-sm w-4 text-center">{icon}</span>
                <span>{label}</span>
                {currentPage === page && <span className="ml-auto w-1 h-4 rounded-full bg-[#d4af37]" />}
              </button>
            ))}
          </div>

          {/* Manage section */}
          {(isOwner || visibleNavItems.some(i => i.page === 'reports')) && (
            <div>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#444242]">Quản lý</p>
              {visibleNavItems.filter(i => ['reports'].includes(i.page)).map(({ page, label, icon }) => (
                <button
                  key={page}
                  onClick={() => setView({ page: page as NavPage } as View)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2.5 mb-0.5
                    ${currentPage === page
                      ? 'glass-nav-active text-white font-medium'
                      : 'text-white/40 hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                >
                  <span className="text-sm w-4 text-center">{icon}</span>
                  <span>{label}</span>
                  {currentPage === page && <span className="ml-auto w-1 h-4 rounded-full bg-[#d4af37]" />}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-white/[0.08] space-y-0.5">
          <button
            onClick={() => setView({ page: 'settings' })}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2.5
              ${currentPage === 'settings'
                ? 'glass-nav-active text-white font-medium'
                : 'text-white/40 hover:bg-white/[0.06] hover:text-white/80'
              }`}
          >
            <span className="text-sm w-4 text-center">⚙</span>
            <span>Cài đặt</span>
            {currentPage === 'settings' && <span className="ml-auto w-1 h-4 rounded-full bg-[#d4af37]" />}
          </button>
          {/* User row */}
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mt-1">
            <div className="w-6 h-6 rounded-full bg-[#d4af37] flex items-center justify-center text-[#0f0e0f] text-[10px] font-bold flex-shrink-0">
              {username ? username[0].toUpperCase() : 'O'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{username || 'Owner'}</p>
              <p className="text-[10px] text-[#555353] capitalize">{role}</p>
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
              className="text-[#555353] hover:text-red-400 transition-colors text-xs"
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
      <main className="flex-1 overflow-auto p-6">
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
