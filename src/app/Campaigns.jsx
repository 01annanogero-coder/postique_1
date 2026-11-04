import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Users,
  X,
} from 'lucide-react'
import { Badge, Button, Field, Modal, ProgressBar } from '../components/ui'
import { api } from '../lib/api'
import { cx, navigate } from '../lib/utils'
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
  if (status === 'paused') return 'warning'
  if (status === 'cancelled') return 'neutral'
  return 'neutral'
}

function CampaignRow({ campaign, onAction }) {
  const total = campaign.total || 0
  const done = (campaign.sent || 0) + (campaign.failed || 0) + (campaign.suppressed || 0)
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="campaign-row">
      <div className="campaign-row__main">
        <span className="campaign-row__icon"><Megaphone size={16} /></span>
        <div>
          <div className="campaign-row__title">
            <strong>{campaign.name}</strong>
            <Badge tone={statusTone(campaign.status)} dot>{campaign.status}</Badge>
          </div>
          <span className="campaign-row__meta">
            {total.toLocaleString()} recipients · {campaign.sent || 0} sent · {campaign.failed || 0} failed
          </span>
        </div>
      </div>
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
        {(campaign.status === 'paused' || campaign.status === 'draft') && (
          <Button size="sm" onClick={() => onAction('start', campaign)} icon={<Play size={13} />}>
            {campaign.status === 'paused' ? 'Resume' : 'Start'}
          </Button>
        )}
        <button className="icon-button" onClick={() => navigate('/app/campaigns')} aria-label="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>
    </div>
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

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!template && publishedTemplates[0]) setTemplate(publishedTemplates[0].slug)
    if (!fromEmail && identities[0]) setFromEmail(identities[0].from_email)
  }, [template, fromEmail, publishedTemplates, identities])

  const create = async () => {
    const recipients = parseRecipients(audience)
    if (!name.trim()) return toast('Give the campaign a name', 'error')
    if (!template) return toast('Choose a published template', 'error')
    if (!recipients.length) return toast('Add at least one recipient', 'error')
    setBusy(true)
    try {
      const result = await api.createCampaign({
        name: name.trim(),
        template,
        from_email: fromEmail || undefined,
        subject: subject.trim() || undefined,
        recipients,
      })
      if (startNow) await api.startCampaign(result.campaign.id)
      toast('Campaign created', 'success', `${recipients.length} recipients queued`)
      setCreateOpen(false)
      setName('')
      setAudience('')
      setSubject('')
      await load()
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
    } catch (error) {
      toast('Campaign action failed', 'error', error.message)
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
                <CampaignRow key={campaign.id} campaign={campaign} onAction={action} />
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
            <Button onClick={create} loading={busy} icon={!busy && <Send size={14} />}>Create campaign</Button>
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
            <input type="checkbox" checked={startNow} onChange={(event) => setStartNow(event.target.checked)} />
            <span>Start immediately after creating the draft</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}
