import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Terminal,
  Trash2,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import { Badge, Button, CopyButton, Field, Modal, Toggle } from '../components/ui'
import { cx } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader } from './shared'

const codeSamples = {
  node: `const response = await fetch(\`\${process.env.POSTIQUE_URL}/v1/send\`, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.POSTIQUE_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": "order-4821"
  },
  body: JSON.stringify({
    from: "orders@acme.co.ke",
    to: ["amara.njoroge@gmail.com"],
    template: "order-confirmation",
    variables: { name: "Amara", order_id: "AC-4821" },
    thread_id: "thr_8f2ka1"
  })
});

const message = await response.json();
console.log(message.id);`,
  curl: `curl -X POST __BASE__/v1/send \\
  -H "Authorization: Bearer $POSTIQUE_KEY" \\
  -H "Idempotency-Key: order-4821" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "orders@acme.co.ke",
    "to": ["amara.njoroge@gmail.com"],
    "template": "order-confirmation",
    "variables": { "name": "Amara", "order_id": "AC-4821" },
    "thread_id": "thr_8f2ka1"
  }'`,
  python: `import os, requests

response = requests.post(
    f"{os.environ['POSTIQUE_URL']}/v1/send",
    headers={"Authorization": f"Bearer {os.environ['POSTIQUE_KEY']}"},
    json={
        "from": "orders@acme.co.ke",
        "to": ["amara.njoroge@gmail.com"],
        "template": "order-confirmation",
        "variables": {"name": "Amara", "order_id": "AC-4821"},
        "thread_id": "thr_8f2ka1",
        "idempotency_key": "order-4821",
    },
    timeout=30,
)

print(response.json()["id"])`,
}

const webhookEvents = [
  'message.sent',
  'message.bounced',
  'message.complained',
  'message.failed',
  'thread.reply_received',
  'verification.completed',
  'campaign.scheduled',
  'campaign.started',
  'campaign.paused',
  'campaign.resumed',
  'campaign.completed',
  'campaign.cancelled',
]

