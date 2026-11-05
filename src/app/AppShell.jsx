import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Fingerprint,
  Globe2,
  Image,
  Inbox,
  Layers,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MailCheck,
  Megaphone,
  Menu,
  PanelRight,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { Avatar, Badge, Logo, LogoMark } from '../components/ui'
import { cx, navigate } from '../lib/utils'
import { useAuth } from '../store/AuthContext'
import { useStore } from '../store/StoreContext'
import Overview from './Overview'
import InboxPage from './InboxPage'
import Campaigns from './Campaigns'
import Domains from './Domains'
import Logs from './Logs'
import Queue from './Queue'
import Automations from './Automations'
import Assets from './Assets'
import Developers from './Developers'
import Authentication from './Authentication'
import Verification from './Verification'
import Embed from './Embed'
import SettingsPage from './Settings'

const Studio = lazy(() => import('./Studio'))

const primaryNav = [
  { label: 'Overview', path: '/app', icon: LayoutDashboard },
  { label: 'Inbox', path: '/app/inbox', icon: Inbox, badge: 'inbox' },
  { label: 'Campaigns', path: '/app/campaigns', icon: Megaphone },
  { label: 'Template studio', path: '/app/studio', icon: Layers },
]

const infraNav = [
  { label: 'Domains', path: '/app/domains', icon: Globe2 },
  { label: 'Logs & events', path: '/app/logs', icon: Activity },
  { label: 'Queue', path: '/app/queue', icon: ListTodo },
  { label: 'Automations', path: '/app/automations', icon: Sparkles },
  { label: 'Assets', path: '/app/assets', icon: Image },
]

const buildNav = [
  { label: 'Verification', path: '/app/verification', icon: MailCheck },
  { label: 'Accounts', path: '/app/auth', icon: Fingerprint },
  { label: 'Developers', path: '/app/developers', icon: Code2 },
  { label: 'Embedded inbox', path: '/app/embed', icon: PanelRight },
]

const pageTitles = {
  '/app': 'Overview',
  '/app/inbox': 'Inbox',
  '/app/campaigns': 'Campaigns',
  '/app/studio': 'Template studio',
  '/app/domains': 'Domains',
  '/app/logs': 'Logs & events',
  '/app/queue': 'Queue',
  '/app/automations': 'Automations',
  '/app/assets': 'Assets',
  '/app/verification': 'Verification',
  '/app/auth': 'Application accounts',
  '/app/developers': 'Developers',
  '/app/embed': 'Embedded inbox',
  '/app/settings': 'Settings',
}

function NavItem({ item, active, onClick, unreadCount }) {
  const Icon = item.icon
  return (
    <button className={cx('side-nav__item', active && 'is-active')} onClick={onClick}>
      <Icon size={16} strokeWidth={active ? 2.3 : 1.9} />
      <span>{item.label}</span>
      {item.badge === 'inbox' && unreadCount > 0 && <span className="side-nav__badge">{unreadCount}</span>}
      {item.pill && <span className="side-nav__pill">{item.pill}</span>}
    </button>
  )
}

