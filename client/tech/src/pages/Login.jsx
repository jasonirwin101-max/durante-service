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
  const [fetchingTechs, setFetchingTechs] = useState(true)

  useEffect(() => {
    api.get('/auth/techs')
      .then(res => {
        setTechs(res.data)
        setFetchingTechs(false)
      })
      .catch(() => {
        setError('Unable to connect to server')
        setFetchingTechs(false)
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
      login(res.data.token, res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-[#E31837] text-white px-6 pt-12 pb-8 text-center">
        <h1 className="text-2xl font-bold">Durante Equipment</h1>
        <p className="text-sm text-white/80 mt-1">Tech Portal</p>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-start justify-center px-4 pt-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-900 text-center">Sign In</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Name Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              disabled={fetchingTechs}
              className="w-full min-h-[48px] px-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
            >
              <option value="">
                {fetchingTechs ? 'Loading...' : 'Select your name'}
              </option>
              {techs.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* PIN Entry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="4-digit PIN"
              className="w-full min-h-[48px] px-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !selectedName || pin.length < 4}
            className="w-full min-h-[52px] bg-[#E31837] text-white text-lg font-bold rounded-lg hover:bg-[#c21530] active:bg-[#a8112a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 py-4">
        Old School Values. New School Speed.
      </div>
    </div>
  )
}
