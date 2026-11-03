import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Mail,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react'
import { Badge, Button } from '../components/ui'
import { cx } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard } from './shared'

const statusMeta = {
  sent: { label: 'Sent', tone: 'success' },
  received: { label: 'Received', tone: 'blue' },
  bounced: { label: 'Bounced', tone: 'danger' },
  complained: { label: 'Complained', tone: 'danger' },
  queued: { label: 'Queued', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
}

const filterList = [
  { id: 'all', label: 'All events' },
  { id: 'sent', label: 'Sent' },
  { id: 'received', label: 'Received' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'complained', label: 'Complaints' },
  { id: 'queued', label: 'Queued' },
]

function StatusChip({ status }) {
  const meta = statusMeta[status] || statusMeta.sent
  return (
    <span className={cx('delivery-status', `delivery-status--${status}`)}>
      <span>{['sent', 'received'].includes(status) ? <Check size={10} /> : ['bounced', 'complained', 'failed'].includes(status) ? <ShieldAlert size={10} /> : <Clock3 size={10} />}</span>
      {meta.label}
    </span>
  )
}

function ExportButton({ logs }) {
  const exportCsv = () => {
    const rows = [['id', 'recipient', 'subject', 'template', 'status', 'time', 'message_id']]
    logs.forEach((log) => {
      rows.push([log.id, log.to, log.subject, log.template || 'Raw HTML', log.status, log.time, log.messageId])
    })
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'postique-message-logs.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Button variant="secondary" onClick={exportCsv} icon={<Download size={14} />}>
      Export CSV
    </Button>
  )
}

function EventDrawer({ log, onClose }) {
  if (!log) return null
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="event-drawer">
        <div className="event-drawer__head">
          <div>
            <span>MESSAGE DETAIL</span>
            <code>{log.id}</code>
          </div>
          <button onClick={onClose} aria-label="Close event details">
            <X size={17} />
          </button>
        </div>
        <div className="event-drawer__status">
          <StatusChip status={log.status} />
          <span>{log.time}</span>
        </div>
        <div className="event-drawer__subject">
          <span>Subject</span>
          <strong>{log.subject}</strong>
        </div>
        <div className="event-drawer__field-grid">
          <div>
            <span>To</span>
            <strong>{log.toName}</strong>
            <small>{log.to}</small>
          </div>
          <div>
            <span>From</span>
            <strong>Acme Commerce</strong>
            <small>orders@acme.co.ke</small>
          </div>
          <div>
            <span>Template</span>
            <strong>{log.template || 'Raw HTML'}</strong>
            <small>{log.template ? 'Published version' : 'API body'}</small>
          </div>
          <div>
            <span>Provider</span>
            <strong>SMTP transport</strong>
            <small>{log.provider}</small>
          </div>
        </div>
        <div className="event-drawer__meta">
          <span>Message-ID</span>
          <code>{log.messageId}</code>
        </div>
        <div className="event-drawer__timeline">
          <span className="event-drawer__label">EVENT TIMELINE</span>
          {log.events.map((event, index) => (
            <div className={cx('event-step', event.tone === 'error' && 'is-error')} key={`${event.label}-${index}`}>
              <span className={cx('event-step__dot', index === log.events.length - 1 && 'is-last')}>
                {event.tone === 'error' ? <X size={9} /> : <Check size={9} />}
              </span>
              <div>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </div>
              <time>{event.time}</time>
            </div>
          ))}
        </div>
        <div className="event-drawer__actions">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => onClose()}>
            Retry delivery
          </Button>
          <Button size="sm" icon={<ArrowUpRight size={13} />} onClick={onClose}>
            View conversation
          </Button>
        </div>
        <div className="event-drawer__note">
          <ShieldAlert size={12} />
          Message records are stored in this installation’s local SQLite database. Attachments live on the
          local data volume.
        </div>
      </aside>
    </>
  )
}

