import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { STATUS_ES, L } from '../components/Bi'

const TECH_STATUSES = ['Dispatched', 'On Site', 'Diagnosing', 'In Progress', 'Parts Needed', 'Left Site - Will Schedule Return', 'Complete']

const STATUS_COLORS = {
  'Received': 'bg-gray-500', 'Acknowledged': 'bg-blue-500', 'Scheduled': 'bg-orange-500',
  'Dispatched': 'bg-orange-500', 'On Site': 'bg-green-600', 'Diagnosing': 'bg-blue-600',
  'In Progress': 'bg-green-600', 'Parts Needed': 'bg-orange-500', 'Parts Ordered': 'bg-orange-500',
  'Parts Arrived': 'bg-green-500', 'Left Site - Will Schedule Return': 'bg-blue-500',
  'Complete': 'bg-green-700', 'Follow-Up Required': 'bg-orange-600',
  'Cannot Repair': 'bg-red-600', 'Cancelled': 'bg-gray-400',
}

const STATUS_BTN = {
  'Dispatched': { color: 'bg-orange-500 active:bg-orange-600' },
  'On Site': { color: 'bg-green-600 active:bg-green-700' },
  'Diagnosing': { color: 'bg-blue-600 active:bg-blue-700' },
  'In Progress': { color: 'bg-green-600 active:bg-green-700' },
  'Parts Needed': { color: 'bg-orange-500 active:bg-orange-600' },
  'Left Site - Will Schedule Return': { color: 'bg-[#2196F3] active:bg-[#1976D2]' },
  'Complete': { color: 'bg-[#E31837] active:bg-[#c21530]' },
}

