import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

const TECH_STATUSES = ['Dispatched', 'On Site', 'Diagnosing', 'In Progress', 'Parts Ordered', 'Complete']

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

const STATUS_BTN = {
  'Dispatched': { label: 'Dispatched', color: 'bg-orange-500 active:bg-orange-600' },
  'On Site': { label: 'On Site', color: 'bg-green-600 active:bg-green-700' },
  'Diagnosing': { label: 'Diagnosing', color: 'bg-blue-600 active:bg-blue-700' },
  'In Progress': { label: 'In Progress', color: 'bg-green-600 active:bg-green-700' },
  'Parts Ordered': { label: 'Parts Ordered', color: 'bg-orange-500 active:bg-orange-600' },
  'Complete': { label: 'Mark Complete', color: 'bg-[#E31837] active:bg-[#c21530]' },
}

export default function SRDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sr, setSr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Status update state
  const [updating, setUpdating] = useState(false)
  const [notes, setNotes] = useState('')
  const [eta, setEta] = useState('')

  // Unit number state
  const [unitNumber, setUnitNumber] = useState('')
  const [unitSaving, setUnitSaving] = useState(false)

  // Complete flow state
  const [showComplete, setShowComplete] = useState(false)
  const [completeNotes, setCompleteNotes] = useState('')
  const [completeError, setCompleteError] = useState('')

  // Success feedback
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => { loadSR() }, [id])

  async function loadSR() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/requests/${id}`)
      setSr(res.data)
      setUnitNumber(res.data.Unit_Number || '')
    } catch {
      setError('Failed to load service request')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusUpdate(status) {
    if (status === 'Complete') {
      setShowComplete(true)
      return
    }

    setUpdating(true)
    setStatusMsg('')
    try {
      const body = { status }
      if (notes.trim()) body.notes = notes.trim()
      if (eta.trim()) body.eta = eta.trim()

      await api.patch(`/requests/${id}/status`, body)
      setStatusMsg(`Updated to ${status}`)
      setNotes('')
      setEta('')
      await loadSR()
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Status update failed')
    } finally {
      setUpdating(false)
    }
  }

  async function handleComplete() {
    if (!completeNotes.trim()) {
      setCompleteError('Notes are required when marking complete')
      return
    }

    setUpdating(true)
    setCompleteError('')
    try {
      await api.patch(`/requests/${id}/status`, {
        status: 'Complete',
        notes: completeNotes.trim(),
      })
      setShowComplete(false)
      setCompleteNotes('')
      setStatusMsg('Service marked Complete!')
      await loadSR()
    } catch (err) {
      setCompleteError(err.response?.data?.error || 'Failed to mark complete')
    } finally {
      setUpdating(false)
    }
  }

  async function saveUnitNumber() {
    if (unitNumber === (sr?.Unit_Number || '')) return
    setUnitSaving(true)
    try {
      await api.patch(`/requests/${id}/status`, {
        status: sr.Current_Status,
        unitNumber: unitNumber.trim(),
      })
      await loadSR()
    } catch {
      // silent
    } finally {
      setUnitSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center text-gray-500 py-12">Loading...</div>
  }

  if (error && !sr) {
    return (
      <div className="px-4 pt-6">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      </div>
    )
  }

  if (!sr) return null

  const isComplete = ['Complete', 'Cancelled', 'Cannot Repair'].includes(sr.Current_Status)

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* Status Badge + SR ID */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold text-white ${STATUS_COLORS[sr.Current_Status] || 'bg-gray-500'}`}>
            {sr.Current_Status}
          </span>
          <span className="text-sm font-mono text-gray-400">{sr.SR_ID}</span>
        </div>
      </div>

      {/* Success Message */}
      {statusMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg font-medium">
          {statusMsg}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Customer Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <h3 className="font-bold text-gray-900">Customer</h3>
        <InfoRow label="Company" value={sr.Company_Name} />
        <InfoRow label="Contact" value={sr.Contact_Name} />
        <InfoRow label="Phone" value={sr.Contact_Phone} link={`tel:${sr.Contact_Phone}`} />
        <InfoRow label="Site Address" value={sr.Site_Address} />
      </div>

      {/* Equipment Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <h3 className="font-bold text-gray-900">Equipment</h3>
        <InfoRow label="Description" value={sr.Equipment_Description} />
        <InfoRow label="Asset #" value={sr.Asset_Number} />
        <InfoRow label="Problem" value={sr.Problem_Description} />

        {/* Unit Number — editable */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Unit Number</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={unitNumber}
              onChange={e => setUnitNumber(e.target.value)}
              placeholder="Enter unit number"
              disabled={isComplete}
              className="flex-1 min-h-[48px] px-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none disabled:bg-gray-100"
            />
            {!isComplete && unitNumber !== (sr.Unit_Number || '') && (
              <button
                onClick={saveUnitNumber}
                disabled={unitSaving}
                className="min-h-[48px] px-4 bg-[#E31837] text-white text-sm font-medium rounded-lg active:bg-[#c21530] disabled:opacity-50"
              >
                {unitSaving ? '...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notes + ETA (only when SR is open) */}
      {!isComplete && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Add Notes</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes for this update..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none resize-none"
          />
          <input
            type="text"
            value={eta}
            onChange={e => setEta(e.target.value)}
            placeholder="ETA (e.g., Between 2-4 PM)"
            className="w-full min-h-[48px] px-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
          />
        </div>
      )}

      {/* Tech Notes History */}
      {sr.Tech_Notes && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-2">Tech Notes</h3>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{sr.Tech_Notes}</pre>
        </div>
      )}

      {/* Status Buttons — TECH_STATUSES only */}
      {!isComplete && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-900 px-1">Update Status</h3>
          <div className="grid grid-cols-2 gap-3">
            {TECH_STATUSES.filter(s => s !== 'Complete').map(status => (
              <button
                key={status}
                onClick={() => handleStatusUpdate(status)}
                disabled={updating || sr.Current_Status === status}
                className={`min-h-[56px] rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-40 ${STATUS_BTN[status].color}`}
              >
                {STATUS_BTN[status].label}
              </button>
            ))}
          </div>

          {/* Mark Complete — Full Width */}
          <button
            onClick={() => handleStatusUpdate('Complete')}
            disabled={updating}
            className="w-full min-h-[56px] rounded-xl bg-[#E31837] text-white text-lg font-bold active:bg-[#c21530] disabled:opacity-50 transition-colors"
          >
            Mark Complete
          </button>
        </div>
      )}

      {/* Complete Flow Modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900">Mark Complete</h3>
            <p className="text-sm text-gray-600">
              Completing <strong>{sr.SR_ID}</strong> — {sr.Equipment_Description}
            </p>

            {completeError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {completeError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tech Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                value={completeNotes}
                onChange={e => setCompleteNotes(e.target.value)}
                placeholder="Describe what was done, parts replaced, issue found..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none resize-none"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowComplete(false); setCompleteError('') }}
                className="flex-1 min-h-[52px] rounded-xl border-2 border-gray-300 text-gray-700 font-bold text-base active:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={updating || !completeNotes.trim()}
                className="flex-1 min-h-[52px] rounded-xl bg-[#E31837] text-white font-bold text-base active:bg-[#c21530] disabled:opacity-50 transition-colors"
              >
                {updating ? 'Completing...' : 'Confirm Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status History Timeline */}
      {sr.statusHistory && sr.statusHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-3">Timeline</h3>
          <div className="space-y-3">
            {[...sr.statusHistory].reverse().map((h, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1 ${STATUS_COLORS[h.Status] || 'bg-gray-400'}`} />
                  {i < sr.statusHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                </div>
                <div className="pb-3 flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{h.Status}</p>
                  {h.Notes && <p className="text-xs text-gray-600 mt-0.5">{h.Notes}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {h.Updated_By} · {formatTime(h.Timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, link }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {link ? (
        <a href={link} className="text-base text-[#E31837] font-medium">{value}</a>
      ) : (
        <p className="text-base text-gray-900">{value}</p>
      )}
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    hour12: true,
  })
}
