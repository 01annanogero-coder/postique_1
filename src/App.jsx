import { lazy, Suspense, useEffect, useState } from 'react'
import { LogoMark } from './components/ui'
import { AuthProvider, useAuth } from './store/AuthContext'
import { StoreProvider } from './store/StoreContext'
import { ToastProvider, ToastViewport } from './store/ToastContext'
import AuthScreen from './auth/AuthScreen'

const Marketing = lazy(() => import('./marketing/Marketing'))
const AppShell = lazy(() => import('./app/AppShell'))

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/'
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-screen__mark">
        <LogoMark size={42} />
      </div>
      <span>Loading Postique…</span>
    </div>
  )
}

function WorkspaceGate({ path }) {
  const auth = useAuth()
  if (auth.loading) return <BootScreen />
  if (auth.setupRequired) return <AuthScreen mode="setup" />
  if (!auth.authenticated) return <AuthScreen mode="login" />
  return (
    <StoreProvider>
      <AppShell path={path} />
    </StoreProvider>
  )
}

export default function App() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onHashChange = () => {
      setPath(currentPath())
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) window.location.replace('#/')
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.title =
      path === '/'
        ? 'Postique — Email infrastructure for applications'
        : path.startsWith('/app')
          ? 'Postique — Workspace'
          : 'Postique'
  }, [path])

  return (
    <ToastProvider>
      <AuthProvider>
        <Suspense fallback={<BootScreen />}>
          {path.startsWith('/app') ? <WorkspaceGate path={path} /> : <Marketing path={path} />}
        </Suspense>
      </AuthProvider>
      <ToastViewport />
    </ToastProvider>
  )
}