export default function SRDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sr, setSr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [notes, setNotes] = useState('')
  const [eta, setEta] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [unitSaving, setUnitSaving] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [completeNotes, setCompleteNotes] = useState('')
  const [completeError, setCompleteError] = useState('')
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
      setError('Failed to load service request / Error al cargar solicitud')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusUpdate(status) {
    if (status === 'Complete') { setShowComplete(true); return }
    setUpdating(true)
    setStatusMsg('')
    try {
      const body = { status }
      if (notes.trim()) body.notes = notes.trim()
      if (eta.trim()) body.eta = eta.trim()
      await api.patch(`/requests/${id}/status`, body)
      setStatusMsg(`${status} / ${STATUS_ES[status]}`)
      setNotes('')
      setEta('')
      await loadSR()
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Status update failed / Error al actualizar')
    } finally {
      setUpdating(false)
    }
  }

  async function handleComplete() {
    if (!completeNotes.trim()) {
      setCompleteError(`${L.notesRequired[0]} / ${L.notesRequired[1]}`)
      return
    }
    setUpdating(true)
    setCompleteError('')
    try {
      await api.patch(`/requests/${id}/status`, { status: 'Complete', notes: completeNotes.trim() })
      setShowComplete(false)
      setCompleteNotes('')
      setStatusMsg('Complete / Completado')
      await loadSR()
    } catch (err) {
      setCompleteError(err.response?.data?.error || 'Failed / Error')
    } finally {
      setUpdating(false)
    }
  }

  async function saveUnitNumber() {
    if (unitNumber === (sr?.Unit_Number || '')) return
    setUnitSaving(true)
    try {
      await api.patch(`/requests/${id}/status`, { status: sr.Current_Status, unitNumber: unitNumber.trim() })
      await loadSR()
    } catch { /* silent */ } finally { setUnitSaving(false) }
  }

  if (loading) return <div className="text-center text-gray-500 py-12">{L.loading[0]} / {L.loading[1]}</div>
  if (error && !sr) return (
    <div className="px-4 pt-6">
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
    </div>
  )
  if (!sr) return null

  const isComplete = ['Complete', 'Cancelled', 'Cannot Repair'].includes(sr.Current_Status)

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* Status Badge + SR ID */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold text-white ${STATUS_COLORS[sr.Current_Status] || 'bg-gray-500'}`}>
            {sr.Current_Status} <span className="font-normal opacity-75">/ {STATUS_ES[sr.Current_Status]}</span>
          </span>
          <span className="text-sm font-mono text-gray-400">{sr.SR_ID}</span>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg font-medium">{statusMsg}</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error} <button onClick={() => setError('')} className="ml-2 underline">OK</button>
        </div>
      )}

      {/* Customer Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <h3 className="font-bold text-gray-900">{L.customer[0]} <span className="text-sm font-normal text-gray-500">/ {L.customer[1]}</span></h3>
        <BiRow en="Company" es="Compañía" value={sr.Company_Name} />
        <BiRow en="Contact" es="Contacto" value={sr.Contact_Name} />
        <BiRow en="Phone" es="Teléfono" value={sr.Contact_Phone} link={`tel:${sr.Contact_Phone}`} />
        <BiRow en="Site Address" es="Dirección del Sitio" value={sr.Site_Address} />
      </div>

      {/* Equipment Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <h3 className="font-bold text-gray-900">{L.equipment[0]} <span className="text-sm font-normal text-gray-500">/ {L.equipment[1]}</span></h3>
        <BiRow en="Description" es="Descripción" value={sr.Equipment_Description} />
        <BiRow en="Asset #" es="Activo #" value={sr.Asset_Number} />
        <BiRow en="Problem" es="Problema" value={sr.Problem_Description} />

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {L.unitNumber[0]} <span className="opacity-70">/ {L.unitNumber[1]}</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={unitNumber}
              onChange={e => setUnitNumber(e.target.value)}
              placeholder={`${L.enterUnit[0]} / ${L.enterUnit[1]}`}
              disabled={isComplete}
              className="flex-1 min-h-[48px] px-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none disabled:bg-gray-100"
            />
            {!isComplete && unitNumber !== (sr.Unit_Number || '') && (
              <button onClick={saveUnitNumber} disabled={unitSaving}
                className="min-h-[48px] px-4 bg-[#E31837] text-white text-sm font-medium rounded-lg active:bg-[#c21530] disabled:opacity-50">
                {unitSaving ? '...' : `${L.save[0]} / ${L.save[1]}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notes + ETA */}
      {!isComplete && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <h3 className="font-bold text-gray-900">{L.addNotes[0]} <span className="text-sm font-normal text-gray-500">/ {L.addNotes[1]}</span></h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={`${L.notesPlaceholder[0]}\n${L.notesPlaceholder[1]}`}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none resize-none"
          />
          <input
            type="text"
            value={eta}
            onChange={e => setEta(e.target.value)}
            placeholder={`${L.etaPlaceholder[0]} / ${L.etaPlaceholder[1]}`}
            className="w-full min-h-[48px] px-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
          />
        </div>
      )}

      {/* Tech Notes History */}
      {sr.Tech_Notes && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-2">{L.techNotes[0]} <span className="text-sm font-normal text-gray-500">/ {L.techNotes[1]}</span></h3>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{sr.Tech_Notes}</pre>
        </div>
      )}

      {/* Status Buttons */}
      {!isComplete && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-900 px-1">{L.updateStatus[0]} <span className="text-sm font-normal text-gray-500">/ {L.updateStatus[1]}</span></h3>
          <div className="grid grid-cols-2 gap-3">
            {TECH_STATUSES.filter(s => s !== 'Complete').map(status => (
              <button
                key={status}
                onClick={() => handleStatusUpdate(status)}
                disabled={updating || sr.Current_Status === status}
                className={`min-h-[56px] rounded-xl text-white font-bold transition-colors disabled:opacity-40 ${STATUS_BTN[status].color} flex flex-col items-center justify-center px-2`}
              >
                <span className="text-sm">{status}</span>
                <span className="text-xs opacity-75">{STATUS_ES[status]}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => handleStatusUpdate('Complete')}
            disabled={updating}
            className="w-full min-h-[56px] rounded-xl bg-[#E31837] text-white font-bold active:bg-[#c21530] disabled:opacity-50 transition-colors flex flex-col items-center justify-center"
          >
            <span className="text-lg">{L.markComplete[0]}</span>
            <span className="text-sm opacity-75">{L.markComplete[1]}</span>
          </button>
        </div>
      )}

      {/* Complete Modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900">
              {L.markComplete[0]} <span className="text-base font-normal text-gray-500">/ {L.markComplete[1]}</span>
            </h3>
            <p className="text-sm text-gray-600">
              <strong>{sr.SR_ID}</strong> — {sr.Equipment_Description}
            </p>

            {completeError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{completeError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {L.notesLabel[0]} / {L.notesLabel[1]} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={completeNotes}
                onChange={e => setCompleteNotes(e.target.value)}
                placeholder={`${L.notesHint[0]}\n${L.notesHint[1]}`}
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
                <div>{L.cancel[0]}</div>
                <div className="text-xs font-normal opacity-60">{L.cancel[1]}</div>
              </button>
              <button
                onClick={handleComplete}
                disabled={updating || !completeNotes.trim()}
                className="flex-1 min-h-[52px] rounded-xl bg-[#E31837] text-white font-bold text-base active:bg-[#c21530] disabled:opacity-50 transition-colors"
              >
                <div>{updating ? L.completing[0] : L.confirmComplete[0]}</div>
                <div className="text-xs font-normal opacity-75">{updating ? L.completing[1] : L.confirmComplete[1]}</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {sr.statusHistory && sr.statusHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-3">{L.timeline[0]} <span className="text-sm font-normal text-gray-500">/ {L.timeline[1]}</span></h3>
          <div className="space-y-3">
            {[...sr.statusHistory].reverse().map((h, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1 ${STATUS_COLORS[h.Status] || 'bg-gray-400'}`} />
                  {i < sr.statusHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                </div>
                <div className="pb-3 flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{h.Status} <span className="font-normal text-gray-500">/ {STATUS_ES[h.Status] || ''}</span></p>
                  {h.Notes && <p className="text-xs text-gray-600 mt-0.5">{h.Notes}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{h.Updated_By} · {formatTime(h.Timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BiRow({ en, es, value, link }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{en} <span className="opacity-70">/ {es}</span></p>
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
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}
