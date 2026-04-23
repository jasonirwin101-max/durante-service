import { useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const ALL_STATUSES = [
  'Received', 'Acknowledged', 'Scheduled', 'Dispatched', 'On Site',
  'Diagnosing', 'In Progress', 'Parts Needed', 'Parts Ordered', 'Parts Arrived',
  'Left Site - Will Schedule Return', 'Unit to be Swapped', 'Unit Has Been Swapped',
  'Complete', 'Follow-Up Required', 'Cannot Repair', 'Cancelled',
]

const STATUS_COLORS = {
  'Received': 'bg-gray-500', 'Acknowledged': 'bg-blue-500', 'Scheduled': 'bg-orange-500',
  'Dispatched': 'bg-orange-500', 'On Site': 'bg-green-600', 'Diagnosing': 'bg-blue-600',
  'In Progress': 'bg-green-600', 'Parts Needed': 'bg-orange-500', 'Parts Ordered': 'bg-orange-500',
  'Parts Arrived': 'bg-green-500', 'Left Site - Will Schedule Return': 'bg-blue-500',
  'Unit to be Swapped': 'bg-purple-600', 'Unit Has Been Swapped': 'bg-purple-700',
  'Complete': 'bg-green-700', 'Follow-Up Required': 'bg-orange-600',
  'Cannot Repair': 'bg-red-600', 'Cancelled': 'bg-gray-400',
}

export default function SRDetailPanel({ srId, techs, onUpdate, onClose }) {
  const { user } = useAuth()
  const canEdit = user?.role === 'Manager'
  const [sr, setSr] = useState(null)
  const [loading, setLoading] = useState(true)

  // Status override
  const [newStatus, setNewStatus] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  const [eta, setEta] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Assign tech
  const [assignedTech, setAssignedTech] = useState('')
  const [techSaving, setTechSaving] = useState(false)

  // Internal notes
  const [internalNotes, setInternalNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  // Re-send
  const [resending, setResending] = useState(false)

  // Feedback
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')

  useEffect(() => { loadDetail() }, [srId])

  async function loadDetail() {
    setLoading(true)
    try {
      const res = await api.get(`/requests/${srId}`)
      setSr(res.data)
      setAssignedTech(res.data.Assigned_Tech || '')
      setInternalNotes(res.data.Internal_Notes || '')
      setNewStatus('')
      setStatusNotes('')
      setEta('')
      setScheduledDate('')
    } catch {
      showMsg('Failed to load SR', 'error')
    } finally {
      setLoading(false)
    }
  }

  function showMsg(text, type = 'success') {
    setMsg(text)
    setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  async function handleStatusUpdate() {
    if (!newStatus) return
    setStatusUpdating(true)
    try {
      const body = { status: newStatus }
      if (statusNotes.trim()) body.notes = statusNotes.trim()
      if (eta.trim()) body.eta = eta.trim()
      if (scheduledDate) body.scheduledDate = scheduledDate
      await api.patch(`/requests/${srId}/status`, body)
      showMsg(`Status updated to ${newStatus}`)
      setNewStatus('')
      setStatusNotes('')
      setEta('')
      setScheduledDate('')
      await loadDetail()
      onUpdate()
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed', 'error')
    } finally {
      setStatusUpdating(false)
    }
  }

  async function handleAssignTech() {
    if (assignedTech === (sr?.Assigned_Tech || '')) return
    setTechSaving(true)
    try {
      await api.patch(`/requests/${srId}`, { Assigned_Tech: assignedTech })
      showMsg(`Assigned to ${assignedTech || 'nobody'}`)
      await loadDetail()
      onUpdate()
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed', 'error')
    } finally {
      setTechSaving(false)
    }
  }

  async function handleSaveNotes() {
    setNotesSaving(true)
    try {
      await api.patch(`/requests/${srId}`, { Internal_Notes: internalNotes })
      showMsg('Internal notes saved')
      await loadDetail()
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed', 'error')
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      const res = await api.post(`/notify/${srId}`)
      const n = res.data.notifications
      showMsg(`Re-sent — SMS: ${n.smsSent ? 'Yes' : 'No'}, Email: ${n.emailSent ? 'Yes' : 'No'}`)
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed', 'error')
    } finally {
      setResending(false)
    }
  }

  if (loading) return <div className="bg-white rounded-lg border border-gray-200 p-6 text-gray-500">Loading...</div>
  if (!sr) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden max-h-[calc(100vh-160px)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <div>
          <span className="font-mono text-sm text-gray-500">{sr.SR_ID}</span>
          <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white ${STATUS_COLORS[sr.Current_Status] || 'bg-gray-500'}`}>
            {sr.Current_Status}
          </span>
          {sr.Escalation_Flag === 'TRUE' && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">ESCALATED</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" title="Close">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Feedback */}
        {msg && (
          <div className={`px-3 py-2 rounded text-sm font-medium ${msgType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {msg}
          </div>
        )}

        {/* Customer Info */}
        <Section title="Customer">
          <Row label="Company" value={sr.Company_Name} />
          <Row label="Contact" value={sr.Contact_Name} />
          <Row label="Phone" value={sr.Contact_Phone} link={`tel:${sr.Contact_Phone}`} />
          <Row label="Email" value={sr.Contact_Email} link={`mailto:${sr.Contact_Email}`} />
          <Row label="Site" value={sr.Site_Address} />
          <Row label="Submitted By" value={sr.Submitter_Name} />
          <Row label="Submitter Phone" value={sr.Submitter_Phone} />
        </Section>

        {/* Equipment */}
        <Section title="Equipment">
          <Row label="Description" value={sr.Equipment_Description} />
          <Row label="Asset #" value={sr.Asset_Number} />
          <Row label="Unit #" value={sr.Unit_Number} />
          <Row label="Problem" value={sr.Problem_Description} />
          <Row label="Customer Need" value={sr.Customers_Need} />
        </Section>

        {/* Photos */}
        {[sr.Photo_1, sr.Photo_2, sr.Photo_3, sr.Photo_4].some(p => p) && (
          <Section title="Photos">
            <div className="grid grid-cols-2 gap-2">
              {[sr.Photo_1, sr.Photo_2, sr.Photo_3, sr.Photo_4].map((photo, i) => {
                if (!photo) return null
                const API = import.meta.env.VITE_API_URL || ''
                let url = photo
                // Fix URLs pointing to Netlify instead of Railway
                if (url.includes('.netlify.app/uploads/')) {
                  url = `${API}/uploads/${url.split('/uploads/')[1]}`
                }
                // Add protocol if missing
                if (url && !url.startsWith('http') && !url.startsWith('data:')) {
                  url = url.startsWith('/') ? `${API}${url}` : `https://${url}`
                }
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-gray-200 overflow-hidden hover:border-[#E31837] transition-colors"
                  >
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-28 object-cover bg-gray-100"
                      onError={e => { e.target.onerror = null; e.target.src = ''; e.target.className = 'hidden' }}
                    />
                  </a>
                )
              })}
            </div>
          </Section>
        )}

        {/* Assigned Tech (read-only for Sales, editable for Manager) */}
        <Section title={canEdit ? 'Assign Tech' : 'Assigned Tech'}>
          {canEdit ? (
            <div className="flex gap-2">
              <select
                value={assignedTech}
                onChange={e => setAssignedTech(e.target.value)}
                className="flex-1 h-8 px-2 text-sm border border-gray-300 rounded bg-white focus:ring-1 focus:ring-[#E31837] outline-none"
              >
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              {assignedTech !== (sr.Assigned_Tech || '') && (
                <button
                  onClick={handleAssignTech}
                  disabled={techSaving}
                  className="h-8 px-3 text-sm font-medium text-white bg-[#E31837] rounded hover:bg-[#c21530] disabled:opacity-50"
                >
                  {techSaving ? '...' : 'Save'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-900">{sr.Assigned_Tech || <span className="text-gray-400 italic">Unassigned</span>}</p>
          )}
        </Section>

        {/* Status Override (Managers only) */}
        {canEdit && <Section title="Update Status">
          <div className="space-y-2">
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              className="w-full h-8 px-2 text-sm border border-gray-300 rounded bg-white focus:ring-1 focus:ring-[#E31837] outline-none"
            >
              <option value="">Select new status...</option>
              {ALL_STATUSES.filter(s => s !== sr.Current_Status).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {newStatus && (
              <>
                <input
                  type="text"
                  value={statusNotes}
                  onChange={e => setStatusNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
                />
                {(newStatus === 'Dispatched' || newStatus === 'Parts Ordered') && (
                  <input
                    type="text"
                    value={eta}
                    onChange={e => setEta(e.target.value)}
                    placeholder="ETA (e.g., Between 2-4 PM)"
                    className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
                  />
                )}
                {newStatus === 'Scheduled' && (
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
                  />
                )}
                {newStatus === 'Unit to be Swapped' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Swap ETA / Date & Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={eta}
                      onChange={e => setEta(e.target.value)}
                      className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
                      required
                    />
                    {!eta && <p className="text-xs text-red-500 mt-1">Date and time required for unit swap</p>}
                  </div>
                )}
                <button
                  onClick={handleStatusUpdate}
                  disabled={statusUpdating || (newStatus === 'Unit to be Swapped' && !eta)}
                  className="w-full h-8 text-sm font-medium text-white bg-[#E31837] rounded hover:bg-[#c21530] disabled:opacity-50"
                >
                  {statusUpdating ? 'Updating...' : `Set to ${newStatus}`}
                </button>
              </>
            )}
          </div>
        </Section>}

        {/* Internal Notes (editable for Manager, read-only for Sales) */}
        <Section title="Internal Notes">
          <p className="text-xs text-gray-400 mb-1">Not visible to customer or in notifications</p>
          {canEdit ? (
            <>
              <textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none resize-none"
              />
              {internalNotes !== (sr.Internal_Notes || '') && (
                <button
                  onClick={handleSaveNotes}
                  disabled={notesSaving}
                  className="mt-1 h-8 px-3 text-sm font-medium text-white bg-[#E31837] rounded hover:bg-[#c21530] disabled:opacity-50"
                >
                  {notesSaving ? 'Saving...' : 'Save Notes'}
                </button>
              )}
            </>
          ) : (
            sr.Internal_Notes
              ? <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{sr.Internal_Notes}</pre>
              : <p className="text-sm text-gray-400 italic">No internal notes</p>
          )}
        </Section>

        {/* Financial */}
        {(sr.Operator_Issue === 'TRUE' || sr.Customer_Charged === 'TRUE' || sr.Amount_Charged) && (
          <Section title="Financial">
            <Row label="Operator Issue" value={sr.Operator_Issue === 'TRUE' ? 'Yes' : 'No'} />
            <Row label="Customer Charged" value={sr.Customer_Charged === 'TRUE' ? 'Yes' : 'No'} />
            <Row label="Amount" value={sr.Amount_Charged ? `$${sr.Amount_Charged}` : ''} />
          </Section>
        )}

        {/* Re-send Notifications (Managers only) */}
        {canEdit && (
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full h-9 text-sm font-medium border-2 border-[#E31837] text-[#E31837] rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {resending ? 'Sending...' : 'Re-send Notifications'}
          </button>
        )}

        {/* Tech Notes */}
        {sr.Tech_Notes && (
          <Section title={sr.Tech_Notes_Original ? 'Tech Notes (EN)' : 'Tech Notes'}>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{sr.Tech_Notes}</pre>
          </Section>
        )}

        {/* Original Spanish Notes */}
        {sr.Tech_Notes_Original && (
          <Section title="Tech Notes (ES)">
            <pre className="text-sm text-gray-500 italic whitespace-pre-wrap font-sans">{sr.Tech_Notes_Original}</pre>
          </Section>
        )}

        {/* Timeline */}
        {sr.statusHistory && sr.statusHistory.length > 0 && (
          <Section title="Status History">
            <div className="space-y-2">
              {[...sr.statusHistory].reverse().map((h, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${STATUS_COLORS[h.Status] || 'bg-gray-400'}`} />
                    {i < sr.statusHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-0.5" />}
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{h.Status}</span>
                      <div className="flex gap-1">
                        {h.SMS_Sent === 'TRUE' && <span className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded">SMS</span>}
                        {h.Email_Sent === 'TRUE' && <span className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded">Email</span>}
                      </div>
                    </div>
                    {h.Notes && <p className="text-xs text-gray-600 mt-0.5">{h.Notes}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {h.Updated_By} ({h.Role}) · {fmtTime(h.Timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value, link }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 w-28 flex-shrink-0">{label}</span>
      {link ? (
        <a href={link} className="text-[#E31837] hover:underline truncate">{value}</a>
      ) : (
        <span className="text-gray-900 truncate">{value}</span>
      )}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
