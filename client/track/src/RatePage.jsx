import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api' })

export default function RatePage() {
  const { requestId, token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovering, setHovering] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    api.get(`/rate/${requestId}/${token}`)
      .then(res => setData(res.data))
      .catch(err => {
        if (err.response?.status === 410) {
          setAlreadyRated(true)
        } else if (err.response?.status === 403) {
          setError('This rating link is invalid.')
        } else if (err.response?.status === 404) {
          setError('Service request not found.')
        } else {
          setError('Unable to load. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }, [requestId, token])

  async function handleSubmit() {
    if (rating < 1) return
    setSubmitting(true)
    try {
      await api.post(`/rate/${requestId}/${token}`, { rating })
      setSubmitted(true)
    } catch (err) {
      if (err.response?.status === 410) {
        setAlreadyRated(true)
      } else {
        setError('Failed to submit rating. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Already rated
  if (alreadyRated) {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-3">
            <div className="w-14 h-14 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Already Rated</h2>
            <p className="text-gray-600">You have already submitted a rating for this service request. Thank you!</p>
          </div>
        </Card>
      </Shell>
    )
  }

  // Thank you
  if (submitted) {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-3">
            <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Thank You!</h2>
            <div className="flex justify-center gap-1">
              {[1,2,3,4,5].map(i => (
                <Star key={i} filled={i <= rating} />
              ))}
            </div>
            <p className="text-gray-600">Your feedback helps us improve our service.</p>
            <p className="text-sm text-gray-400 mt-4">Durante Equipment · Old School Values. New School Speed.</p>
          </div>
        </Card>
      </Shell>
    )
  }

  if (loading) {
    return <Shell><div className="text-center text-gray-500 py-16">Loading...</div></Shell>
  }

  if (error) {
    return (
      <Shell>
        <Card>
          <div className="text-center text-red-600 py-4">{error}</div>
        </Card>
      </Shell>
    )
  }

  if (!data) return null

  return (
    <Shell>
      <Card>
        <div className="text-center space-y-5">
          <div>
            <p className="text-sm text-gray-500">Rate Your Service</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{data.companyName}</p>
            <p className="text-sm text-gray-600">{data.equipmentDescription}</p>
            {data.techName && <p className="text-sm text-gray-500 mt-1">Technician: {data.techName}</p>}
          </div>

          <div>
            <p className="text-sm text-gray-500 mb-3">How was your experience?</p>
            <div className="flex justify-center gap-2">
              {[1,2,3,4,5].map(i => (
                <button
                  key={i}
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHovering(i)}
                  onMouseLeave={() => setHovering(0)}
                  className="p-1 transition-transform hover:scale-110 active:scale-95"
                  aria-label={`${i} star${i > 1 ? 's' : ''}`}
                >
                  <Star filled={i <= (hovering || rating)} size={44} />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-500 mt-2">
                {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
              </p>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={rating < 1 || submitting}
            className="w-full min-h-[48px] bg-[#E31837] text-white font-bold rounded-lg hover:bg-[#c21530] active:bg-[#a8112a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>
      </Card>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#E31837] text-white px-4 py-4 shadow-md">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold">Durante Equipment</h1>
          <p className="text-xs text-white/80">Service Feedback</p>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}

function Card({ children }) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">{children}</div>
  )
}

function Star({ filled, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#FBBF24' : 'none'} stroke={filled ? '#FBBF24' : '#D1D5DB'} strokeWidth={1.5}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}
