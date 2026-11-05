import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Clock3, ListTodo, RefreshCw, RotateCcw, Square } from 'lucide-react'
import { Badge, Button } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard, EmptyState } from './shared'

function when(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function statusTone(status) {
  if (status === 'done') return 'success'
  if (status === 'running') return 'blue'
  if (status === 'failed') return 'danger'
  if (status === 'cancelled') return 'neutral'
  return 'warning'
}

function JobRow({ job, onRetry, onCancel, busy }) {
  return (
    <div className="queue-row">
      <div className="queue-row__main">
        <span className={`queue-row__icon queue-row__icon--${job.status}`}>
          {job.status === 'failed' ? <AlertTriangle size={14} /> : <Activity size={14} />}
        </span>
        <div>
          <div className="queue-row__title">
            <code>{job.type}</code>
            <Badge tone={statusTone(job.status)} dot>{job.status}</Badge>
          </div>
          <span className="queue-row__meta">
            <code>{job.id}</code> · attempt {job.attempts}/{job.maxAttempts}
            {job.lastError ? ` · ${job.lastError}` : ''}
          </span>
        </div>
      </div>
      <span className="queue-row__when">{when(job.runAt)}</span>
      <div className="queue-row__actions">
        {job.status === 'failed' && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRetry(job)} icon={<RotateCcw size={12} />}>
            Retry
          </Button>
        )}
        {(job.status === 'pending' || job.status === 'failed') && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(job)} icon={<Square size={11} />}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

export default function Queue() {
  const { toast } = useStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setData(await api.queue())
    } catch (error) {
      toast('Queue could not be loaded', 'error', error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const run = async (action, job) => {
    setBusy(true)
    try {
      const next = action === 'retry' ? await api.retryQueueJob(job.id) : await api.cancelQueueJob(job.id)
      setData(next)
      toast(action === 'retry' ? 'Job queued again' : 'Job cancelled', 'success', job.type)
    } catch (error) {
      toast('Queue action failed', 'error', error.message)
    } finally {
      setBusy(false)
    }
  }

  const counts = data?.counts || { pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 }

  return (
    <div className="page page--queue">
      <PageHeader
        eyebrow="Delivery operations"
        title="Queue"
        description="Inspect delivery, campaign and webhook jobs. Retry failed work or cancel jobs before the worker picks them up."
        actions={
          <Button variant="secondary" onClick={load} icon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      />

      <div className="queue-stats">
        <div><span>Pending</span><strong>{counts.pending}</strong><small>waiting for worker</small></div>
        <div><span>Running</span><strong>{counts.running}</strong><small>in flight</small></div>
        <div><span>Failed</span><strong>{counts.failed}</strong><small>need attention</small></div>
        <div><span>Done</span><strong>{counts.done}</strong><small>completed jobs</small></div>
      </div>

      <div className="queue-layout">
        <div className="queue-main">
          <SectionCard title="Failed jobs" description="Retry after fixing the destination, credentials or campaign.">
            {loading ? (
              <div className="queue-loading"><span className="button__spinner" /> Loading queue…</div>
            ) : !data?.failures?.length ? (
              <EmptyState
                icon={<ListTodo size={20} />}
                title="No failed jobs"
                description="Worker failures appear here with their last error and attempt count."
              />
            ) : (
              <div className="queue-list">
                {data.failures.map((job) => (
                  <JobRow key={job.id} job={job} busy={busy} onRetry={(item) => run('retry', item)} onCancel={(item) => run('cancel', item)} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent jobs" description="Newest jobs for this workspace.">
            {!data?.recent?.length ? (
              <EmptyState
                icon={<Activity size={20} />}
                title="The queue is empty"
                description="Sends, campaign batches and webhook deliveries will appear here."
              />
            ) : (
              <div className="queue-list">
                {data.recent.map((job) => (
                  <JobRow key={job.id} job={job} busy={busy} onRetry={(item) => run('retry', item)} onCancel={(item) => run('cancel', item)} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="queue-side">
          <div className="queue-side-card">
            <span><Clock3 size={15} /></span>
            <div>
              <strong>Next wake-up</strong>
              <p>{data?.nextRunAt ? when(data.nextRunAt) : 'No pending jobs.'}</p>
            </div>
          </div>
          <div className="queue-side-card">
            <span><ListTodo size={15} /></span>
            <div>
              <strong>What runs here</strong>
              <p>Message sends, campaign batches, scheduled campaign starts and webhook deliveries share this durable queue.</p>
            </div>
          </div>
          <div className="queue-side-card">
            <span><Square size={15} /></span>
            <div>
              <strong>Safe cancellation</strong>
              <p>Cancelling a pending job stops it before the worker claims it. Running jobs cannot be cancelled from here.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
