import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDetail = location.pathname.startsWith('/sr/')

  return (
    <header className="bg-[#E31837] text-white sticky top-0 z-50 shadow-md">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {isDetail && (
            <button
              onClick={() => navigate('/')}
              className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg hover:bg-white/20 active:bg-white/30 transition-colors"
              aria-label="Back"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold leading-tight">Durante Equipment</h1>
            <p className="text-xs text-white/80">Tech Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/90 hidden sm:inline">{user?.name}</span>
          <button
            onClick={logout}
            className="min-h-[48px] px-3 rounded-lg text-sm font-medium hover:bg-white/20 active:bg-white/30 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
