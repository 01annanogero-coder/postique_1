import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Clock3,
  Megaphone,
  Pause,
  Play,
  Plus,
  Send,
  Users,
} from 'lucide-react'
import { Badge, Button, Field, Modal, ProgressBar } from '../components/ui'
import { api } from '../lib/api'
import { navigate } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard, EmptyState } from './shared'

function parseRecipients(value) {
  const rows = []
  for (const line of String(value || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [email, name = '', externalId = ''] = trimmed.split(',').map((part) => part.trim())
    if (!email.includes('@')) continue
    rows.push({
      email,
      name,
      external_user_id: externalId || undefined,
      variables: name ? { name } : {},
    })
  }
  return rows
}

function statusTone(status) {
  if (status === 'completed') return 'success'
  if (status === 'running') return 'blue'
  if (status === 'paused' || status === 'scheduled') return 'warning'
  if (status === 'cancelled') return 'danger'
  return 'neutral'
}

function when(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function localInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function CampaignRow({ campaign, onOpen, onAction }) {
  const total = campaign.total || 0
  const done = (campaign.sent || 0) + (campaign.failed || 0) + (campaign.suppressed || 0) + (campaign.unsubscribed || 0) + (campaign.cancelled || 0)
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="campaign-row">
      <button type="button" className="campaign-row__main campaign-row__open" onClick={() => onOpen(campaign)}>
        <span className="campaign-row__icon"><Megaphone size={16} /></span>
        <span>
          <span className="campaign-row__title">
            <strong>{campaign.name}</strong>
            <Badge tone={statusTone(campaign.status)} dot>{campaign.status}</Badge>
          </span>
          <span className="campaign-row__meta">
            {campaign.status === 'scheduled' && campaign.scheduledAt
              ? `Scheduled ${when(campaign.scheduledAt)} · `
              : ''}
            {total.toLocaleString()} recipients · {campaign.sent || 0} sent · {campaign.failed || 0} failed
          </span>
        </span>
      </button>
      <div className="campaign-row__progress">
        <div>
          <span>{percent}%</span>
          <small>{campaign.pending || 0} waiting</small>
        </div>
        <ProgressBar value={percent} />
      </div>
      <div className="campaign-row__actions">
        {campaign.status === 'running' && (
          <Button variant="secondary" size="sm" onClick={() => onAction('pause', campaign)} icon={<Pause size={13} />}>
            Pause
          </Button>
        )}
        {(campaign.status === 'paused' || campaign.status === 'draft' || campaign.status === 'scheduled') && (
          <Button size="sm" onClick={() => onAction('start', campaign)} icon={<Play size={13} />}>
            {campaign.status === 'paused' ? 'Resume' : 'Start now'}
          </Button>
        )}
        <button className="icon-button" onClick={() => onOpen(campaign)} aria-label="Open campaign">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function CampaignDetail({
  detail,
  analytics,
  loading,
  schedule,
  setSchedule,
  audience,
  setAudience,
  onClose,
  onAction,
  onAdd,
  onSchedule,
  onCsv,
  busy,
}) {
  const campaign = detail?.campaign
  const recipients = detail?.recipients || []
  const canAdd = campaign && ['draft', 'scheduled', 'running', 'paused'].includes(campaign.status)
  const canSchedule = campaign && campaign.status === 'draft'
  const canCancel = campaign && !['completed', 'cancelled'].includes(campaign.status)

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign?.name || 'Campaign'}
      eyebrow="Campaign detail"
      description={campaign ? `Created ${when(campaign.createdAt)} · ${campaign.batchSize} recipients per batch` : 'Loading…'}
      footer={
        <>
          {canCancel && (
            <Button variant="danger" onClick={() => onAction('cancel', campaign)}>
              Cancel campaign
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </>
      }
    >
      {loading || !campaign ? (
        <div className="campaign-loading"><span className="button__spinner" /> Loading campaign…</div>
      ) : (
        <div className="campaign-detail">
          <div className="campaign-detail__status">
            <Badge tone={statusTone(campaign.status)} dot>{campaign.status}</Badge>
            {campaign.status === 'scheduled' && campaign.scheduledAt && (
              <span><CalendarClock size={12} /> Starts {when(campaign.scheduledAt)}</span>
            )}
            {campaign.startedAt && <span><Clock3 size={12} /> Started {when(campaign.startedAt)}</span>}
          </div>

          <div className="campaign-detail__stats">
            <div><span>Total</span><strong>{campaign.total}</strong></div>
            <div><span>Sent</span><strong>{campaign.sent}</strong></div>
            <div><span>Waiting</span><strong>{campaign.pending + campaign.queued}</strong></div>
            <div><span>Failed</span><strong>{campaign.failed}</strong></div>
            <div><span>Cancelled</span><strong>{campaign.cancelled}</strong></div>
            <div><span>Unsubscribed</span><strong>{campaign.unsubscribed}</strong></div>
          </div>

          {analytics && (
            <div className="campaign-detail__analytics">
              <span><strong>{analytics.deliveryRate}%</strong> delivery rate</span>
              <span>{analytics.byDomain.slice(0, 3).map((item) => `${item.domain} (${item.count})`).join(' · ') || 'No domain data'}</span>
              {analytics.errors[0] && <span className="campaign-detail__error">{analytics.errors[0].count}× {analytics.errors[0].message}</span>}
            </div>
          )}

          {campaign.status === 'running' && (
            <div className="campaign-detail__actions">
              <Button variant="secondary" size="sm" onClick={() => onAction('pause', campaign)} icon={<Pause size={13} />}>
                Pause after current work
              </Button>
            </div>
          )}
          {campaign.status === 'paused' && (
            <div className="campaign-detail__actions">
              <Button size="sm" onClick={() => onAction('start', campaign)} icon={<Play size={13} />}>Resume</Button>
            </div>
          )}

          {canSchedule && (
            <div className="campaign-detail__schedule">
              <Field label="Schedule for later" hint="The worker starts the campaign at this time. Times are shown in your local timezone.">
                <input
                  className="input"
                  type="datetime-local"
                  value={schedule || localInput(campaign.scheduledAt)}
                  min={localInput(new Date(Date.now() + 60_000).toISOString())}
                  onChange={(event) => setSchedule(event.target.value)}
                />
              </Field>
              <Button variant="secondary" onClick={onSchedule} disabled={!schedule && !campaign.scheduledAt} icon={<CalendarClock size={14} />}>
                Schedule
              </Button>
            </div>
          )}

          <div className="campaign-detail__recipients">
            <div className="campaign-detail__section-head">
              <div>
                <strong>Recipients</strong>
                <span>{recipients.length.toLocaleString()} shown</span>
              </div>
            </div>
            {recipients.length === 0 ? (
              <p className="campaign-detail__empty">No recipients in this campaign.</p>
            ) : (
              <div className="campaign-recipient-table">
                <div className="campaign-recipient-table__head">
                  <span>Recipient</span><span>Status</span><span>Detail</span>
                </div>
                {recipients.slice(0, 100).map((recipient) => (
                  <div className="campaign-recipient-row" key={recipient.id}>
                    <div>
                      <strong>{recipient.email}</strong>
                      <small>{recipient.name || recipient.externalUserId || '—'}</small>
                    </div>
                    <Badge tone={recipient.status === 'sent' ? 'success' : recipient.status === 'failed' ? 'danger' : recipient.status === 'unsubscribed' ? 'warning' : 'neutral'}>
                      {recipient.status}
                    </Badge>
                    <span>{recipient.error || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canAdd && (
            <div className="campaign-detail__add">
              <Field
                label="Append a recipient batch"
                hint={`${parseRecipients(audience).length} parsed · max 5,000 per request · duplicates are ignored.`}
              >
                <textarea
                  className="input campaign-audience campaign-audience--small"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  rows={4}
                  placeholder={'another@example.com,Name\nthird@example.com,Name,user_789'}
                />
              </Field>
              <Button variant="secondary" onClick={onAdd} disabled={!parseRecipients(audience).length || busy} icon={<Plus size={14} />}>
                Add recipients
              </Button>
              <label className="button button--secondary button--sm campaign-csv-button">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onCsv(file)
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function Campaigns() {
  const { templates, domains, toast } = useStore()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [audience, setAudience] = useState('')
  const [startNow, setStartNow] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailAudience, setDetailAudience] = useState('')
  const [detailSchedule, setDetailSchedule] = useState('')

  const identities = useMemo(
    () => domains.flatMap((domain) => (domain.identityRecords || []).map((identity) => ({ ...identity, domain: domain.name }))),
    [domains],
  )
  const publishedTemplates = templates.filter((item) => item.publishedVersion || item.status === 'published')

  const load = async () => {
    try {
      const data = await api.campaigns()
      setCampaigns(data.campaigns || [])
    } catch (error) {
      toast('Campaigns could not be loaded', 'error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (id) => {
    if (!id) return
    setDetailLoading(true)
    try {
      const nextDetail = await api.campaign(id)
      setDetail(nextDetail)
      try {
        setAnalytics(await api.campaignAnalytics(id))
      } catch {
        setAnalytics(null)
      }
    } catch (error) {
      toast('Campaign could not be loaded', 'error', error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (detailId) loadDetail(detailId)
  }, [detailId])

  useEffect(() => {
    if (!template && publishedTemplates[0]) setTemplate(publishedTemplates[0].slug)
    if (!fromEmail && identities[0]) setFromEmail(identities[0].from_email)
  }, [template, fromEmail, publishedTemplates, identities])

  const openDetail = (campaign) => {
    setDetailId(campaign.id)
    setDetail(null)
    setAnalytics(null)
    setDetailAudience('')
    setDetailSchedule(localInput(campaign.scheduledAt))
  }

  const create = async () => {
    const recipients = parseRecipients(audience)
    if (!name.trim()) return toast('Give the campaign a name', 'error')
    if (!template) return toast('Choose a published template', 'error')
    if (!recipients.length) return toast('Add at least one recipient', 'error')
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) return toast('Choose a future schedule', 'error')
    setBusy(true)
    try {
      const result = await api.createCampaign({
        name: name.trim(),
        template,
        from_email: fromEmail || undefined,
        subject: subject.trim() || undefined,
        recipients,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      })
      if (startNow && !scheduledAt) await api.startCampaign(result.campaign.id)
      toast(
        scheduledAt ? 'Campaign scheduled' : 'Campaign created',
        'success',
        scheduledAt ? `Starts ${when(scheduledAt)}` : `${recipients.length} recipients queued`,
      )
      setCreateOpen(false)
      setName('')
      setAudience('')
      setSubject('')
      setScheduledAt('')
      await load()
      openDetail(result.campaign)
    } catch (error) {
      toast('Campaign could not be created', 'error', error.message)
    } finally {
      setBusy(false)
    }
  }

  const action = async (type, campaign) => {
    try {
      if (type === 'start') {
        const result = campaign.status === 'paused' ? await api.resumeCampaign(campaign.id) : await api.startCampaign(campaign.id)
        setCampaigns((current) => current.map((item) => (item.id === campaign.id ? result.campaign : item)))
        toast(campaign.status === 'paused' ? 'Campaign resumed' : 'Campaign started', 'success')
      }
      if (type === 'pause') {
        const result = await api.pauseCampaign(campaign.id)
        setCampaigns((current) => current.map((item) => (item.id === campaign.id ? result.campaign : item)))
        toast('Campaign paused', 'success', 'Queued messages already handed to the delivery worker may still send.')
      }
      if (type === 'cancel') {
        const result = await api.cancelCampaign(campaign.id)
        setCampaigns((current) => current.map((item) => (item.id === campaign.id ? result.campaign : item)))
        toast('Campaign cancelled', 'success', 'Queued messages will be skipped by the worker.')
      }
      if (detailId === campaign.id) await loadDetail(campaign.id)
      await load()
    } catch (error) {
      toast('Campaign action failed', 'error', error.message)
    }
  }

  const addRecipients = async () => {
    const recipients = parseRecipients(detailAudience)
    if (!detailId || !recipients.length) return
    setBusy(true)
    try {
      const result = await api.addCampaignRecipients(detailId, recipients)
      toast('Recipients added', 'success', `${result.added} added · ${result.total} total`)
      setDetailAudience('')
      await loadDetail(detailId)
      await load()
    } catch (error) {
      toast('Recipients could not be added', 'error', error.message)
    } finally {
      setBusy(false)
    }
  }

  const schedule = async () => {
    if (!detailId || !detailSchedule) return toast('Choose a schedule', 'error')
    setBusy(true)
    try {
      await api.scheduleCampaign(detailId, new Date(detailSchedule).toISOString())
      toast('Campaign scheduled', 'success', `Starts ${when(detailSchedule)}`)
      await loadDetail(detailId)
      await load()
    } catch (error) {
      toast('Campaign could not be scheduled', 'error', error.message)
    } finally {
      setBusy(false)
    }
  }

  const importCsv = async (file) => {
    if (!detailId) return
    setBusy(true)
    try {
      const result = await api.addCampaignRecipientsCsv(detailId, await file.text())
      toast('CSV imported', 'success', `${result.added} added · ${result.total} total`)
      await loadDetail(detailId)
      await load()
    } catch (error) {
      toast('CSV could not be imported', 'error', error.message)
    } finally {
      setBusy(false)
    }
  }

  const totals = campaigns.reduce(
    (sum, campaign) => ({
      recipients: sum.recipients + (campaign.total || 0),
      sent: sum.sent + (campaign.sent || 0),
      active: sum.active + (campaign.status === 'running' ? 1 : 0),
    }),
    { recipients: 0, sent: 0, active: 0 },
  )

  return (
    <div className="page page--campaigns">
      <PageHeader
        eyebrow="Bring your own audience"
        title="Campaigns"
        description="Send a template to recipients you supply. Postique queues each message, but your database remains the source of truth."
        actions={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus size={15} />}>
            New campaign
          </Button>
        }
      />

      <div className="campaign-stats">
        <div><span>Campaigns</span><strong>{campaigns.length}</strong><small>all time</small></div>
        <div><span>Recipients</span><strong>{totals.recipients.toLocaleString()}</strong><small>across campaigns</small></div>
        <div><span>Accepted</span><strong>{totals.sent.toLocaleString()}</strong><small>messages</small></div>
        <div><span>Running</span><strong>{totals.active}</strong><small>campaigns</small></div>
      </div>

      <div className="campaign-layout">
        <SectionCard title="Your campaigns" description="Recipient batches are stored only for the campaign retention window.">
          {loading ? (
            <div className="campaign-loading"><span className="button__spinner" /> Loading campaigns…</div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone size={20} />}
              title="No campaigns yet"
              description="Create a campaign from a published template and paste the audience from your own application."
              action={<Button onClick={() => setCreateOpen(true)} icon={<Plus size={14} />}>New campaign</Button>}
            />
          ) : (
            <div className="campaign-list">
              {campaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} onOpen={openDetail} onAction={action} />
              ))}
            </div>
          )}
        </SectionCard>

        <aside className="campaign-side">
          <div className="campaign-side-card">
            <span><Users size={15} /></span>
            <div>
              <strong>BYOA by design</strong>
              <p>Your backend owns the user table. Postique only receives the recipient fields required for this send.</p>
            </div>
          </div>
          <div className="campaign-side-card">
            <span><Clock3 size={15} /></span>
            <div>
              <strong>Batch queue</strong>
              <p>Recipients are processed in batches through the same queue and delivery routes as transactional mail.</p>
            </div>
          </div>
          <div className="campaign-side-card campaign-side-card--link" onClick={() => navigate('/app/developers')}>
            <div>
              <strong>API-first campaigns</strong>
              <p>Push recipients from any backend through the authenticated campaign API.</p>
            </div>
            <ArrowRight size={14} />
          </div>
        </aside>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New campaign"
        eyebrow="BYOA audience"
        description="Paste one recipient per line as email,name or email,name,external_user_id."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={busy} icon={!busy && <Send size={14} />}>
              {scheduledAt ? 'Schedule campaign' : 'Create campaign'}
            </Button>
          </>
        }
      >
        <div className="campaign-form">
          <div className="campaign-form__row">
            <Field label="Campaign name">
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Privacy policy update" />
            </Field>
            <Field label="Published template">
              <select className="input" value={template} onChange={(event) => setTemplate(event.target.value)}>
                {publishedTemplates.length === 0 && <option value="">Publish a template first</option>}
                {publishedTemplates.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="campaign-form__row">
            <Field label="From identity" hint="Blank uses the first verified identity.">
              <select className="input" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)}>
                <option value="">First verified identity</option>
                {identities.map((identity) => (
                  <option key={identity.from_email} value={identity.from_email}>{identity.from_email}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject override" hint="Blank uses the template subject.">
              <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Template subject" />
            </Field>
          </div>
          <Field label="Schedule for later" hint="Leave blank to keep as a draft or start immediately. Times are local.">
            <input
              className="input"
              type="datetime-local"
              value={scheduledAt}
              min={localInput(new Date(Date.now() + 60_000).toISOString())}
              onChange={(event) => {
                setScheduledAt(event.target.value)
                if (event.target.value) setStartNow(false)
              }}
            />
          </Field>
          <Field label="Recipients" hint={`${parseRecipients(audience).length} parsed recipients · maximum 5,000 per request.`}>
            <textarea
              className="input campaign-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              rows={8}
              placeholder={'amara@example.com,Amara\nbuyer@example.com,Buyer,user_123'}
            />
          </Field>
          <label className="campaign-start-check">
            <input
              type="checkbox"
              checked={startNow && !scheduledAt}
              disabled={Boolean(scheduledAt)}
              onChange={(event) => setStartNow(event.target.checked)}
            />
            <span>Start immediately after creating the draft</span>
          </label>
        </div>
      </Modal>

      {detailId && (
        <CampaignDetail
          detail={detail}
          analytics={analytics}
          loading={detailLoading}
          schedule={detailSchedule}
          setSchedule={setDetailSchedule}
          audience={detailAudience}
          setAudience={setDetailAudience}
          onClose={() => {
            setDetailId(null)
            setDetail(null)
          }}
          onAction={action}
          onAdd={addRecipients}
          onSchedule={schedule}
          onCsv={importCsv}
          busy={busy}
        />
      )}
    </div>
  )
}
