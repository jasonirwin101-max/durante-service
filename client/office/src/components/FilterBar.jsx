export default function FilterBar({ filters, setFilters, techs, statuses }) {
  function update(key, value) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  function clearAll() {
    setFilters({ status: '', tech: '', company: '', dateFrom: '', dateTo: '', escalatedOnly: false })
  }

  const hasFilters = filters.status || filters.tech || filters.company || filters.dateFrom || filters.dateTo || filters.escalatedOnly

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-2.5">
      <span className="text-xs font-medium text-gray-500 uppercase">Filters</span>

      <select
        value={filters.status}
        onChange={e => update('status', e.target.value)}
        className="h-8 px-2 text-sm border border-gray-300 rounded bg-white focus:ring-1 focus:ring-[#E31837] outline-none"
      >
        <option value="">All Statuses</option>
        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <select
        value={filters.tech}
        onChange={e => update('tech', e.target.value)}
        className="h-8 px-2 text-sm border border-gray-300 rounded bg-white focus:ring-1 focus:ring-[#E31837] outline-none"
      >
        <option value="">All Techs</option>
        {techs.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
      </select>

      <input
        type="text"
        value={filters.company}
        onChange={e => update('company', e.target.value)}
        placeholder="Company..."
        className="h-8 w-36 px-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
      />

      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span>From</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => update('dateFrom', e.target.value)}
          className="h-8 px-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
        />
        <span>To</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => update('dateTo', e.target.value)}
          className="h-8 px-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#E31837] outline-none"
        />
      </div>

      {hasFilters && (
        <button
          onClick={clearAll}
          className="h-8 px-3 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          Clear All
        </button>
      )}
    </div>
  )
}
