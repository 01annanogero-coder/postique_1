import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  AtSign,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  Copy,
  Globe2,
  Info,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, Button, CopyButton, Field, Modal } from '../components/ui'
import { cx } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader } from './shared'

function DomainListItem({ domain, active, onClick }) {
  return (
    <button className={cx('domain-list-item', active && 'is-active')} onClick={onClick}>
      <span className={cx('domain-list-item__icon', domain.status === 'verified' ? 'is-verified' : 'is-pending')}>
        <Globe2 size={16} />
      </span>
      <span className="domain-list-item__main">
        <strong>{domain.name}</strong>
        <span>{domain.identities.length} identities</span>
      </span>
      <span className={cx('domain-dot', domain.status === 'verified' ? 'is-verified' : 'is-pending')} />
      <ChevronRight size={13} />
    </button>
  )
}

function RecordRow({ record }) {
  return (
    <div className="dns-row">
      <span className="dns-row__type">{record.type}</span>
      <span className="dns-row__host">
        <code>{record.host}</code>
      </span>
      <span className="dns-row__value">
        <code>{record.value}</code>
        <CopyButton value={record.value} compact />
      </span>
      <span className={cx('dns-row__status', record.status === 'verified' ? 'is-verified' : 'is-pending')}>
        {record.status === 'verified' ? <Check size={11} /> : <Clock3 size={11} />}
        {record.status === 'verified' ? 'Verified' : 'Pending'}
      </span>
    </div>
  )
}

