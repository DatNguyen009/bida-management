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
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-500 text-sm">Đang tải...</p>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLogin={() => setAuthState('authenticated')} />
  }

  const handleCheckout = (
    session: Session & { table_name: string; hourly_rate: number },
    playAmount: number
  ) => {
    setView({ page: 'invoice', session, playAmount })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <button
          className="text-xl font-bold text-green-400"
          onClick={() => setView({ page: 'dashboard' })}
        >
          🎱 Bida Manager
        </button>
        <button onClick={() => setView({ page: 'products' })} className="text-sm text-white hover:text-gray-200">Sản phẩm</button>
        <button onClick={() => setView({ page: 'stock' })} className="text-sm text-white hover:text-gray-200">Kho</button>
        <button onClick={() => setView({ page: 'invoices' })} className="text-sm text-white hover:text-gray-200">Hóa đơn</button>
        <button onClick={() => setView({ page: 'customers' })} className="text-sm text-white hover:text-gray-200">Khách hàng</button>
        <button onClick={() => setView({ page: 'reports' })} className="text-sm text-white hover:text-gray-200">Báo cáo</button>
        <button onClick={() => setView({ page: 'settings' })} className="text-sm text-white hover:text-gray-200 ml-auto">Cài đặt</button>
        <button
          onClick={async () => {
            await window.api.auth.logout()
            setAuthState('unauthenticated')
            setView({ page: 'dashboard' })
          }}
          className="text-sm text-red-400 hover:text-red-300"
        >
          Đăng xuất
        </button>
      </nav>
      <main className="p-6">
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
