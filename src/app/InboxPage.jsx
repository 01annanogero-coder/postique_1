import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  CornerUpLeft,
  Inbox,
  Link2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PanelRight,
  Plus,
  Reply,
  Search,
  Send,
  ShieldAlert,
  Star,
  Tag,
  UserRound,
  X,
} from 'lucide-react'
import { Avatar, Badge, Button, CopyButton, Modal, Toggle } from '../components/ui'
import { cx, firstName, navigate } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { EmptyState } from './shared'

const filters = [
  { id: 'all', label: 'All mail' },
  { id: 'open', label: 'Open' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'review', label: 'Needs review' },
]

function labelTone(name) {
  return `label-${name.toLowerCase().replace(/\s+/g, '-')}`
}

function LabelChip({ name }) {
  return <span className={cx('label-chip', labelTone(name))}>{name}</span>
}

function ThreadRow({ thread, active, onClick }) {
  return (
    <button className={cx('thread-row', active && 'is-active', thread.unread && 'is-unread')} onClick={onClick}>
      <div className="thread-row__top">
        <Avatar
          name={thread.customer.name}
          initials={thread.customer.initials}
          color={thread.customer.color}
          size={30}
        />
        <strong>{thread.customer.name}</strong>
        <time>{thread.lastActivity}</time>
      </div>
      <div className="thread-row__subject">{thread.subject}</div>
      <div className="thread-row__snippet">{thread.snippet}</div>
      <div className="thread-row__foot">
        <div className="thread-row__labels">
          {thread.labels.slice(0, 2).map((label) => (
            <LabelChip key={label} name={label} />
          ))}
        </div>
        <div className="thread-row__marks">
          {thread.matched === false && <ShieldAlert size={11} />}
          {thread.starred && <Star size={11} fill="currentColor" />}
          {thread.unread && <span className="thread-row__dot" />}
        </div>
      </div>
    </button>
  )
}

function EmailMessage({ message, customer, onReply }) {
  const outbound = message.direction === 'out'
  return (
    <article className={cx('email-message', outbound ? 'email-message--out' : 'email-message--in')}>
      <div className="email-message__head">
        <Avatar
          name={outbound ? 'Acme Commerce' : customer.name}
          initials={outbound ? 'AC' : customer.initials}
          color={outbound ? '#26352A' : customer.color}
          size={34}
        />
        <div className="email-message__from">
          <div>
            <strong>{outbound ? 'Acme Commerce' : message.author}</strong>
            <span>&lt;{message.email}&gt;</span>
          </div>
          <div className="email-message__to">
            to {outbound ? customer.email : 'orders@acme.co.ke'}
          </div>
        </div>
        <div className="email-message__meta">
          <time>{message.date}</time>
          {outbound ? (
            <span className={cx('email-status', ['queued', 'failed', 'bounced'].includes(message.status) && 'email-status--queued')}>
              {message.status === 'queued' ? <Clock3 size={11} /> : ['failed', 'bounced', 'complained'].includes(message.status) ? <ShieldAlert size={11} /> : <CheckCheck size={12} />}
              {message.status === 'sent' ? 'Sent' : message.status === 'queued' ? 'Queued' : message.status === 'failed' ? 'Failed' : message.status === 'bounced' ? 'Bounced' : message.status === 'complained' ? 'Complained' : message.status}
            </span>
          ) : (
            <Badge tone="neutral">via email</Badge>
          )}
        </div>
      </div>
      <div className="email-message__body">{message.body}</div>
      {message.attachments?.length > 0 && (
        <div className="email-attachments">
          {message.attachments.map((file) => (
            <span key={file.name} className="email-attachment">
              <Paperclip size={12} />
              <span>{file.name}</span>
              <small>{file.size}</small>
            </span>
          ))}
        </div>
      )}
      <div className="email-message__foot">
        {outbound ? (
          <>
            {message.template && (
              <span>
                <Mail size={11} /> Sent with “{message.template}”
              </span>
            )}
            <span>
              <Reply size={11} /> Reply-To {customer.email ? 'set' : 'thread address'}
            </span>
          </>
        ) : (
          <button onClick={onReply}>
            <CornerUpLeft size={12} /> Reply
          </button>
        )}
      </div>
    </article>
  )
}

