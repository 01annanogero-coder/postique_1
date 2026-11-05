import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Eye,
  Globe2,
  Inbox,
  LayoutPanelLeft,
  LockKeyhole,
  MessageSquare,
  Monitor,
  Palette,
  PanelRight,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react'
import { Avatar, Badge, Button, CopyButton, Toggle } from '../components/ui'
import { cx, firstName, navigate } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader } from './shared'

const scriptSnippet = `<!-- 1. On your server: mint a scoped inbox session -->
const session = await fetch("https://mail.example.com/embed/v1/session", {
  method: "POST",
  headers: {
    authorization: "Bearer " + process.env.POSTIQUE_SECRET_KEY,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    external_user_id: "user_123",
    email: "customer@example.com",
    name: "Amara",
    origin: "https://app.example.com",
  }),
}).then((response) => response.json());

<!-- 2. In your app: render the widget -->
<script src="https://mail.example.com/sdk/postique-inbox.js"></script>

<postique-inbox
  base-url="https://mail.example.com"
  token={session.token}
  theme="light"
  accent="#C6F26B"
  thread-id="thr_..."
  branding="true"
></postique-inbox>`

const reactSnippet = `import { useEffect, useRef } from "react";

export function OrderInbox({ token, threadId }) {
  const ref = useRef(null);

  useEffect(() => {
    const widget = ref.current;
    const onReply = (event) => console.log("Reply sent", event.detail);
    const onExpired = async () => {
      const next = await fetch("/api/postique/inbox-token").then((response) => response.json());
      widget?.setToken(next.token);
    };
    widget?.addEventListener("postique:reply.sent", onReply);
    widget?.addEventListener("postique:session.expired", onExpired);
    return () => {
      widget?.removeEventListener("postique:reply.sent", onReply);
      widget?.removeEventListener("postique:session.expired", onExpired);
    };
  }, []);

  return (
    <postique-inbox
      ref={ref}
      base-url="https://mail.example.com"
      token={token}
      thread-id={threadId}
      theme="light"
      accent="#C6F26B"
    />
  );
}`

const accents = [
  { name: 'Postique lime', value: '#C6F26B' },
  { name: 'Ink', value: '#121713' },
  { name: 'Cobalt', value: '#4B6FDB' },
  { name: 'Terracotta', value: '#CF7448' },
  { name: 'Warm sand', value: '#D7B98C' },
]

