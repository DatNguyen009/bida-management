import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken } from '../lib/auth'

export default function NavBar() {
  const navigate = useNavigate()

  function logout() {
    clearToken()
    navigate('/login')
  }

  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <nav className="bg-white border-b border-gray-200 px-4 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-1">
          <span className="font-bold text-gray-900 mr-4 text-lg">🎱 Bida Master</span>
          <NavLink to="/" end className={cls}>Overview</NavLink>
          <NavLink to="/agents" className={cls}>Quán</NavLink>
          <NavLink to="/reports" className={cls}>Báo cáo</NavLink>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100">
          Đăng xuất
        </button>
      </div>
    </nav>
  )
}
