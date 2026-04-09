import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const STATUS_COLORS = {
  'Received': 'bg-gray-500',
  'Acknowledged': 'bg-blue-500',
  'Scheduled': 'bg-orange-500',
  'Dispatched': 'bg-orange-500',
  'On Site': 'bg-green-600',
  'Diagnosing': 'bg-blue-600',
  'In Progress': 'bg-green-600',
  'Parts Ordered': 'bg-orange-500',
  'Parts Arrived': 'bg-green-500',
  'Complete': 'bg-green-700',
  'Follow-Up Required': 'bg-orange-600',
  'Cannot Repair': 'bg-red-600',
  'Cancelled': 'bg-gray-400',
}

function getAge(isoDate) {
  if (!isoDate) return ''
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function MyRequests() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadRequests() }, [])

  async function loadRequests() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/requests')
      // Sort newest first by Submitted_On
      const sorted = res.data.sort((a, b) =>
        new Date(b.Submitted_On) - new Date(a.Submitted_On)
      )
      setRequests(sorted)
    } catch (err) {
      setError('Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  const openCount = requests.filter(r =>
    !['Complete', 'Cancelled', 'Cannot Repair'].includes(r.Current_Status)
  ).length

  return (
    <div className="px-4 pt-4">
      {/* Summary Bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">My Requests</h2>
          <p className="text-sm text-gray-500">{openCount} open · {requests.length} total</p>
        </div>
        <button
          onClick={loadRequests}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          aria-label="Refresh"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No requests assigned</p>
          <p className="text-gray-400 text-sm mt-1">Pull to refresh or tap the refresh button</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(sr => (
            <button
              key={sr.SR_ID}
              onClick={() => navigate(`/sr/${sr.SR_ID}`)}
              className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-left active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{sr.Company_Name}</p>
                  <p className="text-sm text-gray-600 truncate mt-0.5">{sr.Equipment_Description}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{getAge(sr.Submitted_On)}</span>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium text-white ${STATUS_COLORS[sr.Current_Status] || 'bg-gray-500'}`}>
                  {sr.Current_Status}
                </span>
                <span className="text-xs text-gray-400 font-mono">{sr.SR_ID}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
