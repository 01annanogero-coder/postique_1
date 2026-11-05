import fs from 'node:fs/promises'
import path from 'node:path'
import { SMTPServer } from 'smtp-server'
import { simpleParser } from 'mailparser'
import sanitizeHtml from 'sanitize-html'
import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { makeId, normaliseEmail, safeFilename } from './crypto.js'
import { escapeHtml } from './format.js'
import { logger } from './logger.js'
import { htmlToText } from './templates.js'
import { analyseFaqs } from './automation.js'
import { createThread, automationSettings, addThreadParticipant } from './workspace.js'
import { createOutboundMessage } from './messages.js'
import { notifyOwner } from './notify.js'
import { enqueueWebhookEvent } from './webhooks.js'

let smtpServer = null

function addressOf(value) {
  const source = value?.value ? value.value : value
  const first = Array.isArray(source) ? source[0] : source
  if (!first) return { name: '', email: '' }
  return {
    name: String(first.name || '').trim(),
    email: normaliseEmail(first.address || first.email || ''),
  }
}

function recipientList(parsed, envelope) {
  const envelopeRecipients = (envelope?.rcptTo || []).map((item) => normaliseEmail(item.address))
  if (envelopeRecipients.length) return [...new Set(envelopeRecipients)]
  const to = parsed.to?.value || []
  return [...new Set(to.map((item) => normaliseEmail(item.address)).filter(Boolean))]
}

function stripAngles(value) {
  return String(value || '')
    .trim()
    .replace(/^<|>$/g, '')
}

function safeHtml(html) {
  if (!html) return ''
  return sanitizeHtml(String(html), {
    allowedTags: [
      'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'img',
      'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'data-blocked-src'],
      '*': ['style', 'class'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'cid', 'data'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
      img: (tagName, attribs) => {
        const source = attribs.src || ''
        if (/^https?:/i.test(source)) {
          return {
            tagName,
            attribs: {
              ...attribs,
              src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
              'data-blocked-src': source,
              alt: attribs.alt || 'Remote image blocked',
            },
          }
        }
        return { tagName, attribs }
      },
    },
  })
}

function textToHtml(text, subject = '') {
  const paragraphs = String(text || '')
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#20251f;line-height:1.6;font-size:15px">${
    subject ? `<h2 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h2>` : ''
  }${paragraphs || '<p></p>'}</div>`
}

function findThread({ recipients, parsed, from, workspaceId }) {
  const db = getDb()
  const messageIds = [parsed.inReplyTo, ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])]
    .filter(Boolean)
    .map((value) => String(value).trim())
  const references = messageIds.flatMap((value) => [value, `<${stripAngles(value)}>`])
  if (references.length) {
    const placeholders = references.map(() => '?').join(',')
    const match = db
      .prepare(
        `SELECT t.* FROM threads t
         JOIN messages m ON m.thread_id = t.id
         WHERE m.message_id IN (${placeholders})
         ORDER BY m.created_at DESC LIMIT 1`,
      )
      .get(...references)
    if (match) return { thread: match, method: 'headers', workspaceId: match.workspace_id }
  }

  for (const recipient of recipients) {
    const match = recipient.match(/^t_([a-z0-9]+)@/i)
    if (!match) continue
    const thread = db.prepare('SELECT * FROM threads WHERE reply_token = ? COLLATE NOCASE').get(match[1])
    if (thread) return { thread, method: 'reply_address', workspaceId: thread.workspace_id }
  }

  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const normalizedSubject = String(parsed.subject || '').replace(/^(\s*re\s*:\s*)+/i, '').trim()
  if (from.email) {
    const candidate = db
      .prepare(
        `SELECT * FROM threads
         WHERE workspace_id = ? AND customer_email = ? COLLATE NOCASE
           AND lower(trim(subject)) = lower(trim(?))
           AND last_activity_at >= ?
         ORDER BY last_activity_at DESC LIMIT 1`,
      )
      .get(workspaceId, from.email, normalizedSubject, threshold)
    if (candidate) return { thread: candidate, method: 'subject', workspaceId: candidate.workspace_id }
  }
  return { thread: null, method: 'none', workspaceId }
}

function recordBounce({ parsed, originalId, failedRecipient, workspaceId }) {
  const db = getDb()
  let original = null
  if (originalId) {
    original = db
      .prepare('SELECT * FROM messages WHERE (id = ? OR message_id = ?) AND workspace_id = ?')
      .get(originalId, originalId, workspaceId)
  }
  if (!original && failedRecipient) {
    original = db
      .prepare(
        `SELECT * FROM messages
         WHERE workspace_id = ? AND direction = 'out' AND to_json LIKE ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(workspaceId, `%${failedRecipient}%`)
  }
  if (!original) {
    logger.warn({ originalId, failedRecipient }, 'Received a delivery failure that could not be matched')
    return false
  }
  db.prepare("UPDATE messages SET status = 'bounced', error = ? WHERE id = ?").run(
    `Delivery failed${failedRecipient ? ` for ${failedRecipient}` : ''}`,
    original.id,
  )
  db.prepare('INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)').run(
    makeId('evt', 6),
    original.id,
    'bounced',
    JSON.stringify({ detail: parsed.text?.slice(0, 500) || 'Delivery status notification received', failedRecipient }),
    nowIso(),
  )
  if (failedRecipient) {
    db.prepare(
      `INSERT INTO suppressions (workspace_id, email, reason, created_at)
       VALUES (?, ?, 'bounce', ?)
       ON CONFLICT(workspace_id, email) DO NOTHING`,
    ).run(workspaceId, normaliseEmail(failedRecipient), nowIso())
  }
  enqueueWebhookEvent(workspaceId, 'message.bounced', {
    message: { id: original.id, threadId: original.thread_id, status: 'bounced', recipient: failedRecipient },
  })
  notifyOwner(workspaceId, {
    subject: `Delivery failed${failedRecipient ? ` for ${failedRecipient}` : ''}`,
    text: `A delivery status notification was received.\n\nMessage: ${original.subject}\nRecipient: ${failedRecipient || 'unknown'}\n\n${parsed.text?.slice(0, 1000) || ''}`,
    preference: 'notifyBounces',
  })
  return true
}

