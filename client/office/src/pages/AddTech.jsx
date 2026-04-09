import { useState } from 'react'
import api from '../api'

export default function AddTech() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('Tech')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setError('All fields are required')
      return
    }
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await api.post('/techs', {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role,
      })
      setSuccess(`${fullName} added (${res.data.techId}). PIN ${res.data.pinSent ? 'sent via SMS' : 'generated — SMS failed'}.`)
      setFullName('')
      setEmail('')
      setPhone('')
      setRole('Tech')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add tech')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Add New Tech</h2>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{success}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Eddie Rivera"
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. erivera@duranteequip.com"
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 954-555-1234"
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837] outline-none"
          >
            <option value="Tech">Tech</option>
            <option value="Office">Office</option>
          </select>
        </div>
        <p className="text-xs text-gray-500">A random 4-digit PIN will be auto-generated and sent to the phone number via SMS.</p>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 bg-[#E31837] text-white font-bold rounded-lg hover:bg-[#c21530] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Adding...' : 'Add Tech'}
        </button>
      </form>
    </div>
  )
}
