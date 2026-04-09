import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const STATUS_BADGE = {
  'Received':            { color: 'bg-gray-500',    text: 'Received' },
  'Acknowledged':        { color: 'bg-blue-500',    text: 'Acknowledged' },
  'Scheduled':           { color: 'bg-orange-500',  text: 'Scheduled' },
  'Dispatched':          { color: 'bg-orange-500',  text: 'Dispatched' },
  'On Site':             { color: 'bg-green-600',   text: 'On Site' },
  'Diagnosing':          { color: 'bg-blue-600',    text: 'Diagnosing' },
  'In Progress':         { color: 'bg-yellow-500',  text: 'In Progress' },
  'Parts Ordered':       { color: 'bg-orange-500',  text: 'Parts Ordered' },
  'Parts Arrived':       { color: 'bg-green-500',   text: 'Parts Arrived' },
  'Complete':            { color: 'bg-green-700',   text: 'Complete' },
  'Follow-Up Required':  { color: 'bg-orange-600',  text: 'Follow-Up Required' },
  'Cannot Repair':       { color: 'bg-red-600',     text: 'Cannot Repair' },
  'Cancelled':           { color: 'bg-gray-400',    text: 'Cancelled' },
}

const OFFICE_PHONE = '+9543617368'

export default function TrackPage() {
  const { requestId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`/track/${requestId}`)
      .then(res => setData(res.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('Service request not found. Please check your tracking link.')
        } else {
          setError('Unable to load tracking information. Please try again later.')
        }
      })
      .finally(() => setLoading(false))
  }, [requestId])

  if (loading) {
    return (
      <Shell>
        <div className="text-center text-gray-500 py-16">Loading tracking information...</div>
      </Shell>
    )
  }

  if (error) {
    return (
      <Shell>
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-8 rounded-xl">
            <svg className="w-12 h-12 mx-auto text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-lg font-medium">{error}</p>
          </div>
        </div>
      </Shell>
    )
  }

  if (!data) return null

  const badge = STATUS_BADGE[data.currentStatus] || { color: 'bg-gray-500', text: data.currentStatus }

  return (
    <Shell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* SR Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-500">Service Request</p>
          <p className="text-2xl font-bold font-mono text-gray-900 mt-1">{data.srId}</p>
          <p className="text-base text-gray-700 mt-1">{data.companyName}</p>
        </div>

        {/* Status Badge */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-500 mb-3">Current Status</p>
          <span className={`inline-block px-6 py-2.5 rounded-full text-lg font-bold text-white ${badge.color}`}>
            {badge.text}
          </span>
          {data.statusUpdatedAt && (
            <p className="text-xs text-gray-400 mt-3">
              Updated {fmtTime(data.statusUpdatedAt)}
            </p>
          )}
        </div>

        {/* Equipment & Service Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
          <h3 className="font-bold text-gray-900">Service Details</h3>
          <InfoRow label="Equipment" value={data.equipmentDescription} />
          <InfoRow label="Issue" value={data.problemDescription} />
          {data.assignedTech && <InfoRow label="Technician" value={data.assignedTech} />}
          {data.eta && <InfoRow label="ETA" value={data.eta} highlight />}
          {data.scheduledDate && <InfoRow label="Scheduled" value={data.scheduledDate} highlight />}
        </div>

        {/* Timeline */}
        {data.timeline && data.timeline.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Status Timeline</h3>
            <div className="space-y-0">
              {data.timeline.map((entry, i) => {
                const entryBadge = STATUS_BADGE[entry.status] || { color: 'bg-gray-400' }
                const isLast = i === data.timeline.length - 1
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${isLast ? entryBadge.color : 'bg-gray-300'}`} />
                      {i < data.timeline.length - 1 && <div className="w-px flex-1 bg-gray-200 min-h-[24px]" />}
                    </div>
                    <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
                      <p className={`text-sm font-medium ${isLast ? 'text-gray-900' : 'text-gray-600'}`}>
                        {entry.status}
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{fmtTime(entry.timestamp)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Call Us */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-500 mb-2">Questions about your service?</p>
          <a
            href={`tel:${OFFICE_PHONE}`}
            className="inline-flex items-center gap-2 min-h-[48px] px-6 bg-[#E31837] text-white font-bold rounded-lg hover:bg-[#c21530] active:bg-[#a8112a] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call Us
          </a>
          <p className="text-xs text-gray-400 mt-2">{OFFICE_PHONE}</p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-2">
          Durante Equipment · Old School Values. New School Speed.
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#E31837] text-white px-4 py-4 shadow-md">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold">Durante Equipment</h1>
          <p className="text-xs text-white/80">Service Tracking</p>
        </div>
      </header>
      {children}
    </div>
  )
}

function InfoRow({ label, value, highlight }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-base ${highlight ? 'text-[#E31837] font-semibold' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
