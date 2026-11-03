import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  Inbox,
  MailCheck,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Avatar, Badge, Button } from '../components/ui'
import { cx, formatNumber, getGreeting, navigate } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard, StatCard } from './shared'

function VolumeChart({ range, series }) {
  const [hover, setHover] = useState(null)
  const data = range === 7 ? series.slice(-7) : series
  const max = Math.max(10, ...data.map((item) => item.sent), ...data.map((item) => item.replies))
  const scaleMax = Math.ceil(max / 10) * 10
  const width = 720
  const height = 212
  const left = 8
  const right = 712
  const top = 18
  const bottom = 186
  const points = data.map((item, index) => ({
    ...item,
    x: left + (index / Math.max(data.length - 1, 1)) * (right - left),
    y: bottom - (item.sent / scaleMax) * (bottom - top),
  }))
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const area = `${line} L${right},${bottom} L${left},${bottom} Z`
  const active = hover !== null ? points[hover] : null

  const handleMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    setHover(Math.round(ratio * Math.max(data.length - 1, 1)))
  }

  return (
    <div className="volume-chart">
      <div className="volume-chart__y">
        <span>{scaleMax}</span>
        <span>{Math.round(scaleMax * 0.72)}</span>
        <span>{Math.round(scaleMax * 0.36)}</span>
        <span>0</span>
      </div>
      <div className="volume-chart__plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Email sends over the last ${range} days`}
        >
          <defs>
            <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C6F26B" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#C6F26B" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[top, top + 56, top + 112, bottom].map((y) => (
            <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="#e8e4d9" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#chartArea)" />
          <path d={line} fill="none" stroke="#6f9e35" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {active && (
            <>
              <line x1={active.x} x2={active.x} y1={top} y2={bottom} stroke="#aeb7a4" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={active.x} cy={active.y} r="4" fill="#fffefa" stroke="#6f9e35" strokeWidth="2" />
            </>
          )}
          {!active && points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="3.5"
              fill="#6f9e35"
              stroke="#fffefa"
              strokeWidth="2"
            />
          )}
        </svg>
        {active && (
          <div className="chart-tooltip" style={{ left: `${(active.x / width) * 100}%` }}>
            <span>{active.day}</span>
            <strong>{active.sent} sends</strong>
            <span>{active.replies} replies</span>
          </div>
        )}
        <div className="volume-chart__x">
          {data.map((item, index) =>
            index === 0 || index === Math.floor(data.length / 2) || index === data.length - 1 ? (
              <span key={item.day}>{item.day}</span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  )
}

function ConversationRow({ thread }) {
  return (
    <button
      className={cx('overview-conversation', thread.unread && 'is-unread')}
      onClick={() => navigate(`/app/inbox?thread=${thread.id}`)}
    >
      <Avatar
        name={thread.customer.name}
        initials={thread.customer.initials}
        color={thread.customer.color}
        size={34}
      />
      <span className="overview-conversation__main">
        <span className="overview-conversation__top">
          <strong>{thread.customer.name}</strong>
          <time>{thread.lastActivity}</time>
        </span>
        <span className="overview-conversation__subject">{thread.subject}</span>
        <span className="overview-conversation__snippet">{thread.snippet}</span>
      </span>
      {thread.unread && <span className="overview-conversation__dot" />}
    </button>
  )
}

export default function Overview() {
  const { threads, templates, domains, openCount, unreadCount, metrics, volume, activity, workspace, config } = useStore()
  const [range, setRange] = useState(14)
  const greeting = getGreeting()
  const firstName = (workspace.owner || '').split(' ')[0] || 'there'
  const deliveredRate = metrics.deliveryRate ?? 0
  const totalSent = volume.reduce((total, day) => total + day.sent, 0)
  const peak = volume.reduce((best, day) => (day.sent > (best?.sent || 0) ? day : best), null)
  const firstDomain = domains[0]
  const bounceRate = metrics.outbound ? ((metrics.bounced / metrics.outbound) * 100).toFixed(1) : '0.0'
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="page page--overview">
      <PageHeader
        eyebrow={today}
        title={`${greeting}, ${firstName}.`}
        description="Here’s what your application’s email has been doing while you were building."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/app/developers')} icon={<Code2 size={14} />}>
              API quickstart
            </Button>
            <Button onClick={() => navigate('/app/inbox')} icon={<Inbox size={15} />}>
              Open inbox
              {unreadCount > 0 && <span className="button__count">{unreadCount}</span>}
            </Button>
          </>
        }
      />

      <div className={`demo-note ${config.mailTransport === 'file' ? 'demo-note--warn' : ''}`}>
        <span className="demo-note__icon">
          <Sparkles size={13} />
        </span>
        <span>
          <strong>Self-hosted workspace.</strong>{' '}
          {config.mailTransport === 'file'
            ? 'The local file transport is active — outbound mail is written to data/outbox and is not delivered externally. Configure SMTP_URL for real delivery.'
            : `Outbound mail uses your ${config.mailTransport} transport. Inbound replies are received on port ${config.inboundPort} at ${config.inboundDomain}.`}
        </span>
        <button onClick={() => navigate('/app/domains')}>
          Sending setup <ArrowRight size={13} />
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Emails sent"
          value={formatNumber(metrics.sent || 0)}
          deltaLabel="accepted by your transport"
          icon={<Send size={16} />}
        />
        <StatCard
          label="Delivery rate"
          value={deliveredRate.toFixed(1)}
          suffix="%"
          deltaLabel={`${metrics.bounced || 0} bounced · ${metrics.failed || 0} failed`}
          icon={<MailCheck size={16} />}
          tone="green"
        />
        <StatCard
          label="Replies received"
          value={formatNumber(metrics.replies || 0)}
          deltaLabel={`${openCount} conversations open`}
          icon={<MessageSquare size={16} />}
          tone="blue"
        />
        <StatCard
          label="Templates"
          value={templates.length}
          suffix=""
          deltaLabel={`${templates.filter((template) => template.status === 'published').length} published · ${templates.filter((template) => template.status === 'draft').length} drafts`}
          icon={<FileText size={16} />}
          tone="sand"
        />
      </div>

      <div className="overview-grid">
        <div className="overview-main">
          <SectionCard
            title="Sending volume"
            description="Messages queued and accepted by your SMTP transport."
            action={
              <div className="range-switch">
                <button className={cx(range === 7 && 'is-active')} onClick={() => setRange(7)}>
                  7 days
                </button>
                <button className={cx(range === 14 && 'is-active')} onClick={() => setRange(14)}>
                  14 days
                </button>
              </div>
            }
            className="chart-card"
          >
            <div className="chart-summary">
              <div>
                <strong>{formatNumber(totalSent)}</strong>
                <span>sends in the last 14 days</span>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="chart-legend__dot" /> Outbound
                </span>
                <span>
                  <i className="chart-legend__dot chart-legend__dot--delivered" /> Inbound replies
                </span>
              </div>
            </div>
            <VolumeChart range={range} series={volume} />
            <div className="chart-foot">
              <span>
                <TrendingUp size={13} /> Peak day: {peak?.sent ? `${peak.day} · ${peak.sent} sends` : 'No sends yet'}
              </span>
              <span>{deliveredRate.toFixed(1)}% accepted</span>
            </div>
          </SectionCard>

          <SectionCard
            title="Recent conversations"
            description="Replies that were matched back to your application."
            action={
              <button className="text-button" onClick={() => navigate('/app/inbox')}>
                View all <ArrowRight size={13} />
              </button>
            }
            bodyClassName="section-card__body--flush"
          >
            <div className="overview-conversations">
              {threads.length === 0 && (
                <div className="section-empty">
                  <Inbox size={18} />
                  <strong>No conversations yet</strong>
                  <span>Send your first email from the API or wait for a reply.</span>
                </div>
              )}
              {threads.slice(0, 5).map((thread) => (
                <ConversationRow key={thread.id} thread={thread} />
              ))}
            </div>
          </SectionCard>
        </div>

        <aside className="overview-side">
          <SectionCard title="Workspace health" description="Live checks across your sending infrastructure.">
            <div className="health-score">
              <div className="health-ring" style={{ '--health': `${Math.max(0, Math.min(100, deliveredRate))}%` }}>
                <div>
                  <strong>{metrics.outbound ? deliveredRate.toFixed(1) : '—'}</strong>
                  <span>accepted rate</span>
                </div>
              </div>
              <div className="health-score__copy">
                <Badge tone={firstDomain?.status === 'verified' ? 'success' : 'warning'} dot>
                  {firstDomain?.status === 'verified' ? 'Ready' : 'Setup needed'}
                </Badge>
                <p>
                  {firstDomain
                    ? firstDomain.status === 'verified'
                      ? 'Domain and inbound routing are configured.'
                      : 'Publish the DNS records for this domain.'
                    : 'Add a sending domain to start delivering email.'}
                </p>
              </div>
            </div>
            <div className="health-list">
              <div>
                <span className={`health-list__icon ${firstDomain?.status === 'verified' ? 'health-list__icon--ok' : 'health-list__icon--warn'}`}>
                  {firstDomain?.status === 'verified' ? <Check size={11} /> : <Clock3 size={11} />}
                </span>
                <span>
                  <strong>Sending domain</strong>
                  <small>{firstDomain?.name || 'Not configured'}</small>
                </span>
                <Badge tone={firstDomain?.status === 'verified' ? 'success' : 'warning'}>
                  {firstDomain?.status === 'verified' ? 'DKIM' : 'Pending'}
                </Badge>
              </div>
              <div>
                <span className="health-list__icon health-list__icon--ok">
                  <Check size={11} />
                </span>
                <span>
                  <strong>Inbound routing</strong>
                  <small>{config.inboundDomain} : {config.inboundPort}</small>
                </span>
                <Badge tone={config.inboundEnabled ? 'success' : 'warning'}>
                  {config.inboundEnabled ? 'Listening' : 'Disabled'}
                </Badge>
              </div>
              <div>
                <span className="health-list__icon health-list__icon--warn">
                  <Clock3 size={11} />
                </span>
                <span>
                  <strong>Bounce rate</strong>
                  <small>{bounceRate}% · {metrics.bounced || 0} bounced</small>
                </span>
                <Badge tone="neutral">{bounceRate}%</Badge>
              </div>
              <div>
                <span className="health-list__icon health-list__icon--ok">
                  <ShieldCheck size={11} />
                </span>
                <span>
                  <strong>Storage</strong>
                  <small>Local asset files</small>
                </span>
                <Badge tone="neutral">{metrics.assets || 0}</Badge>
              </div>
            </div>
            <button className="health-link" onClick={() => navigate('/app/domains')}>
              Manage infrastructure <ChevronRight size={13} />
            </button>
          </SectionCard>

          <SectionCard
            title="Recent activity"
            action={
              <button className="icon-link" onClick={() => navigate('/app/logs')} aria-label="View events">
                <ArrowUpRight size={14} />
              </button>
            }
          >
            <div className="activity-list">
              {activity.length === 0 && (
                <div className="section-empty section-empty--compact">
                  <span>No activity yet.</span>
                </div>
              )}
              {activity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-item__marker" style={{ background: item.color }} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <time>{item.time}</time>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="quick-action-card">
            <span className="quick-action-card__icon">
              <Zap size={17} />
            </span>
            <div>
              <strong>Send your first threaded reply</strong>
              <p>Use a template in the inbox and keep the headers intact.</p>
              <button onClick={() => navigate('/app/inbox')}>
                Try it <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
