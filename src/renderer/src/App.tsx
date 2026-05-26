import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/Session'
import InvoicePage from './pages/Invoice'
import ProductsPage from './pages/Products'
import type { Session } from './types'

type View =
  | { page: 'dashboard' }
  | { page: 'session'; tableId: number }
  | { page: 'invoice'; session: Session & { table_name: string; hourly_rate: number }; playAmount: number }
  | { page: 'products' }

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
        <button
          onClick={() => setView({ page: 'products' })}
          className="text-sm text-gray-300 hover:text-white"
        >
          Sản phẩm
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
      </main>
    </div>
  )
}
