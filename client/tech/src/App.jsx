import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import MyRequests from './pages/MyRequests'
import SRDetail from './pages/SRDetail'
import Header from './components/Header'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="pb-6">
        <Routes>
          <Route path="/" element={<MyRequests />} />
          <Route path="/sr/:id" element={<SRDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