function Sidebar({ path, open, onClose }) {
  const { workspace, unreadCount, usage } = useStore()
  const auth = useAuth()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const usagePercent = usage?.sendLimit ? Math.min(100, (usage.sends / usage.sendLimit) * 100) : 0

  const isActive = (target) => (target === '/app' ? path === '/app' : path.startsWith(target))

  const go = (target) => {
    navigate(target)
    onClose?.()
  }

  const logout = async () => {
    onClose?.()
    await auth.logout()
    navigate('/')
  }

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={cx('app-sidebar', open && 'is-open')}>
        <div className="app-sidebar__brand">
          <button onClick={() => navigate('/')} aria-label="Postique home">
            <Logo light />
          </button>
          <button className="app-sidebar__mobile-close" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switch-wrap">
          <button className="workspace-switch" onClick={() => setWorkspaceOpen(!workspaceOpen)}>
            <span className="workspace-switch__avatar">{workspace.initials || 'PQ'}</span>
            <span className="workspace-switch__text">
              <strong>{workspace.name}</strong>
              <small>{workspace.plan} · {workspace.replyDomain}</small>
            </span>
            <ChevronDown size={14} className={cx(workspaceOpen && 'is-open')} />
          </button>
          {workspaceOpen && (
            <div className="workspace-menu">
              <span className="workspace-menu__label">Workspace</span>
              <button className="workspace-menu__active">
                <span className="workspace-switch__avatar">{workspace.initials || 'PQ'}</span>
                <span>
                  <strong>{workspace.name}</strong>
                  <small>{workspace.plan}</small>
                </span>
                <Check size={14} />
              </button>
              <hr />
              <button onClick={() => go('/app/settings')}>
                <Settings size={14} /> Workspace settings
              </button>
              <button onClick={() => navigate('/')}>
                <ArrowLeft size={14} /> Back to website
              </button>
            </div>
          )}
        </div>

        <nav className="side-nav" aria-label="Workspace">
          <div className="side-nav__group">
            {primaryNav.map((item) => (
              <NavItem
                key={item.path}
                item={item}
                active={isActive(item.path)}
                unreadCount={unreadCount}
                onClick={() => go(item.path)}
              />
            ))}
          </div>
          <span className="side-nav__label">Infrastructure</span>
          <div className="side-nav__group">
            {infraNav.map((item) => (
              <NavItem key={item.path} item={item} active={isActive(item.path)} onClick={() => go(item.path)} />
            ))}
          </div>
          <span className="side-nav__label">Build</span>
          <div className="side-nav__group">
            {buildNav.map((item) => (
              <NavItem key={item.path} item={item} active={isActive(item.path)} onClick={() => go(item.path)} />
            ))}
          </div>
        </nav>

        <div className="app-sidebar__bottom">
          <div className="usage-card">
            <div className="usage-card__head">
              <span>Monthly sends</span>
              <span>{Math.round(usagePercent)}%</span>
            </div>
            <div className="usage-card__bar">
              <span style={{ width: `${Math.max(2, usagePercent)}%` }} />
            </div>
            <div className="usage-card__foot">
              <span>{(usage?.sends || 0).toLocaleString()} of {(usage?.sendLimit || 0).toLocaleString()}</span>
              <button onClick={() => go('/app/settings')}>Manage</button>
            </div>
          </div>
          <button className={cx('side-nav__item', path === '/app/settings' && 'is-active')} onClick={() => go('/app/settings')}>
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <button className="side-nav__help" onClick={() => go('/app/developers')}>
            <CircleHelp size={16} />
            <span>Help & docs</span>
            <ArrowRight size={12} />
          </button>
          <div className="app-sidebar__user">
            <Avatar name={workspace.owner} initials={workspace.initials} color="#314238" size={32} />
            <span>
              <strong>{workspace.owner}</strong>
              <small>Owner</small>
            </span>
            <button aria-label="Sign out" onClick={logout} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function Topbar({ path, onMenu, onSearch }) {
  const { workspace } = useStore()
  const title = pageTitles[path.split('?')[0]] || 'Workspace'
  return (
    <header className="app-topbar">
      <div className="app-topbar__left">
        <button className="app-topbar__menu" onClick={onMenu} aria-label="Open navigation">
          <Menu size={19} />
        </button>
        <div className="breadcrumbs">
          <span>{workspace.name}</span>
          <span className="breadcrumbs__slash">/</span>
          <strong>{title}</strong>
        </div>
      </div>
      <button className="topbar-search" onClick={onSearch}>
        <Search size={14} />
        <span>Search conversations, templates…</span>
        <span className="topbar-search__kbd">⌘ K</span>
      </button>
      <div className="app-topbar__right">
        <Badge tone="outline" className="demo-badge">
          <span className="demo-badge__dot" /> Self-hosted
        </Badge>
        <button className="topbar-icon" title="Documentation" onClick={() => navigate('/app/developers')}>
          <BookOpen size={16} />
        </button>
        <button className="topbar-icon" title="Notifications">
          <Bell size={16} />
          <span className="topbar-icon__dot" />
        </button>
        <button className="topbar-user" onClick={() => navigate('/app/settings')}>
          <Avatar name={workspace.owner} initials={workspace.initials} color="#314238" size={30} />
          <ChevronDown size={13} />
        </button>
      </div>
    </header>
  )
}

function CommandPalette({ open, onClose }) {
  const { threads } = useStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  const results = useMemo(() => {
    const pages = [
      { type: 'page', label: 'Overview', path: '/app', icon: LayoutDashboard },
      { type: 'page', label: 'Inbox', path: '/app/inbox', icon: Inbox },
      { type: 'page', label: 'Campaigns', path: '/app/campaigns', icon: Megaphone },
      { type: 'page', label: 'Template studio', path: '/app/studio', icon: Layers },
      { type: 'page', label: 'Domains', path: '/app/domains', icon: Globe2 },
      { type: 'page', label: 'Logs & events', path: '/app/logs', icon: Activity },
      { type: 'page', label: 'Queue', path: '/app/queue', icon: ListTodo },
      { type: 'page', label: 'Automations', path: '/app/automations', icon: Sparkles },
      { type: 'page', label: 'Assets', path: '/app/assets', icon: Image },
      { type: 'page', label: 'Verification', path: '/app/verification', icon: MailCheck },
      { type: 'page', label: 'Application accounts', path: '/app/auth', icon: Fingerprint },
      { type: 'page', label: 'Developers', path: '/app/developers', icon: Code2 },
      { type: 'page', label: 'Embedded inbox', path: '/app/embed', icon: PanelRight },
    ]
    const normalized = query.trim().toLowerCase()
    const pageMatches = pages.filter((item) => item.label.toLowerCase().includes(normalized))
    const threadMatches = threads
      .filter(
        (thread) =>
          thread.subject.toLowerCase().includes(normalized) ||
          thread.customer.name.toLowerCase().includes(normalized) ||
          thread.customer.email.toLowerCase().includes(normalized),
      )
      .slice(0, 5)
      .map((thread) => ({
        type: 'thread',
        label: thread.subject,
        sublabel: `${thread.customer.name} · ${thread.customer.email}`,
        path: `/app/inbox?thread=${thread.id}`,
        thread,
      }))
    return [...pageMatches, ...threadMatches]
  }, [query, threads])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const select = (item) => {
    onClose()
    navigate(item.path)
  }

  const handleKey = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      select(results[activeIndex])
    }
    if (event.key === 'Escape') onClose()
  }

  return (
    <div className="command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command" role="dialog" aria-modal="true" aria-label="Search workspace">
        <div className="command__input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKey}
            placeholder="Search conversations, templates, pages…"
          />
          <kbd>esc</kbd>
        </div>
        <div className="command__results">
          {results.length === 0 && (
            <div className="command__empty">
              <Search size={20} />
              <span>No results for “{query}”</span>
            </div>
          )}
          {results.length > 0 && (
            <>
              {results.some((item) => item.type === 'page') && (
                <span className="command__group-label">Go to</span>
              )}
              {results.map(
                (item, index) =>
                  item.type === 'page' && (
                    <button
                      key={item.path}
                      className={cx('command__item', index === activeIndex && 'is-active')}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                    >
                      <span className="command__icon">
                        <item.icon size={15} />
                      </span>
                      <span>{item.label}</span>
                      <ArrowRight size={13} />
                    </button>
                  ),
              )}
              {results.some((item) => item.type === 'thread') && (
                <span className="command__group-label">Conversations</span>
              )}
              {results.map(
                (item, index) =>
                  item.type === 'thread' && (
                    <button
                      key={item.thread.id}
                      className={cx('command__item', index === activeIndex && 'is-active')}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                    >
                      <Avatar
                        name={item.thread.customer.name}
                        initials={item.thread.customer.initials}
                        color={item.thread.customer.color}
                        size={26}
                      />
                      <span className="command__thread">
                        <strong>{item.label}</strong>
                        <small>{item.sublabel}</small>
                      </span>
                      <ArrowRight size={13} />
                    </button>
                  ),
              )}
            </>
          )}
        </div>
        <div className="command__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className="command__brand">
            <LogoMark size={15} /> Postique
          </span>
        </div>
      </div>
    </div>
  )
}

