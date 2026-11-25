import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

export default function Login() {
  const { login } = useAuth()
  const [techs, setTechs] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Server filters to users allowed for the dashboard (Manager OR
    // Dashboard_Access=TRUE), so no client-side role filtering is needed.
    api.get('/auth/techs?app=dashboard')
      .then(res => setTechs(res.data))
      .catch(err => {
        const detail = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message
        console.error('[OFFICE LOGIN] Failed to load techs:', detail)
        setError(`Unable to load users — ${detail}`)
      })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedName || !pin) {
      setError('Select your name and enter your PIN')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { name: selectedName, pin, app: 'dashboard' })
      login(res.data.token, res.data.user)
    } catch (err) {
      const status = err.response?.status
      if (status === 403) {
        // Server's access-denied message (role / Dashboard_Access gate).
        setError(err.response.data.error)
      } else if (status === 401) {
        setError('Invalid PIN')
      } else {
        setError(err.response?.data?.error || 'Login failed')
      }
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F2F2] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6 bg-[#181617] rounded-xl border-b-4 border-[#D42027] px-6 py-6 shadow-lg">
          <img src="/durante-logo.png" alt="Durante Equipment" className="h-12 w-auto mx-auto" />
          <p className="text-sm font-bold uppercase tracking-wider text-white mt-3">Office Dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 text-center">Sign In</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#D42027] focus:border-[#D42027] outline-none"
            >
              <option value="">Select your name</option>
              {techs.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="4-digit PIN"
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-center text-lg tracking-[0.4em] font-mono focus:ring-2 focus:ring-[#D42027] focus:border-[#D42027] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !selectedName || pin.length < 4}
            className="w-full h-10 bg-[#D42027] text-white font-bold rounded-lg hover:bg-[#A81A20] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-6">Old School Values. New School Speed.</p>
      </div>
    </div>
  )
}
