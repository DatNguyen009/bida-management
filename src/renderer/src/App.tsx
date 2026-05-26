import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/Session'
import InvoicePage from './pages/Invoice'
import ProductsPage from './pages/Products'
import CustomersPage from './pages/Customers'
import ReportsPage from './pages/Reports'
import SettingsPage from './pages/Settings'
import type { Session } from './types'

type View =
  | { page: 'dashboard' }
  | { page: 'session'; tableId: number }
  | { page: 'invoice'; session: Session & { table_name: string; hourly_rate: number }; playAmount: number }
  | { page: 'products' }
  | { page: 'customers' }
  | { page: 'reports' }
  | { page: 'settings' }

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' })

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
        <button onClick={() => setView({ page: 'products' })} className="text-sm text-gray-300 hover:text-white">Sản phẩm</button>
        <button onClick={() => setView({ page: 'customers' })} className="text-sm text-gray-300 hover:text-white">Khách hàng</button>
        <button onClick={() => setView({ page: 'reports' })} className="text-sm text-gray-300 hover:text-white">Báo cáo</button>
        <button onClick={() => setView({ page: 'settings' })} className="text-sm text-gray-300 hover:text-white ml-auto">Cài đặt</button>
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
        {view.page === 'customers' && <CustomersPage />}
        {view.page === 'reports' && <ReportsPage />}
        {view.page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
