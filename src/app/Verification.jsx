import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  Clock3,
  Code2,
  Fingerprint,
  KeyRound,
  Mail,
  Send,
  ShieldCheck,
  Timer,
  UserX,
} from 'lucide-react'
import { Badge, Button, CopyButton, Field, Modal } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard, EmptyState } from './shared'

function formatWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Verification() {
  const { templates, config, toast } = useStore()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [redirect, setRedirect] = useState(`${config.appUrl || ''}/#/app/verification`)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const published = templates.filter((item) => item.publishedVersion || item.status === 'published')
  const counts = useMemo(
    () => ({
      pending: requests.filter((item) => item.status === 'pending').length,
      verified: requests.filter((item) => item.status === 'verified').length,
    }),
    [requests],
  )

  const load = async () => {
    try {
      const data = await api.verifications()
      setRequests(data.verifications || [])
    } catch (error) {
      toast('Verification requests could not be loaded', 'error', error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!template && published[0]) setTemplate(published[0].slug)
  }, [template, published])

  const send = async () => {
    if (!email.trim()) return toast('Enter an email address', 'error')
    setBusy(true)
    try {
      const data = await api.sendVerificationTest({
        email: email.trim(),
        name: name.trim(),
        template: template || undefined,
        redirect_url: redirect.trim() || undefined,
      })
      setResult(data)
      setEmail('')
      setName('')
      await load()
      toast('Verification email queued', 'success', data.debug ? 'Local debug link generated' : 'Check the recipient inbox')
    } catch (error) {
      toast('Verification could not be sent', 'error', error.message)
    } finally {
      setBusy(false)
    }
  }

  const snippet = `curl -X POST ${config.appUrl}/verify/v1/requests \\
  -H "Authorization: Bearer $POSTIQUE_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "person@example.com",
    "template": "verify-email",
    "redirect_url": "https://app.example.com/verified",
    "metadata": { "submission_id": "sub_123" }
  }'`

  return (
    <div className="page page--verification">
      <PageHeader
        eyebrow="Email ownership · no account required"
        title="Verification"
        description="Confirm that someone owns an email address, then forget about them. No user record, password, session or profile is created."
        actions={<Badge tone="success">Ephemeral</Badge>}
      />

      <div className="verification-banner">
        <span><UserX size={17} /></span>
        <div>
          <strong>This is not a BaaS user system.</strong>
          <p>Verification requests expire and are purged. Use Accounts only when a product actually needs persistent users and sessions.</p>
        </div>
        <Badge tone="neutral">BYO identity</Badge>
      </div>

      <div className="verification-stats">
        <div><span>Recent requests</span><strong>{requests.length}</strong><small>last records</small></div>
        <div><span>Pending</span><strong>{counts.pending}</strong><small>awaiting click</small></div>
        <div><span>Verified</span><strong>{counts.verified}</strong><small>proof recorded</small></div>
        <div><span>Retention</span><strong>{config.verificationHours || 24}h</strong><small>then purged</small></div>
      </div>

      <div className="verification-layout">
        <div className="verification-main">
          <SectionCard title="Try a verification" description="Send a real request through this workspace. The developer chooses the template.">
            <div className="verification-form">
              <div className="verification-form__row">
                <Field label="Email to verify">
                  <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" />
                </Field>
                <Field label="Display name" hint="Optional, available to the template as {{name}}.">
                  <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Amara" />
                </Field>
              </div>
              <div className="verification-form__row">
                <Field label="Verification template" hint="Published Template Studio templates only.">
                  <select className="input" value={template} onChange={(event) => setTemplate(event.target.value)}>
                    <option value="">Built-in fallback</option>
                    {published.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Redirect after verification">
                  <input className="input" value={redirect} onChange={(event) => setRedirect(event.target.value)} />
                </Field>
              </div>
              <div className="verification-form__action">
                <span><ShieldCheck size={13} /> No account is created. The token is single-use and expires.</span>
                <Button onClick={send} loading={busy} icon={!busy && <Send size={14} />}>Send verification</Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Recent verification requests" description="Temporary proof records for this workspace.">
            {loading ? (
              <div className="verification-loading"><span className="button__spinner" /> Loading…</div>
            ) : requests.length === 0 ? (
              <EmptyState
                icon={<Fingerprint size={20} />}
                title="No verification requests yet"
                description="Send one above, or create requests from your backend with a secret API key."
              />
            ) : (
              <div className="verification-table">
                <div className="verification-table__head"><span>Email</span><span>Status</span><span>Created</span><span>Expires</span></div>
                {requests.map((request) => (
                  <div className="verification-row" key={request.id}>
                    <div><strong>{request.email}</strong><small>{request.name || request.id}</small></div>
                    <Badge tone={request.status === 'verified' ? 'success' : request.status === 'failed' ? 'danger' : 'warning'}>
                      {request.status}
                    </Badge>
                    <span>{formatWhen(request.createdAt)}</span>
                    <span>{formatWhen(request.expiresAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="verification-side">
          <SectionCard title="Server API" description="Create requests with a secret key from your backend.">
            <div className="verification-snippet">
              <div><span><Code2 size={12} /> POST /verify/v1/requests</span><CopyButton value={snippet} compact /></div>
              <pre><code>{snippet}</code></pre>
            </div>
            <div className="verification-api-meta">
              <span><Check size={11} /> Template Studio design</span>
              <span><Check size={11} /> 30-minute link</span>
              <span><Check size={11} /> Single-use</span>
              <span><Check size={11} /> 24-hour purge</span>
            </div>
          </SectionCard>

          <div className="verification-side-card">
            <span><KeyRound size={15} /></span>
            <div>
              <strong>No account, no password</strong>
              <p>Verification requests contain only the email, template choice, metadata and redirect.</p>
            </div>
          </div>
          <div className="verification-side-card">
            <span><Timer size={15} /></span>
            <div>
              <strong>Proof lives briefly</strong>
              <p>After verification, your backend can read the request status with its secret key. Records are purged after the retention window.</p>
            </div>
          </div>
          <div className="verification-side-card verification-side-card--link" onClick={() => window.location.assign('/#/app/studio')}>
            <div>
              <strong>Design the verification email</strong>
              <p>Use <code>verify_url</code>, <code>email</code> and <code>name</code> variables in Template Studio.</p>
            </div>
            <ArrowRight size={14} />
          </div>
        </aside>
      </div>

      <Modal
        open={Boolean(result)}
        onClose={() => setResult(null)}
        title="Verification request created"
        eyebrow="Ephemeral proof"
        description="The request is pending until the recipient opens the link."
        footer={<Button onClick={() => setResult(null)}>Done</Button>}
      >
        {result && (
          <div className="verification-result">
            <div><span>Request</span><code>{result.verification.id}</code></div>
            <div><span>Email</span><strong>{result.verification.email}</strong></div>
            <div><span>Expires</span><strong>{formatWhen(result.verification.expires_at)}</strong></div>
            {result.debug?.verifyUrl && (
              <div className="verification-debug">
                <span>Local debug link</span>
                <code>{result.debug.verifyUrl}</code>
                <CopyButton value={result.debug.verifyUrl} label="Copy link" />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
