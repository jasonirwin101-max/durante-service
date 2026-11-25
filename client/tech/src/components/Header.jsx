import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { L } from './Bi'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDetail = location.pathname.startsWith('/sr/')

  return (
    // Durante brand (11/25/2026): black bar, logo, red rule. Left padding keeps
    // the PORTAL link (fixed top-left on every Durante app) off the logo.
    <header className="bg-[#181617] text-white sticky top-0 z-50 shadow-md border-b-4 border-[#D42027]">
      <div className="flex items-center justify-between pl-[7.25rem] pr-2 sm:pr-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
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
          {!isDetail && <img src="/favicon.png" alt="Durante Equipment" className="h-9 w-9 rounded sm:hidden" />}
          <img src="/durante-logo.png" alt="Durante Equipment" className="hidden sm:block h-10 w-auto" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide leading-tight whitespace-nowrap">{L.techPortal[0]}</h1>
            <p className="text-xs text-white/60 truncate">{L.techPortal[1]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/90 hidden sm:inline">{user?.name}</span>
          <button
            onClick={logout}
            className="min-h-[48px] px-3 rounded-lg text-sm font-medium hover:bg-white/20 active:bg-white/30 transition-colors"
          >
            {L.logout[0]} <span className="hidden sm:inline text-xs opacity-70">/ {L.logout[1]}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