function EmbedPreview({ config, thread }) {
  const { toast } = useStore()
  const [reply, setReply] = useState('')
  const messages = thread.messages.slice(-3)

  const send = () => {
    if (!reply.trim()) return
    toast('Embedded inbox is a preview', 'error', 'Sending from this page is disabled. Use the Inbox to reply.')
  }

  return (
    <div className={cx('embed-preview', config.theme === 'dark' && 'is-dark')} style={{ '--embed-accent': config.accent }}>
      <div className="embed-preview__browser">
        <div className="embed-preview__bar">
          <span className="window-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="embed-preview__url">
            <LockKeyhole size={9} /> admin.acme.co.ke/orders/AC-4821
          </span>
          <span className="embed-preview__badge">Your product</span>
        </div>
        <div className="embed-preview__app">
          <aside className="embed-preview__nav">
            <span className="embed-preview__brand">ACME</span>
            <span>
              <Inbox size={12} /> Orders
            </span>
            <span className="is-active">
              <MessageSquare size={12} /> Conversations
            </span>
            <span>
              <Globe2 size={12} /> Customers
            </span>
            <span>
              <Settings2 size={12} /> Settings
            </span>
          </aside>
          <div className="embed-preview__content">
            <div className="embed-preview__order">
              <div>
                <span>ORDER AC-4821</span>
                <strong>The Everyday Set</strong>
                <small>Amara Njoroge · Westlands, Nairobi</small>
              </div>
              <div className="embed-preview__order-meta">
                <Badge tone="success">Paid</Badge>
                <strong>KSh 8,400</strong>
              </div>
            </div>

            <div className={cx('embedded-panel', config.mode === 'inbox' && 'is-full')}>
              <div className="embedded-panel__head">
                <div>
                  <strong>{config.mode === 'inbox' ? 'Inbox' : thread.subject}</strong>
                  <span>
                    {config.mode === 'inbox' ? '3 conversations · 2 unread' : `${thread.customer.name} · ${thread.customer.email}`}
                  </span>
                </div>
                <div>
                  <span className="embedded-panel__status">Open</span>
                  <button aria-label="Close panel">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="embedded-panel__messages">
                {messages.map((message) => (
                  <div
                    className={cx('embedded-message', message.direction === 'out' && 'is-out')}
                    key={message.id}
                  >
                    <Avatar
                      name={message.direction === 'out' ? 'AC' : thread.customer.name}
                      initials={message.direction === 'out' ? 'AC' : thread.customer.initials}
                      color={message.direction === 'out' ? '#26352A' : thread.customer.color}
                      size={24}
                    />
                    <div>
                      <div className="embedded-message__meta">
                        <strong>{message.direction === 'out' ? 'Acme Commerce' : thread.customer.name}</strong>
                        <span>{message.date}</span>
                      </div>
                      <p>{message.body.split('\n\n')[0]}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="embedded-composer">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={`Reply to ${firstName(thread.customer.name)}…`}
                  rows={2}
                />
                <div>
                  <span>
                    <ShieldCheck size={10} /> Sent through Postique
                  </span>
                  <button onClick={send}>
                    Send <Send size={10} />
                  </button>
                </div>
              </div>
              {config.showBranding && <span className="embedded-panel__powered">Powered by Postique</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="embed-preview__caption">
        <span>
          <Monitor size={12} /> Theme preview
        </span>
        <span>This panel is rendered inside a simulated host application.</span>
      </div>
    </div>
  )
}

export default function Embed() {
  const { threads, toast } = useStore()
  const thread = threads.find((item) => item.externalUserId) || threads[0]
  const [mode, setMode] = useState('thread')
  const [theme, setTheme] = useState('light')
  const [accent, setAccent] = useState(accents[0].value)
  const [showBranding, setShowBranding] = useState(true)
  const [allowAttachments, setAllowAttachments] = useState(true)
  const [tab, setTab] = useState('script')
  const [fullPreview, setFullPreview] = useState(false)

  const snippet = tab === 'script' ? scriptSnippet : reactSnippet
  const config = { mode, theme, accent, showBranding, allowAttachments }

  if (!thread) {
    return (
      <div className="page page--embed">
        <PageHeader
          eyebrow="Available now"
          title="Embedded inbox"
          description="A themable conversation widget scoped to your application’s own users."
          actions={<Badge tone="success">Available</Badge>}
        />
        <div className="empty-state empty-state--panel">
          <span className="empty-state__icon">
            <Inbox size={22} />
          </span>
          <h3>No conversation to preview</h3>
          <p>Create a conversation with an external_user_id, then this page can preview the widget theme.</p>
          <Button onClick={() => navigate('/app/inbox')} icon={<Inbox size={15} />}>
            Open inbox
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--embed">
      <PageHeader
        eyebrow="Scoped, themable, self-hosted"
        title="Embedded inbox"
        description="The widget renders your conversations inside your product. Your app’s user id controls access."
        actions={
          <>
            <Badge tone="success" className="embed-beta">Available</Badge>
            <Button variant="secondary" onClick={() => setFullPreview(true)} icon={<Eye size={15} />}>
              Full preview
            </Button>
            <Button onClick={() => navigate('/app/developers')} icon={<Code2 size={15} />}>
              Create server key
            </Button>
          </>
        }
      />

      <div className="embed-notice">
        <Sparkles size={14} />
        <span>
          The widget is live at <code>/sdk/postique-inbox.js</code>. Your backend exchanges a secret key for a
          short-lived, user-scoped token; the browser never receives the workspace key. This page previews the
          theme and configuration against a real conversation.
        </span>
      </div>

      <div className="embed-layout">
        <aside className="embed-config">
          <div className="embed-config__head">
            <div>
              <strong>Configuration</strong>
              <span>Changes update the preview instantly.</span>
            </div>
            <Palette size={16} />
          </div>

          <div className="config-group">
            <span className="config-group__label">Mode</span>
            <div className="segmented">
              <button className={cx(mode === 'thread' && 'is-active')} onClick={() => setMode('thread')}>
                <PanelRight size={13} /> Single thread
              </button>
              <button className={cx(mode === 'inbox' && 'is-active')} onClick={() => setMode('inbox')}>
                <LayoutPanelLeft size={13} /> Full inbox
              </button>
            </div>
          </div>

          <div className="config-group">
            <span className="config-group__label">Theme</span>
            <div className="theme-options">
              {[
                ['light', 'Light'],
                ['dark', 'Dark'],
              ].map(([value, label]) => (
                <button key={value} className={cx(theme === value && 'is-active')} onClick={() => setTheme(value)}>
                  <span className={cx('theme-swatch', `theme-swatch--${value}`)} />
                  {label}
                  {theme === value && <Check size={11} />}
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <span className="config-group__label">Accent colour</span>
            <div className="accent-options">
              {accents.map((option) => (
                <button
                  key={option.value}
                  className={cx(accent === option.value && 'is-active')}
                  onClick={() => setAccent(option.value)}
                  style={{ background: option.value }}
                  title={option.name}
                  aria-label={option.name}
                >
                  {accent === option.value && <Check size={11} />}
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <span className="config-group__label">Options</span>
            <div className="config-toggle">
              <div>
                <strong>Show Postique branding</strong>
                <span>“Powered by Postique” under the panel.</span>
              </div>
              <Toggle checked={showBranding} onChange={setShowBranding} label="Show Postique branding" size="sm" />
            </div>
            <div className="config-toggle">
              <div>
                <strong>Allow attachments</strong>
                <span>Let operators attach files to replies.</span>
              </div>
              <Toggle checked={allowAttachments} onChange={setAllowAttachments} label="Allow attachments" size="sm" />
            </div>
          </div>

          <div className="embed-security">
            <LockKeyhole size={15} />
            <div>
              <strong>Scoped session token</strong>
              <p>
                Your server exchanges a secret key for a 60-minute token bound to one external user and origin.
                The workspace key never reaches the browser.
              </p>
            </div>
          </div>
        </aside>

        <div className="embed-main">
          <EmbedPreview config={config} thread={thread} />

          <div className="embed-code">
            <div className="embed-code__head">
              <div className="embed-code__tabs">
                <button className={cx(tab === 'script' && 'is-active')} onClick={() => setTab('script')}>
                  Script tag
                </button>
                <button className={cx(tab === 'react' && 'is-active')} onClick={() => setTab('react')}>
                  React
                </button>
              </div>
              <CopyButton value={snippet} label="Copy snippet" />
            </div>
            <pre>
              <code>{snippet}</code>
            </pre>
            <div className="embed-code__foot">
              <span>
                <ShieldCheck size={11} /> User-scoped token enforced server-side
              </span>
              <span>Widget · self-hosted</span>
            </div>
          </div>

          <div className="embed-benefits">
            <div>
              <span>
                <Globe2 size={15} />
              </span>
              <strong>Your domain, your context</strong>
              <p>Operators never leave your admin panel or learn another inbox.</p>
            </div>
            <div>
              <span>
                <ShieldCheck size={15} />
              </span>
              <strong>Permission-aware</strong>
              <p>Thread access is checked on the server for every request.</p>
            </div>
            <div>
              <span>
                <MessageSquare size={15} />
              </span>
              <strong>Conversation-native</strong>
              <p>Correct headers and reply addresses are handled by Postique.</p>
            </div>
          </div>
        </div>
      </div>

      {fullPreview && (
        <div className="embed-full" onClick={(event) => event.target === event.currentTarget && setFullPreview(false)}>
          <div className="embed-full__card">
            <div className="embed-full__head">
              <div>
                <span>EMBEDDED INBOX · FULL PREVIEW</span>
                <strong>admin.acme.co.ke</strong>
              </div>
              <button onClick={() => setFullPreview(false)} aria-label="Close full preview">
                <X size={18} />
              </button>
            </div>
            <div className="embed-full__body">
              <EmbedPreview config={config} thread={thread} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
