import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { makeId, makeMessageId, normaliseEmail } from './crypto.js'
import { enqueue } from './queue.js'
import { parseAddressList, threadReplyAddress } from './mailer.js'
import { touchThread } from './workspace.js'

function previousMessage(threadId) {
  return getDb()
    .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(threadId)
}

export function threadingForThread(threadId) {
  if (!threadId) return { inReplyTo: null, references: [] }
  const previous = previousMessage(threadId)
  if (!previous) return { inReplyTo: null, references: [] }
  const references = new Set(parseJson(previous.references_json, []))
  if (previous.message_id) references.add(previous.message_id)
  return {
    inReplyTo: previous.message_id || null,
    references: [...references].slice(-20),
  }
}

export function createOutboundMessage({
  workspaceId,
  threadId = null,
  from,
  to,
  cc = [],
  bcc = [],
  subject,
  html,
  text,
  templateVersionId = null,
  apiKeyId = null,
  authorType = 'human',
  isTest = false,
  attachments = [],
  campaignId = null,
  campaignRecipientId = null,
  verificationId = null,
  headers = {},
}) {
  const db = getDb()
  const thread = threadId ? db.prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?').get(threadId, workspaceId) : null
  if (threadId && !thread) throw new Error('Thread not found in this workspace.')
  const sender = typeof from === 'string' ? from : `${from?.name || ''} <${from?.email || ''}>`
  const fromAddress = parseAddressList(sender)[0]
  if (!fromAddress) throw new Error('A valid sender address is required.')
  const recipients = parseAddressList(to)
  if (!recipients.length) throw new Error('At least one recipient is required.')
  const domain = fromAddress.email.split('@')[1]
  const threading = threadingForThread(threadId)
  const messageId = makeMessageId(domain)
  const createdAt = nowIso()
  const id = makeId('msg')
  const finalSubject = subject || thread?.subject || 'No subject'
  db.prepare(
    `INSERT INTO messages
      (id, workspace_id, thread_id, direction, author_type, message_id, in_reply_to, references_json,
       from_email, from_name, to_json, cc_json, bcc_json, subject, html, text, status,
       template_version_id, api_key_id, headers_json, is_test, created_at, campaign_id, campaign_recipient_id, verification_id)
     VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    threadId,
    authorType,
    messageId,
    threading.inReplyTo,
    JSON.stringify(threading.references),
    fromAddress.email,
    fromAddress.name,
    JSON.stringify(recipients),
    JSON.stringify(parseAddressList(cc)),
    JSON.stringify(parseAddressList(bcc)),
    finalSubject,
    html || null,
    text || null,
    templateVersionId,
    apiKeyId,
    JSON.stringify(headers && typeof headers === 'object' ? headers : {}),
    isTest ? 1 : 0,
    createdAt,
    campaignId,
    campaignRecipientId,
    verificationId,
  )
  for (const attachment of attachments) {
    db.prepare(
      `INSERT INTO attachments (id, message_id, filename, content_type, bytes, storage_path, content_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      makeId('att', 6),
      id,
      attachment.filename,
      attachment.contentType || 'application/octet-stream',
      attachment.bytes || 0,
      attachment.storagePath,
      attachment.contentId || null,
      createdAt,
    )
  }
  if (thread) {
    touchThread(thread.id, { snippet: text || '', unread: false })
  }
  enqueue('send_message', { messageId: id }, { workspaceId })
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
}

export function replyAddressForThread(thread) {
  return threadReplyAddress(thread)
}