export default function Domains() {
  const { domains, addDomain, verifyDomain, updateDomainRoute, addIdentity, removeIdentity, workspace, config } = useStore()
  const [selectedId, setSelectedId] = useState(domains[0]?.id)
  const [addOpen, setAddOpen] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [domainName, setDomainName] = useState('')
  const [identity, setIdentity] = useState('')
  const [verifyState, setVerifyState] = useState(false)
  const [routeTransport, setRouteTransport] = useState('inherit')
  const [smtpUrl, setSmtpUrl] = useState('')
  const [adapterUrl, setAdapterUrl] = useState('')
  const [adapterToken, setAdapterToken] = useState('')
  const [routeBusy, setRouteBusy] = useState(false)
  const selected = domains.find((domain) => domain.id === selectedId) || domains[0]

  useEffect(() => {
    if (domains.length && !domains.some((domain) => domain.id === selectedId)) setSelectedId(domains[0]?.id)
  }, [domains, selectedId])

  useEffect(() => {
    setRouteTransport(selected?.transport || 'inherit')
    setSmtpUrl('')
    setAdapterUrl('')
    setAdapterToken('')
  }, [selected?.id, selected?.transport])

  const handleAdd = async () => {
    const added = await addDomain(domainName)
    if (added) {
      setAddOpen(false)
      setDomainName('')
    }
  }

  const verify = async (force = false) => {
    if (!selected) return
    setVerifyState(true)
    await verifyDomain(selected.id, force)
    setVerifyState(false)
  }

  const saveRoute = async () => {
    if (!selected) return
    setRouteBusy(true)
    const patch = { transport: routeTransport }
    if (routeTransport === 'smtp' && smtpUrl.trim()) patch.smtpUrl = smtpUrl.trim()
    if (routeTransport === 'http') {
      if (adapterUrl.trim()) patch.adapterUrl = adapterUrl.trim()
      if (adapterToken.trim()) patch.adapterToken = adapterToken.trim()
    }
    await updateDomainRoute(selected.id, patch)
    setRouteBusy(false)
  }

  if (!selected) {
    return (
      <div className="page page--domains">
        <PageHeader
          eyebrow="Sending infrastructure"
          title="Domains"
          description="Connect a domain you control. Postique generates SPF, DKIM and DMARC records and verifies them over DNS."
        />
        <div className="empty-state empty-state--panel setup-empty">
          <span className="empty-state__icon">
            <Globe2 size={22} />
          </span>
          <h3>Connect your first sending domain</h3>
          <p>
            Add the domain you want to send from. You will get exact DNS records, a generated DKIM key and a
            verification check — all handled by this server.
          </p>
          <div className="setup-empty__form">
            <input
              className="input"
              value={domainName}
              onChange={(event) => setDomainName(event.target.value)}
              placeholder="example.com"
              onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} icon={<Plus size={14} />}>
              Add domain
            </Button>
          </div>
          <span className="setup-empty__hint">
            No third-party DNS integration is required. Publish the records at your registrar.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--domains">
      <PageHeader
        eyebrow="Sending infrastructure"
        title="Domains"
        description="Send from your own domain. Postique guides the SPF, DKIM and DMARC setup, then verifies it for you."
        actions={
          <Button onClick={() => setAddOpen(true)} icon={<Plus size={15} />}>
            Add domain
          </Button>
        }
      />

      <div className="domains-grid">
        <aside className="domain-list">
          <div className="domain-list__head">
            <span>Sending domains</span>
            <Badge tone="neutral">{domains.length}</Badge>
          </div>
          {domains.map((domain) => (
            <DomainListItem
              key={domain.id}
              domain={domain}
              active={domain.id === selected.id}
              onClick={() => setSelectedId(domain.id)}
            />
          ))}
          <button className="domain-list__add" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add another domain
          </button>
          <div className="domain-list__note">
            <ShieldCheck size={14} />
            <div>
              <strong>Provider independent</strong>
              <p>Mail is delivered through your own SMTP relay or direct-to-MX. DNS records are managed by you.</p>
            </div>
          </div>
        </aside>

        <section className="domain-detail">
          <div className="domain-detail__top">
            <div className="domain-detail__identity">
              <span className={cx('domain-big-icon', selected.status === 'verified' ? 'is-verified' : 'is-pending')}>
                <Globe2 size={22} />
              </span>
              <div>
                <div className="domain-detail__title">
                  <h2>{selected.name}</h2>
                  <Badge tone={selected.status === 'verified' ? 'success' : 'warning'} dot>
                    {selected.status === 'verified' ? 'Verified' : 'Pending DNS'}
                  </Badge>
                </div>
                <span>
                  {selected.provider} · Added {selected.added}
                </span>
              </div>
            </div>
            <div className="domain-detail__actions">
              <Button variant="secondary" size="sm" onClick={() => setIdentityOpen(true)} icon={<AtSign size={14} />}>
                Add sender
              </Button>
              {selected.status === 'pending' && (
                <Button size="sm" onClick={() => verify(false)} loading={verifyState} icon={!verifyState && <RefreshCw size={14} />}>
                  {verifyState ? 'Checking DNS…' : 'Verify domain'}
                </Button>
              )}
            </div>
          </div>

          {selected.status === 'verified' ? (
            <div className="domain-status domain-status--ok">
              <span className="domain-status__icon">
                <CheckCircle2 size={17} />
              </span>
              <div>
                <strong>This domain is ready to send</strong>
                <p>
                  SPF, DKIM and DMARC are verified. Your reputation is separate from other Postique
                  workspaces. Verified {selected.verifiedAt}.
                </p>
              </div>
              <Badge tone="success">Healthy</Badge>
            </div>
          ) : (
            <div className="domain-status domain-status--warn">
              <span className="domain-status__icon">
                <Clock3 size={17} />
              </span>
              <div>
                <strong>Waiting for DNS records</strong>
                <p>
                  Add the records below at your DNS provider. Verification normally completes within a few
                  minutes, but can take up to 48 hours.
                </p>
              </div>
              <Button size="sm" onClick={() => verify(false)} loading={verifyState}>
                {verifyState ? 'Checking…' : 'Check again'}
              </Button>
              {config.allowManualVerification && (
                <Button variant="ghost" size="sm" onClick={() => verify(true)}>
                  Mark verified
                </Button>
              )}
            </div>
          )}

          <div className="domain-section">
            <div className="domain-section__head">
              <div>
                <h3>DNS records</h3>
                <p>Publish these exact records at your DNS provider. Do not change the values.</p>
              </div>
              <Badge tone="neutral">{selected.records.length} records</Badge>
            </div>
            <div className="dns-table">
              <div className="dns-row dns-row--head">
                <span>Type</span>
                <span>Host</span>
                <span>Value</span>
                <span>Status</span>
              </div>
              {selected.records.map((record) => (
                <RecordRow key={record.id} record={record} />
              ))}
            </div>
            <div className="dns-help">
              <Info size={14} />
              <span>
                Need help? Every DNS provider labels these fields slightly differently. Publish them at your
                registrar or DNS host.
              </span>
              <button>Read the guide <ArrowRight size={12} /></button>
            </div>
          </div>

          <div className="domain-section">
            <div className="domain-section__head">
              <div>
                <h3>Delivery route</h3>
                <p>Choose how mail from this domain leaves Postique.</p>
              </div>
              <Badge tone={selected.routeConfigured ? 'success' : 'neutral'}>
                {selected.routeConfigured ? 'Custom route' : 'Global default'}
              </Badge>
            </div>
            <div className="domain-route-grid">
              <Field label="Transport" hint="Per-domain routes override the global MAIL_TRANSPORT setting.">
                <select className="input" value={routeTransport} onChange={(event) => setRouteTransport(event.target.value)}>
                  <option value="inherit">Inherit global · {config.mailTransport}</option>
                  <option value="smtp">SMTP relay or mailbox</option>
                  <option value="direct">Direct to recipient MX</option>
                  <option value="http">HTTP mail adapter</option>
                </select>
              </Field>
              {routeTransport === 'smtp' && (
                <Field label="SMTP URL" hint="Leave blank to use the global SMTP_URL. Secrets stay encrypted in SQLite.">
                  <input className="input" value={smtpUrl} onChange={(event) => setSmtpUrl(event.target.value)} placeholder="smtp://user:pass@smtp.example.com:587" />
                </Field>
              )}
              {routeTransport === 'http' && (
                <>
                  <Field label="Adapter URL" hint="Your mail gateway. Postique sends signed raw MIME to this endpoint.">
                    <input className="input" value={adapterUrl} onChange={(event) => setAdapterUrl(event.target.value)} placeholder="https://mail-gateway.example.com/v1/deliver" />
                  </Field>
                  <Field label="Adapter token" hint="Leave blank to keep the existing encrypted token.">
                    <input className="input" type="password" value={adapterToken} onChange={(event) => setAdapterToken(event.target.value)} placeholder="Bearer token + HMAC secret" />
                  </Field>
                </>
              )}
              <div className="domain-route-note">
                {routeTransport === 'direct' && (
                  <span><ShieldCheck size={13} /> Requires outbound port 25, a static IP and a matching PTR record.</span>
                )}
                {routeTransport === 'smtp' && (
                  <span><Server size={13} /> Works with Postfix on a VPS, your existing mailbox SMTP, or a relay.</span>
                )}
                {routeTransport === 'http' && (
                  <span><Globe2 size={13} /> The adapter receives DKIM-signed raw MIME and must forward it without rewriting headers.</span>
                )}
                {routeTransport === 'inherit' && (
                  <span><Info size={13} /> This domain uses the installation-wide transport from your environment.</span>
                )}
                <Button size="sm" onClick={saveRoute} loading={routeBusy}>Save route</Button>
              </div>
            </div>
          </div>

          <div className="domain-inline-grid">
            <div className="domain-section domain-section--half">
              <div className="domain-section__head">
                <div>
                  <h3>Sender identities</h3>
                  <p>Addresses this domain is allowed to send from.</p>
                </div>
              </div>
              <div className="identity-list">
                {selected.identities.length === 0 && (
                  <div className="identity-empty">
                    <AtSign size={16} />
                    <span>No sender identities yet. Verify the domain first.</span>
                  </div>
                )}
                {(selected.identityRecords || []).map((record) => (
                  <div className="identity-row" key={record.id}>
                    <span className="identity-row__avatar">
                      <Mail size={13} />
                    </span>
                    <span>
                      <strong>{record.from_email}</strong>
                      <small>{record.from_name || 'Sender identity'}</small>
                    </span>
                    <Badge tone="success">verified</Badge>
                    <button
                      className="identity-row__remove"
                      onClick={() => removeIdentity(record.id)}
                      aria-label={`Remove ${record.from_email}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button className="identity-add" onClick={() => setIdentityOpen(true)}>
                  <Plus size={13} /> Add sender identity
                </button>
              </div>
            </div>

            <div className="domain-section domain-section--half">
              <div className="domain-section__head">
                <div>
                  <h3>DMARC policy</h3>
                  <p>Start in monitor mode, then tighten when you are confident.</p>
                </div>
              </div>
              <div className="policy-card">
                <div className="policy-card__row">
                  <span>Policy</span>
                  <code>p=none</code>
                </div>
                <div className="policy-card__row">
                  <span>Aggregate reports</span>
                  <code>dmarc@{selected.name}</code>
                </div>
                <div className="policy-card__row">
                  <span>Alignment</span>
                  <Badge tone="success">Strict DKIM</Badge>
                </div>
                <button className="policy-card__button">
                  Edit policy <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="inbound-card">
        <div className="inbound-card__copy">
          <span className="inbound-card__icon">
            <InboundIcon />
          </span>
          <div>
            <div className="inbound-card__title">
              <h3>Inbound reply routing</h3>
              <Badge tone={config.inboundEnabled ? 'success' : 'warning'} dot>
                {config.inboundEnabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            <p>
              Replies to your application email arrive at a unique address on this installation’s inbound
              domain. The built-in SMTP listener accepts the message, parses it locally and attaches it to the
              right thread. No email routing provider is involved.
            </p>
            <div className="inbound-card__flow">
              <span>
                <Mail size={12} /> Customer reply
              </span>
              <ArrowRight size={12} />
              <span>
                <Server size={12} /> Your SMTP :{config.inboundPort}
              </span>
              <ArrowRight size={12} />
              <span>
                <Server size={12} /> Postique inbound
              </span>
              <ArrowRight size={12} />
              <span>
                <MessageIcon /> Inbox
              </span>
            </div>
          </div>
        </div>
        <div className="inbound-card__address">
          <span>Workspace reply domain</span>
          <div>
            <code>{workspace.replyDomain}</code>
            <CopyButton value={workspace.replyDomain} compact />
          </div>
          <small>Built-in SMTP listener · port {config.inboundPort}</small>
        </div>
      </section>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a sending domain"
        eyebrow="New domain"
        description="Use a domain you control. We’ll generate the exact SPF, DKIM and DMARC records."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} icon={<Plus size={14} />}>
              Add domain
            </Button>
          </>
        }
      >
        <div className="add-domain">
          <Field label="Domain name" hint="Use the root domain, for example acme.co.ke. Do not include https:// or a path.">
            <input
              className="input"
              value={domainName}
              onChange={(event) => setDomainName(event.target.value)}
              placeholder="yourcompany.com"
              onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            />
          </Field>
          <div className="add-domain__preview">
            <Globe2 size={18} />
            <div>
              <strong>We’ll verify ownership through DNS</strong>
              <span>No access to your registrar is required. Records are usually live within minutes.</span>
            </div>
          </div>
          <div className="add-domain__note">
            <AlertCircle size={13} />
            Sending from a new domain warms its reputation gradually. Postique applies per-workspace limits
            while it builds.
          </div>
        </div>
      </Modal>

      <Modal
        open={identityOpen}
        onClose={() => setIdentityOpen(false)}
        title="Add sender identity"
        eyebrow={selected.name}
        description="Create an address this domain can send from. The part before @ is up to you."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIdentityOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const address = identity.includes('@') ? identity : `${identity}@${selected.name}`
                const added = await addIdentity(selected.id, address)
                if (added) {
                  setIdentity('')
                  setIdentityOpen(false)
                }
              }}
              icon={<AtSign size={14} />}
            >
              Add identity
            </Button>
          </>
        }
      >
        <Field label="Email address" hint="For example: support. The verified domain is appended automatically.">
          <div className="identity-input">
            <input
              className="input"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              placeholder="hello"
            />
            <span>@{selected.name}</span>
          </div>
        </Field>
      </Modal>
    </div>
  )
}

function InboundIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 5h16v14H4z" />
      <path d="m4 7 8 6 8-6" />
      <path d="M12 19v-6" />
      <path d="m9 15 3 3 3-3" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
