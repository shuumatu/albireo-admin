import axios from 'axios'

const authRequest = axios.create({
  baseURL: '/api/auth',
  timeout: 10000
})

authRequest.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, error => Promise.reject(error))

export interface LoginResponse {
  token: string
  userId: number
  username: string
  role: string
}

export function adminLogin(username: string, password: string) {
  return authRequest.post<LoginResponse>('/admin-login', { username, password })
}

export function changePassword(oldPassword: string, newPassword: string) {
  return authRequest.post('/change-password', { oldPassword, newPassword })
}
