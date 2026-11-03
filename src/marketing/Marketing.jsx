import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Fingerprint,
  Globe2,
  Image,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquare,
  MousePointerClick,
  PanelRight,
  Play,
  Reply,
  Search,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import { seedThreads } from '../lib/data'
import { Logo, LogoMark, Badge, Button, CopyButton } from '../components/ui'
import { cx, navigate } from '../lib/utils'

const navLinks = [
  { label: 'Product', target: 'product' },
  { label: 'How it works', target: 'how-it-works' },
  { label: 'Developers', target: 'developers' },
  { label: 'Roadmap', target: 'roadmap' },
]

const capabilities = [
  {
    group: 'Included',
    tone: 'success',
    items: [
      ['MJML Template Studio', 'Editor, variables, live preview, test send, draft and published versions.'],
      ['REST API and browser SDK', 'Template or raw HTML sends, idempotency, small attachments and authed API keys.'],
      ['Application authentication', 'Email/password, JWT sessions, magic links, recovery and end-user management.'],
      ['Embedded inbox', 'A themable <postique-inbox> widget scoped to your application’s external user IDs.'],
      ['Custom sending domains', 'Locally generated DKIM keys, SPF/DKIM/DMARC guidance and DNS verification.'],
      ['Threaded replies and inbound email', 'Built-in inbound SMTP, stable subjects, correct headers and manual linking.'],
      ['Dashboard inbox', 'Conversation list, thread view, search, labels and replies using a saved template.'],
      ['Local asset library', 'Images stored under your DATA_DIR with direct URLs for templates.'],
    ],
  },
  {
    group: 'Self-hosted automation',
    tone: 'purple',
    items: [
      ['Approved FAQ rules', 'Local phrase matching selects exact responses you wrote. Auto-send is opt-in.'],
    ],
  },
  {
    group: 'Planned',
    tone: 'blue',
    items: [
      ['Custom embed layout slots', 'Deeper structural customization beyond theme tokens. The headless API is available today.'],
    ],
  },
  {
    group: 'Not included',
    tone: 'neutral',
    items: [
      ['Gmail / Outlook sync', 'Postique manages application email, not your entire personal mailbox.'],
      ['Bulk campaigns', 'This is communication infrastructure, not a marketing suite.'],
    ],
  },
]

const faqs = [
  {
    q: 'Does Postique replace Gmail or Outlook?',
    a: 'No. Postique manages the email conversations connected to your application. It does not import your personal mailbox, and it does not require your customers to leave their normal email client. They reply from Gmail, Outlook or anywhere else — the reply lands in your Postique thread.',
  },
  {
    q: 'Can I use my own domain?',
    a: 'Yes. Add your domain, publish the SPF, DKIM and DMARC records Postique gives you, and verify it. Once verified, send as orders@yourcompany.com, support@yourcompany.com, or any identity you configure.',
  },
  {
    q: 'Can the automation write its own replies?',
    a: 'No. The local matcher only selects from responses you have explicitly approved. If confidence is below your threshold, the message stays in the inbox for a person. Auto-send is off by default.',
  },
  {
    q: 'Can I embed the inbox in my own product?',
    a: 'Yes. Load the self-hosted widget from /sdk/postique-inbox.js, mint a short-lived session for one of your users on your server, and pass the token to the widget. You can also use the scoped API and build the entire interface yourself.',
  },
]

function useScrollTo() {
  return (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function MarketingNav() {
  const [open, setOpen] = useState(false)
  const scrollTo = useScrollTo()

  const go = (target) => {
    setOpen(false)
    if (window.location.hash !== '#/') {
      navigate('/')
      setTimeout(() => scrollTo(target), 80)
    } else {
      scrollTo(target)
    }
  }

  return (
    <header className="site-nav">
      <div className="site-nav__inner">
        <button className="site-nav__logo" onClick={() => navigate('/')} aria-label="Postique home">
          <Logo />
        </button>
        <nav className="site-nav__links" aria-label="Main navigation">
          {navLinks.map((link) => (
            <button key={link.target} onClick={() => go(link.target)}>
              {link.label}
            </button>
          ))}
        </nav>
        <div className="site-nav__actions">
          <button className="site-nav__signin" onClick={() => navigate('/app')}>
            Sign in
          </button>
          <Button variant="primary" size="sm" onClick={() => navigate('/app')} iconRight={<ArrowRight size={14} />}>
            Open workspace
          </Button>
        </div>
        <button
          className="site-nav__menu"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="site-nav__mobile">
          {navLinks.map((link) => (
            <button key={link.target} onClick={() => go(link.target)}>
              {link.label}
              <ArrowUpRight size={15} />
            </button>
          ))}
          <button onClick={() => navigate('/app')}>
            Open workspace
            <ArrowRight size={15} />
          </button>
        </div>
      )}
    </header>
  )
}

