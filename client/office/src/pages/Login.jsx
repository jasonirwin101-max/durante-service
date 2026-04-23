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
    api.get('/auth/techs')
      .then(res => setTechs(res.data.filter(t => t.role === 'Manager' || t.role === 'Sales')))
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
      const res = await api.post('/auth/login', { name: selectedName, pin })
      if (res.data.user.role !== 'Manager' && res.data.user.role !== 'Sales') {
        setError('Access denied — Manager or Sales role required')
        setPin('')
        return
      }
      login(res.data.token, res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#E31837]">Durante Equipment</h1>
          <p className="text-sm text-gray-500 mt-1">Office Dashboard</p>
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
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
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
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-center text-lg tracking-[0.4em] font-mono focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !selectedName || pin.length < 4}
            className="w-full h-10 bg-[#E31837] text-white font-bold rounded-lg hover:bg-[#c21530] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-6">Old School Values. New School Speed.</p>
      </div>
    </div>
  )
}
