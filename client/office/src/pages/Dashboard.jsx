import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../api'
import SRDetailPanel from '../components/SRDetailPanel'
import FilterBar from '../components/FilterBar'

const STATUS_COLORS = {
  'Received': 'bg-gray-500',
  'Acknowledged': 'bg-blue-500',
  'Scheduled': 'bg-orange-500',
  'Dispatched': 'bg-orange-500',
  'On Site': 'bg-green-600',
  'Diagnosing': 'bg-blue-600',
  'In Progress': 'bg-green-600',
  'Parts Needed': 'bg-orange-500',
  'Parts Ordered': 'bg-orange-500',
  'Parts Arrived': 'bg-green-500',
  'Left Site - Will Schedule Return': 'bg-blue-500',
  'Unit to be Swapped': 'bg-purple-600',
  'Unit Has Been Swapped': 'bg-purple-700',
  'Complete': 'bg-green-700',
  'Follow-Up Required': 'bg-orange-600',
  'Cannot Repair': 'bg-red-600',
  'Cancelled': 'bg-gray-400',
}

function ageDays(isoDate) {
  if (!isoDate) return 0
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000)
}

function ageRowClass(isoDate) {
  const days = ageDays(isoDate)
  if (days >= 4) return 'bg-red-50 border-l-4 border-l-red-500'
  if (days >= 2) return 'bg-yellow-50 border-l-4 border-l-yellow-500'
  return 'bg-white border-l-4 border-l-green-500'
}

