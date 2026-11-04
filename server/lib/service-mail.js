import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { getDb } from '../db/index.js'
import { decryptSecret, makeId } from './crypto.js'
import { htmlToText } from './templates.js'
import { logger } from './logger.js'
import { makeTransport } from './mailer.js'
import { resolveMailRoute } from './mail-route.js'

function resolveServiceSender(workspaceId, fromEmail = '') {
  const db = getDb()
  const requested = String(fromEmail || '').trim().toLowerCase()
  const identity = requested
    ? db
        .prepare('SELECT * FROM identities WHERE workspace_id = ? AND from_email = ?')
        .get(workspaceId, requested)
    : db
        .prepare('SELECT * FROM identities WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1')
        .get(workspaceId)
  if (identity) {
    const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(identity.domain_id)
    if (domain?.status === 'verified') {
      return {
        from: { name: identity.from_name || 'Postique', email: identity.from_email },
        dkim: {
          domainName: domain.name,
          keySelector: domain.dkim_selector,
          privateKey: decryptSecret(domain.dkim_private_enc),
        },
        route: resolveMailRoute(domain),
      }
    }
  }
  if (config.mail.transport === 'file') {
    return {
      from: { name: 'Postique', email: `no-reply@${config.mail.fromDomain}` },
      dkim: null,
      route: resolveMailRoute(null),
    }
  }
  throw new Error('Add and verify a sending domain before sending this email.')
}

export async function sendServiceEmail({
  workspaceId,
  to,
  subject,
  html,
  text,
  headers = {},
  fromEmail = '',
}) {
  const { from, dkim, route } = resolveServiceSender(workspaceId, fromEmail)
  const transport = makeTransport(dkim, route)
  const plain = text || htmlToText(html)
  const info = await transport.sendMail({
    from: `"${String(from.name).replaceAll('"', '')}" <${from.email}>`,
    to,
    subject,
    text: plain,
    html,
    headers,
  })
  if (route.transport === 'file') {
    const filename = `service_${makeId('mail', 6)}.eml`
    fs.writeFileSync(path.join(config.outboxDir, filename), info.message)
    logger.warn({ filename }, 'Service email written to the local outbox')
  }
  return {
    sent: true,
    transport: route.transport,
    messageId: info.messageId,
  }
}