export default function Logs() {
  const { logs, metrics: workspaceMetrics } = useStore()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    let list = logs
    if (filter !== 'all') list = list.filter((log) => log.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (log) =>
          log.subject.toLowerCase().includes(q) ||
          log.to.toLowerCase().includes(q) ||
          log.toName.toLowerCase().includes(q) ||
          log.id.toLowerCase().includes(q),
      )
    }
    return list
  }, [logs, filter, search])

  const queued = logs.filter((log) => log.status === 'queued').length
  const metrics = [
    {
      label: 'Accepted',
      value: `${workspaceMetrics.deliveryRate ?? 0}%`,
      foot: `${workspaceMetrics.sent || 0} sent · ${workspaceMetrics.outbound || 0} total`,
      icon: <CheckCheck size={15} />,
    },
    {
      label: 'Replies',
      value: workspaceMetrics.replies || 0,
      foot: 'inbound messages',
      icon: <MessageSquare size={15} />,
    },
    {
      label: 'Bounced',
      value: workspaceMetrics.bounced || 0,
      foot: `${workspaceMetrics.complained || 0} complaints`,
      icon: <ShieldAlert size={15} />,
    },
    { label: 'Queued', value: queued, foot: 'waiting for worker', icon: <Clock3 size={15} /> },
  ]

  return (
    <div className="page page--logs">
      <PageHeader
        eyebrow="Observability"
        title="Logs & events"
        description="Every message, every state change. Search what happened and give your application the same information through webhooks."
        actions={<ExportButton logs={logs} />}
      />

      <div className="log-metrics">
        {metrics.map((metric) => (
          <div className="log-metric" key={metric.label}>
            <span className="log-metric__icon">{metric.icon}</span>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.foot}</small>
            </div>
          </div>
        ))}
      </div>

      <section className="logs-panel">
        <div className="logs-toolbar">
          <div className="logs-filters">
            {filterList.map((item) => {
              const count = item.id === 'all' ? logs.length : logs.filter((log) => log.status === item.id).length
              return (
                <button
                  key={item.id}
                  className={cx(filter === item.id && 'is-active')}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span>{count}</span>
                </button>
              )
            })}
          </div>
          <div className="logs-search">
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages…" />
          </div>
        </div>

        <div className="logs-table">
          <div className="logs-row logs-row--head">
            <span>Message</span>
            <span>Recipient</span>
            <span>Template</span>
            <span>Status</span>
            <span>Time</span>
            <span />
          </div>
          {filtered.map((log) => (
            <button className="logs-row" key={log.id} onClick={() => setSelected(log)}>
              <span className="logs-message">
                <span className={cx('logs-message__icon', `logs-message__icon--${log.status}`)}>
                  <Mail size={13} />
                </span>
                <span>
                  <strong>{log.subject}</strong>
                  <small>{log.id}</small>
                </span>
              </span>
              <span className="logs-recipient">
                <strong>{log.toName}</strong>
                <small>{log.to}</small>
              </span>
              <span className="logs-template">{log.template || <em>Raw HTML</em>}</span>
              <StatusChip status={log.status} />
              <span className="logs-time">{log.time}</span>
              <ChevronRight size={13} className="logs-chevron" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="logs-empty">
              <Search size={18} />
              <strong>No messages match</strong>
              <span>Try a different status or search term.</span>
            </div>
          )}
        </div>

        <div className="logs-foot">
          <span>
            Showing {filtered.length} of {logs.length} recent messages · {logs.length > 0 ? 'All time' : ''}
          </span>
          <div className="logs-pagination">
            <button disabled>
              <ChevronDown size={13} style={{ transform: 'rotate(90deg)' }} />
            </button>
            <span>1</span>
            <button disabled>
              <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        </div>
      </section>

      <div className="logs-integrations">
        <div className="logs-integration">
          <span className="logs-integration__icon">
            <WebhookIcon />
          </span>
          <div>
            <strong>Deliver events to your app</strong>
            <p>Subscribe to delivered, bounced, complained and reply events with signed webhooks.</p>
          </div>
          <button>Manage webhooks <ArrowRight size={12} /></button>
        </div>
        <div className="logs-integration">
          <span className="logs-integration__icon logs-integration__icon--blue">
            <Activity size={16} />
          </span>
          <div>
            <strong>Local SMTP transport</strong>
            <p>Sent, failed and inbound events are produced by this server’s worker and inbound listener.</p>
          </div>
          <Badge tone="success" dot>Worker running</Badge>
        </div>
      </div>

      <EventDrawer log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function WebhookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
    </svg>
  )
}
