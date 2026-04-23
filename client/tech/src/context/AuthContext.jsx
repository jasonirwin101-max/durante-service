import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('durante_tech_token')
    const savedUser = localStorage.getItem('durante_tech_user')
    if (saved && savedUser) {
      try {
        // Check if token is expired
        const payload = JSON.parse(atob(saved.split('.')[1]))
        if (payload.exp * 1000 > Date.now()) {
          const u = JSON.parse(savedUser)
          if (u.role === 'Tech') {
            setToken(saved)
            setUser(u)
          } else {
            localStorage.removeItem('durante_tech_token')
            localStorage.removeItem('durante_tech_user')
          }
        } else {
          localStorage.removeItem('durante_tech_token')
          localStorage.removeItem('durante_tech_user')
        }
      } catch {
        localStorage.removeItem('durante_tech_token')
        localStorage.removeItem('durante_tech_user')
      }
    }
    setLoading(false)
  }, [])

  function login(tokenVal, userVal) {
    setToken(tokenVal)
    setUser(userVal)
    localStorage.setItem('durante_tech_token', tokenVal)
    localStorage.setItem('durante_tech_user', JSON.stringify(userVal))
  }

  function logout() {
    setToken(null)
    setUser(null)
    localStorage.removeItem('durante_tech_token')
    localStorage.removeItem('durante_tech_user')
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
