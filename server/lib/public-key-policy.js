import { config } from '../config.js'
import { getDb, parseJson } from '../db/index.js'
import { fail } from './http.js'

/**
 * Public browser keys are the untrusted boundary. Keep their send policy in one
 * place so `to`, `cc`, `bcc`, origins, templates and daily quota cannot drift.
 */

function normaliseList(value) {
  return parseJson(value, []).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
}

export function publicAllowedRecipients(key) {
  return normaliseList(key.allowed_recipients_json)
}

export function assertPublicRecipientPolicy(key, recipients, { verificationEmail = null } = {}) {
  if (key.kind !== 'public') return
  const allowed = publicAllowedRecipients(key)
  const verified = key.recipient_policy === 'verified'
  if (!allowed.length && !verified) {
    throw fail(
      403,
      'recipient_policy_required',
      'This public key has no approved recipients. Add a recipient allow-list before using it.',
    )
  }
  const allowedSet = new Set(allowed)
  for (const recipient of recipients) {
    const email = String(recipient.email || '').toLowerCase()
    if (allowedSet.has(email)) continue
    if (verified && recipients.length === 1 && verificationEmail && email === String(verificationEmail).toLowerCase()) {
      continue
    }
    throw fail(403, 'recipient_not_allowed', `This public key cannot send to ${recipient.email}.`)
  }
}

export function assertPublicVerificationPolicy(key) {
  if (key.kind !== 'public') return
  if (key.recipient_policy !== 'verified') {
    throw fail(403, 'verified_policy_required', 'Enable verified-visitor sends on this public key first.')
  }
}

export function assertPublicDailyVerifyLimit(key) {
  if (key.kind !== 'public') return
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const count = getDb()
    .prepare('SELECT COUNT(*) AS count FROM verification_requests WHERE api_key_id = ? AND created_at >= ?')
    .get(key.id, since).count
  if (count >= config.limits.publicVerifyPerDay) {
    throw fail(429, 'public_key_verification_limit', 'This public key has reached its 24-hour verification-email limit.')
  }
}

export function assertPublicSendShape(key, body) {
  if (key.kind !== 'public') return
  if (body?.thread_id) {
    throw fail(403, 'public_thread_not_allowed', 'Public keys cannot send into an existing conversation.')
  }
  if (body?.in_reply_to) {
    throw fail(403, 'public_thread_not_allowed', 'Public keys cannot send into an existing conversation.')
  }
  if (body?.cc || body?.bcc) {
    throw fail(403, 'public_carbon_copy_not_allowed', 'Public keys cannot use cc or bcc.')
  }
}

export function assertPublicOrigin(key, origin) {
  if (key.kind !== 'public') return
  const allowed = normaliseList(key.allowed_origins_json)
  if (!origin) {
    throw fail(403, 'origin_required', 'Public keys must be called from an allowed browser origin.')
  }
  if (!allowed.includes(String(origin).trim().toLowerCase())) {
    throw fail(403, 'origin_not_allowed', 'This public key is not allowed from this origin.')
  }
}

export function assertPublicTemplateAllowed(key, slug) {
  if (key.kind !== 'public') return
  const allowed = normaliseList(key.allowed_templates_json)
  if (!allowed.length) {
    throw fail(403, 'template_not_allowed', 'This public key has no approved templates yet.')
  }
  if (!slug || !allowed.includes(String(slug).trim().toLowerCase())) {
    throw fail(403, 'template_not_allowed', 'This public key is not allowed to send that template.')
  }
}

export function assertPublicDailyLimit(key) {
  if (key.kind !== 'public') return
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const count = getDb()
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE api_key_id = ? AND direction = 'out' AND created_at >= ?")
    .get(key.id, since).count
  if (count >= config.limits.publicSendPerDay) {
    throw fail(429, 'public_key_daily_limit', 'This public key has reached its 24-hour sending limit.')
  }
}