function DetailsPanel({ thread, onClose }) {
  const { setThreadLabels, labels } = useStore()
  const toggleLabel = (label) => {
    const exists = thread.labels.includes(label)
    setThreadLabels(thread.id, exists ? thread.labels.filter((item) => item !== label) : [...thread.labels, label])
  }

  return (
    <aside className="thread-details">
      <div className="thread-details__head">
        <strong>Conversation details</strong>
        <button onClick={onClose} aria-label="Close details">
          <X size={15} />
        </button>
      </div>
      <div className="thread-details__contact">
        <Avatar
          name={thread.customer.name}
          initials={thread.customer.initials}
          color={thread.customer.color}
          size={44}
        />
        <strong>{thread.customer.name}</strong>
        <span>{thread.customer.email}</span>
        <small>{thread.customer.company}</small>
      </div>
      <div className="thread-details__section">
        <span className="thread-details__label">Reply address</span>
        <div className="thread-details__code">
          <code>{thread.replyAddress || 'Unmatched'}</code>
          {thread.replyAddress && <CopyButton value={thread.replyAddress} compact />}
        </div>
        <p>The token routes replies back to this thread even if headers are lost.</p>
      </div>
      <div className="thread-details__section">
        <span className="thread-details__label">Labels</span>
        <div className="thread-details__labels">
          {labels.map((label) => (
            <button
              key={label.id}
              className={cx('label-toggle', thread.labels.includes(label.name) && 'is-on')}
              onClick={() => toggleLabel(label.name)}
            >
              <span style={{ background: label.color }} />
              {label.name}
              {thread.labels.includes(label.name) && <Check size={11} />}
            </button>
          ))}
        </div>
      </div>
      <div className="thread-details__section">
        <span className="thread-details__label">Assignment</span>
        <button className="detail-assignee">
          <Avatar name={thread.assigned} initials={thread.assigned === 'Unassigned' ? '—' : 'AO'} size={24} />
          <span>{thread.assigned}</span>
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="thread-details__meta">
        <div>
          <span>Created</span>
          <strong>{thread.createdAt}</strong>
        </div>
        <div>
          <span>Order</span>
          <strong>{thread.order || '—'}</strong>
        </div>
        <div>
          <span>Messages</span>
          <strong>{thread.messages.length}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong className="capitalize">{thread.status}</strong>
        </div>
      </div>
    </aside>
  )
}

function TemplatePicker({ thread, onPick, onClose }) {
  const { templates } = useStore()
  return (
    <div className="template-picker">
      <div className="template-picker__head">
        <div>
          <strong>Reply with a template</strong>
          <span>Variables are filled from the conversation.</span>
        </div>
        <button onClick={onClose} aria-label="Close template picker">
          <X size={14} />
        </button>
      </div>
      <div className="template-picker__list">
        {templates
          .filter((template) => template.status === 'published')
          .map((template) => (
            <button key={template.id} onClick={() => onPick(template)}>
              <span className="template-picker__icon">
                <Mail size={14} />
              </span>
              <span>
                <strong>{template.name}</strong>
                <small>{template.subject}</small>
              </span>
              <ArrowRight size={13} />
            </button>
          ))}
      </div>
      <div className="template-picker__foot">
        <ShieldAlert size={12} /> Sends inside this thread · headers preserved
      </div>
    </div>
  )
}

function LinkModal({ open, onClose, thread }) {
  const { threads, linkThread } = useStore()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const candidates = threads.filter(
    (item) => item.id !== thread?.id && item.subject.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link this reply"
      eyebrow="Manual matching"
      description="This message could not be matched by headers, reply address or subject. Attach it to an existing conversation."
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="modal-search">
        <Search size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations…" />
      </div>
      <div className="link-list">
        {candidates.length === 0 && <div className="section-empty section-empty--compact">No other conversations found.</div>}
        {candidates.slice(0, 5).map((item) => (
          <button
            key={item.id}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const result = await linkThread(thread.id, item.id)
              setBusy(false)
              if (result) onClose()
            }}
          >
            <Avatar name={item.customer.name} initials={item.customer.initials} color={item.customer.color} size={28} />
            <span>
              <strong>{item.subject}</strong>
              <small>{item.customer.name}</small>
            </span>
            <Link2 size={13} />
          </button>
        ))}
      </div>
    </Modal>
  )
}

