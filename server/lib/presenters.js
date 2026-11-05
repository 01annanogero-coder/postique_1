import { config } from '../config.js'
import { getDb, parseJson } from '../db/index.js'
import { formatBytes } from './format.js'

const AVATAR_COLORS = ['#D7E8C4', '#EBD8C5', '#D8DDF0', '#E7DFC2', '#CFE4E1', '#EAD6DD', '#D9DFCC', '#D6D9EA']

export function initials(name, email = '') {
  const source = String(name || email || '?').trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function colorForEmail(email = '') {
  let hash = 0
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) % 9973
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function relativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const diff = date.getTime() - Date.now()
  const minutes = Math.round(diff / 60_000)
  if (Math.abs(minutes) < 1) return 'now'
  if (Math.abs(minutes) < 60) return minutes < 0 ? `${Math.abs(minutes)}m` : `in ${minutes}m`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return hours < 0 ? `${Math.abs(hours)}h` : `in ${hours}h`
  const days = Math.round(hours / 24)
  if (days === -1) return 'Yesterday'
  if (Math.abs(days) < 7) return days < 0 ? `${Math.abs(days)}d` : `in ${days}d`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatMessageDate(value) {
  if (!value) return ''
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const time = date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}

export function formatDateTime(value) {
  if (!value) return null
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDay(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function statusLabel(status) {
  return (
    {
      queued: 'Queued',
      sent: 'Sent',
      failed: 'Failed',
      bounced: 'Bounced',
      complained: 'Complained',
      received: 'Received',
      delivered: 'Delivered',
    }[status] || status
  )
}

export function messageView(row) {
  return {
    id: row.id,
    direction: row.direction,
    author: row.from_name || (row.direction === 'out' ? 'Postique' : row.from_email),
    email: row.from_email,
    to: parseJson(row.to_json, []),
    cc: parseJson(row.cc_json, []),
    date: formatMessageDate(row.created_at),
    rawDate: row.created_at,
    subject: row.subject,
    body: row.text || '',
    html: row.html || '',
    status: row.status,
    template: row.template_name || null,
    attachments: row.attachments || [],
    messageId: row.message_id,
    error: row.error,
  }
}

function labelsForThread(threadId) {
  return getDb()
    .prepare(
      `SELECT l.id, l.name, l.color FROM labels l
       JOIN thread_labels tl ON tl.label_id = l.id
       WHERE tl.thread_id = ? ORDER BY l.name`,
    )
    .all(threadId)
}

function attachmentsForMessages(messageIds) {
  if (!messageIds.length) return new Map()
  const placeholders = messageIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at`)
    .all(...messageIds)
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.message_id)) map.set(row.message_id, [])
    map.get(row.message_id).push({
      id: row.id,
      name: row.filename,
      size: formatBytes(row.bytes),
      contentType: row.content_type,
      url: `/media/attachments/${row.id}`,
    })
  }
  return map
}

export function threadView(thread, options = {}) {
  const db = getDb()
  const messages = db
    .prepare(
      `SELECT m.*, t.name AS template_name
       FROM messages m
       LEFT JOIN template_versions tv ON tv.id = m.template_version_id
       LEFT JOIN templates t ON t.id = tv.template_id
       WHERE m.thread_id = ?
       ORDER BY m.created_at ASC`,
    )
    .all(thread.id)
  const attachments = attachmentsForMessages(messages.map((message) => message.id))
  const labels = labelsForThread(thread.id)
  const assigned = thread.assigned_user_id
    ? db.prepare('SELECT name FROM users WHERE id = ?').get(thread.assigned_user_id)?.name
    : null
  const lastMessage = messages[messages.length - 1]
  return {
    id: thread.id,
    subject: thread.subject,
    customer: {
      name: thread.customer_name || thread.customer_email,
      email: thread.customer_email,
      company: thread.customer_company || '',
      initials: initials(thread.customer_name, thread.customer_email),
      color: colorForEmail(thread.customer_email),
    },
    status: thread.status,
    unread: Boolean(thread.unread),
    starred: Boolean(thread.starred),
    matched: Boolean(thread.matched),
    labels: labels.map((label) => label.name),
    labelObjects: labels,
    lastActivity: relativeTime(thread.last_activity_at),
    lastActivityAt: thread.last_activity_at,
    snippet:
      thread.snippet ||
      (lastMessage?.text || '').replace(/\s+/g, ' ').slice(0, 110) ||
      'No messages yet',
    replyAddress: thread.reply_token ? `t_${thread.reply_token}@${config.inbound.domain}` : null,
    createdAt: formatDateTime(thread.created_at),
    assigned: assigned || 'Unassigned',
    order: thread.order_ref,
    externalUserId: thread.embed_user_id || null,
    messages: messages.map((message) =>
      messageView({ ...message, attachments: attachments.get(message.id) || [] }),
    ),
  }
}

export function domainView(domain) {
  const identities = getDb()
    .prepare('SELECT * FROM identities WHERE domain_id = ? ORDER BY created_at')
    .all(domain.id)
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    added: relativeTime(domain.created_at),
    verifiedAt: formatDateTime(domain.verified_at),
    provider: 'Postique SMTP · self-hosted',
    transport: domain.route_transport || 'inherit',
    routeConfigured: (domain.route_transport || 'inherit') !== 'inherit',
    dkimSelector: domain.dkim_selector,
    identities: identities.map((identity) => identity.from_email),
    identityRecords: identities,
    records: parseJson(domain.records_json, []),
  }
}

export function assetView(asset) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    dimensions: asset.dimensions || '—',
    size: formatBytes(asset.bytes),
    url: `${config.appUrl}${asset.url_path}`,
    preview: asset.url_path,
    uploaded: relativeTime(asset.created_at),
    public: Boolean(asset.public),
    mime: asset.mime,
    bytes: asset.bytes,
  }
}

export function keyView(key) {
  return {
    id: key.id,
    name: key.name,
    kind: key.kind,
    prefix: key.prefix,
    createdAt: formatDateTime(key.created_at),
    lastUsed: key.last_used_at ? relativeTime(key.last_used_at) : 'Never',
    status: key.revoked_at ? 'revoked' : 'active',
    scope: key.revoked_at
      ? 'Revoked'
      : key.kind === 'public'
        ? `${key.recipient_policy === 'verified' ? 'Verified visitors' : 'Fixed recipients'} · ${parseJson(key.allowed_templates_json, []).length || 'No'} templates`
        : 'Full API access',
    origins: parseJson(key.allowed_origins_json, []),
    allowedTemplates: parseJson(key.allowed_templates_json, []),
    allowedRecipients: parseJson(key.allowed_recipients_json, []),
    recipientPolicy: key.recipient_policy || 'fixed',
    verificationTemplate: key.verification_template || '',
    rateLimit: key.rate_limit,
  }
}

export function logView(message) {
  const db = getDb()
  const events = db
    .prepare('SELECT * FROM message_events WHERE message_id = ? ORDER BY at ASC')
    .all(message.id)
  const to = parseJson(message.to_json, [])
  const isOutbound = message.direction === 'out'
  return {
    id: message.id,
    direction: message.direction,
    to: isOutbound ? to[0]?.email || '' : message.from_email,
    toName: isOutbound ? to[0]?.name || to[0]?.email || '' : message.from_name || message.from_email,
    from: message.from_email,
    fromName: message.from_name,
    subject: message.subject,
    template: message.template_name || null,
    status: message.status,
    time: relativeTime(message.created_at),
    createdAt: message.created_at,
    provider: 'smtp',
    messageId: message.message_id || '',
    error: message.error,
    events:
      events.length > 0
        ? events.map((event) => ({
            label: statusLabel(event.type === 'reply_received' ? 'received' : event.type),
            time: new Date(event.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }),
            detail: parseJson(event.payload_json, {}).detail || '',
            tone: ['bounced', 'complained', 'failed'].includes(event.type) ? 'error' : undefined,
          }))
        : [
            {
              label: statusLabel(message.status),
              time: formatMessageDate(message.created_at),
              detail: message.error || 'Message ' + message.status,
            },
          ],
  }
}

export function webhookView(webhook) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: parseJson(webhook.events_json, []),
    status: webhook.status,
    createdAt: formatDateTime(webhook.created_at),
    lastDelivery: webhook.last_delivery_at ? relativeTime(webhook.last_delivery_at) : 'Never',
  }
}

export function faqView(faq) {
  return {
    id: faq.id,
    title: faq.title,
    answer: faq.answer,
    triggers: parseJson(faq.triggers_json, []),
    usage: faq.usage_count,
  }
}
