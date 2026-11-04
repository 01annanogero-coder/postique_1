import crypto from 'node:crypto'
import { config } from '../config.js'
import { getDb, nowIso } from '../db/index.js'
import { fail } from './http.js'

const SECRET = crypto
  .createHmac('sha256', config.appSecret)
  .update('postique:unsubscribe:v1')
  .digest()

export function unsubscribeToken(recipientId, campaignId) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${recipientId}:${campaignId}`)
    .digest('base64url')
}

export function unsubscribeUrl(recipientId, campaignId) {
  const token = unsubscribeToken(recipientId, campaignId)
  return `${config.appUrl}/unsubscribe/${encodeURIComponent(recipientId)}?token=${encodeURIComponent(token)}`
}

function validToken(recipient, token) {
  const expected = unsubscribeToken(recipient.id, recipient.campaign_id)
  const left = Buffer.from(String(token || ''))
  const right = Buffer.from(expected)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function unsubscribeRecipient(recipientId, token) {
  const db = getDb()
  const recipient = db
    .prepare(
      `SELECT r.*, c.workspace_id AS campaign_workspace_id
       FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
       WHERE r.id = ?`,
    )
    .get(recipientId)
  if (!recipient || !validToken(recipient, token)) {
    throw fail(400, 'invalid_unsubscribe_token', 'This unsubscribe link is invalid or has expired.')
  }
  db.prepare(
    'INSERT INTO suppressions (workspace_id, email, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, email) DO NOTHING',
  ).run(recipient.workspace_id, recipient.email, 'unsubscribe', nowIso())
  db.prepare("UPDATE campaign_recipients SET status = 'unsubscribed', updated_at = ? WHERE id = ?").run(nowIso(), recipient.id)
  return { email: recipient.email, campaignId: recipient.campaign_id }
}
