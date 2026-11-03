import fs from 'node:fs'
import path from 'node:path'
import nodemailer from 'nodemailer'
import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { decryptSecret, makeMessageId, normaliseEmail } from './crypto.js'
import { logger } from './logger.js'
import { htmlToText } from './templates.js'
import { enqueueWebhookEvent } from './webhooks.js'
import { formatMessageDate } from './presenters.js'
import { SendError } from './mail-errors.js'
import { sendViaAdapter } from './mail-adapter.js'
import { resolveMailRoute } from './mail-route.js'

export { SendError }

export function parseAddress(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const angle = raw.match(/^(?:"?([^"<]*?)"?\s*)?<([^>\s]+)>$/)
  if (angle) {
    return { name: (angle[1] || '').trim(), email: normaliseEmail(angle[2]) }
  }
  const simple = raw.match(/^([^\s@]+@[^\s@]+)$/)
  if (simple) return { name: '', email: normaliseEmail(simple[1]) }
  return { name: raw.replace(/<[^>]*>/g, '').trim(), email: normaliseEmail((raw.match(/[^\s<>,]+@[^\s<>,]+/) || [''])[0]) }
}

export function parseAddressList(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const output = []
  for (const entry of list) {
    if (entry && typeof entry === 'object' && entry.email) {
      const email = normaliseEmail(entry.email)
      if (email.includes('@')) output.push({ name: String(entry.name || '').trim(), email })
      continue
    }
    for (const part of String(entry).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const address = parseAddress(part)
      if (address?.email?.includes('@')) output.push(address)
    }
  }
  return output
}

export function formatAddress(address) {
  if (!address) return ''
  return address.name ? `"${address.name.replaceAll('"', '')}" <${address.email}>` : address.email
}

export function resolveSendingIdentity(workspaceId, requestedFrom) {
  const db = getDb()
  const requested =
    (requestedFrom && typeof requestedFrom === 'object'
      ? { name: requestedFrom.name || '', email: normaliseEmail(requestedFrom.email) }
      : parseAddress(requestedFrom)) ||
    (() => {
      const identity = db.prepare('SELECT * FROM identities WHERE workspace_id = ? ORDER BY created_at LIMIT 1').get(workspaceId)
      if (identity) return { name: identity.from_name, email: identity.from_email }
      const domain = db.prepare("SELECT * FROM domains WHERE workspace_id = ? AND status = 'verified' LIMIT 1").get(workspaceId)
      return domain ? { name: '', email: `noreply@${domain.name}` } : null
    })()

  if (!requested?.email?.includes('@')) {
    throw new SendError('A sender address is required. Add a verified domain first.', {
      retryable: false,
      code: 'sender_required',
    })
  }
  const domainName = requested.email.split('@')[1]
  const domain = db
    .prepare('SELECT * FROM domains WHERE workspace_id = ? AND name = ?')
    .get(workspaceId, domainName)
  if (!domain) {
    throw new SendError(`The sender domain ${domainName} is not configured in this workspace.`, {
      retryable: false,
      code: 'sender_domain_not_found',
    })
  }
  if (domain.status !== 'verified') {
    throw new SendError(`The sender domain ${domainName} is not verified yet.`, {
      retryable: false,
      code: 'sender_domain_unverified',
    })
  }
  const identity = db
    .prepare('SELECT * FROM identities WHERE workspace_id = ? AND from_email = ?')
    .get(workspaceId, requested.email)
  return {
    from: { email: requested.email, name: requested.name || identity?.from_name || '' },
    domain,
  }
}

export function makeTransport(dkim, route = {}) {
  if (route.configError) {
    throw new SendError(`The delivery route for this domain could not be loaded: ${route.configError}`, {
      retryable: false,
      code: 'route_config_invalid',
    })
  }
  if (route.transport === 'file') {
    return nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
      ...(dkim ? { dkim } : {}),
    })
  }
  if (route.transport === 'direct') {
    return nodemailer.createTransport({
      direct: true,
      port: config.mail.directPort,
      name: config.mail.heloName,
      ...(dkim ? { dkim } : {}),
    })
  }
  if (route.transport === 'http') {
    return {
      sendMail: async (mail) => {
        const rawTransport = nodemailer.createTransport({
          streamTransport: true,
          buffer: true,
          newline: 'unix',
          ...(dkim ? { dkim } : {}),
        })
        const output = await rawTransport.sendMail(mail)
        return sendViaAdapter({
          adapterUrl: route.adapterUrl,
          adapterToken: route.adapterToken,
          timeoutMs: route.adapterTimeoutMs,
          mail,
          raw: output.message,
          messageId: mail.messageId,
        })
      },
    }
  }
  const smtpUrl = route.smtpUrl || config.mail.smtpUrl
  if (!smtpUrl) {
    throw new SendError('MAIL_TRANSPORT=smtp requires SMTP_URL or a per-domain SMTP route.', {
      retryable: false,
      code: 'smtp_not_configured',
    })
  }
  return nodemailer.createTransport(smtpUrl, dkim ? { dkim } : {})
}

function messageAttachments(messageId) {
  const db = getDb()
  return db
    .prepare('SELECT * FROM attachments WHERE message_id = ?')
    .all(messageId)
    .filter((attachment) => fs.existsSync(attachment.storage_path))
    .map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.content_type,
      path: attachment.storage_path,
      cid: attachment.content_id || undefined,
    }))
}

