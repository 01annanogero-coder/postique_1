import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { makeId } from '../lib/utils'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback((message, tone = 'success', detail = '') => {
    const id = makeId('toast', 6)
    setToasts((current) => [...current, { id, message, tone, detail }])
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
      timers.current.delete(id)
    }, 4500)
    timers.current.set(id, timer)
    return id
  }, [])

  useEffect(() => {
    const active = timers.current
    return () => active.forEach((timer) => clearTimeout(timer))
  }, [])

  const value = useMemo(
    () => ({ toasts, toast, dismissToast }),
    [toasts, toast, dismissToast],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}

export function ToastViewport() {
  const { toasts, dismissToast } = useToast()
  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span className="toast__icon">
            {toast.tone === 'error' ? <X size={14} /> : <Check size={14} />}
          </span>
          <div className="toast__body">
            <strong>{toast.message}</strong>
            {toast.detail && <span>{toast.detail}</span>}
          </div>
          <button onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
