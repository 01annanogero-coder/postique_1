import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Database, KeyRound, Mail, Server, ShieldCheck } from 'lucide-react'
import { Logo, LogoMark, Button, Field } from '../components/ui'
import { navigate } from '../lib/utils'
import { useAuth } from '../store/AuthContext'

const setupBenefits = [
  { icon: <Database size={15} />, title: 'SQLite database', copy: 'All data stays in DATA_DIR on this machine.' },
  { icon: <Mail size={15} />, title: 'Your SMTP', copy: 'Send through your own relay or direct-to-MX.' },
  { icon: <Server size={15} />, title: 'Built-in inbound', copy: 'Receive replies on your own SMTP listener.' },
  { icon: <ShieldCheck size={15} />, title: 'Local secrets', copy: 'Sessions, API keys and DKIM keys stay local.' },
]

export default function AuthScreen({ mode = 'login' }) {
  const auth = useAuth()
  const isSetup = mode === 'setup' || auth.setupRequired
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (isSetup && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      if (isSetup) {
        await auth.setup({ name, email, password, workspaceName })
      } else {
        await auth.login(email, password)
      }
      navigate('/app')
    } catch (submitError) {
      setError(submitError.message || 'Could not complete that request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__visual">
        <button className="auth-page__back" onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> Back to website
        </button>
        <div className="auth-page__visual-copy">
          <span className="auth-page__eyebrow">SELF-HOSTED EMAIL INFRASTRUCTURE</span>
          <h1>
            Your application.
            <br />
            Your inbox.
            <br />
            <span className="serif">Your server.</span>
          </h1>
          <p>
            Postique runs entirely on your infrastructure. No Supabase, no Cloudflare, no Amazon SES — just
            your database, your SMTP relay and your domain.
          </p>
        </div>
        <div className="auth-page__benefits">
          {setupBenefits.map((benefit) => (
            <div key={benefit.title}>
              <span>{benefit.icon}</span>
              <div>
                <strong>{benefit.title}</strong>
                <p>{benefit.copy}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="auth-page__brand">
          <Logo light />
          <span>v1.0 · self-hosted</span>
        </div>
      </div>

      <div className="auth-page__form-wrap">
        <div className="auth-page__form-head">
          <LogoMark size={34} />
          <span>{isSetup ? 'First-run setup' : 'Workspace access'}</span>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-form__heading">
            <span>{isSetup ? 'NEW INSTANCE' : 'WELCOME BACK'}</span>
            <h2>{isSetup ? 'Set up your workspace.' : 'Sign in to Postique.'}</h2>
            <p>
              {isSetup
                ? 'Create the owner account for this self-hosted installation. You can add your domain and SMTP settings next.'
                : 'Use the owner account from this installation to access the workspace.'}
            </p>
          </div>

          {isSetup && (
            <div className="auth-form__row">
              <Field label="Your name">
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Annan Ogero" required autoFocus />
              </Field>
              <Field label="Workspace name">
                <input className="input" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Acme Commerce" />
              </Field>
            </div>
          )}

          <Field label="Email address">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus={!isSetup}
            />
          </Field>
          <Field label="Password" hint={isSetup ? 'At least 10 characters. Stored locally with scrypt.' : undefined}>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              required
              minLength={10}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
            />
          </Field>
          {isSetup && (
            <Field label="Confirm password">
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="••••••••••••"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </Field>
          )}

          {error && (
            <div className="auth-form__error">
              <KeyRound size={14} /> {error}
            </div>
          )}

          <Button type="submit" size="lg" className="button--block" loading={busy} icon={!busy && <ArrowRight size={16} />}>
            {isSetup ? 'Create workspace' : 'Sign in'}
          </Button>

          {!isSetup && (
            <div className="auth-form__note">
              <Check size={12} /> Local accounts only. No third-party identity provider.
            </div>
          )}
        </form>
        <div className="auth-page__form-foot">
          <span>Postique self-hosted</span>
          <span>Data directory {'.'}/data</span>
        </div>
      </div>
    </div>
  )
}
