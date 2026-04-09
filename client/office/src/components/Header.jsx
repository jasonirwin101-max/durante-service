import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <header className="bg-[#1A1A1A] text-white shadow-md">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="cursor-pointer" onClick={() => navigate('/')}>
            <h1 className="text-lg font-bold text-[#E31837]">Durante Equipment</h1>
            <p className="text-xs text-gray-400">Office Dashboard</p>
          </div>
          <nav className="flex gap-1">
            <NavBtn to="/" current={location.pathname} label="Service Requests" />
            <NavBtn to="/add-tech" current={location.pathname} label="Add Tech" />
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">{user?.name}</span>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-sm rounded border border-gray-600 hover:bg-gray-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}

function NavBtn({ to, current, label }) {
  const active = current === to
  return (
    <button
      onClick={() => window.location.pathname !== to && (window.location.href = to)}
      className={`px-3 py-1.5 text-sm rounded transition-colors ${
        active
          ? 'bg-[#E31837] text-white'
          : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  )
}
