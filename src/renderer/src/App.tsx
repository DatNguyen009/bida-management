import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/Session'
import type { Session } from './types'

type View =
  | { page: 'dashboard' }
  | { page: 'session'; tableId: number }

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' })

  const handleCheckout = (
    session: Session & { table_name: string; hourly_rate: number },
    playAmount: number
  ) => {
    // TODO Plan 2: navigate to Invoice page
    console.log('Checkout session', session.id, 'play amount:', playAmount)
    setView({ page: 'dashboard' })
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
      </main>
    </div>
  )
}
