import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { decryptSecret, makeId, signPayload } from './crypto.js'
import { logger } from './logger.js'

export function enqueueWebhookDelivery(hook, event, data) {
  const db = getDb()
  const deliveryId = makeId('whd')
  const payload = JSON.stringify({
    event,
    createdAt: nowIso(),
    workspaceId: hook.workspace_id,
    data,
  })
  db.prepare(
    `INSERT INTO webhook_deliveries (id, webhook_id, event, payload_json, status, attempts, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
  ).run(deliveryId, hook.id, event, payload, nowIso())
  db.prepare(
    `INSERT INTO jobs (id, workspace_id, type, payload_json, status, attempts, max_attempts, run_at, created_at, updated_at)
     VALUES (?, ?, 'webhook_delivery', ?, 'pending', 0, 5, ?, ?, ?)`,
  ).run(makeId('job'), hook.workspace_id, JSON.stringify({ deliveryId }), nowIso(), nowIso(), nowIso())
  return deliveryId
}

export function enqueueWebhookEvent(workspaceId, event, data) {
  const db = getDb()
  const hooks = db
    .prepare("SELECT * FROM webhooks WHERE workspace_id = ? AND status = 'active'")
    .all(workspaceId)
    .filter((hook) => parseJson(hook.events_json, []).includes(event))
  for (const hook of hooks) {
    enqueueWebhookDelivery(hook, event, data)
  }
}

function isPrivateHostname(hostname) {
  const value = hostname.toLowerCase()
  if (value === 'localhost' || value.endsWith('.local') || value.endsWith('.internal')) return true
  if (/^127\./.test(value) || value === '::1') return true
  if (/^10\./.test(value) || /^192\.168\./.test(value)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true
  if (/^169\.254\./.test(value) || value === '0.0.0.0') return true
  return false
}

export function isPrivateAddress(address) {
  const family = isIP(address)
  if (family === 4) {
    const parts = address.split('.').map(Number)
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true
    if (parts[0] >= 224) return true
    return false
  }
  if (family === 6) {
    const value = address.toLowerCase()
    if (value === '::' || value === '::1') return true
    if (value.startsWith('fc') || value.startsWith('fd')) return true
    if (/^fe[89ab]/.test(value)) return true
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }
  return true
}

async function assertPublicWebhookDestination(parsed) {
  if (config.webhooks.allowPrivate) return
  if (isPrivateHostname(parsed.hostname) || isPrivateAddress(parsed.hostname)) {
    throw new Error('Private webhook destinations are disabled.')
  }
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true })
  if (!addresses.length) throw new Error('Webhook hostname did not resolve.')
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Private webhook destinations are disabled.')
  }
}

export async function deliverWebhook(deliveryId) {
  const db = getDb()
  const delivery = db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(deliveryId)
  if (!delivery) return
  if (delivery.status === 'delivered') return
  const hook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(delivery.webhook_id)
  if (!hook || hook.status !== 'active') {
    db.prepare("UPDATE webhook_deliveries SET status = 'failed', last_error = ? WHERE id = ?").run(
      'Webhook is paused or missing',
      delivery.id,
    )
    return
  }
  let parsed
  try {
    parsed = new URL(hook.url)
  } catch {
    db.prepare("UPDATE webhook_deliveries SET status = 'failed', last_error = ? WHERE id = ?").run(
      'Invalid webhook URL',
      delivery.id,
    )
    return
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use HTTP or HTTPS.')
  }
  try {
    await assertPublicWebhookDestination(parsed)
  } catch (error) {
    db.prepare("UPDATE webhook_deliveries SET status = 'failed', last_error = ? WHERE id = ?").run(
      error.message,
      delivery.id,
    )
    throw error
  }
  const secret = decryptSecret(hook.secret_enc)
  const signature = signPayload(delivery.payload_json, secret)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.webhooks.timeoutMs)
  let response
  try {
    response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Postique-Webhooks/1.0',
        'x-postique-event': delivery.event,
        'x-postique-delivery': delivery.id,
        'x-postique-signature': `sha256=${signature}`,
      },
      body: delivery.payload_json,
      redirect: 'manual',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (response.status >= 300 && response.status < 400) {
    db.prepare(
      "UPDATE webhook_deliveries SET status = 'failed', attempts = attempts + 1, response_code = ?, last_error = ? WHERE id = ?",
    ).run(response.status, 'Webhook redirects are not allowed.', delivery.id)
    throw new Error('Webhook redirects are not allowed.')
  }
  const responseText = (await response.text().catch(() => '')).slice(0, 500)
  const attempts = delivery.attempts + 1
  if (response.ok) {
    db.prepare(
      `UPDATE webhook_deliveries
       SET status = 'delivered', attempts = ?, response_code = ?, delivered_at = ?, last_error = NULL
       WHERE id = ?`,
    ).run(attempts, response.status, nowIso(), delivery.id)
    db.prepare('UPDATE webhooks SET last_delivery_at = ? WHERE id = ?').run(nowIso(), hook.id)
  } else {
    db.prepare(
      `UPDATE webhook_deliveries
       SET status = 'failed', attempts = ?, response_code = ?, last_error = ?
       WHERE id = ?`,
    ).run(attempts, response.status, responseText || `HTTP ${response.status}`, delivery.id)
    logger.warn({ deliveryId, status: response.status }, 'Webhook delivery failed')
    throw new Error(`Webhook returned HTTP ${response.status}`)
  }
}
