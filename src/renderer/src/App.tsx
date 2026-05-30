import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
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

  useEffect(() => {
    window.api.auth.getSession()
      .then((session) => {
        setAuthState(session ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => {
        setAuthState('unauthenticated')
      })
  }, [])

  if (authState === 'checking') {
    return (
      <>
        <Toaster position="top-right" richColors theme="dark" />
        <div className="min-h-screen flex items-center justify-center bg-bida-bg">
          <p className="text-gray-500 text-sm">Đang tải...</p>
        </div>
      </>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <>
        <Toaster position="top-right" richColors theme="dark" />
        <LoginPage onLogin={() => setAuthState('authenticated')} />
      </>
    )
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

  const currentPage: string = view.page === 'session' || view.page === 'invoice' ? 'dashboard' : view.page

  return (
    <div className="flex h-screen bg-bida-bg text-white overflow-hidden">
      <Toaster position="top-right" richColors theme="dark" />
      {/* Sidebar */}
      <aside className="w-40 flex-shrink-0 bg-bida-sidebar border-r-2 border-[#d4af37] flex flex-col">
        <div className="px-4 py-4 border-b border-bida-border">
          <div className="text-[#d4af37] font-bold text-base">🎱 Bida</div>
          <div className="text-[#4b7a52] text-[10px] mt-0.5">Manager</div>
        </div>

        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => setView({ page: page as NavPage } as View)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2
                ${currentPage === page
                  ? 'bg-[#1e3d23] text-green-400 border-l-[3px] border-green-400 font-semibold'
                  : 'text-[#6b7280] hover:bg-bida-card hover:text-white border-l-[3px] border-transparent'
                }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="py-3 px-2 border-t border-bida-border flex flex-col gap-0.5">
          <button
            onClick={() => setView({ page: 'settings' })}
            className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2
              ${currentPage === 'settings'
                ? 'bg-[#1e3d23] text-green-400 border-l-[3px] border-green-400 font-semibold'
                : 'text-[#6b7280] hover:bg-bida-card hover:text-white border-l-[3px] border-transparent'
              }`}
          >
            <span>⚙</span><span>Cài đặt</span>
          </button>
          <button
            onClick={async () => {
              await window.api.auth.logout()
              setAuthState('unauthenticated')
              setView({ page: 'dashboard' })
            }}
            className="w-full text-left px-3 py-2 rounded-md text-xs text-red-400 hover:bg-[#2d1515] hover:text-red-300 transition-colors flex items-center gap-2 border-l-[3px] border-transparent"
          >
            <span>↩</span><span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
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
        {view.page === 'products' && <ProductsPage />}
        {view.page === 'stock' && <StockHistoryPage />}
        {view.page === 'invoices' && <InvoiceListPage />}
        {view.page === 'customers' && <CustomersPage />}
        {view.page === 'reports' && <ReportsPage />}
        {view.page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