function recordComplaint({ parsed, workspaceId }) {
  const db = getDb()
  const text = `${parsed.text || ''}\n${parsed.html || ''}`
  const match = text.match(/(?:Original-Rcpt-To|Final-Recipient):\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/i)
  const recipient = normaliseEmail(match?.[1] || addressOf(parsed.from).email)
  const original = recipient
    ? db
        .prepare(
          `SELECT * FROM messages WHERE workspace_id = ? AND direction = 'out' AND to_json LIKE ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(workspaceId, `%${recipient}%`)
    : null
  if (original) {
    db.prepare("UPDATE messages SET status = 'complained' WHERE id = ?").run(original.id)
    db.prepare('INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)').run(
      makeId('evt', 6),
      original.id,
      'complained',
      JSON.stringify({ detail: 'Recipient filed an abuse complaint.' }),
      nowIso(),
    )
  }
  if (recipient) {
    db.prepare(
      `INSERT INTO suppressions (workspace_id, email, reason, created_at)
       VALUES (?, ?, 'complaint', ?)
       ON CONFLICT(workspace_id, email) DO NOTHING`,
    ).run(workspaceId, recipient, nowIso())
  }
  enqueueWebhookEvent(workspaceId, 'message.complained', {
    message: original ? { id: original.id, threadId: original.thread_id, status: 'complained' } : null,
    recipient,
  })
  notifyOwner(workspaceId, {
    subject: `Complaint received${recipient ? ` from ${recipient}` : ''}`,
    text: `A recipient marked a message as spam.\n\nThe address has been added to the workspace suppression list.\n\nRecipient: ${recipient || 'unknown'}`,
    preference: 'notifyBounces',
  })
  return Boolean(original)
}

async function saveAttachments(parsed, messageId) {
  const saved = []
  for (const [index, attachment] of (parsed.attachments || []).entries()) {
    if (!attachment.content) continue
    const folder = path.join(config.attachmentsDir, messageId)
    await fs.mkdir(folder, { recursive: true })
    const filename = safeFilename(attachment.filename || `attachment-${index + 1}`)
    const storagePath = path.join(folder, `${index}-${filename}`)
    await fs.writeFile(storagePath, attachment.content)
    saved.push({
      filename,
      contentType: attachment.contentType || 'application/octet-stream',
      bytes: attachment.size || attachment.content.length,
      storagePath,
      contentId: attachment.cid ? String(attachment.cid).replace(/^<|>$/g, '') : null,
    })
  }
  return saved
}

function identityForThread(db, workspaceId, threadId) {
  const last = db
    .prepare(
      `SELECT from_email FROM messages
       WHERE thread_id = ? AND direction = 'out' AND from_email != ''
       ORDER BY date DESC, created_at DESC LIMIT 1`,
    )
    .get(threadId)
  if (last?.from_email) {
    const matched = db
      .prepare('SELECT * FROM identities WHERE workspace_id = ? AND from_email = ? COLLATE NOCASE')
      .get(workspaceId, last.from_email)
    if (matched) return matched
  }
  return db.prepare('SELECT * FROM identities WHERE workspace_id = ? ORDER BY created_at LIMIT 1').get(workspaceId)
}

function maybeAutoReply({ workspaceId, thread, text, subject, parsed }) {
  if (!thread || thread.matched === 0) return
  const autoSubmitted = String(parsed.headers.get('auto-submitted') || '').toLowerCase()
  const autoReply = parsed.headers.get('x-autoreply') || parsed.headers.get('x-autorespond')
  if ((autoSubmitted && autoSubmitted !== 'no') || autoReply) return
  const settings = automationSettings(workspaceId)
  if (!settings.enabled || !settings.autoSend) return
  const db = getDb()
  const recentAuto = db
    .prepare(
      `SELECT COUNT(*) AS count FROM messages
       WHERE thread_id = ? AND author_type = 'automation' AND created_at >= ?`,
    )
    .get(thread.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).count
  if (recentAuto > 0) return
  const faqs = db.prepare('SELECT * FROM faqs WHERE workspace_id = ?').all(workspaceId).map((faq) => ({
    ...faq,
    triggers: parseJson(faq.triggers_json, []),
  }))
  if (!faqs.length) return
  const result = analyseFaqs(faqs, text, settings)
  if (result.review || !result.reply) return
  const identity = identityForThread(db, workspaceId, thread.id)
  if (!identity) return
  const html = textToHtml(result.reply, `Re: ${subject || thread.subject}`)
  const message = createOutboundMessage({
    workspaceId,
    threadId: thread.id,
    from: { name: identity.from_name, email: identity.from_email },
    to: [{ name: thread.customer_name, email: thread.customer_email }],
    subject: `Re: ${String(subject || thread.subject).replace(/^(\s*re\s*:\s*)+/i, '').trim()}`,
    html,
    text: result.reply,
    authorType: 'automation',
  })
  for (const match of result.matches) {
    db.prepare('UPDATE faqs SET usage_count = usage_count + 1 WHERE id = ?').run(match.faq.id)
  }
  db.prepare('INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)').run(
    makeId('evt', 6),
    message.id,
    'automation',
    JSON.stringify({
      detail: `Automation selected ${result.matches.map((match) => match.faq.title).join(', ')} at ${result.confidence}% confidence`,
    }),
    nowIso(),
  )
}

export async function processEmail(raw, envelope = {}) {
  const parsed = await simpleParser(raw)
  const from = addressOf(parsed.from)
  const recipients = recipientList(parsed, envelope)
  const db = getDb()
  const defaultWorkspace = db.prepare('SELECT * FROM workspaces ORDER BY created_at LIMIT 1').get()
  if (!defaultWorkspace) {
    throw new Error('No workspace is configured to receive email.')
  }
  let workspaceId = defaultWorkspace.id
  const found = findThread({ recipients, parsed, from, workspaceId })
  workspaceId = found.workspaceId || workspaceId
  let thread = found.thread
  const contentType = String(parsed.headers.get('content-type') || '')
  const isBounce =
    (/multipart\/report/i.test(contentType) && /delivery-status/i.test(contentType)) ||
    /delivery status notification|undelivered mail|mail delivery failed/i.test(parsed.subject || '')
  const isComplaint = /feedback-report/i.test(contentType) || /abuse report/i.test(parsed.subject || '')
  const originalId =
    parsed.headers.get('x-postique-message') ||
    parsed.headers.get('x-postique-message-id') ||
    (parsed.text || '').match(/X-Postique-Message:\s*<?([^>\s]+)>?/i)?.[1] ||
    null

  if (isBounce) {
    const text = `${parsed.text || ''}\n${parsed.html || ''}`
    const failed =
      text.match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i)?.[1] ||
      text.match(/Original-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i)?.[1] ||
      null
    recordBounce({ parsed, originalId: originalId ? stripAngles(originalId) : null, failedRecipient: failed, workspaceId })
  }
  if (isComplaint) {
    recordComplaint({ parsed, workspaceId })
  }

  if (!thread) {
    thread = createThread({
      workspaceId,
      subject: parsed.subject || 'No subject',
      customerName: from.name,
      customerEmail: from.email,
      matched: false,
      unread: true,
    })
  }
  const isNewThread = !found.thread

  const messageId = parsed.messageId ? String(parsed.messageId) : `<${Date.now()}.${makeId('in', 6)}@${config.inbound.domain}>`
  const duplicate = db.prepare('SELECT 1 FROM messages WHERE message_id = ? AND direction = ?').get(messageId, 'in')
  if (duplicate) {
    logger.info({ messageId }, 'Duplicate inbound message ignored')
    return { duplicate: true, threadId: thread.id }
  }

  const text = (parsed.text || htmlToText(parsed.html || '')).trim()
  const html = safeHtml(parsed.html) || textToHtml(text)
  const createdAt = (parsed.date || new Date()).toISOString()
  const id = makeId('msg')
  const references = [
    ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []),
  ].slice(-20)
  const to = (parsed.to?.value || recipients.map((email) => ({ address: email }))).map((item) => ({
    name: item.name || '',
    email: normaliseEmail(item.address || item.email),
  }))
  const cc = (parsed.cc?.value || []).map((item) => ({ name: item.name || '', email: normaliseEmail(item.address) }))
  db.prepare(
    `INSERT INTO messages
      (id, workspace_id, thread_id, direction, author_type, message_id, in_reply_to, references_json,
       from_email, from_name, to_json, cc_json, bcc_json, subject, html, text, status,
       headers_json, is_test, created_at, received_at)
     VALUES (?, ?, ?, 'in', 'human', ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, 'received', ?, 0, ?, ?)`,
  ).run(
    id,
    workspaceId,
    thread.id,
    messageId,
    parsed.inReplyTo || null,
    JSON.stringify(references),
    from.email,
    from.name,
    JSON.stringify(to),
    JSON.stringify(cc),
    parsed.subject || thread.subject || 'No subject',
    html,
    text,
    JSON.stringify(Object.fromEntries(parsed.headers)),
    createdAt,
    nowIso(),
  )
  const attachments = await saveAttachments(parsed, id)
  for (const attachment of attachments) {
    db.prepare(
      `INSERT INTO attachments (id, message_id, filename, content_type, bytes, storage_path, content_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      makeId('att', 6),
      id,
      attachment.filename,
      attachment.contentType,
      attachment.bytes,
      attachment.storagePath,
      attachment.contentId,
      nowIso(),
    )
  }

  const threadUpdates = {
    lastMessageAt: createdAt,
    unread: 1,
    status: 'open',
  }
  db.prepare(
    `UPDATE threads SET
      subject = CASE WHEN subject = '' THEN ? ELSE subject END,
      customer_name = CASE WHEN customer_name = '' THEN ? ELSE customer_name END,
      customer_email = CASE WHEN customer_email = '' THEN ? ELSE customer_email END,
      last_activity_at = ?, snippet = ?, unread = 1, status = 'open', matched = ?
     WHERE id = ?`,
  ).run(
    parsed.subject || 'No subject',
    from.name,
    from.email,
    nowIso(),
    text.replace(/\s+/g, ' ').slice(0, 180),
    isNewThread ? 0 : 1,
    thread.id,
  )
  addThreadParticipant(thread.id, from.email)
  db.prepare('INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)').run(
    makeId('evt', 6),
    id,
    'received',
    JSON.stringify({
      detail: `Matched by ${found.method === 'none' ? 'new conversation' : found.method}`,
      matchedBy: found.method,
    }),
    nowIso(),
  )
  const period = nowIso().slice(0, 7)
  db.prepare(
    `INSERT INTO usage_counters (workspace_id, period, sends, inbound, storage_bytes)
     VALUES (?, ?, 0, 1, 0)
     ON CONFLICT(workspace_id, period) DO UPDATE SET inbound = inbound + 1`,
  ).run(workspaceId, period)
  enqueueWebhookEvent(workspaceId, 'thread.reply_received', {
    thread: {
      id: thread.id,
      subject: parsed.subject || thread.subject,
      customer: { name: from.name, email: from.email },
    },
    message: { id, direction: 'in', text: text.slice(0, 500) },
  })
  notifyOwner(workspaceId, {
    subject: `New reply from ${from.name || from.email || 'a customer'}`,
    text: `${from.name || from.email} replied to “${parsed.subject || thread.subject}”.\n\n${text.slice(0, 1500)}\n\nOpen the inbox: ${config.appUrl}/#/app/inbox`,
    preference: 'notifyReplies',
  })
  if (!isBounce && !isComplaint) {
    maybeAutoReply({
      workspaceId,
      thread: db.prepare('SELECT * FROM threads WHERE id = ?').get(thread.id),
      text,
      subject: parsed.subject,
      parsed,
    })
  }
  logger.info({ threadId: thread.id, workspaceId, matchedBy: found.method }, 'Inbound email stored')
  return { threadId: thread.id, messageId: id, matchedBy: found.method, bounce: isBounce, complaint: isComplaint }
}