export default function Dashboard() {
  const [requests, setRequests] = useState([])
  const [techs, setTechs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [newBannerCount, setNewBannerCount] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const [justArrivedIds, setJustArrivedIds] = useState(() => new Set())
  const [selectedSR, setSelectedSR] = useState(null)

  const prevIdsRef = useRef(new Set())
  const isInitialRef = useRef(true)

  // Filters
  const [filters, setFilters] = useState({
    status: '', tech: '', company: '', dateFrom: '', dateTo: '', escalatedOnly: false,
  })

  // Sorting
  const [sortCol, setSortCol] = useState('Submitted_On')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    const tickTime = new Date().toLocaleTimeString()
    console.log('[DASHBOARD] Auto-refresh tick:', tickTime)
    console.log('[DASHBOARD] Token present:', !!localStorage.getItem('durante_office_token'))
    setRefreshing(true)
    try {
      const [srRes, techRes] = await Promise.all([
        api.get('/requests'),
        api.get('/auth/techs'),
      ])
      const newList = srRes.data
      console.log('[DASHBOARD] SRs returned:', Array.isArray(newList) ? newList.length : `not-array (${typeof newList})`)

      if (!isInitialRef.current) {
        const arrived = newList
          .map(sr => sr.SR_ID)
          .filter(id => !prevIdsRef.current.has(id))
        if (arrived.length > 0) {
          setNewBannerCount(arrived.length)
          setJustArrivedIds(new Set(arrived))
          setTimeout(() => setNewBannerCount(0), 5000)
          setTimeout(() => setJustArrivedIds(new Set()), 5000)
        }
      }
      prevIdsRef.current = new Set(newList.map(sr => sr.SR_ID))
      isInitialRef.current = false

      setRequests(newList)
      setTechs(techRes.data)
      setLastUpdated(new Date())
      setLoadError(null)
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err.message
      console.error('[DASHBOARD] Fetch failed —', detail)
      setLoadError(detail)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = [...requests]

    if (filters.escalatedOnly) {
      result = result.filter(sr => sr.Escalation_Flag === 'TRUE')
    }
    if (filters.status) {
      result = result.filter(sr => sr.Current_Status === filters.status)
    }
    if (filters.tech) {
      result = result.filter(sr => sr.Assigned_Tech === filters.tech)
    }
    if (filters.company) {
      const q = filters.company.toLowerCase()
      result = result.filter(sr => sr.Company_Name.toLowerCase().includes(q))
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime()
      result = result.filter(sr => new Date(sr.Submitted_On).getTime() >= from)
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 86400000
      result = result.filter(sr => new Date(sr.Submitted_On).getTime() <= to)
    }

    result.sort((a, b) => {
      let va = a[sortCol] || ''
      let vb = b[sortCol] || ''
      if (sortCol === 'Submitted_On' || sortCol === 'Status_Updated_At') {
        va = new Date(va).getTime() || 0
        vb = new Date(vb).getTime() || 0
      } else {
        va = va.toLowerCase()
        vb = vb.toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [requests, filters, sortCol, sortDir])

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function handleSRUpdate() {
    loadData()
    if (selectedSR) {
      api.get(`/requests/${selectedSR.SR_ID}`).then(res => setSelectedSR(res.data)).catch(() => {})
    }
  }

  const openCount = requests.filter(r =>
    !['Complete', 'Cancelled', 'Cannot Repair'].includes(r.Current_Status)
  ).length
  const escalatedCount = requests.filter(r => r.Escalation_Flag === 'TRUE').length

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-6 mb-4">
        <div>
          <span className="text-2xl font-bold text-gray-900">{openCount}</span>
          <span className="text-sm text-gray-500 ml-1">Open</span>
        </div>
        <div>
          <span className="text-2xl font-bold text-gray-900">{requests.length}</span>
          <span className="text-sm text-gray-500 ml-1">Total</span>
        </div>
        {escalatedCount > 0 && (
          <button
            onClick={() => setFilters(f => ({ ...f, escalatedOnly: !f.escalatedOnly }))}
            className={`px-3 py-1 text-sm rounded-full font-medium transition-colors ${
              filters.escalatedOnly
                ? 'bg-red-600 text-white'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            {escalatedCount} Escalated
          </button>
        )}
        <div className="flex-1" />
        {lastUpdated && (
          <span className="text-xs text-gray-500">
            Last updated: {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
        <button
          onClick={loadData}
          disabled={refreshing}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <svg
            className={`w-3.5 h-3.5 ${refreshing ? 'refresh-spin' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 10a6 6 0 0 1 10.24-4.24L17 8" />
            <path d="M17 3v5h-5" />
            <path d="M16 10a6 6 0 0 1-10.24 4.24L3 12" />
            <path d="M3 17v-5h5" />
          </svg>
          Refresh / Actualizar
        </button>
      </div>

      {newBannerCount > 0 && (
        <div className="mb-3 px-4 py-2 bg-yellow-100 border border-yellow-300 text-yellow-900 text-sm rounded-lg">
          {newBannerCount} new service request{newBannerCount === 1 ? '' : 's'} received
        </div>
      )}

      {loadError && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          Unable to load service requests — {loadError}
        </div>
      )}

      {/* Filters */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        techs={techs}
        statuses={[...new Set(requests.map(r => r.Current_Status))].sort()}
      />

      <div className="flex gap-4 mt-4">
        {/* SR Table */}
        <div className={`${selectedSR ? 'w-1/2' : 'w-full'} transition-all`}>
          {loading ? (
            <div className="text-center text-gray-500 py-12">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-500 py-12">No service requests match filters</div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <SortTh col="SR_ID" label="SR#" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="Company_Name" label="Company" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="Contact_Name" label="Contact" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="Equipment_Description" label="Equipment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="Current_Status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="Assigned_Tech" label="Tech" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="Submitted_On" label="Age" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(sr => {
                      const days = ageDays(sr.Submitted_On)
                      const isSelected = selectedSR?.SR_ID === sr.SR_ID
                      const isReceived = sr.Current_Status === 'Received'
                      const isJustArrived = justArrivedIds.has(sr.SR_ID)
                      return (
                        <tr
                          key={sr.SR_ID}
                          onClick={() => setSelectedSR(sr)}
                          className={`cursor-pointer border-b border-gray-100 ${
                            isJustArrived
                              ? 'row-new-flash'
                              : isReceived
                                ? 'row-received-flash'
                                : isSelected
                                  ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                  : `${ageRowClass(sr.Submitted_On)} hover:bg-blue-50/50`
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{sr.SR_ID}</td>
                          <td className="px-3 py-2 font-medium max-w-[150px] truncate">{sr.Company_Name}</td>
                          <td className="px-3 py-2 max-w-[120px] truncate">{sr.Contact_Name}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate">{sr.Equipment_Description}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {isReceived ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-white text-[#E31837]">
                                ACTION NEEDED
                              </span>
                            ) : (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white ${STATUS_COLORS[sr.Current_Status] || 'bg-gray-500'}`}>
                                {sr.Current_Status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{sr.Assigned_Tech || <span className={isReceived ? 'font-bold' : 'text-gray-400 italic'}>Unassigned</span>}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={isReceived ? 'font-bold' : `font-medium ${days >= 4 ? 'text-red-600' : days >= 2 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {days}d
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[140px] truncate">{sr.Site_Address}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedSR && (
          <div className="w-1/2">
            <SRDetailPanel
              srId={selectedSR.SR_ID}
              techs={techs}
              onUpdate={handleSRUpdate}
              onClose={() => setSelectedSR(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SortTh({ col, label, sortCol, sortDir, onSort }) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
    >
      {label}
      {active && (
        <span className="ml-1 text-[#E31837]">{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  )
}
