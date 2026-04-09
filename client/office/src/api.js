import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('durante_office_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('durante_office_token')
      localStorage.removeItem('durante_office_user')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export default api