export default function InboxPage({ query }) {
  const {
    threads,
    templates,
    sendReply,
    markRead,
    toggleThreadStatus,
    toggleStar,
    toast,
    workspace,
    labels,
    config,
  } = useStore()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [usedTemplate, setUsedTemplate] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [mobileThread, setMobileThread] = useState(false)
  const messagesEnd = useRef(null)
  const fileInput = useRef(null)

  const requestedId = new URLSearchParams(query).get('thread')
  const [selectedId, setSelectedId] = useState(requestedId || threads[0]?.id)

  useEffect(() => {
    if (requestedId) {
      setSelectedId(requestedId)
      setMobileThread(true)
    }
  }, [requestedId])

  const selected = threads.find((thread) => thread.id === selectedId) || threads[0]

  useEffect(() => {
    if (selected) markRead(selected.id)
  }, [selected?.id])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [selected?.messages.length])

  const filtered = useMemo(() => {
    let list = [...threads]
    if (filter === 'open') list = list.filter((thread) => thread.status === 'open')
    if (filter === 'unread') list = list.filter((thread) => thread.unread)
    if (filter === 'starred') list = list.filter((thread) => thread.starred)
    if (filter === 'review') list = list.filter((thread) => thread.matched === false || thread.labels.includes('Needs review'))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (thread) =>
          thread.subject.toLowerCase().includes(q) ||
          thread.customer.name.toLowerCase().includes(q) ||
          thread.customer.email.toLowerCase().includes(q) ||
          thread.snippet.toLowerCase().includes(q),
      )
    }
    return list
  }, [threads, filter, search])

  const selectThread = (id) => {
    setSelectedId(id)
    markRead(id)
    setReply('')
    setUsedTemplate(null)
    setAttachments([])
    setMobileThread(true)
  }

  const templateBody = (template) => {
    if (!selected) return ''
    const name = firstName(selected.customer.name)
    if (template.slug === 'order-confirmation') {
      return `Hi ${name},\n\nThanks for reaching out about your order. I've checked with our fulfilment team and will come back to you with a confirmed update shortly.\n\nIf there's anything else I can help with in the meantime, just reply here.\n\nWarmly,\nAnnan\nAcme Commerce`
    }
    return `Hi ${name},\n\nThanks for your message — I'm looking into this now and will get back to you shortly.\n\nWarmly,\nAnnan\nAcme Commerce`
  }

  const pickTemplate = (template) => {
    setReply(templateBody(template))
    setUsedTemplate(template)
    setTemplateOpen(false)
    toast('Template inserted', 'success', 'Variables filled for this conversation')
  }

  const submit = () => {
    if (!selected?.matched || !selected?.customer?.email) {
      toast('Link this conversation first', 'error')
      return
    }
    if (!reply.trim()) {
      toast('Write a reply first', 'error')
      return
    }
    sendReply(selected.id, reply)
    setReply('')
    setUsedTemplate(null)
    setAttachments([])
  }

  const handleFiles = (event) => {
    const files = Array.from(event.target.files || [])
    setAttachments((current) => [...current, ...files.map((file) => file.name)])
    event.target.value = ''
  }

  return (
    <div className="inbox-page">
      <div className="inbox-top">
        <div className="inbox-top__title">
          <h1>Inbox</h1>
          <Badge tone="success" dot>
            live routing
          </Badge>
        </div>
        <div className="inbox-top__search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations…" />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="inbox-top__actions">
          <button className="inbox-action" onClick={() => setLinkOpen(true)} title="Link an unmatched reply">
            <Link2 size={15} />
          </button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFilter('all')
              setSearch('')
              toast('Inbox refreshed', 'success')
            }}
            icon={<MailOpen size={14} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="inbox-grid">
        <aside className="inbox-rail">
          <nav className="inbox-rail__nav">
            {filters.map((item) => {
              const count =
                item.id === 'unread'
                  ? threads.filter((thread) => thread.unread).length
                  : item.id === 'open'
                    ? threads.filter((thread) => thread.status === 'open').length
                    : item.id === 'review'
                      ? threads.filter((thread) => thread.matched === false).length
                      : null
              return (
                <button
                  key={item.id}
                  className={cx('inbox-rail__item', filter === item.id && 'is-active')}
                  onClick={() => setFilter(item.id)}
                >
                  {item.id === 'all' ? (
                    <Inbox size={15} />
                  ) : item.id === 'unread' ? (
                    <Mail size={15} />
                  ) : item.id === 'starred' ? (
                    <Star size={15} />
                  ) : item.id === 'review' ? (
                    <ShieldAlert size={15} />
                  ) : (
                    <MailOpen size={15} />
                  )}
                  <span>{item.label}</span>
                  {count > 0 && <span className="inbox-rail__count">{count}</span>}
                </button>
              )
            })}
          </nav>

          <div className="inbox-rail__section">
            <div className="inbox-rail__section-head">
              <span>Labels</span>
              <button aria-label="Add label">
                <Plus size={12} />
              </button>
            </div>
            {labels.map((label) => {
              const count = threads.filter((thread) => thread.labels.includes(label.name)).length
              return (
                <button
                  key={label.id}
                  className="inbox-rail__label"
                  onClick={() => {
                    setFilter('all')
                    setSearch('')
                    toast(`Filtered by ${label.name}`, 'success')
                  }}
                >
                  <i style={{ background: label.color }} />
                  <span>{label.name}</span>
                  <small>{count}</small>
                </button>
              )
            })}
          </div>

          <div className="inbox-rail__address">
            <span>{selected?.replyAddress ? 'Thread reply address' : 'Inbound domain'}</span>
            <code>{selected?.replyAddress || workspace.replyDomain}</code>
            <div>
              <Badge tone="success">{config.inboundEnabled ? 'Active' : 'Disabled'}</Badge>
              <CopyButton value={selected?.replyAddress || workspace.replyDomain} compact />
            </div>
          </div>
        </aside>

        <section className={cx('inbox-list', mobileThread && 'is-hidden-mobile')}>
          <div className="inbox-list__head">
            <div>
              <strong>{filters.find((item) => item.id === filter)?.label}</strong>
              <span>{filtered.length} conversations</span>
            </div>
            <button className="icon-button" aria-label="List options">
              <MoreHorizontal size={16} />
            </button>
          </div>
          <div className="inbox-list__scroll">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Inbox size={20} />}
                title="Nothing here"
                description="No conversations match this filter."
              />
            ) : (
              filtered.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === selected?.id}
                  onClick={() => selectThread(thread.id)}
                />
              ))
            )}
          </div>
        </section>

        <section className={cx('inbox-thread', !mobileThread && 'is-hidden-mobile')}>
          {selected ? (
            <>
              <header className="inbox-thread__head">
                <button className="inbox-thread__back" onClick={() => setMobileThread(false)} aria-label="Back to list">
                  <ArrowLeft size={17} />
                </button>
                <div className="inbox-thread__subject">
                  <span className="mini-kicker">CONVERSATION · {selected.messages.length} MESSAGES</span>
                  <h2>{selected.subject}</h2>
                  <div className="inbox-thread__meta">
                    <Badge tone={selected.status === 'open' ? 'success' : 'neutral'} dot>
                      {selected.status === 'open' ? 'Open' : 'Closed'}
                    </Badge>
                    {selected.labels.map((label) => (
                      <LabelChip key={label} name={label} />
                    ))}
                    {selected.order && <span className="inbox-thread__order">Order {selected.order}</span>}
                  </div>
                </div>
                <div className="inbox-thread__actions">
                  <button
                    className={cx('icon-button', selected.starred && 'is-starred')}
                    onClick={() => toggleStar(selected.id)}
                    title={selected.starred ? 'Unstar' : 'Star'}
                  >
                    <Star size={16} fill={selected.starred ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => toggleThreadStatus(selected.id)}
                    title={selected.status === 'open' ? 'Close conversation' : 'Reopen conversation'}
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className={cx('icon-button', detailsOpen && 'is-active')}
                    onClick={() => setDetailsOpen(!detailsOpen)}
                    title="Conversation details"
                  >
                    <PanelRight size={16} />
                  </button>
                  <button className="icon-button" title="More actions">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </header>

              <div className="inbox-thread__body">
                <div className="inbox-thread__messages">
                  <div className="thread-contact-strip">
                    <Avatar
                      name={selected.customer.name}
                      initials={selected.customer.initials}
                      color={selected.customer.color}
                      size={30}
                    />
                    <div>
                      <strong>{selected.customer.name}</strong>
                      <span>{selected.customer.email}</span>
                    </div>
                    <div className="thread-contact-strip__tags">
                      <span>
                        <Clock3 size={11} /> {selected.lastActivity}
                      </span>
                      <span>
                        <UserRound size={11} /> {selected.assigned}
                      </span>
                    </div>
                    <CopyButton value={selected.customer.email} compact />
                  </div>

                  {selected.matched === false && (
                    <div className="unmatched-banner">
                      <span className="unmatched-banner__icon">
                        <ShieldAlert size={16} />
                      </span>
                      <div>
                        <strong>This reply couldn’t be matched automatically</strong>
                        <p>
                          It is safely stored. Link it to a conversation so it stays in the right thread and
                          future replies route correctly.
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setLinkOpen(true)}>
                        Link conversation
                      </Button>
                    </div>
                  )}

                  {selected.messages.map((message) => (
                    <EmailMessage
                      key={message.id}
                      message={message}
                      customer={selected.customer}
                      onReply={() => {
                        setReply(`Hi ${firstName(selected.customer.name)},\n\n`)
                        document.getElementById('reply-composer')?.focus()
                      }}
                    />
                  ))}
                  <div ref={messagesEnd} />
                </div>

                {detailsOpen && <DetailsPanel thread={selected} onClose={() => setDetailsOpen(false)} />}
              </div>

              <div className="reply-composer">
                {(!selected.matched || !selected.customer?.email) && (
                  <div className="reply-composer__warning">
                    <ShieldAlert size={13} /> Link this conversation to a known customer before replying.
                  </div>
                )}
                <div className="reply-composer__head">
                  <span>
                    <Reply size={13} /> Reply to {selected.customer.name}
                  </span>
                  <div className="reply-composer__tools">
                    {templateOpen && (
                      <TemplatePicker
                        thread={selected}
                        onPick={pickTemplate}
                        onClose={() => setTemplateOpen(false)}
                      />
                    )}
                    <button className={cx('composer-tool', usedTemplate && 'is-active')} onClick={() => setTemplateOpen(!templateOpen)}>
                      <Mail size={13} /> Template
                      {usedTemplate && <span className="composer-tool__tag">{usedTemplate.name}</span>}
                    </button>
                    <button className="composer-tool" onClick={() => fileInput.current?.click()}>
                      <Paperclip size={13} /> Attach
                    </button>
                    <input ref={fileInput} type="file" multiple hidden onChange={handleFiles} />
                  </div>
                </div>
                <textarea
                  id="reply-composer"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={`Write a reply to ${firstName(selected.customer.name)}…`}
                  rows={4}
                />
                {attachments.length > 0 && (
                  <div className="composer-attachments">
                    {attachments.map((file) => (
                      <span key={file}>
                        <Paperclip size={11} /> {file}
                        <button onClick={() => setAttachments((current) => current.filter((item) => item !== file))}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="reply-composer__foot">
                  <div className="reply-composer__hint">
                    <ShieldAlert size={12} />
                    <span>
                      Replying to <code>{selected.replyAddress || 'unmatched address'}</code> · In-Reply-To set
                    </span>
                  </div>
                  <div className="reply-composer__send">
                    <button className="composer-secondary" onClick={() => toast('Reply saved as draft', 'success')}>
                      Save draft
                    </button>
                    <Button onClick={submit} disabled={!selected.matched || !selected.customer?.email} icon={<Send size={14} />}>
                      Send reply
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={<Inbox size={22} />} title="Select a conversation" description="Choose a thread to read and reply." />
          )}
        </section>
      </div>

      <LinkModal open={linkOpen} onClose={() => setLinkOpen(false)} thread={selected} />
    </div>
  )
}