function KeyRow({ apiKey, onRevoke }) {
  return (
    <div className={cx('api-key-row', apiKey.status === 'revoked' && 'is-revoked')}>
      <span className={cx('api-key-row__icon', apiKey.kind === 'public' ? 'is-public' : 'is-secret')}>
        {apiKey.kind === 'public' ? <Globe2 size={15} /> : <KeyRound size={15} />}
      </span>
      <div className="api-key-row__main">
        <div className="api-key-row__title">
          <strong>{apiKey.name}</strong>
          <Badge tone={apiKey.kind === 'public' ? 'blue' : 'dark'}>{apiKey.kind === 'public' ? 'Public' : 'Secret'}</Badge>
          {apiKey.status === 'revoked' && <Badge tone="danger">Revoked</Badge>}
        </div>
        <div className="api-key-row__prefix">
          <code>{apiKey.prefix}••••••••••••••••</code>
          <span>Created {apiKey.createdAt}</span>
        </div>
        {apiKey.kind === 'public' && apiKey.origins && (
          <div className="api-key-row__origins">
            {apiKey.origins.map((origin) => (
              <span key={origin}>
                <Globe2 size={9} /> {origin}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="api-key-row__meta">
        <span>{apiKey.scope}</span>
        <span>Last used {apiKey.lastUsed.toLowerCase()}</span>
      </div>
      <div className="api-key-row__actions">
        {apiKey.status === 'active' ? (
          <button className="key-action key-action--danger" onClick={() => onRevoke(apiKey.id)}>
            Revoke
          </button>
        ) : (
          <span className="key-action-muted">Inactive</span>
        )}
        <button className="icon-button" aria-label="Key options">
          <MoreHorizontal size={15} />
        </button>
      </div>
    </div>
  )
}

function CreateKeyModal({ open, onClose }) {
  const { addKey, templates, domains } = useStore()
  const publishedTemplates = templates.filter((template) => template.publishedVersion || template.status === 'published')
  const identities = (domains || []).flatMap((domain) => domain.identityRecords || [])
  const [kind, setKind] = useState('secret')
  const [name, setName] = useState('')
  const [origins, setOrigins] = useState(typeof window !== 'undefined' ? window.location.origin : '')
  const [allowedTemplates, setAllowedTemplates] = useState([])
  const [allowedRecipients, setAllowedRecipients] = useState('')
  const [recipientPolicy, setRecipientPolicy] = useState('fixed')
  const [verificationTemplate, setVerificationTemplate] = useState('')
  const [senderIdentity, setSenderIdentity] = useState('')
  const [allowAuth, setAllowAuth] = useState(false)
  const [createdKey, setCreatedKey] = useState(null)

  useEffect(() => {
    if (open) {
      setKind('secret')
      setName('')
      setOrigins(typeof window !== 'undefined' ? window.location.origin : '')
      setAllowedTemplates([])
      setAllowedRecipients('')
      setRecipientPolicy('fixed')
      setVerificationTemplate('')
      setSenderIdentity('')
      setAllowAuth(false)
      setCreatedKey(null)
    }
  }, [open])

  const close = () => {
    onClose()
    setCreatedKey(null)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={createdKey ? 'Key created' : 'Create API key'}
      eyebrow="Authentication"
      description={
        createdKey
          ? 'This is the only time the complete key will be shown. Store it in your secret manager.'
          : 'Choose where this key will be used. Secret keys stay on servers; public keys are restricted.'
      }
      footer={
        createdKey ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={kind === 'public' && (allowedTemplates.length === 0 || (recipientPolicy === 'fixed' && !allowedRecipients.trim()))}
              onClick={async () => {
                const secret = await addKey({ name, kind, origins, allowedTemplates, allowedRecipients, recipientPolicy, verificationTemplate, senderIdentity, allowAuth })
                if (secret) setCreatedKey(secret)
              }}
              icon={<Plus size={14} />}
            >
              Create key
            </Button>
          </>
        )
      }
    >
      {createdKey ? (
        <div className="key-created">
          <div className="key-created__banner">
            <ShieldCheck size={16} />
            <span>Only shown once. If you lose it, revoke the key and create a new one.</span>
          </div>
          <div className="key-created__value">
            <code>{createdKey}</code>
            <CopyButton value={createdKey} label="Copy key" />
          </div>
          <div className="key-created__meta">
            <div>
              <span>Type</span>
              <strong>{kind === 'public' ? 'Public browser key' : 'Secret server key'}</strong>
            </div>
            <div>
              <span>Scope</span>
              <strong>
                {kind === 'public'
                  ? recipientPolicy === 'verified'
                    ? 'Verified visitors · origin allow-list'
                    : 'Fixed recipients · origin allow-list'
                  : 'Full API access'}
              </strong>
            </div>
          </div>
          <div className="key-created__note">
            <LockKeyhole size={13} /> Secret keys must never appear in browser code, mobile bundles or public
            repositories.
          </div>
        </div>
      ) : (
        <div className="create-key">
          <div className="key-type-grid">
            <button className={cx('key-type', kind === 'secret' && 'is-active')} onClick={() => setKind('secret')}>
              <span className="key-type__icon">
                <KeyRound size={18} />
              </span>
              <strong>Secret key</strong>
              <p>For server-side apps. Full API access. Never expose it to a browser.</p>
              <span className="key-type__radio">{kind === 'secret' && <Check size={11} />}</span>
            </button>
            <button className={cx('key-type', kind === 'public' && 'is-active')} onClick={() => setKind('public')}>
              <span className="key-type__icon">
                <Globe2 size={18} />
              </span>
              <strong>Public key</strong>
              <p>For browser apps. Restricted by origin, templates and recipient rules.</p>
              <span className="key-type__radio">{kind === 'public' && <Check size={11} />}</span>
            </button>
          </div>
          <Field label="Key name" hint="A label to remind you where this key is deployed.">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'public' ? 'Checkout browser' : 'Production server'} />
          </Field>
          {kind === 'public' && (
            <>
              <Field label="Allowed origins" hint="Comma-separated. Requests from any other origin will be rejected.">
                <input className="input" value={origins} onChange={(event) => setOrigins(event.target.value)} placeholder="https://acme.co.ke" />
              </Field>
              <Field label="Sender identity" hint="Public keys cannot choose a different From address per request.">
                <select className="input" value={senderIdentity} onChange={(event) => setSenderIdentity(event.target.value)}>
                  <option value="">First verified identity</option>
                  {identities.map((identity) => (
                    <option key={identity.from_email} value={identity.from_email}>{identity.from_email}</option>
                  ))}
                </select>
              </Field>
              <label className="campaign-start-check">
                <input type="checkbox" checked={allowAuth} onChange={(event) => setAllowAuth(event.target.checked)} />
                <span>Allow application auth (signup, magic links and recovery) from this key</span>
              </label>
              <Field
                label="Visitor recipient policy"
                hint={recipientPolicy === 'verified'
                  ? 'Visitors confirm their address with a verification link before a receipt can be sent.'
                  : 'Only the fixed recipient list below can receive email.'}
              >
                <select className="input" value={recipientPolicy} onChange={(event) => setRecipientPolicy(event.target.value)}>
                  <option value="fixed">Fixed recipient list</option>
                  <option value="verified">Verified visitor (double opt-in)</option>
                </select>
              </Field>
              {recipientPolicy === 'verified' && (
                <Field label="Verification email template" hint="Fixed at key creation. Use {{verify_url}} and {{verification_code}}.">
                  <select className="input" value={verificationTemplate} onChange={(event) => setVerificationTemplate(event.target.value)}>
                    <option value="">Built-in verification email</option>
                    {publishedTemplates.map((template) => (
                      <option key={template.id} value={template.slug}>{template.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="field">
                <span className="field__label">Allowed recipients</span>
                <span className="field__hint">
                  {recipientPolicy === 'verified'
                    ? 'Optional. These addresses bypass verification; new visitors still confirm ownership.'
                    : 'Required. Public keys can only send to these addresses.'}
                </span>
                <textarea
                  className="input"
                  rows={3}
                  value={allowedRecipients}
                  onChange={(event) => setAllowedRecipients(event.target.value)}
                  placeholder="customer@example.com, support@example.com"
                />
              </div>
              <div className="field">
                <span className="field__label">Allowed templates</span>
                <span className="field__hint">Public keys can only send templates selected here.</span>
                <div className="key-template-list">
                  {publishedTemplates.length === 0 && <span className="key-template-empty">Publish a template first.</span>}
                  {publishedTemplates.map((template) => {
                    const selected = allowedTemplates.includes(template.slug)
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={cx('key-template-option', selected && 'is-selected')}
                        onClick={() =>
                          setAllowedTemplates((current) =>
                            current.includes(template.slug)
                              ? current.filter((slug) => slug !== template.slug)
                              : [...current, template.slug],
                          )
                        }
                      >
                        <span>{selected && <Check size={10} />}</span>
                        <span>
                          <strong>{template.name}</strong>
                          <small>{template.slug}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
          <div className="create-key__note">
            <ShieldCheck size={13} />
            {kind === 'public'
              ? 'Public sends are origin-bound, template-scoped, recipient-policy-controlled and rate-limited on the server.'
              : 'The key is hashed before storage. Postique cannot recover the original after creation.'}
          </div>
        </div>
      )}
    </Modal>
  )
}

function AddWebhookModal({ open, onClose }) {
  const { addWebhook } = useStore()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState(['thread.reply_received'])
  const [secret, setSecret] = useState(null)
  const toggleEvent = (event) =>
    setEvents((current) => (current.includes(event) ? current.filter((item) => item !== event) : [...current, event]))
  const close = () => {
    setSecret(null)
    setUrl('')
    setEvents(['thread.reply_received'])
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={secret ? 'Webhook created' : 'Add webhook endpoint'}
      eyebrow="Events"
      description={
        secret
          ? 'Store this signing secret now. It is only shown once.'
          : 'Postique signs every request. Verify the signature before trusting an event.'
      }
      size="sm"
      footer={
        secret ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const created = await addWebhook(url, events)
                if (created) setSecret(created)
              }}
              icon={<Plus size={14} />}
            >
              Add endpoint
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <div className="key-created">
          <div className="key-created__banner">
            <ShieldCheck size={16} />
            <span>Use this secret with HMAC-SHA256 to verify the raw webhook body.</span>
          </div>
          <div className="key-created__value">
            <code>{secret}</code>
            <CopyButton value={secret} label="Copy secret" />
          </div>
          <div className="key-created__note">
            <LockKeyhole size={13} /> Store it in your application’s secret manager.
          </div>
        </div>
      ) : (
        <div className="webhook-form">
          <Field label="Endpoint URL" hint="Must be publicly reachable. HTTPS is recommended.">
            <input className="input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourapp.com/api/postique" />
          </Field>
          <div className="webhook-events">
            <span className="field__label">Events</span>
            {webhookEvents.map((event) => (
              <label key={event} className="webhook-event">
                <input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)} />
                <span className="webhook-event__box">{events.includes(event) && <Check size={10} />}</span>
                <code>{event}</code>
              </label>
            ))}
          </div>
          <div className="create-key__note">
            <ShieldCheck size={13} /> You’ll receive a signing secret after the endpoint is created.
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Developers() {
  const { keys, webhooks, revokeKey, toggleWebhook, metrics, usage, config } = useStore()
  const [tab, setTab] = useState('node')
  const [keyModal, setKeyModal] = useState(false)
  const [webhookModal, setWebhookModal] = useState(false)
  const code = codeSamples[tab].replaceAll('__BASE__', config.appUrl || 'http://localhost:3000')

  return (
    <div className="page page--developers">
      <PageHeader
        eyebrow="Build with Postique"
        title="Developers"
        description="Keys, endpoints and signed webhooks for your integration. Everything is served by this self-hosted instance."
        actions={
          <>
            <Button variant="secondary" onClick={() => setWebhookModal(true)} icon={<Webhook size={15} />}>
              Add webhook
            </Button>
            <Button onClick={() => setKeyModal(true)} icon={<Plus size={15} />}>
              Create API key
            </Button>
          </>
        }
      />

      <div className="dev-metrics">
        <div>
          <span>Messages sent</span>
          <strong>{metrics.sent || 0}</strong>
          <small>all time</small>
        </div>
        <div>
          <span>Accepted rate</span>
          <strong>{metrics.deliveryRate ?? 0}%</strong>
          <small>{metrics.failed || 0} failed</small>
        </div>
        <div>
          <span>Open threads</span>
          <strong>{metrics.openConversations || 0}</strong>
          <small>{metrics.unread || 0} unread</small>
        </div>
        <div>
          <span>API version</span>
          <strong>v1</strong>
          <small>{config.mailTransport} transport</small>
        </div>
      </div>

      <div className="developer-layout">
        <div className="developer-main">
          <section className="dev-section">
            <div className="dev-section__head">
              <div>
                <h2>API keys</h2>
                <p>Rotate keys regularly. Revocation is immediate.</p>
              </div>
              <button className="text-button" onClick={() => setKeyModal(true)}>
                <Plus size={13} /> New key
              </button>
            </div>
            <div className="api-key-list">
              {keys.map((key) => (
                <KeyRow key={key.id} apiKey={key} onRevoke={revokeKey} />
              ))}
            </div>
            <div className="dev-inline-note">
              <LockKeyhole size={13} /> Secret keys are stored hashed. We show the complete value once, at
              creation.
            </div>
          </section>

          <section className="dev-section">
            <div className="dev-section__head">
              <div>
                <h2>Quickstart</h2>
                <p>Send a template into a thread in under ten lines.</p>
              </div>
              <div className="code-tabs code-tabs--light">
                {[
                  ['node', 'Node.js'],
                  ['curl', 'cURL'],
                  ['python', 'Python'],
                ].map(([key, label]) => (
                  <button key={key} className={cx(tab === key && 'is-active')} onClick={() => setTab(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="quickstart-code">
              <div className="quickstart-code__bar">
                <span>
                  <Terminal size={12} /> POST {config.appUrl}/v1/send
                </span>
                <CopyButton value={code} label="Copy" />
              </div>
              <pre>
                <code>{code}</code>
              </pre>
            </div>
            <div className="quickstart-steps">
              <div>
                <span>1</span>
                <strong>Add a token</strong>
                <p>Use a secret key on your server, or a public key in browser code.</p>
              </div>
              <div>
                <span>2</span>
                <strong>Send</strong>
                <p>Pass a template slug and variables, or raw HTML and text.</p>
              </div>
              <div>
                <span>3</span>
                <strong>Handle events</strong>
                <p>Receive delivery and reply events through a verified webhook.</p>
              </div>
            </div>
          </section>

          <section className="dev-section">
            <div className="dev-section__head">
              <div>
                <h2>Webhooks</h2>
                <p>Normalised events across the sending provider and inbound pipeline.</p>
              </div>
              <button className="text-button" onClick={() => setWebhookModal(true)}>
                <Plus size={13} /> Add endpoint
              </button>
            </div>
            <div className="webhook-list">
              {webhooks.map((webhook) => (
                <div className={cx('webhook-row', webhook.status === 'paused' && 'is-paused')} key={webhook.id}>
                  <span className="webhook-row__icon">
                    <Webhook size={15} />
                  </span>
                  <div className="webhook-row__main">
                    <div>
                      <code>{webhook.url}</code>
                      <Badge tone={webhook.status === 'active' ? 'success' : 'neutral'} dot>
                        {webhook.status}
                      </Badge>
                    </div>
                    <div className="webhook-row__events">
                      {webhook.events.map((event) => (
                        <span key={event}>{event}</span>
                      ))}
                    </div>
                    <span className="webhook-row__last">Last delivery · {webhook.lastDelivery}</span>
                  </div>
                  <div className="webhook-row__actions">
                    <Toggle
                      checked={webhook.status === 'active'}
                      onChange={() => toggleWebhook(webhook.id)}
                      label={`Toggle webhook ${webhook.url}`}
                      size="sm"
                    />
                    <button className="icon-button" aria-label="Webhook options">
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="dev-inline-note">
              <ShieldCheck size={13} /> Every event includes a signature header. Verify it before acting.
            </div>
          </section>
        </div>

        <aside className="developer-side">
          <div className="dev-side-card">
            <div className="dev-side-card__head">
              <span className="dev-side-card__icon">
                <Code2 size={15} />
              </span>
              <div>
                <strong>Browser SDK</strong>
                <span>/sdk/postique.js</span>
              </div>
            </div>
            <div className="install-line">
              <code>{'<script src="/sdk/postique.js"></script>'}</code>
              <CopyButton value={'<script src="/sdk/postique.js"></script>'} compact />
            </div>
            <p>
              Send from the browser without exposing a secret. Public keys are origin-restricted and
              rate-limited.
            </p>
            <button className="dev-side-link">
              Read SDK docs <ArrowUpRight size={12} />
            </button>
          </div>

          <div className="dev-side-card">
            <div className="dev-side-card__head">
              <span className="dev-side-card__icon dev-side-card__icon--blue">
                <Gauge size={15} />
              </span>
              <div>
                <strong>Usage & limits</strong>
                <span>Self-hosted</span>
              </div>
            </div>
            <div className="usage-block">
              <div>
                <span>Emails this month</span>
                <strong>{(usage?.sends || 0).toLocaleString()} <small>/ {(usage?.sendLimit || 0).toLocaleString()}</small></strong>
              </div>
              <div className="usage-block__bar">
                <span style={{ width: `${Math.min(100, ((usage?.sends || 0) / Math.max(usage?.sendLimit || 1, 1)) * 100)}%` }} />
              </div>
            </div>
            <div className="limit-rows">
              <div>
                <span>Hourly send limit</span>
                <strong>{usage?.hourlySendLimit || config.sendLimit || 1000}</strong>
              </div>
              <div>
                <span>Attachment size</span>
                <strong>10 MB</strong>
              </div>
              <div>
                <span>Inbound size</span>
                <strong>25 MB</strong>
              </div>
            </div>
          </div>

          <div className="dev-side-card dev-side-card--security">
            <div className="dev-side-card__head">
              <span className="dev-side-card__icon dev-side-card__icon--dark">
                <ShieldCheck size={15} />
              </span>
              <div>
                <strong>Security checklist</strong>
                <span>Before you ship</span>
              </div>
            </div>
            <ul className="security-list">
              <li>
                <Check size={11} /> Secret key only on the server
              </li>
              <li>
                <Check size={11} /> Verify webhook signatures
              </li>
              <li>
                <Check size={11} /> Restrict public key origins
              </li>
              <li>
                <Check size={11} /> Handle bounces and complaints
              </li>
              <li>
                <Check size={11} /> Use an idempotency key
              </li>
            </ul>
          </div>

          <div className="dev-side-card dev-side-card--docs">
            <BookOpen size={16} />
            <div>
              <strong>API reference</strong>
              <p>Every endpoint, object and error code.</p>
              <button>
                Open docs <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </aside>
      </div>

      <CreateKeyModal open={keyModal} onClose={() => setKeyModal(false)} />
      <AddWebhookModal open={webhookModal} onClose={() => setWebhookModal(false)} />
    </div>
  )
}
