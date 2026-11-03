import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setCsrfToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    authenticated: false,
    setupRequired: false,
    user: null,
    workspace: null,
    error: null,
  })

  const applyAuth = useCallback((payload) => {
    if (payload?.csrfToken) setCsrfToken(payload.csrfToken)
    setState({
      loading: false,
      authenticated: Boolean(payload?.user),
      setupRequired: Boolean(payload?.setupRequired),
      user: payload?.user || null,
      workspace: payload?.workspace || null,
      error: null,
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const status = await api.status()
      applyAuth(status)
      return status
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }))
      return null
    }
  }, [applyAuth])

  useEffect(() => {
    refresh()
    const handleUnauthorized = () => refresh()
    window.addEventListener('postique:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('postique:unauthorized', handleUnauthorized)
  }, [refresh])

  const login = useCallback(async (email, password) => {
    const result = await api.login({ email, password })
    applyAuth(result)
    return result
  }, [applyAuth])

  const setup = useCallback(async (data) => {
    const result = await api.setup(data)
    applyAuth(result)
    return result
  }, [applyAuth])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setCsrfToken('')
      setState({
        loading: false,
        authenticated: false,
        setupRequired: false,
        user: null,
        workspace: null,
        error: null,
      })
    }
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      login,
      setup,
      logout,
    }),
    [state, refresh, login, setup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