function MiniInbox() {
  const threads = seedThreads.slice(0, 4)
  return (
    <div className="mini-inbox">
      <div className="mini-inbox__rail">
        <LogoMark size={25} />
        <span className="mini-inbox__rail-icon is-active">
          <Inbox size={13} />
        </span>
        <span className="mini-inbox__rail-icon">
          <Layers size={13} />
        </span>
        <span className="mini-inbox__rail-icon">
          <Globe2 size={13} />
        </span>
        <span className="mini-inbox__rail-spacer" />
        <span className="mini-inbox__avatar">AO</span>
      </div>
      <div className="mini-inbox__list">
        <div className="mini-inbox__list-head">
          <span>Inbox</span>
          <span className="mini-inbox__count">3</span>
        </div>
        {threads.map((thread, index) => (
          <div key={thread.id} className={cx('mini-thread', index === 0 && 'is-active')}>
            <span className="mini-thread__avatar" style={{ background: thread.customer.color }}>
              {thread.customer.initials}
            </span>
            <span className="mini-thread__copy">
              <span className="mini-thread__top">
                <strong>{thread.customer.name}</strong>
                <time>{thread.lastActivity}</time>
              </span>
              <span className="mini-thread__subject">{thread.subject}</span>
              <span className="mini-thread__snippet">{thread.snippet}</span>
            </span>
            {thread.unread && <span className="mini-thread__unread" />}
          </div>
        ))}
      </div>
      <div className="mini-inbox__thread">
        <div className="mini-inbox__thread-head">
          <div>
            <span className="mini-kicker">CONVERSATION</span>
            <strong>Delivery before Friday?</strong>
          </div>
          <span className="mini-inbox__more">···</span>
        </div>
        <div className="mini-message mini-message--out">
          <div className="mini-message__meta">
            <span className="mini-message__avatar">AC</span>
            <span>
              <strong>Acme Commerce</strong>
              <small>orders@acme.co.ke · 4:12 PM</small>
            </span>
            <CheckCheck size={11} />
          </div>
          <p>Good news, Amara — order AC-4821 is packed and on its way.</p>
          <div className="mini-order">
            <span className="mini-order__thumb">◒</span>
            <span>
              <strong>The Everyday Set</strong>
              <small>Sand · Qty 1</small>
            </span>
            <b>KSh 8,400</b>
          </div>
        </div>
        <div className="mini-message mini-message--in">
          <div className="mini-message__meta">
            <span className="mini-message__avatar" style={{ background: '#D7E8C4' }}>
              AN
            </span>
            <span>
              <strong>Amara Njoroge</strong>
              <small>9:41 AM · via Gmail</small>
            </span>
          </div>
          <p>Thanks! I’m in Westlands and need the set before Friday for a client shoot. Will it arrive in time?</p>
        </div>
        <div className="mini-reply">
          <span>Reply to Amara…</span>
          <span className="mini-reply__send">
            <Send size={10} />
          </span>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  const scrollTo = useScrollTo()
  return (
    <section className="hero">
      <div className="hero__grid-bg" aria-hidden="true" />
      <div className="hero__orb hero__orb--one" aria-hidden="true" />
      <div className="hero__orb hero__orb--two" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <div className="hero__announce">
            <span className="hero__announce-dot" />
            <span>Email infrastructure for applications</span>
            <span className="hero__announce-sep" />
            <span className="hero__announce-link">
              See the product <ArrowUpRight size={12} />
            </span>
          </div>
          <h1>
            Email
            <br />
            infrastructure
            <br />
            built around
            <br />
            <span className="hero__nowrap">
              your <span className="serif">application.</span>
            </span>
          </h1>
          <p className="hero__lead">
            Design responsive templates, send from your product, receive threaded replies, and manage every
            conversation — through one API and one inbox.
          </p>
          <div className="hero__actions">
            <Button variant="primary" size="lg" onClick={() => navigate('/app')} iconRight={<ArrowRight size={16} />}>
              Start self-hosting
            </Button>
            <Button variant="secondary" size="lg" onClick={() => scrollTo('product')} icon={<Play size={14} />}>
              Explore the product
            </Button>
          </div>
          <div className="hero__meta">
            <span>
              <Check size={13} /> Self-hosted
            </span>
            <span>
              <Check size={13} /> Your SMTP
            </span>
            <span>
              <Check size={13} /> Your data
            </span>
          </div>
        </div>
        <div className="hero__visual">
          <div className="hero__visual-glow" aria-hidden="true" />
          <div className="product-window">
            <div className="product-window__bar">
              <span className="window-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="product-window__url">
                <LockKeyhole size={10} />
                app.yourcompany.com/inbox
              </span>
              <span className="product-window__live">
                <span /> live
              </span>
            </div>
            <MiniInbox />
          </div>
          <div className="float-card float-card--reply">
            <span className="float-card__icon">
              <Reply size={13} />
            </span>
            <div>
              <strong>Reply received</strong>
              <span>Matched to thread · 312ms</span>
            </div>
            <span className="float-card__pulse" />
          </div>
          <div className="float-card float-card--delivered">
            <span className="float-card__check">
              <Check size={11} />
            </span>
            <div>
              <strong>Delivered</strong>
              <span>orders@acme.co.ke</span>
            </div>
          </div>
          <div className="float-code">
            <div className="float-code__head">
              <span>
                <Code2 size={11} /> send.ts
              </span>
              <span>TypeScript</span>
            </div>
            <pre>
              <code>
                <span className="code-key">await</span> postique.send({'{'}
                {'\n'}  template: <span className="code-str">'order-confirmation'</span>,
                {'\n'}  to: <span className="code-str">'amara@gmail.com'</span>,
                {'\n'}  thread_id: <span className="code-str">'thr_8f2ka1'</span>
                {'\n'}
                {'}'});
              </code>
            </pre>
          </div>
        </div>
      </div>
      <div className="hero__ticker">
        <div className="container hero__ticker-inner">
          <span>Built for the products people use every day</span>
          <div className="hero__ticker-items">
            <span>SaaS</span>
            <i />
            <span>Marketplaces</span>
            <i />
            <span>Commerce</span>
            <i />
            <span>Booking platforms</span>
            <i />
            <span>Agencies</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function LoopSection() {
  return (
    <section className="section section--loop" id="product">
      <div className="container">
        <div className="loop-head">
          <div>
            <div className="eyebrow">The complete loop</div>
            <h2>
              Most email tools stop at <span className="serif">send.</span>
              <br />
              Postique follows the conversation.
            </h2>
          </div>
          <p>
            Sending is one moment. Real communication is a loop: design, deliver, receive, understand,
            respond. Postique is built for the whole thing.
          </p>
        </div>

        <div className="loop-steps">
          {[
            { n: '01', icon: <Layers size={18} />, title: 'Design', copy: 'Build responsive email in MJML with live preview and reusable variables.' },
            { n: '02', icon: <Send size={18} />, title: 'Send', copy: 'Trigger from your API or browser, with idempotency and delivery tracking.' },
            { n: '03', icon: <Inbox size={18} />, title: 'Receive', copy: 'Replies route back to the right thread, not into an anonymous mailbox.' },
            { n: '04', icon: <MessageSquare size={18} />, title: 'Resolve', copy: 'Reply from Postique or your own product, and keep the context together.' },
          ].map((step, index) => (
            <div className="loop-step" key={step.n}>
              <span className="loop-step__line" aria-hidden="true" />
              <div className="loop-step__top">
                <span className="loop-step__icon">{step.icon}</span>
                <span className="loop-step__n">{step.n}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
              {index < 3 && <ArrowRight size={16} className="loop-step__arrow" />}
            </div>
          ))}
        </div>

        <div className="bento">
          <div className="bento-card bento-card--studio">
            <div className="bento-card__head">
              <Badge tone="lime">Template Studio</Badge>
              <span className="bento-card__meta">MJML · variables · versions</span>
            </div>
            <h3>Design once. Send a thousand different emails.</h3>
            <p>
              A proper email design environment: code, preview, compile and test. Variables make the same
              template personal for every customer.
            </p>
            <div className="studio-mini">
              <div className="studio-mini__code">
                <div className="studio-mini__dots">
                  <i />
                  <i />
                  <i />
                  <span>welcome.mjml</span>
                </div>
                <pre>
                  <code>
                    {'<mj-section>'}
                    {'\n'}  {'<mj-text>'}
                    {'\n'}    Welcome, {'{{name}}'}.
                    {'\n'}  {'</mj-text>'}
                    {'\n'}  {'<mj-button>'}
                    {'\n'}    Start exploring
                    {'\n'}  {'</mj-button>'}
                    {'\n'}{'</mj-section>'}
                  </code>
                </pre>
              </div>
              <div className="studio-mini__preview">
                <div className="studio-email">
                  <div className="studio-email__bar">
                    <span>ACME</span>
                    <span>NAIROBI</span>
                  </div>
                  <div className="studio-email__body">
                    <span className="studio-email__kicker">WELCOME</span>
                    <strong>A little more room for good things.</strong>
                    <p>Hi Wanjiru, your account is ready.</p>
                    <span className="studio-email__button">Explore the collection</span>
                  </div>
                </div>
                <span className="studio-mini__label">
                  <MousePointerClick size={11} /> Live preview
                </span>
              </div>
            </div>
          </div>

          <div className="bento-card bento-card--thread">
            <div className="bento-card__head">
              <Badge tone="success">Threading</Badge>
            </div>
            <h3>One conversation, not a pile of messages.</h3>
            <p>
              Postique owns the Message-ID and the headers, so replies stay where they belong — even when a
              customer changes the subject.
            </p>
            <div className="thread-mini">
              <div className="thread-mini__row thread-mini__row--out">
                <span className="thread-mini__dot" />
                <div>
                  <strong>Order confirmation</strong>
                  <span>to amara@gmail.com · delivered</span>
                </div>
                <CheckCheck size={13} />
              </div>
              <div className="thread-mini__rail">
                <span />
                <span>In-Reply-To · References</span>
              </div>
              <div className="thread-mini__row thread-mini__row--in">
                <span className="thread-mini__dot" />
                <div>
                  <strong>Re: Delivery before Friday?</strong>
                  <span>from amara@gmail.com · 9:41 AM</span>
                </div>
                <span className="thread-mini__new">new</span>
              </div>
            </div>
          </div>

          <div className="bento-card bento-card--inbound">
            <div className="bento-card__head">
              <Badge tone="blue">Inbound</Badge>
            </div>
            <h3>Replies find their way home.</h3>
            <div className="inbound-address">
              <span>Reply-To</span>
              <code>t_8f2ka1@in.postique.fyi</code>
              <CopyButton value="t_8f2ka1@in.postique.fyi" compact />
            </div>
            <ul className="check-list">
              <li>
                <Check size={12} /> Header matching first
              </li>
              <li>
                <Check size={12} /> Reply address fallback
              </li>
              <li>
                <Check size={12} /> Unmatched mail kept for review
              </li>
            </ul>
          </div>

          <div className="bento-card bento-card--control">
            <div className="bento-card__head">
              <Badge tone="neutral">Control</Badge>
            </div>
            <h3>Built for the deliverability reality.</h3>
            <div className="deliverability">
              <div>
                <span className="deliverability__label">Delivery rate</span>
                <strong>99.2%</strong>
              </div>
              <div className="deliverability__bar">
                <span style={{ width: '99.2%' }} />
              </div>
              <div className="deliverability__foot">
                <span>
                  <span className="status-dot status-dot--ok" /> Healthy
                </span>
                <span>Last 30 days</span>
              </div>
            </div>
            <div className="control-tags">
              <span>
                <ShieldCheck size={12} /> Suppression list
              </span>
              <span>
                <Webhook size={12} /> Bounce webhooks
              </span>
              <span>
                <KeyRound size={12} /> Hashed keys
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const modeContent = {
  dashboard: {
    eyebrow: '01 · Postique Dashboard',
    title: 'A focused inbox for application email.',
    copy: 'Open Postique when you want one calm place to see what your product is saying and what customers are saying back. Labels, search and template replies — without trying to rebuild Gmail.',
    bullets: ['Conversation-first list', 'Safe rendering of inbound HTML', 'Reply with a saved template'],
    icon: <LayoutDashboard size={16} />,
  },
  embed: {
    eyebrow: '02 · Embeddable Inbox',
    title: 'Put the conversation inside your product.',
    copy: 'A ready-made conversation widget is planned. The API can already power a custom interface inside your admin dashboard, order page or support surface, so your users never leave your app.',
    bullets: ['Use the API to build a custom UI today', 'Server-side permissions and scoped keys', 'Drop-in widget on the roadmap'],
    icon: <PanelRight size={16} />,
  },
  api: {
    eyebrow: '03 · API & SDK',
    title: 'Complete control, from any stack.',
    copy: 'Build your own interface where the default one does not fit. Send, render, search threads and receive events through a clean REST API or the browser SDK.',
    bullets: ['REST from any backend', 'Public keys restricted by origin', 'Webhooks for replies and delivery'],
    icon: <Terminal size={16} />,
  },
}

function ModeVisual({ mode }) {
  if (mode === 'embed') {
    return (
      <div className="mode-visual mode-visual--embed">
        <div className="embed-admin">
          <div className="embed-admin__top">
            <span className="embed-admin__brand">ACME / ADMIN</span>
            <span className="embed-admin__tabs">
              <span>Orders</span>
              <span className="is-active">#AC-4821</span>
            </span>
          </div>
          <div className="embed-admin__body">
            <div className="embed-order">
              <span className="mini-kicker">ORDER #AC-4821</span>
              <strong>The Everyday Set</strong>
              <span>Amara Njoroge · Westlands, Nairobi</span>
              <div className="embed-order__status">
                <span>
                  <span className="status-dot status-dot--ok" /> Paid
                </span>
                <span>KSh 8,400</span>
              </div>
            </div>
            <div className="embed-panel">
              <div className="embed-panel__head">
                <span>
                  <Mail size={12} /> Customer conversation
                </span>
                <Badge tone="lime">Postique</Badge>
              </div>
              <div className="embed-panel__message">
                <span className="embed-panel__avatar">AN</span>
                <div>
                  <strong>Amara Njoroge</strong>
                  <p>Will it arrive before Friday? I’m in Westlands.</p>
                </div>
              </div>
              <div className="embed-panel__reply">
                <span>Write a reply…</span>
                <Send size={11} />
              </div>
              <span className="embed-panel__powered">Powered by Postique</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'api') {
    return (
      <div className="mode-visual mode-visual--api">
        <div className="api-window">
          <div className="api-window__head">
            <span className="window-dots">
              <i />
              <i />
              <i />
            </span>
            <span>POST /v1/send</span>
            <Badge tone="success" dot>
              201
            </Badge>
          </div>
          <pre className="api-code">
            <code>
              <span className="code-comment">// Send inside an existing conversation</span>
              {'\n'}
              <span className="code-key">const</span> message = <span className="code-key">await</span> postique.send({'{'}
              {'\n'}  from: <span className="code-str">'orders@acme.co.ke'</span>,
              {'\n'}  to: [<span className="code-str">'amara.njoroge@gmail.com'</span>],
              {'\n'}  template: <span className="code-str">'delivery-update'</span>,
              {'\n'}  variables: {'{'} name: <span className="code-str">'Amara'</span> {'}'},
              {'\n'}  thread_id: <span className="code-str">'thr_8f2ka1'</span>
              {'\n'}
              {'}'});
            </code>
          </pre>
          <div className="api-response">
            <span className="api-response__label">RESPONSE</span>
            <pre>
              <code>
                {'{\n  "id": "msg_9k2la8",\n  "thread_id": "thr_8f2ka1",\n  "status": "queued"\n}'}
              </code>
            </pre>
          </div>
        </div>
        <div className="api-endpoint">
          <Webhook size={14} />
          <span>Webhook</span>
          <code>thread.reply_received</code>
          <Badge tone="success">verified</Badge>
        </div>
      </div>
    )
  }

  return (
    <div className="mode-visual mode-visual--dashboard">
      <div className="dashboard-card">
        <div className="dashboard-card__side">
          <LogoMark size={24} />
          <span className="dashboard-card__nav is-active">
            <Inbox size={13} /> Inbox
          </span>
          <span className="dashboard-card__nav">
            <Layers size={13} /> Studio
          </span>
          <span className="dashboard-card__nav">
            <Globe2 size={13} /> Domains
          </span>
        </div>
        <div className="dashboard-card__list">
          <div className="dashboard-card__list-head">
            <strong>Inbox</strong>
            <span>3 unread</span>
          </div>
          {seedThreads.slice(0, 5).map((thread, index) => (
            <div key={thread.id} className={cx('dashboard-thread', index === 0 && 'is-active')}>
              <span className="dashboard-thread__avatar" style={{ background: thread.customer.color }}>
                {thread.customer.initials}
              </span>
              <div>
                <strong>{thread.customer.name}</strong>
                <span>{thread.subject}</span>
              </div>
              <time>{thread.lastActivity}</time>
            </div>
          ))}
        </div>
        <div className="dashboard-card__thread">
          <div className="dashboard-card__thread-head">
            <div>
              <span className="mini-kicker">CONVERSATION</span>
              <strong>Delivery before Friday?</strong>
            </div>
            <span className="dashboard-card__label">Orders</span>
          </div>
          <div className="dashboard-card__message">
            <span className="embed-panel__avatar" style={{ background: '#D7E8C4' }}>
              AN
            </span>
            <div>
              <div className="dashboard-card__meta">
                <strong>Amara Njoroge</strong>
                <span>9:41 AM</span>
              </div>
              <p>Thanks! I’m in Westlands and need the set before Friday for a client shoot.</p>
            </div>
          </div>
          <div className="dashboard-card__composer">
            <span>Reply to Amara…</span>
            <span className="dashboard-card__send">
              <Send size={11} />
            </span>
          </div>
          <span className="thread-address">
            <Reply size={10} /> t_8f2ka1@in.postique.fyi
          </span>
        </div>
      </div>
    </div>
  )
}

function ModesSection() {
  const [mode, setMode] = useState('dashboard')
  return (
    <section className="section section--modes" id="how-it-works">
      <div className="container">
        <div className="section-heading section-heading--center">
          <div className="eyebrow">Three ways to use Postique</div>
          <h2>
            Your application.
            <br />
            Your inbox. <span className="serif">Your conversations.</span>
          </h2>
          <p>
            Use Postique as your dashboard, embed it into your product, or build something completely your
            own. The infrastructure is the same.
          </p>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Ways to use Postique">
          {Object.entries(modeContent).map(([key, item]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              className={cx('mode-tab', mode === key && 'is-active')}
              onClick={() => setMode(key)}
            >
              {item.icon}
              {key === 'dashboard' ? 'Dashboard' : key === 'embed' ? 'Embeddable inbox' : 'API & SDK'}
            </button>
          ))}
        </div>
        <div className="mode-layout">
          <div className="mode-copy">
            <span className="mode-copy__eyebrow">{modeContent[mode].eyebrow}</span>
            <h3>{modeContent[mode].title}</h3>
            <p>{modeContent[mode].copy}</p>
            <ul className="mode-bullets">
              {modeContent[mode].bullets.map((bullet) => (
                <li key={bullet}>
                  <span>
                    <Check size={12} />
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
            <button className="text-link" onClick={() => navigate(mode === 'embed' ? '/app/embed' : mode === 'api' ? '/app/developers' : '/app/inbox')}>
              {mode === 'embed' ? 'See the planned widget' : mode === 'api' ? 'See the developer docs' : 'Open the inbox'}
              <ArrowRight size={14} />
            </button>
          </div>
          <ModeVisual mode={mode} />
        </div>
      </div>
    </section>
  )
}

function AutomationSection() {
  const [selected, setSelected] = useState([0, 2])
  return (
    <section className="section section--automation">
      <div className="container automation-layout">
        <div className="automation-copy">
          <div className="eyebrow eyebrow--light">Automation, with boundaries</div>
          <h2>
            Let rules choose.
            <br />
            <span className="serif">Not invent.</span>
          </h2>
          <p>
            Postique’s local automation does not generate customer-facing answers. It matches intent against
            responses you have explicitly approved, then selects the best match.
          </p>
          <div className="automation-principles">
            <div>
              <span>
                <Bot size={15} />
              </span>
              <div>
                <strong>Classification, not creation</strong>
                <p>Intent is matched to your FAQ library. Every word a customer receives was written by you.</p>
              </div>
            </div>
            <div>
              <span>
                <ShieldCheck size={15} />
              </span>
              <div>
                <strong>Human review when confidence drops</strong>
                <p>Unclear or sensitive messages stay in the inbox for a person to handle.</p>
              </div>
            </div>
          </div>
          <div className="automation-actions">
            <Button variant="lime" onClick={() => navigate('/app/automations')} iconRight={<ArrowRight size={15} />}>
              Explore automation
            </Button>
            <span>Local rules · auto-send off by default</span>
          </div>
        </div>
        <div className="automation-demo">
          <div className="automation-demo__head">
            <span className="automation-demo__incoming">
              <Mail size={13} /> Incoming message
            </span>
            <Badge tone="dark">Local</Badge>
          </div>
          <div className="automation-email">
            <div className="automation-email__meta">
              <span className="embed-panel__avatar" style={{ background: '#D8DDF0' }}>
                GW
              </span>
              <div>
                <strong>Grace Wambui</strong>
                <span>grace.wambui@yahoo.com</span>
              </div>
              <time>9:41 AM</time>
            </div>
            <p>“How long does delivery take, and can I pay using M-Pesa?”</p>
          </div>
          <div className="automation-scan">
            <Sparkles size={13} />
            <span>2 approved answers matched</span>
            <span className="automation-scan__line" />
          </div>
          <div className="automation-matches">
            {[
              { title: 'Delivery information', confidence: 96 },
              { title: 'Payment methods', confidence: 94 },
            ].map((match, index) => (
              <button
                key={match.title}
                className={cx('automation-match', selected.includes(index) && 'is-selected')}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(index) ? current.filter((value) => value !== index) : [...current, index],
                  )
                }
              >
                <span className="automation-match__check">
                  <Check size={10} />
                </span>
                <span>
                  <strong>{match.title}</strong>
                  <small>Approved response</small>
                </span>
                <span className="automation-match__confidence">{match.confidence}%</span>
              </button>
            ))}
          </div>
          <div className="automation-compose">
            <span className="automation-compose__label">COMPOSED REPLY</span>
            <p>
              {selected.length === 2
                ? 'Standard delivery takes 2–4 business days within Nairobi and 3–5 business days elsewhere in Kenya. We also accept M-Pesa, Visa and Mastercard…'
                : selected.length === 1
                  ? 'Standard delivery takes 2–4 business days within Nairobi and 3–5 business days elsewhere in Kenya…'
                  : 'No approved answer selected. This message would be held for human review.'}
            </p>
            <div className="automation-compose__foot">
              <span>
                <LockKeyhole size={10} /> Exact approved wording
              </span>
              <span>{selected.length ? 'Preview only' : 'Human review'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const codeExamples = {
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
  curl: `curl -X POST https://your-postique-host/v1/send \\
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
  browser: `const postique = new Postique("pq_pub_7c1d...", {
  baseUrl: "https://your-postique-host"
});

await postique.send({
  template: "contact-receipt",
  to: "customer@example.com",
  variables: { name: "Wanjiru" }
});`,
}

function DevelopersSection() {
  const [tab, setTab] = useState('node')
  return (
    <section className="section section--developers" id="developers">
      <div className="container developers-grid">
        <div className="developers-copy">
          <div className="eyebrow">For developers</div>
          <h2>
            An API you can
            <br />
            <span className="serif">build a product on.</span>
          </h2>
          <p>
            No provider-specific models leaking into your code. One clean interface for templates, threaded
            sends, inbound replies and delivery events.
          </p>
          <div className="developer-points">
            <div>
              <span>
                <Braces size={14} />
              </span>
              <div>
                <strong>Predictable objects</strong>
                <p>Messages, threads, events and templates. Every id is yours to store.</p>
              </div>
            </div>
            <div>
              <span>
                <Server size={14} />
              </span>
              <div>
                <strong>Provider adapter</strong>
                <p>Your own SMTP relay or direct-to-MX. The API stays stable if the delivery path changes.</p>
              </div>
            </div>
            <div>
              <span>
                <ShieldCheck size={14} />
              </span>
              <div>
                <strong>Keys made for the browser</strong>
                <p>Public keys are origin-restricted, rate-limited and template-scoped.</p>
              </div>
            </div>
            <div>
              <span>
                <Fingerprint size={14} />
              </span>
              <div>
                <strong>Application identity</strong>
                <p>Email/password, JWT sessions, magic links and refresh rotation — inside the same workspace.</p>
              </div>
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate('/app/developers')} iconRight={<ArrowRight size={15} />}>
            Open developer settings
          </Button>
        </div>
        <div className="code-panel">
          <div className="code-panel__head">
            <div className="code-tabs">
              {[
                ['node', 'Node.js'],
                ['curl', 'cURL'],
                ['browser', 'Browser'],
              ].map(([key, label]) => (
                <button key={key} className={cx(tab === key && 'is-active')} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <CopyButton value={codeExamples[tab]} label="Copy" />
          </div>
          <pre className="code-panel__body">
            <code>{codeExamples[tab]}</code>
          </pre>
          <div className="code-panel__foot">
            <span>
              <span className="status-dot status-dot--ok" /> API operational
            </span>
            <span>v1 · REST + SDK</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatusSection() {
  return (
    <section className="section section--status" id="roadmap">
      <div className="container">
        <div className="status-head">
          <div>
            <div className="eyebrow">Honest by default</div>
            <h2>
              What exists.
              <br />
              What comes <span className="serif">next.</span>
            </h2>
          </div>
          <div className="status-head__copy">
            <p>
              Postique is self-hosted software. This is the boundary between what ships today, what is planned
              and what is deliberately left out. Your data, database and SMTP credentials stay on your server.
            </p>
            <div className="status-legend">
              <span>
                <i className="legend-dot legend-dot--lime" /> Included
              </span>
              <span>
                <i className="legend-dot legend-dot--blue" /> Planned
              </span>
              <span>
                <i className="legend-dot legend-dot--purple" /> Local automation
              </span>
            </div>
          </div>
        </div>

        <div className="status-table">
          {capabilities.map((group) => (
            <div className="status-group" key={group.group}>
              <div className="status-group__label">
                <Badge tone={group.tone}>{group.group}</Badge>
              </div>
              <div className="status-group__items">
                {group.items.map(([name, note]) => (
                  <div className="status-row" key={name}>
                    <strong>{name}</strong>
                    <span>{note}</span>
                    <span className="status-row__icon">
                      {group.tone === 'success' ? (
                        <Check size={13} />
                      ) : group.tone === 'neutral' ? (
                        <X size={12} />
                      ) : (
                        <Clock3 size={12} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="status-foot">
          <span>
            <ShieldCheck size={13} /> The product-status table is part of the product. We will keep it current.
          </span>
          <span>Last updated · 03 Nov 2026</span>
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  const [open, setOpen] = useState(0)
  return (
    <section className="section section--faq">
      <div className="container faq-grid">
        <div className="faq-copy">
          <div className="eyebrow">A few straight answers</div>
          <h2>
            The questions
            <br />
            worth asking.
          </h2>
          <p>If something matters to your architecture, it should be clear before you integrate it.</p>
          <button className="text-link" onClick={() => navigate('/app')}>
            Open your workspace <ArrowRight size={14} />
          </button>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div key={faq.q} className={cx('faq-item', open === index && 'is-open')}>
              <button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}>
                <span>{faq.q}</span>
                <ChevronDown size={17} />
              </button>
              {open === index && <p>{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="final-cta">
      <div className="container">
        <div className="final-cta__card">
          <div className="final-cta__noise" aria-hidden="true" />
          <div className="final-cta__copy">
            <span className="final-cta__eyebrow">Postique · email infrastructure for applications</span>
            <h2>
              Give your application
              <br />
              a <span className="serif">voice.</span>
            </h2>
            <p>
              Design it. Send it. Receive it. Manage it. Automate it.
              <br />
              All through one platform.
            </p>
            <div className="final-cta__actions">
              <Button variant="lime" size="lg" onClick={() => navigate('/app')} iconRight={<ArrowRight size={16} />}>
                Open your workspace
              </Button>
              <button className="final-cta__link" onClick={() => navigate('/app/developers')}>
                Read the API surface <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="final-cta__mark" aria-hidden="true">
            <LogoMark size={132} />
            <span>P</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const scrollTo = useScrollTo()
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Logo />
            <p>
              Email infrastructure for applications.
              <br />
              Designed and built in Nairobi.
            </p>
            <span className="site-footer__status">
              <span className="status-dot status-dot--ok" /> All systems operational
            </span>
          </div>
          <div className="site-footer__links">
            <div>
              <span>Product</span>
              <button onClick={() => scrollTo('product')}>Template Studio</button>
              <button onClick={() => scrollTo('how-it-works')}>Inbox</button>
              <button onClick={() => navigate('/app/embed')}>Embeddable inbox</button>
              <button onClick={() => navigate('/app/automations')}>Automation</button>
            </div>
            <div>
              <span>Developers</span>
              <button onClick={() => navigate('/app/developers')}>API reference</button>
              <button onClick={() => navigate('/app/developers')}>Browser SDK</button>
              <button onClick={() => navigate('/app/domains')}>Sending domains</button>
              <button onClick={() => scrollTo('roadmap')}>Roadmap</button>
            </div>
            <div>
              <span>Company</span>
              <a href="https://postique.fyi" target="_blank" rel="noreferrer">
                postique.fyi
              </a>
              <a href="mailto:hello@postique.fyi">hello@postique.fyi</a>
              <span className="site-footer__soon">Privacy · Terms — coming with launch</span>
            </div>
          </div>
        </div>
        <div className="site-footer__bottom">
          <span>© 2026 Postique. An Annan Digital Labs product.</span>
          <span>
            Self-hosted software. Your database, SMTP credentials and message data stay on your server.
          </span>
        </div>
      </div>
    </footer>
  )
}

export default function Marketing() {
  useEffect(() => {
    document.body.classList.add('marketing-body')
    return () => document.body.classList.remove('marketing-body')
  }, [])

  return (
    <div className="marketing">
      <MarketingNav />
      <main>
        <Hero />
        <LoopSection />
        <ModesSection />
        <AutomationSection />
        <DevelopersSection />
        <StatusSection />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
