import { useState } from 'react'
import {
  ArrowRight,
  Bell,
  Check,
  Database,
  Globe2,
  HardDrive,
  Inbox,
  KeyRound,
  Mail,
  Save,
  Server,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Avatar, Badge, Button, Field, ProgressBar, Toggle } from '../components/ui'
import { api } from '../lib/api'
import { navigate } from '../lib/utils'
import { useAuth } from '../store/AuthContext'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard } from './shared'

export default function SettingsPage() {
  const { workspace, domains, assets, usage, metrics, updateWorkspace, config, toast } = useStore()
  const auth = useAuth()
  const settings = workspace.settings || {}
  const [name, setName] = useState(workspace.name)
  const [notifyReplies, setNotifyReplies] = useState(settings.notifyReplies ?? true)
  const [notifyBounces, setNotifyBounces] = useState(settings.notifyBounces ?? true)
  const [busy, setBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const verifiedDomains = domains.filter((domain) => domain.status === 'verified')
  const storageBytes = assets.reduce((total, asset) => total + (asset.bytes || 0), 0)
  const sendPercent = usage?.sendLimit ? Math.min(100, ((usage.sends || 0) / usage.sendLimit) * 100) : 0

  const save = async () => {
    setBusy(true)
    await updateWorkspace({
      name,
      settings: { notifyReplies, notifyBounces },
    })
    setBusy(false)
  }

  const changePassword = async () => {
    if (newPassword.length < 10) {
      toast('Use at least 10 characters', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('Passwords do not match', 'error')
      return
    }
    setPasswordBusy(true)
    try {
      await api.updateProfile({ currentPassword, password: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('Password changed', 'success')
      await auth.refresh()
    } catch (error) {
      toast('Password could not be changed', 'error', error.message)
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div className="page page--settings">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage the local workspace, sending defaults and notification behaviour."
        actions={
          <Button onClick={save} loading={busy} icon={!busy && <Save size={15} />}>
            Save changes
          </Button>
        }
      />

      <div className="settings-layout">
        <div className="settings-main">
          <SectionCard title="Workspace profile" description="This name appears across the dashboard and in the API.">
            <div className="settings-avatar-row">
              <span className="settings-avatar">{workspace.initials || 'PQ'}</span>
              <div>
                <strong>{workspace.name}</strong>
                <span>Self-hosted workspace · {workspace.slug}</span>
                <span className="settings-avatar-row__hint">Profile images are managed by your local deployment.</span>
              </div>
            </div>
            <div className="settings-fields">
              <Field label="Workspace name">
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Workspace slug" hint="Set at setup. Used by the API and internal records.">
                <input className="input" value={workspace.slug} readOnly />
              </Field>
              <Field label="Install URL">
                <input className="input" value={config.appUrl} readOnly />
              </Field>
              <Field label="Inbound domain">
                <input className="input" value={config.inboundDomain} readOnly />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Owner account" description="Your local sign-in. Passwords are hashed with scrypt.">
            <div className="settings-fields">
              <Field label="Name">
                <input className="input" value={auth.user?.name || ''} readOnly />
              </Field>
              <Field label="Email">
                <input className="input" value={auth.user?.email || ''} readOnly />
              </Field>
              <Field label="Current password">
                <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="New password" hint="At least 10 characters.">
                <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password">
                <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            <div className="settings-password-action">
              <Button variant="secondary" onClick={changePassword} loading={passwordBusy} icon={!passwordBusy && <ShieldCheck size={14} />}>
                Change password
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Sending infrastructure" description="Postique uses your local configuration, not a hosted provider.">
            <div className="settings-fields">
              <Field label="Outbound transport">
                <input className="input" value={config.mailTransport} readOnly />
              </Field>
              <Field label="Inbound SMTP port">
                <input className="input" value={String(config.inboundPort || '')} readOnly />
              </Field>
            </div>
            <div className={`settings-info ${verifiedDomains.length ? '' : 'settings-info--warn'}`}>
              {verifiedDomains.length ? <ShieldCheck size={14} /> : <Globe2 size={14} />}
              <div>
                <strong>{verifiedDomains.length ? 'Sending domain verified' : 'No verified sending domain'}</strong>
                <span>
                  {verifiedDomains.length
                    ? `${verifiedDomains[0].name} · SPF, DKIM and DMARC are active`
                    : 'Add a domain and publish its DNS records before sending.'}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate('/app/domains')}>
                Manage
              </Button>
            </div>
            <div className="settings-system-links">
              <button onClick={() => navigate('/app/developers')}>
                <KeyRound size={14} /> API keys and webhooks <ArrowRight size={12} />
              </button>
              <button onClick={() => navigate('/app/domains')}>
                <Globe2 size={14} /> Domains and identities <ArrowRight size={12} />
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Notifications" description="These preferences are stored on this server.">
            <div className="settings-toggle-list">
              <div className="settings-toggle">
                <span className="settings-toggle__icon">
                  <Bell size={15} />
                </span>
                <div>
                  <strong>New reply notifications</strong>
                  <span>Notify the workspace owner when a customer replies.</span>
                </div>
                <Toggle checked={notifyReplies} onChange={setNotifyReplies} label="New reply notifications" />
              </div>
              <div className="settings-toggle">
                <span className="settings-toggle__icon">
                  <Inbox size={15} />
                </span>
                <div>
                  <strong>Bounce and complaint alerts</strong>
                  <span>Notify when a message fails or a recipient complains.</span>
                </div>
                <Toggle checked={notifyBounces} onChange={setNotifyBounces} label="Bounce notifications" />
              </div>
              <div className="settings-toggle">
                <span className="settings-toggle__icon">
                  <ShieldCheck size={15} />
                </span>
                <div>
                  <strong>Stored locally</strong>
                  <span>Preferences are part of the workspace record on this server.</span>
                </div>
              </div>
            </div>
            <p className="settings-footnote">
              Notification delivery uses the same SMTP transport. If the transport is set to <code>file</code>,
              alerts are written to the local outbox.
            </p>
          </SectionCard>

          <SectionCard title="Local data" description="Everything is stored on the machine running this server.">
            <div className="settings-data-grid">
              <div>
                <Database size={16} />
                <span>Database</span>
                <strong>SQLite</strong>
                <small>WAL mode · {config.appUrl}</small>
              </div>
              <div>
                <HardDrive size={16} />
                <span>Assets</span>
                <strong>{assets.length}</strong>
                <small>{storageBytes.toLocaleString()} bytes</small>
              </div>
              <div>
                <Server size={16} />
                <span>Inbound</span>
                <strong>{config.inboundDomain}</strong>
                <small>port {config.inboundPort}</small>
              </div>
            </div>
          </SectionCard>
        </div>

        <aside className="settings-side">
          <div className="settings-plan">
            <div className="settings-plan__head">
              <span className="settings-plan__icon">
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>Self-hosted</strong>
                <span>No billing · your infrastructure</span>
              </div>
              <Badge tone="lime">Active</Badge>
            </div>
            <div className="settings-plan__usage">
              <div>
                <span>Emails this month</span>
                <strong>
                  {(usage?.sends || 0).toLocaleString()} <small>/ {(usage?.sendLimit || 0).toLocaleString()}</small>
                </strong>
              </div>
              <ProgressBar value={sendPercent} />
            </div>
            <div className="settings-plan__stats">
              <div>
                <span>Inbound</span>
                <strong>{usage?.inbound || 0}</strong>
              </div>
              <div>
                <span>Storage</span>
                <strong>{(storageBytes / 1024 / 1024).toFixed(1)} MB</strong>
              </div>
              <div>
                <span>Domains</span>
                <strong>{domains.length}</strong>
              </div>
            </div>
            <div className="settings-plan__note">
              <Check size={12} /> SQLite, files and background jobs run locally
            </div>
          </div>

          <div className="settings-owner">
            <Avatar name={auth.user?.name} initials={workspace.initials} color="#314238" size={40} />
            <div>
              <strong>{auth.user?.name}</strong>
              <span>{auth.user?.email}</span>
            </div>
            <UserRound size={14} />
          </div>

          <div className="settings-links">
            <span className="settings-owner__label">SHORTCUTS</span>
            <button onClick={() => navigate('/app/domains')}>
              <Globe2 size={14} /> Sending domains <ArrowRight size={12} />
            </button>
            <button onClick={() => navigate('/app/developers')}>
              <KeyRound size={14} /> API keys <ArrowRight size={12} />
            </button>
            <button onClick={() => navigate('/app/automations')}>
              <Inbox size={14} /> Automation rules <ArrowRight size={12} />
            </button>
          </div>

          <div className="settings-meta">
            <span>Workspace ID</span>
            <code>{workspace.id}</code>
            <span>{metrics.openConversations || 0} open conversations · {templatesCount(metrics)}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

function templatesCount(metrics) {
  return `${metrics.templates || 0} templates`
}
