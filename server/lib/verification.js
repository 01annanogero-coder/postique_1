import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { escapeHtml } from './format.js'
import { hashToken, makeId, normaliseEmail, randomToken } from './crypto.js'
import { fail } from './http.js'
import { compileMjml, htmlToText, renderSubject } from './templates.js'
import { sendServiceEmail } from './service-mail.js'
import { logger } from './logger.js'
import { enqueueWebhookEvent } from './webhooks.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireEmail(value) {
  const email = normaliseEmail(value)
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 320) {
    throw fail(400, 'invalid_email', 'Enter a valid email address.')
  }
  return email
}

function safeRedirect(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return config.appUrl
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return config.appUrl
    return url.toString()
  } catch {
    return config.appUrl
  }
}

function fallbackHtml({ verifyUrl, workspaceName, expiresMinutes }) {
  return `<div style="margin:0;padding:32px 16px;background:#f3f0e8;font-family:Arial,Helvetica,sans-serif;color:#20251f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px">
    <tr><td style="padding:30px 32px">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8e9588">Email verification</div>
      <h1 style="margin:14px 0 10px;font-size:27px;line-height:1.15">Confirm your email address</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#5f675a">Use the button below to confirm that you own this address for ${escapeHtml(workspaceName)}.</p>
      <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:13px 20px;border-radius:7px;background:#171b17;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Verify email</a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9aa095">This link expires in ${escapeHtml(expiresMinutes)} minutes. If you did not request it, ignore this message.</p>
    </td></tr>
  </table>
</div>`
}

