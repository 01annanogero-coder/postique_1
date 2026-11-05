import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { constantTimeEqual, hashApiKey } from './crypto.js'
import { fail } from './http.js'

const buckets = new Map()

function keyFromRequest(req) {
  const authorization = req.get('authorization') || ''
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim()
    // Auth endpoints carry an end-user JWT in Authorization and the workspace
    // public key in X-Postique-Key. Prefer the key header unless the bearer
    // value is itself a Postique API key.
    if (/^pq_(live|pub)_/.test(token)) return token
  }
  return req.get('x-postique-key') || req.body?.public_key || ''
}

function bucketKey(apiKey, req, scope = 'ip') {
  return `${apiKey.id}:${scope}:${scope === 'key' ? 'global' : req.ip}`
}

export function rateLimit(apiKey, req, limit, windowMs = 60_000, scope = 'ip') {
  const now = Date.now()
  const id = bucketKey(apiKey, req, scope)
  let bucket = buckets.get(id)
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(id, bucket)
  }
  bucket.count += 1
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    const error = fail(429, 'rate_limited', 'Too many requests. Try again shortly.', { retryAfter })
    error.retryAfter = retryAfter
    throw error
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}, 60_000).unref()

export function apiCors(req, res, next) {
  const origin = req.get('origin')
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Postique-Key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  return next()
}

export function authenticateApiKey(req, _res, next) {
  try {
    const key = keyFromRequest(req)
    if (!key || !/^pq_(live|pub)_[A-Za-z0-9_-]{16,}$/.test(key)) {
      return next(fail(401, 'invalid_api_key', 'A valid Postique API key is required.'))
    }
    const db = getDb()
    const record = db.prepare('SELECT * FROM api_keys WHERE prefix = ?').get(key.slice(0, 13))
    if (!record || record.revoked_at) {
      return next(fail(401, 'invalid_api_key', 'This API key is invalid or has been revoked.'))
    }
    if (!constantTimeEqual(record.hash, hashApiKey(key))) {
      return next(fail(401, 'invalid_api_key', 'This API key is invalid or has been revoked.'))
    }
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(record.workspace_id)
    if (!workspace) return next(fail(401, 'invalid_api_key', 'The workspace for this key no longer exists.'))

    const origin = req.get('origin')
    const allowedOrigins = parseJson(record.allowed_origins_json, []).map((entry) => String(entry).toLowerCase())
    if (record.kind === 'public') {
      if (origin && !allowedOrigins.includes(String(origin).trim().toLowerCase())) {
        return next(fail(403, 'origin_not_allowed', 'This public key is not allowed from this origin.'))
      }
      rateLimit(record, req, Math.min(record.rate_limit || 60, config.limits.publicSendPerMinute))
      // A global per-key bucket prevents a leaked key from bypassing the
      // per-IP bucket by rotating IP addresses.
      rateLimit(record, req, config.limits.publicKeyPerMinute, 60_000, 'key')
    }

    db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowIso(), record.id)
    req.apiKey = record
    req.workspace = workspace
    req.workspaceId = workspace.id
    return next()
  } catch (error) {
    return next(error)
  }
}

export function apiKeyView(record) {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    prefix: record.prefix,
    allowedOrigins: parseJson(record.allowed_origins_json, []),
    allowedTemplates: parseJson(record.allowed_templates_json, []),
    allowedRecipients: parseJson(record.allowed_recipients_json, []),
    rateLimit: record.rate_limit,
    createdAt: record.created_at,
    lastUsedAt: record.last_used_at,
    revokedAt: record.revoked_at,
  }
}
