import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let queue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(api(original))
        })
      })
    }
    isRefreshing = true
    const refreshToken = useAuthStore.getState().refreshToken
    try {
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
      useAuthStore.getState().setAccessToken(data.accessToken)
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken)
        useAuthStore.setState({ refreshToken: data.refreshToken })
      }
      queue.forEach((cb) => cb(data.accessToken))
      queue = []
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return api(original)
    } catch {
      useAuthStore.getState().logout()
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)