export async function deliverMessage(messageId) {
  const db = getDb()
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
  if (!message) throw new SendError('Message not found.', { retryable: false })
  if (message.status === 'sent') return { alreadySent: true }
  const thread = message.thread_id ? db.prepare('SELECT * FROM threads WHERE id = ?').get(message.thread_id) : null
  const { from, domain } = resolveSendingIdentity(message.workspace_id, {
    name: message.from_name,
    email: message.from_email,
  })
  const to = parseJson(message.to_json, [])
  const cc = parseJson(message.cc_json, [])
  if (!to.length) throw new SendError('The message has no recipients.', { retryable: false, code: 'recipient_required' })

  const suppressed = db
    .prepare(`SELECT email FROM suppressions WHERE workspace_id = ? AND email IN (${to.map(() => '?').join(',')})`)
    .all(message.workspace_id, ...to.map((item) => normaliseEmail(item.email)))
  if (suppressed.length === to.length) {
    throw new SendError('All recipients are on the workspace suppression list.', {
      retryable: false,
      code: 'suppressed',
    })
  }

  const dkim = {
    domainName: domain.name,
    keySelector: domain.dkim_selector,
    privateKey: decryptSecret(domain.dkim_private_enc),
  }
  const route = resolveMailRoute(domain)
  const transport = makeTransport(dkim, route)
  const replyAddress = thread?.reply_token ? `t_${thread.reply_token}@${config.inbound.domain}` : undefined
  const html = message.html || `<p>${String(message.text || '').replaceAll('\n', '<br>')}</p>`
  const text = message.text || htmlToText(html)
  const headers = {
    'X-Postique-Thread': message.thread_id || '',
    'X-Postique-Message': message.id,
    'X-Postique-Workspace': message.workspace_id,
  }
  if (message.author_type === 'automation') headers['Auto-Submitted'] = 'auto-generated'
  const mail = {
    from: formatAddress(from),
    to: to.map(formatAddress),
    cc: cc.map(formatAddress),
    replyTo: replyAddress || from.email,
    subject: message.subject,
    html,
    text,
    messageId: message.message_id || makeMessageId(domain.name),
    inReplyTo: message.in_reply_to || undefined,
    references: parseJson(message.references_json, []),
    headers,
    attachments: messageAttachments(message.id),
  }

  let info
  try {
    info = await transport.sendMail(mail)
  } catch (error) {
    if (error instanceof SendError) throw error
    throw new SendError(error.message || 'SMTP transmission failed.', { retryable: true })
  }

  let storedPath = null
  if (route.transport === 'file') {
    const filename = `${message.id}.eml`
    storedPath = path.join(config.outboxDir, filename)
    fs.writeFileSync(storedPath, info.message)
  }

  const rejected = info.rejected || []
  const accepted = info.accepted || to.map((item) => item.email)
  if (accepted.length === 0) {
    throw new SendError(
      rejected.length
        ? `All recipients were rejected: ${rejected.join(', ')}`
        : 'The SMTP server accepted no recipients.',
      { retryable: true, code: 'recipients_rejected' },
    )
  }

  const sentAt = nowIso()
  db.prepare(
    `UPDATE messages SET status = 'sent', provider_id = ?, sent_at = ?, error = NULL, message_id = ? WHERE id = ?`,
  ).run(String(info.messageId || info.response || ''), sentAt, mail.messageId, message.id)
  db.prepare(
    'INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    `evt_${message.id}_sent`,
    message.id,
    'sent',
    JSON.stringify({
      detail:
        route.transport === 'file'
          ? `Written to local outbox${storedPath ? ` (${path.basename(storedPath)})` : ''}`
          : route.transport === 'http'
            ? 'Accepted by the HTTP mail adapter'
            : 'Accepted by SMTP transport',
      accepted,
      rejected,
    }),
    sentAt,
  )
  const period = sentAt.slice(0, 7)
  db.prepare(
    `INSERT INTO usage_counters (workspace_id, period, sends, inbound, storage_bytes)
     VALUES (?, ?, 1, 0, 0)
     ON CONFLICT(workspace_id, period) DO UPDATE SET sends = sends + 1`,
  ).run(message.workspace_id, period)
  enqueueWebhookEvent(message.workspace_id, 'message.sent', {
    message: { id: message.id, threadId: message.thread_id, status: 'sent', messageId: mail.messageId },
  })
  if (rejected.length) {
    db.prepare(
      'INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      `evt_${message.id}_bounce`,
      message.id,
      'bounced',
      JSON.stringify({ detail: `Rejected recipients: ${rejected.join(', ')}`, rejected }),
      nowIso(),
    )
  }
  logger.info(
    { messageId: message.id, transport: route.transport, source: route.source, accepted: accepted.length },
    'Message sent',
  )
  return { info, accepted, rejected, outboxFile: storedPath }
}

export function queueMessageEvent(messageId, type, detail, payload = {}) {
  const db = getDb()
  db.prepare('INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)').run(
    `evt_${messageId}_${type}_${Date.now()}`,
    messageId,
    type,
    JSON.stringify({ detail, ...payload }),
    nowIso(),
  )
}

export function threadReplyAddress(thread) {
  return thread?.reply_token ? `t_${thread.reply_token}@${config.inbound.domain}` : null
}

export function threadHeadersForReply(message, previousMessage) {
  const references = new Set(parseJson(previousMessage?.references_json, []))
  if (previousMessage?.message_id) references.add(previousMessage.message_id)
  return {
    inReplyTo: previousMessage?.message_id || message.in_reply_to || null,
    references: [...references].slice(-20),
  }
}

export function formatSenderForLog(thread) {
  return thread ? `${thread.subject} · ${formatMessageDate(thread.last_activity_at)}` : ''
}