function Page({ path }) {
  if (path === '/app') return <Overview />
  if (path.startsWith('/app/inbox')) return <InboxPage query={path.split('?')[1] || ''} />
  if (path.startsWith('/app/campaigns')) return <Campaigns />
  if (path.startsWith('/app/studio')) return <Studio />
  if (path.startsWith('/app/domains')) return <Domains />
  if (path.startsWith('/app/logs')) return <Logs />
  if (path.startsWith('/app/queue')) return <Queue />
  if (path.startsWith('/app/automations')) return <Automations />
  if (path.startsWith('/app/assets')) return <Assets />
  if (path.startsWith('/app/verification')) return <Verification />
  if (path.startsWith('/app/auth')) return <Authentication />
  if (path.startsWith('/app/developers')) return <Developers />
  if (path.startsWith('/app/embed')) return <Embed />
  if (path.startsWith('/app/settings')) return <SettingsPage />
  return <Overview />
}

function PageLoading() {
  return (
    <div className="page-loading">
      <span className="button__spinner" />
      <span>Loading workspace…</span>
    </div>
  )
}

export default function AppShell({ path }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const mainRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('app-body')
    return () => document.body.classList.remove('app-body')
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [path])

  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((value) => !value)
      }
      if (event.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app-shell">
      <Sidebar path={path} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-frame">
        <Topbar path={path} onMenu={() => setSidebarOpen(true)} onSearch={() => setCommandOpen(true)} />
        <main className="app-main" key={path} ref={mainRef}>
          <Suspense fallback={<PageLoading />}>
            <Page path={path} />
          </Suspense>
        </main>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  )
}