function publishedTemplate(workspaceId, reference) {
  if (!reference) return null
  const db = getDb()
  const template = db
    .prepare('SELECT * FROM templates WHERE workspace_id = ? AND (slug = ? OR id = ?)')
    .get(workspaceId, String(reference), String(reference))
  if (!template) throw fail(404, 'template_not_found', 'Verification template not found.')
  const version = db
    .prepare("SELECT * FROM template_versions WHERE template_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
    .get(template.id)
  if (!version) throw fail(400, 'template_not_published', 'Publish the verification template before using it.')
  return version
}

export async function createVerificationRequest({
  workspaceId,
  email,
  name = '',
  template: templateReference = '',
  redirectUrl,
  metadata = {},
  fromEmail = '',
  subject,
  apiKeyId = null,
  req,
}) {
  const address = requireEmail(email)
  const db = getDb()
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = db
    .prepare('SELECT COUNT(*) AS count FROM verification_requests WHERE workspace_id = ? AND email = ? AND created_at >= ?')
    .get(workspaceId, address, windowStart).count
  if (recent >= config.verification.maxPerHour) {
    throw fail(429, 'too_many_verifications', 'Too many verification attempts. Try again later.')
  }
  const workspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId)
  if (!workspace) throw fail(404, 'workspace_not_found', 'Workspace not found.')
  const rawToken = randomToken(32)
  const id = makeId('vrf')
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + config.verification.tokenMinutes * 60 * 1000)
  const purgeAt = new Date(createdAt.getTime() + config.verification.retentionHours * 60 * 60 * 1000)
  const verifyUrl = `${config.appUrl}/verify/v1/confirm?token=${encodeURIComponent(rawToken)}`
  const version = publishedTemplate(workspaceId, templateReference)
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const variables = {
    ...meta,
    email: address,
    name: String(name || ''),
    workspace: workspace.name,
    verify_url: verifyUrl,
    verification_url: verifyUrl,
    expires_minutes: config.verification.tokenMinutes,
  }
  let html
  let text
  let finalSubject = String(subject || '').trim()
  if (version) {
    const renderedSubject = renderSubject(version.subject, variables)
    finalSubject = finalSubject || renderedSubject || `Verify your email for ${workspace.name}`
    const compiled = await compileMjml(version.mjml, variables)
    html = compiled.html
    text = htmlToText(html)
  } else {
    finalSubject = finalSubject || `Verify your email for ${workspace.name}`
    html = fallbackHtml({
      verifyUrl,
      workspaceName: workspace.name,
      expiresMinutes: config.verification.tokenMinutes,
    })
    text = `Confirm your email address\n\n${verifyUrl}\n\nThis link expires in ${config.verification.tokenMinutes} minutes.`
  }
  db.prepare(
    `INSERT INTO verification_requests
      (id, workspace_id, email, name, template_version_id, redirect_url, metadata_json, token_hash,
       status, ip, user_agent, api_key_id, created_at, expires_at, purge_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    address,
    String(name || '').slice(0, 120),
    version?.id || null,
    safeRedirect(redirectUrl),
    JSON.stringify(meta),
    hashToken(rawToken),
    req?.ip || null,
    String(req?.get('user-agent') || '').slice(0, 400),
    apiKeyId,
    createdAt.toISOString(),
    expiresAt.toISOString(),
    purgeAt.toISOString(),
  )
  try {
    await sendServiceEmail({
      workspaceId,
      to: address,
      subject: finalSubject,
      html,
      text,
      fromEmail,
      headers: {
        'X-Postique-Verification': id,
        'Auto-Submitted': 'auto-generated',
      },
    })
  } catch (error) {
    db.prepare("UPDATE verification_requests SET status = 'failed' WHERE id = ?").run(id)
    logger.error({ error: error.message, verificationId: id }, 'Verification email could not be sent')
    throw fail(503, 'verification_email_failed', error.message)
  }
  return {
    id,
    status: 'pending',
    email: address,
    expiresAt: expiresAt.toISOString(),
    purgeAt: purgeAt.toISOString(),
    templateVersionId: version?.id || null,
    debug: config.verification.debugLinks ? { verifyUrl } : null,
  }
}

export function confirmVerification(rawToken, req) {
  const db = getDb()
  const token = String(rawToken || '').trim()
  if (!token) throw fail(400, 'token_required', 'A verification token is required.')
  const row = db.prepare('SELECT * FROM verification_requests WHERE token_hash = ?').get(hashToken(token))
  if (!row) throw fail(400, 'invalid_token', 'This verification link is invalid.')
  if (row.status === 'failed') throw fail(400, 'invalid_token', 'This verification email could not be delivered.')
  let firstConfirmation = false
  if (row.status !== 'verified') {
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw fail(400, 'token_expired', 'This verification link has expired.')
    }
    const result = db
      .prepare("UPDATE verification_requests SET status = 'verified', verified_at = ?, ip = ? WHERE id = ? AND status != 'verified'")
      .run(nowIso(), req?.ip || row.ip, row.id)
    firstConfirmation = result.changes === 1
  }
  const updated = db.prepare('SELECT * FROM verification_requests WHERE id = ?').get(row.id)
  if (firstConfirmation) {
    enqueueWebhookEvent(updated.workspace_id, 'verification.completed', {
      verification: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        metadata: parseJson(updated.metadata_json, {}),
        verifiedAt: updated.verified_at,
      },
    })
  }
  return {
    id: updated.id,
    email: updated.email,
    status: updated.status,
    verifiedAt: updated.verified_at,
    redirectUrl: updated.redirect_url || config.appUrl,
  }
}

export function verificationView(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    metadata: parseJson(row.metadata_json, {}),
    templateVersionId: row.template_version_id,
    redirectUrl: row.redirect_url,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    consumedAt: row.consumed_at || null,
  }
}

export function getVerificationProof({ workspaceId, id, email, apiKeyId }) {
  const row = getDb()
    .prepare('SELECT * FROM verification_requests WHERE id = ? AND workspace_id = ?')
    .get(String(id || ''), workspaceId)
  if (
    !row ||
    row.status !== 'verified' ||
    row.consumed_at ||
    !row.api_key_id ||
    row.api_key_id !== apiKeyId ||
    normaliseEmail(row.email) !== normaliseEmail(email) ||
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    throw fail(403, 'verification_proof_required', 'Verify this recipient before sending to them.')
  }
  return row
}

export function consumeVerificationProof({ workspaceId, id, email, apiKeyId }) {
  const row = getVerificationProof({ workspaceId, id, email, apiKeyId })
  const claimed = getDb()
    .prepare('UPDATE verification_requests SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
    .run(nowIso(), row.id)
  if (claimed.changes !== 1) {
    throw fail(409, 'verification_proof_used', 'This verification proof has already been used.')
  }
  return row
}

export function publicVerificationView({ workspaceId, id, apiKeyId }) {
  const row = getDb()
    .prepare('SELECT * FROM verification_requests WHERE id = ? AND workspace_id = ? AND api_key_id = ?')
    .get(String(id || ''), workspaceId, apiKeyId)
  if (!row) throw fail(404, 'verification_not_found', 'Verification request not found.')
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    consumedAt: row.consumed_at || null,
  }
}

export function getVerification(workspaceId, id) {
  const row = getDb()
    .prepare('SELECT * FROM verification_requests WHERE id = ? AND workspace_id = ?')
    .get(id, workspaceId)
  if (!row) throw fail(404, 'verification_not_found', 'Verification request not found.')
  return verificationView(row)
}

export function listVerifications(workspaceId, limit = 50) {
  return getDb()
    .prepare('SELECT * FROM verification_requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(workspaceId, Math.min(Math.max(Number(limit) || 50, 1), 200))
    .map(verificationView)
}

export function cleanupVerifications() {
  return getDb().prepare('DELETE FROM verification_requests WHERE purge_at < ?').run(nowIso())
}
