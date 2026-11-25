import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import { L } from '../components/Bi'

export default function Login() {
  const { login } = useAuth()
  const [techs, setTechs] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchingTechs, setFetchingTechs] = useState(true)

  useEffect(() => {
    // Server filters to roles allowed for the tech portal (Tech or Manager).
    api.get('/auth/techs?app=tech')
      .then(res => {
        const sorted = res.data.slice().sort((a, b) => {
          const lastA = (a.name || '').split(/\s+/).pop()
          const lastB = (b.name || '').split(/\s+/).pop()
          return lastA.localeCompare(lastB)
        })
        setTechs(sorted)
        setFetchingTechs(false)
      })
      .catch(() => {
        setError('Unable to connect to server / No se puede conectar al servidor')
        setFetchingTechs(false)
      })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedName || !pin) {
      setError('Select your name and enter your PIN / Seleccione su nombre e ingrese su PIN')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { name: selectedName, pin, app: 'tech' })
      login(res.data.token, res.data.user)
    } catch (err) {
      const status = err.response?.status
      if (status === 403) {
        // Server's access-denied message (role gate).
        setError(err.response.data.error)
      } else if (status === 401) {
        setError('Invalid PIN')
      } else {
        setError(err.response?.data?.error || 'Login failed / Error de inicio de sesión')
      }
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F2F2] flex flex-col">
      <div className="bg-[#181617] text-white px-6 pt-14 pb-7 text-center border-b-4 border-[#D42027]">
        <img src="/durante-logo.png" alt="Durante Equipment" className="h-12 sm:h-14 w-auto mx-auto" />
        <p className="text-sm font-bold uppercase tracking-wider mt-3">{L.techPortal[0]} <span className="font-normal normal-case tracking-normal text-white/60">/ {L.techPortal[1]}</span></p>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 pt-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-900 text-center">
            {L.signIn[0]} <span className="text-base font-normal text-gray-500">/ {L.signIn[1]}</span>
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {L.yourName[0]} <span className="text-xs text-gray-400">/ {L.yourName[1]}</span>
            </label>
            <select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              disabled={fetchingTechs}
              className="w-full min-h-[48px] px-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-[#D42027] focus:border-[#D42027] outline-none"
            >
              <option value="">
                {fetchingTechs ? `${L.loading[0]} / ${L.loading[1]}` : `${L.selectName[0]} / ${L.selectName[1]}`}
              </option>
              {techs.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {L.pin[0]}
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={`${L.pinPlaceholder[0]} / ${L.pinPlaceholder[1]}`}
              className="w-full min-h-[48px] px-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-[#D42027] focus:border-[#D42027] outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !selectedName || pin.length < 4}
            className="w-full min-h-[52px] bg-[#D42027] text-white text-lg font-bold rounded-lg hover:bg-[#A81A20] active:bg-[#8C161B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? `${L.signingIn[0]} / ${L.signingIn[1]}` : `${L.signIn[0]} / ${L.signIn[1]}`}
          </button>
        </form>
      </div>

      <div className="text-center text-xs text-gray-400 py-4">
        Old School Values. New School Speed.
      </div>
    </div>
  )
}
