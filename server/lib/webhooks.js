import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
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
    const mappedHex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mappedHex) {
      const high = parseInt(mappedHex[1], 16)
      const low = parseInt(mappedHex[2], 16)
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
    }
    const nat64 = value.match(/^64:ff9b::(?:[0-9a-f]{1,4}:){0,2}?(\d+\.\d+\.\d+\.\d+)$/)
    if (nat64) return isPrivateAddress(nat64[1])
    // Node prints addresses in compressed hex, so NAT64 usually arrives as 64:ff9b::7f00:1.
    const nat64Hex = value.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (nat64Hex) {
      const high = parseInt(nat64Hex[1], 16)
      const low = parseInt(nat64Hex[2], 16)
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
    }
    return false
  }
  return false
}

async function resolvePublicWebhookDestination(parsed) {
  if (config.webhooks.allowPrivate) return null
  if (isPrivateHostname(parsed.hostname) || isPrivateAddress(parsed.hostname)) {
    throw new Error('Private webhook destinations are disabled.')
  }
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true })
  if (!addresses.length) throw new Error('Webhook hostname did not resolve.')
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Private webhook destinations are disabled.')
  }
  return addresses.map(({ address, family }) => ({ address, family }))
}

// Node 20+ calls `lookup` with { all: true } (happy eyeballs) and expects an
// array of { address, family }. Answer both calling conventions, and offer every
// vetted address so a dead first record still falls back to the next one.
export function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (options && options.all) return callback(null, addresses.map((entry) => ({ ...entry })))
    return callback(null, addresses[0].address, addresses[0].family)
  }
}

const MAX_RESPONSE_PREVIEW = 500

export function sendWebhookRequest(parsed, body, headers, pinned, { timeoutMs = config.webhooks.timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const transport = parsed.protocol === 'https:' ? https : http
    let settled = false
    let deadline = null
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      fn(value)
    }
    const request = transport.request(
      parsed,
      {
        method: 'POST',
        headers,
        agent: false,
        ...(pinned?.length ? { lookup: pinnedLookup(pinned) } : {}),
      },
      (response) => {
        const status = response.statusCode || 0
        const result = (text) => ({ status, ok: status >= 200 && status < 300, text: text.slice(0, MAX_RESPONSE_PREVIEW) })
        let text = ''
        response.setEncoding('utf8')
        response.on('error', (error) => finish(reject, error))
        response.on('data', (chunk) => {
          text += chunk
          if (text.length >= MAX_RESPONSE_PREVIEW) {
            // Enough for the log. Stop reading so a streaming endpoint cannot pin the worker.
            finish(resolve, result(text))
            response.destroy()
          }
        })
        response.on('end', () => finish(resolve, result(text)))
      },
    )
    // One deadline for the whole exchange, body included (the socket idle timeout never fires on a slow drip).
    deadline = setTimeout(() => request.destroy(new Error('Webhook request timed out.')), timeoutMs)
    request.on('error', (error) => finish(reject, error))
    request.end(body)
  })
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
  let pinned = null
  try {
    pinned = await resolvePublicWebhookDestination(parsed)
  } catch (error) {
    db.prepare("UPDATE webhook_deliveries SET status = 'failed', last_error = ? WHERE id = ?").run(
      error.message,
      delivery.id,
    )
    throw error
  }
  const secret = decryptSecret(hook.secret_enc)
  const signature = signPayload(delivery.payload_json, secret)
  const response = await sendWebhookRequest(
    parsed,
    delivery.payload_json,
    {
      'content-type': 'application/json',
      'user-agent': 'Postique-Webhooks/1.0',
      'x-postique-event': delivery.event,
      'x-postique-delivery': delivery.id,
      'x-postique-signature': `sha256=${signature}`,
    },
    pinned,
  )
  if (response.status >= 300 && response.status < 400) {
    db.prepare(
      "UPDATE webhook_deliveries SET status = 'failed', attempts = attempts + 1, response_code = ?, last_error = ? WHERE id = ?",
    ).run(response.status, 'Webhook redirects are not allowed.', delivery.id)
    throw new Error('Webhook redirects are not allowed.')
  }
  const responseText = response.text
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
