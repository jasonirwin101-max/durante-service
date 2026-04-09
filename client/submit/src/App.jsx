import { useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api' })

const REQUIRED_FIELDS = [
  { key: 'companyName', label: 'Company Name' },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'contactEmail', label: 'Contact Email' },
  { key: 'siteAddress', label: 'Site Address' },
  { key: 'customersNeed', label: "Customer's Need" },
  { key: 'equipmentDescription', label: 'Equipment Description' },
  { key: 'problemDescription', label: 'Description of Issue' },
  { key: 'submitterName', label: 'Your Name' },
  { key: 'submitterPhone', label: 'Your Phone' },
]

const INITIAL = {
  companyName: '', contactName: '', contactPhone: '', contactEmail: '',
  siteAddress: '', customersNeed: '', assetNumber: '', equipmentDescription: '',
  problemDescription: '', submitterName: '', submitterPhone: '',
}

export default function App() {
  const [form, setForm] = useState({ ...INITIAL })
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  function update(key, value) {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }))
  }

  function handlePhotos(e) {
    const files = Array.from(e.target.files).slice(0, 4)
    setPhotos(files)
  }

  function validate() {
    const errs = {}
    for (const { key, label } of REQUIRED_FIELDS) {
      if (!form[key]?.trim()) errs[key] = `${label} is required`
    }
    // Basic email format
    if (form.contactEmail && !/\S+@\S+\.\S+/.test(form.contactEmail)) {
      errs.contactEmail = 'Enter a valid email address'
    }
    // Basic phone format
    if (form.contactPhone && form.contactPhone.replace(/\D/g, '').length < 10) {
      errs.contactPhone = 'Enter a valid 10-digit phone number'
    }
    if (form.submitterPhone && form.submitterPhone.replace(/\D/g, '').length < 10) {
      errs.submitterPhone = 'Enter a valid 10-digit phone number'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) {
      // Scroll to first error
      const firstErr = document.querySelector('[data-error="true"]')
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      // 1. Upload photos to Google Drive (if any)
      let photoUrls = []
      if (photos.length > 0) {
        const formData = new FormData()
        photos.forEach(f => formData.append('photos', f))
        const uploadRes = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        photoUrls = uploadRes.data.urls
      }

      // 2. Submit the service request
      const res = await api.post('/submit', {
        ...form,
        photos: photoUrls,
      })

      setResult(res.data)
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result.trackingUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleReset() {
    setForm({ ...INITIAL })
    setPhotos([])
    setErrors({})
    setSubmitError('')
    setResult(null)
    setCopied(false)
    window.scrollTo(0, 0)
  }

  // ─── Confirmation Screen ───────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center space-y-5">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Request Submitted!</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Service Request Number</p>
              <p className="text-3xl font-bold text-[#E31837] font-mono mt-1">{result.srId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Tracking Link</p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                <span className="flex-1 text-sm text-gray-700 truncate font-mono">{result.trackingUrl}</span>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 min-h-[40px] px-4 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c21530] active:bg-[#a8112a] transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              The customer and submitter will receive SMS and email notifications with tracking updates.
            </p>
            <button
              onClick={handleReset}
              className="w-full min-h-[48px] border-2 border-[#E31837] text-[#E31837] font-bold rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors"
            >
              Submit Another Request
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Entry Form ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">New Service Request</h2>
        <p className="text-sm text-gray-500 mb-6">Fill out all required fields to submit a service request.</p>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Information */}
          <FormSection title="Customer Information">
            <Field label="Company Name" required value={form.companyName} onChange={v => update('companyName', v)} error={errors.companyName} />
            <Field label="Contact Name" required hint="Person to be notified about this request" value={form.contactName} onChange={v => update('contactName', v)} error={errors.contactName} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Phone" required type="tel" value={form.contactPhone} onChange={v => update('contactPhone', v)} error={errors.contactPhone} />
              <Field label="Contact Email" required type="email" value={form.contactEmail} onChange={v => update('contactEmail', v)} error={errors.contactEmail} />
            </div>
            <Field label="Site Address" required value={form.siteAddress} onChange={v => update('siteAddress', v)} error={errors.siteAddress} />
          </FormSection>

          {/* Equipment & Issue */}
          <FormSection title="Equipment & Issue">
            <Field label="Customer's Need / Service Type" required value={form.customersNeed} onChange={v => update('customersNeed', v)} error={errors.customersNeed} placeholder="e.g. Repair, PM, Inspection" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Equipment Description" required value={form.equipmentDescription} onChange={v => update('equipmentDescription', v)} error={errors.equipmentDescription} placeholder="e.g. CAT 320 Excavator" />
              <Field label="Asset Number" value={form.assetNumber} onChange={v => update('assetNumber', v)} placeholder="Optional" />
            </div>
            <TextArea label="Description of Issue" required value={form.problemDescription} onChange={v => update('problemDescription', v)} error={errors.problemDescription} placeholder="Describe the problem in detail..." />
          </FormSection>

          {/* Photos */}
          <FormSection title="Photos (Optional)">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upload up to 4 photos</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotos}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#E31837] file:text-white hover:file:bg-[#c21530] file:cursor-pointer file:transition-colors"
              />
              {photos.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{photos.length} photo{photos.length > 1 ? 's' : ''} selected</p>
              )}
            </div>
          </FormSection>

          {/* Submitter */}
          <FormSection title="Submitter (DE Employee)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Your Name" required value={form.submitterName} onChange={v => update('submitterName', v)} error={errors.submitterName} />
              <Field label="Your Phone" required type="tel" value={form.submitterPhone} onChange={v => update('submitterPhone', v)} error={errors.submitterPhone} hint="For SMS updates" />
            </div>
          </FormSection>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[52px] bg-[#E31837] text-white text-lg font-bold rounded-xl hover:bg-[#c21530] active:bg-[#a8112a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Service Request'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="bg-[#E31837] text-white px-4 py-4 shadow-md">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-bold">Durante Equipment</h1>
        <p className="text-xs text-white/80">Service Request Portal</p>
      </div>
    </header>
  )
}

function FormSection({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-4">
      <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, required, type = 'text', value, onChange, error, hint, placeholder }) {
  return (
    <div data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full min-h-[44px] px-3 border rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none transition-colors ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function TextArea({ label, required, value, onChange, error, placeholder }) {
  return (
    <div data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className={`w-full px-3 py-2 border rounded-lg text-base focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none resize-none transition-colors ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