export function startInboundServer() {
  if (!config.inbound.enabled) {
    logger.info('Inbound SMTP server disabled by configuration')
    return null
  }
  const options = {
    name: config.inbound.domain,
    banner: `Postique inbound SMTP for ${config.inbound.domain}`,
    size: config.inbound.maxSize,
    authOptional: true,
    disabledCommands: ['AUTH'],
    hideSTARTTLS: !config.inbound.tlsKey || !config.inbound.tlsCert,
    onData(stream, session, callback) {
      processEmail(stream, session)
        .then((result) => {
          logger.info({ result }, 'Inbound SMTP message accepted')
          callback(null, '250 Message accepted for delivery')
        })
        .catch((error) => {
          logger.error({ error: error.message }, 'Inbound SMTP processing failed')
          callback(Object.assign(new Error('Message could not be processed'), { responseCode: 451 }))
        })
    },
    onError(error) {
      logger.warn({ error: error.message }, 'Inbound SMTP connection error')
    },
  }
  if (config.inbound.tlsKey && config.inbound.tlsCert) {
    options.key = config.inbound.tlsKey
    options.cert = config.inbound.tlsCert
  }
  smtpServer = new SMTPServer(options)
  smtpServer.listen(config.inbound.port, config.inbound.host, () => {
    logger.info(
      { host: config.inbound.host, port: config.inbound.port, domain: config.inbound.domain },
      'Inbound SMTP server listening',
    )
  })
  smtpServer.on('error', (error) => {
    logger.error({ error: error.message, code: error.code }, 'Inbound SMTP server error')
  })
  return smtpServer
}

export function stopInboundServer() {
  return new Promise((resolve) => {
    if (!smtpServer) return resolve()
    smtpServer.close(() => {
      smtpServer = null
      resolve()
    })
  })
}
