import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    // Durante brand (11/25/2026): black bar, logo, red rule. Left padding keeps
    // the PORTAL link (fixed top-left on every Durante app) off the logo.
    <header className="bg-[#181617] text-white shadow-md border-b-4 border-[#D42027] pl-28">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="cursor-pointer flex items-center gap-4" onClick={() => navigate('/')}>
            <img src="/durante-logo.png" alt="Durante Equipment" className="h-10 w-auto" />
            <div className="h-9 w-px bg-white/20" />
            <div>
              <h1 className="text-base font-bold uppercase tracking-wide leading-tight">Office Dashboard</h1>
              <p className="text-xs text-gray-400">Service Requests</p>
            </div>
          </div>
          <nav className="flex gap-1">
            <NavBtn to="/" current={location.pathname} label="Service Requests" />
            {user?.role === 'Manager' && (
              <NavBtn to="/add-tech" current={location.pathname} label="Add Tech" />
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">
            {user?.name}
            {user?.role === 'Sales' && <span className="ml-2 text-xs text-gray-400">(read-only)</span>}
          </span>
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
          ? 'bg-[#D42027] text-white'
          : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  )
}
