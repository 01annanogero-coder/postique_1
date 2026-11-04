import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Ban,
  Check,
  Code2,
  Fingerprint,
  KeyRound,
  Link2,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { Avatar, Badge, Button, CopyButton, Modal, Toggle } from '../components/ui'
import { cx, navigate } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard, EmptyState } from './shared'

function formatWhen(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function initialsFor(user) {
  const source = user.name || user.email || '?'
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function AuthStat({ icon, label, value, detail }) {
  return (
    <div className="auth-stat">
      <span className="auth-stat__icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  )
}

function UserRow({ user, onLink, onToggle, onDelete }) {
  return (
    <div className={cx('auth-user-row', user.disabled && 'is-disabled')}>
      <div className="auth-user-row__identity">
        <Avatar name={user.name || user.email} initials={initialsFor(user)} size={32} />
        <div>
          <strong>{user.name || user.email.split('@')[0]}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <div className="auth-user-row__status">
        {user.disabled ? (
          <Badge tone="neutral">Disabled</Badge>
        ) : user.emailVerified ? (
          <Badge tone="success" dot>Verified</Badge>
        ) : (
          <Badge tone="warning">Unverified</Badge>
        )}
      </div>
      <div className="auth-user-row__method">
        {user.metadata?.provider ? user.metadata.provider : user.hasPassword ? 'Password' : 'Magic link'}
      </div>
      <div className="auth-user-row__last">{formatWhen(user.lastSignInAt)}</div>
      <div className="auth-user-row__actions">
        <button type="button" className="icon-button" title="Send magic link" onClick={() => onLink(user)}>
          <Mail size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          title={user.disabled ? 'Enable user' : 'Disable user'}
          onClick={() => onToggle(user)}
        >
          {user.disabled ? <Check size={14} /> : <Ban size={14} />}
        </button>
        <button type="button" className="icon-button icon-button--danger" title="Delete user" onClick={() => onDelete(user)}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export default function Authentication() {
  const {
    auth,
    keys,
    config,
    updateAppAuthSettings,
    setAppAuthUserDisabled,
    deleteAppAuthUser,
    sendAppAuthLink,
  } = useStore()
  const settings = auth?.settings || {}
  const users = auth?.users || []
  const metrics = auth?.metrics || {}
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [linkTarget, setLinkTarget] = useState(null)
  const [linkResult, setLinkResult] = useState(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const publicKeys = keys.filter((key) => key.kind === 'public' && !key.revokedAt)
  const settingsKey = JSON.stringify(settings)

  useEffect(() => {
    setDraft(settings)
  }, [settingsKey])

  useEffect(() => {
    if (!selectedKey && publicKeys[0]) setSelectedKey(publicKeys[0].id)
  }, [publicKeys, selectedKey])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return users
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(needle) ||
        String(user.name || '').toLowerCase().includes(needle),
    )
  }, [search, users])

  const selected = publicKeys.find((key) => key.id === selectedKey) || publicKeys[0]
  const baseUrl = config.appUrl || window.location.origin
  const snippet = `const postique = new Postique("${selected?.prefix ? `${selected.prefix}…` : 'pq_pub_…'}", {
  baseUrl: "${baseUrl}"
});

const { user, session } = await postique.auth.signUp({
  email: "customer@example.com",
  password: "a-long-password",
  data: { name: "Amara" }
});

await postique.auth.signInWithOtp({
  email: "customer@example.com"
});`

  const save = async () => {
    setSaving(true)
    await updateAppAuthSettings(draft)
    setSaving(false)
  }

  const sendLink = async (user) => {
    setLinkTarget(user)
    setLinkResult(null)
    setLinkBusy(true)
    const result = await sendAppAuthLink(user.id)
    setLinkResult(result)
    setLinkBusy(false)
  }

  const toggleUser = async (user) => {
    await setAppAuthUserDisabled(user.id, !user.disabled)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await deleteAppAuthUser(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="page page--auth-service">
      <PageHeader
        eyebrow="Optional identity pool"
        title="Application accounts"
        description="Use this only when a product needs persistent users, passwords and sessions. For email ownership alone, use Verification."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/app/verification')} icon={<Mail size={14} />}>
              Verification
            </Button>
            <Button variant="secondary" onClick={() => navigate('/app/developers')} icon={<KeyRound size={14} />}>
              API keys
            </Button>
            <Button onClick={save} loading={saving} icon={!saving && <Check size={14} />}>
              Save settings
            </Button>
          </>
        }
      />

      <div className="auth-banner">
        <span className="auth-banner__icon">
          <LockKeyhole size={16} />
        </span>
        <div>
          <strong>Accounts are optional. Verification is the lightweight path.</strong>
          <p>This module stores users, password hashes and refresh sessions. If you only need to prove email ownership, use the ephemeral Verification API instead.</p>
        </div>
        <Badge tone="warning">Stores users</Badge>
      </div>

      <div className="auth-stats">
        <AuthStat icon={<Users size={16} />} label="End-users" value={metrics.total || 0} detail={`${metrics.signups7d || 0} joined this week`} />
        <AuthStat icon={<ShieldCheck size={16} />} label="Verified" value={metrics.verified || 0} detail="email addresses" />
        <AuthStat icon={<RefreshCw size={16} />} label="Active sessions" value={metrics.activeSessions || 0} detail="refreshable" />
        <AuthStat icon={<Fingerprint size={16} />} label="Password accounts" value={metrics.withPassword || 0} detail="the rest use magic links" />
      </div>

      <div className="auth-layout">
        <div className="auth-main">
          <SectionCard
            title="End-users"
            description="Accounts created by your application through the public auth API."
            action={
              <button className="text-button" onClick={() => navigate('/app/developers')}>
                <KeyRound size={13} /> Create a public key
              </button>
            }
          >
            <div className="auth-user-toolbar">
              <label className="auth-search">
                <Users size={14} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email or name…" />
              </label>
              <span>{filtered.length} shown</span>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<UserPlus size={20} />}
                title={users.length ? 'No matching users' : 'No end-users yet'}
                description={
                  users.length
                    ? 'Try a different email or name.'
                    : 'Your app can create its first account with postique.auth.signUp or a magic link.'
                }
              />
            ) : (
              <div className="auth-user-table">
                <div className="auth-user-table__head">
                  <span>User</span>
                  <span>Status</span>
                  <span>Method</span>
                  <span>Last sign in</span>
                  <span />
                </div>
                {filtered.map((user) => (
                  <UserRow key={user.id} user={user} onLink={sendLink} onToggle={toggleUser} onDelete={setDeleteTarget} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Auth settings" description="These switches apply to this workspace only. They are enforced by the server, not just the UI.">
            <div className="auth-settings">
              <div className="auth-setting">
                <div>
                  <strong>Allow new signups</strong>
                  <span>Let the public signup and magic-link endpoints create accounts.</span>
                </div>
                <Toggle checked={Boolean(draft.signupsEnabled)} onChange={(value) => setDraft((current) => ({ ...current, signupsEnabled: value }))} label="Allow signups" />
              </div>
              <div className="auth-setting">
                <div>
                  <strong>Email and password</strong>
                  <span>Enable POST /auth/v1/token with grant_type=password.</span>
                </div>
                <Toggle checked={Boolean(draft.passwordEnabled)} onChange={(value) => setDraft((current) => ({ ...current, passwordEnabled: value }))} label="Email and password" />
              </div>
              <div className="auth-setting">
                <div>
                  <strong>Magic links and email codes</strong>
                  <span>Send one-time sign-in links and six-digit codes through your SMTP transport.</span>
                </div>
                <Toggle checked={Boolean(draft.magicLinkEnabled)} onChange={(value) => setDraft((current) => ({ ...current, magicLinkEnabled: value }))} label="Magic links" />
              </div>
              <div className="auth-setting">
                <div>
                  <strong>Require email verification</strong>
                  <span>Password sign-in waits until the address has been confirmed by a magic link.</span>
                </div>
                <Toggle checked={Boolean(draft.requireEmailVerification)} onChange={(value) => setDraft((current) => ({ ...current, requireEmailVerification: value }))} label="Require email verification" />
              </div>
            </div>
            <div className="auth-note">
              <ShieldCheck size={14} /> Passwords are hashed with scrypt. Access tokens are JWTs signed on this server; refresh tokens are hashed and rotate on every use.
            </div>
          </SectionCard>

          <SectionCard title="API surface" description="Use the same public key as your browser integration. Origin restrictions on the key apply here too.">
            <div className="auth-endpoints">
              {[
                ['POST', '/auth/v1/signup', 'Create an email/password account'],
                ['POST', '/auth/v1/token', 'Password or refresh-token grant'],
                ['POST', '/auth/v1/otp', 'Send a magic link and code'],
                ['POST', '/auth/v1/verify', 'Exchange link or code for a session'],
                ['POST', '/auth/v1/recover', 'Send a password-recovery link'],
                ['GET', '/auth/v1/user', 'Read the current user'],
                ['PUT', '/auth/v1/user', 'Update name, metadata or password'],
                ['POST', '/auth/v1/logout', 'Revoke the current session'],
              ].map(([method, path, description]) => (
                <div className="auth-endpoint" key={`${method}-${path}`}>
                  <Badge tone={method === 'GET' ? 'blue' : 'neutral'}>{method}</Badge>
                  <code>{path}</code>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <aside className="auth-side">
          <SectionCard title="Connect your app" description="Public keys are safe for browser code when their allowed origins are set.">
            {publicKeys.length === 0 ? (
              <div className="auth-empty-key">
                <p>No public API key exists yet. Create one in Developers so your app can call the auth endpoints.</p>
                <Button variant="secondary" onClick={() => navigate('/app/developers')} icon={<ArrowUpRight size={14} />}>
                  Open Developers
                </Button>
              </div>
            ) : (
              <>
                <label className="auth-key-select">
                  <span>Public key</span>
                  <select value={selected?.id || ''} onChange={(event) => setSelectedKey(event.target.value)}>
                    {publicKeys.map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name} · {key.prefix}…
                      </option>
                    ))}
                  </select>
                </label>
                <div className="auth-snippet">
                  <div className="auth-snippet__bar">
                    <span><Code2 size={12} /> Browser SDK</span>
                    <CopyButton value={snippet} label="Copy" />
                  </div>
                  <pre><code>{snippet}</code></pre>
                </div>
                <div className="auth-key-meta">
                  <span><Check size={12} /> Origin restricted</span>
                  <span><Check size={12} /> JWT sessions</span>
                  <span><Check size={12} /> Refresh rotation</span>
                </div>
              </>
            )}
          </SectionCard>

          <div className="auth-side-card">
            <span className="auth-side-card__icon"><Mail size={15} /></span>
            <div>
              <strong>Magic links use your SMTP</strong>
              <p>Links and six-digit codes go through the same local transport as your outbound email. With the file transport they are written to the outbox.</p>
            </div>
          </div>

          <div className="auth-side-card auth-side-card--quiet">
            <span className="auth-side-card__icon"><Link2 size={15} /></span>
            <div>
              <strong>Recovery flow</strong>
              <p><code>POST /auth/v1/recover</code> sends a recovery link. The returned session can call <code>PUT /auth/v1/user</code> with a new password without the old one.</p>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={Boolean(linkTarget)}
        onClose={() => { setLinkTarget(null); setLinkResult(null) }}
        title={linkResult?.debug ? 'Magic link generated' : 'Send magic link'}
        eyebrow="Authentication"
        description={linkTarget ? `A one-time link and code for ${linkTarget.email}.` : ''}
        footer={<Button onClick={() => { setLinkTarget(null); setLinkResult(null) }}>Done</Button>}
      >
        {linkBusy && <div className="auth-link-loading"><span className="button__spinner" /> Sending…</div>}
        {!linkBusy && linkResult?.debug && (
          <div className="auth-link-result">
            <p>This installation is using the local file transport, so the link is shown here instead of being delivered.</p>
            <label>
              <span>Magic link</span>
              <div><code>{linkResult.debug.link}</code><CopyButton value={linkResult.debug.link} compact /></div>
            </label>
            <label>
              <span>One-time code</span>
              <div><code className="auth-code">{linkResult.debug.code}</code><CopyButton value={linkResult.debug.code} compact /></div>
            </label>
            <small>Redirects to {linkResult.debug.redirectTo}</small>
          </div>
        )}
        {!linkBusy && linkResult && !linkResult.debug && (
          <div className="auth-link-sent">
            <Check size={18} />
            <strong>Email queued</strong>
            <p>Check the outbox or the recipient’s inbox. The link expires shortly.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete end-user?"
        eyebrow="Authentication"
        size="sm"
        description={deleteTarget ? `${deleteTarget.email} will lose access immediately. This cannot be undone.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} icon={<Trash2 size={14} />}>Delete user</Button>
          </>
        }
      >
        <p className="auth-delete-copy">Active refresh sessions and pending links are removed with the account. Sent email history is not affected.</p>
      </Modal>
    </div>
  )
}
