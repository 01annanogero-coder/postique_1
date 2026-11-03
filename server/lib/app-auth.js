import crypto from 'node:crypto'
import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { issueAccessToken, verifyAccessToken } from './app-tokens.js'
import { sendAuthEmail } from './auth-mail.js'
import {
  hashPassword,
  hashToken,
  makeId,
  normaliseEmail,
  randomToken,
  verifyPassword,
} from './crypto.js'
import { fail } from './http.js'
import { logger } from './logger.js'
import { authSettings } from './workspace.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_WINDOW_MS = 15 * 60 * 1000
const RESEND_LIMIT = 5

function requireEmail(value) {
  const email = normaliseEmail(value)
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 320) {
    throw fail(400, 'invalid_email', 'Enter a valid email address.')
  }
  return email
}

function requirePassword(value) {
  const password = String(value || '')
  if (password.length < config.auth.passwordMinLength || password.length > 200) {
    throw fail(
      400,
      'weak_password',
      `Use a password between ${config.auth.passwordMinLength} and 200 characters.`,
    )
  }
  return password
}

function workspaceName(workspaceId) {
  return getDb().prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId)?.name || 'your workspace'
}

export function appUserView(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: Boolean(user.email_verified_at),
    emailVerifiedAt: user.email_verified_at,
    hasPassword: Boolean(user.password_hash),
    metadata: parseJson(user.metadata_json, {}),
    lastSignInAt: user.last_sign_in_at,
    disabled: Boolean(user.disabled_at),
    createdAt: user.created_at,
  }
}

export function findAppUser(workspaceId, email) {
  return getDb()
    .prepare('SELECT * FROM auth_users WHERE workspace_id = ? AND email = ? COLLATE NOCASE')
    .get(workspaceId, normaliseEmail(email))
}

export function findAppUserById(workspaceId, id) {
  return getDb()
    .prepare('SELECT * FROM auth_users WHERE workspace_id = ? AND id = ?')
    .get(workspaceId, id)
}

function assertActive(user) {
  if (!user || user.disabled_at) {
    throw fail(401, 'user_disabled', 'This account is not available.')
  }
}

function authEvent(workspaceId, userId, type, payload = {}) {
  try {
    getDb()
      .prepare(
        'INSERT INTO auth_events (id, workspace_id, user_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(makeId('aev', 6), workspaceId, userId || null, type, JSON.stringify(payload), nowIso())
  } catch (error) {
    logger.warn({ error: error.message }, 'Auth event could not be recorded')
  }
}

function issueSession(user, req, method) {
  const db = getDb()
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso())
  const refreshToken = randomToken(48)
  const sessionId = makeId('aus')
  const now = new Date()
  const expires = new Date(now.getTime() + config.auth.refreshDays * 24 * 60 * 60 * 1000)
  db.prepare(
    `INSERT INTO auth_sessions
      (id, workspace_id, user_id, refresh_token_hash, method, user_agent, ip, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    user.workspace_id,
    user.id,
    hashToken(refreshToken),
    method,
    String(req?.get('user-agent') || '').slice(0, 400),
    req?.ip || null,
    now.toISOString(),
    now.toISOString(),
    expires.toISOString(),
  )
  db.prepare('UPDATE auth_users SET last_sign_in_at = ?, updated_at = ? WHERE id = ?').run(
    now.toISOString(),
    now.toISOString(),
    user.id,
  )
  const access = issueAccessToken({
    userId: user.id,
    email: user.email,
    workspaceId: user.workspace_id,
    sessionId,
    method,
  })
  const updated = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(user.id)
  return {
    access_token: access.token,
    token_type: 'bearer',
    expires_in: access.expiresIn,
    expires_at: access.expiresAt,
    refresh_token: refreshToken,
    user: appUserView(updated),
  }
}

function checkEmailVerification(user, settings) {
  if (settings.requireEmailVerification && !user.email_verified_at) {
    throw fail(403, 'email_not_verified', 'Verify your email address before signing in.')
  }
}

export async function signUp({ workspaceId, email, password, name, metadata, redirectTo, allowedOrigins = [], req }) {
  const settings = authSettings(workspaceId)
  if (!settings.signupsEnabled) {
    throw fail(403, 'signups_disabled', 'Signups are disabled for this workspace.')
  }
  const normalised = requireEmail(email)
  const db = getDb()
  const existing = findAppUser(workspaceId, normalised)
  if (existing) throw fail(409, 'user_exists', 'An account with this email already exists.')
  if (password && !settings.passwordEnabled) {
    throw fail(403, 'password_disabled', 'Password sign-in is disabled for this workspace.')
  }
  const createdAt = nowIso()
  const user = {
    id: makeId('au'),
    workspace_id: workspaceId,
    email: normalised,
    name: String(name || '').trim().slice(0, 120),
    password_hash: password ? hashPassword(requirePassword(password)) : null,
    metadata_json: JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
  }
  db.prepare(
    `INSERT INTO auth_users
      (id, workspace_id, email, name, password_hash, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    workspaceId,
    user.email,
    user.name,
    user.password_hash,
    user.metadata_json,
    createdAt,
    createdAt,
  )
  const created = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(user.id)
  authEvent(workspaceId, user.id, 'signup', { method: password ? 'password' : 'magiclink' })
  if (settings.requireEmailVerification) {
    try {
      await requestAuthLink({
        workspaceId,
        email: normalised,
        purpose: 'magiclink',
        redirectTo,
        allowedOrigins,
        createUser: false,
        req,
      })
    } catch (error) {
      logger.warn({ error: error.message, email: normalised }, 'Signup verification email could not be sent')
    }
  }
  return {
    user: appUserView(created),
    session: password && !settings.requireEmailVerification ? issueSession(created, req, 'password') : null,
  }
}

export function signInWithPassword({ workspaceId, email, password, req }) {
  const settings = authSettings(workspaceId)
  if (!settings.passwordEnabled) {
    throw fail(403, 'password_disabled', 'Password sign-in is disabled for this workspace.')
  }
  const user = findAppUser(workspaceId, requireEmail(email))
  if (!user || !user.password_hash || !verifyPassword(String(password || ''), user.password_hash)) {
    throw fail(401, 'invalid_credentials', 'The email or password is incorrect.')
  }
  assertActive(user)
  checkEmailVerification(user, settings)
  authEvent(workspaceId, user.id, 'signin', { method: 'password' })
  return issueSession(user, req, 'password')
}

export function refreshSession({ refreshToken, workspaceId, req }) {
  const raw = String(refreshToken || '').trim()
  if (!raw) throw fail(400, 'refresh_token_required', 'A refresh token is required.')
  const db = getDb()
  const session = db
    .prepare('SELECT * FROM auth_sessions WHERE refresh_token_hash = ? AND workspace_id = ?')
    .get(hashToken(raw), workspaceId)
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    throw fail(401, 'invalid_refresh_token', 'This session has expired. Sign in again.')
  }
  const user = db.prepare('SELECT * FROM auth_users WHERE id = ? AND workspace_id = ?').get(session.user_id, session.workspace_id)
  assertActive(user)
  const consumed = db
    .prepare('UPDATE auth_sessions SET revoked_at = ?, last_used_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(nowIso(), nowIso(), session.id)
  if (consumed.changes !== 1) {
    throw fail(401, 'invalid_refresh_token', 'This session has already been rotated.')
  }
  authEvent(session.workspace_id, user.id, 'refresh', { method: session.method })
  return issueSession(user, req, session.method)
}

export function revokeSession({ accessToken, refreshToken, workspaceId }) {
  const db = getDb()
  if (refreshToken) {
    db.prepare(
      'UPDATE auth_sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND workspace_id = ? AND revoked_at IS NULL',
    ).run(nowIso(), hashToken(String(refreshToken)), workspaceId)
    return
  }
  const payload = verifyAccessToken(accessToken)
  if (payload?.session_id && payload.workspace_id === workspaceId) {
    db.prepare(
      'UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL',
    ).run(nowIso(), payload.session_id, workspaceId)
  }
}

export function sessionUserFromAccessToken(workspaceId, accessToken) {
  const payload = verifyAccessToken(accessToken)
  if (!payload || payload.workspace_id !== workspaceId) {
    throw fail(401, 'invalid_token', 'A valid access token is required.')
  }
  const db = getDb()
  const session = db.prepare('SELECT * FROM auth_sessions WHERE id = ?').get(payload.session_id)
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    throw fail(401, 'session_revoked', 'This session has been revoked. Sign in again.')
  }
  const user = db.prepare('SELECT * FROM auth_users WHERE id = ? AND workspace_id = ?').get(payload.sub, workspaceId)
  assertActive(user)
  return { user, session, payload }
}

export function updateSessionUser({ workspaceId, accessToken, patch }) {
  const { user, session } = sessionUserFromAccessToken(workspaceId, accessToken)
  const db = getDb()
  const updates = []
  const values = []
  if (patch.password !== undefined) {
    if (user.password_hash && session.method !== 'recovery') {
      if (!verifyPassword(String(patch.currentPassword || ''), user.password_hash)) {
        throw fail(403, 'current_password_invalid', 'Your current password is incorrect.')
      }
    }
    updates.push('password_hash = ?')
    values.push(hashPassword(requirePassword(patch.password)))
    updates.push('updated_at = ?')
    values.push(nowIso())
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL').run(
      nowIso(),
      user.id,
      session.id,
    )
  }
  if (patch.name !== undefined) {
    updates.push('name = ?')
    values.push(String(patch.name || '').trim().slice(0, 120))
    updates.push('updated_at = ?')
    values.push(nowIso())
  }
  if (patch.metadata !== undefined) {
    const metadata = patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : {}
    updates.push('metadata_json = ?')
    values.push(JSON.stringify(metadata))
    updates.push('updated_at = ?')
    values.push(nowIso())
  }
  if (updates.length) {
    values.push(user.id)
    db.prepare(`UPDATE auth_users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    authEvent(workspaceId, user.id, 'user_updated', { passwordChanged: patch.password !== undefined })
  }
  return appUserView(db.prepare('SELECT * FROM auth_users WHERE id = ?').get(user.id))
}

function safeRedirect(redirectTo, allowedOrigins) {
  const candidate = String(redirectTo || '').trim()
  const fallback = allowedOrigins[0] || config.appUrl
  if (!candidate) return fallback
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return fallback
    if (allowedOrigins.length > 0) {
      return allowedOrigins.includes(url.origin) ? url.toString() : fallback
    }
    return url.toString()
  } catch {
    return fallback
  }
}

function issueAuthToken({ workspaceId, user, purpose, redirectTo, code, token }) {
  const db = getDb()
  db.prepare('DELETE FROM auth_tokens WHERE expires_at < ? OR used_at < ?').run(
    nowIso(),
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  )
  const raw = token || randomToken(32)
  const otp = code || String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const createdAt = new Date()
  const minutes = purpose === 'recovery' ? config.auth.magicLinkMinutes : config.auth.otpMinutes
  const expiresAt = new Date(createdAt.getTime() + minutes * 60 * 1000)
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE workspace_id = ? AND email = ? AND used_at IS NULL').run(
    nowIso(),
    workspaceId,
    user.email,
  )
  db.prepare(
    `INSERT INTO auth_tokens
      (id, workspace_id, user_id, email, token_hash, code_hash, purpose, redirect_to, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    makeId('atk'),
    workspaceId,
    user.id,
    user.email,
    hashToken(raw),
    hashToken(otp),
    purpose,
    redirectTo,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  )
  return { raw, code: otp, expiresAt: expiresAt.toISOString() }
}

function recentTokenCount(workspaceId, email) {
  const since = new Date(Date.now() - RESEND_WINDOW_MS).toISOString()
  return getDb()
    .prepare(
      'SELECT COUNT(*) AS count FROM auth_tokens WHERE workspace_id = ? AND email = ? AND created_at >= ?',
    )
    .get(workspaceId, email, since).count
}

export async function requestAuthLink({
  workspaceId,
  email,
  purpose = 'magiclink',
  redirectTo,
  allowedOrigins = [],
  createUser = true,
  req,
  strictDelivery = false,
}) {
  const settings = authSettings(workspaceId)
  if (!settings.magicLinkEnabled) {
    throw fail(403, 'magic_link_disabled', 'Magic-link sign-in is disabled for this workspace.')
  }
  const normalised = requireEmail(email)
  let user = findAppUser(workspaceId, normalised)
  if (!user) {
    if (purpose !== 'magiclink' || !createUser || !settings.signupsEnabled) {
      return { delivered: false, user: null }
    }
    user = {
      id: makeId('au'),
      workspace_id: workspaceId,
      email: normalised,
      name: '',
      password_hash: null,
      metadata_json: '{}',
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    getDb()
      .prepare(
        `INSERT INTO auth_users (id, workspace_id, email, name, password_hash, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, '', NULL, '{}', ?, ?)`,
      )
      .run(user.id, workspaceId, normalised, user.created_at, user.updated_at)
    authEvent(workspaceId, user.id, 'signup', { method: 'magiclink' })
  }
  if (user.disabled_at) return { delivered: false, user: null }
  if (recentTokenCount(workspaceId, normalised) >= RESEND_LIMIT) {
    throw fail(429, 'too_many_requests', 'Too many sign-in links requested. Wait a few minutes and try again.')
  }
  const redirect = safeRedirect(redirectTo, allowedOrigins)
  const issued = issueAuthToken({ workspaceId, user, purpose, redirectTo: redirect })
  const link = `${config.appUrl}/auth/v1/verify?token=${encodeURIComponent(issued.raw)}&type=${purpose}`
  let deliveryError = null
  try {
    await sendAuthEmail({
      workspaceId,
      workspaceName: workspaceName(workspaceId),
      to: normalised,
      purpose,
      link,
      code: issued.code,
    })
  } catch (error) {
    deliveryError = error
    logger.error({ error: error.message, email: normalised }, 'Auth email could not be sent')
    if (strictDelivery) throw fail(503, 'mail_delivery_failed', error.message)
  }
  authEvent(workspaceId, user.id, 'magic_link_requested', { purpose })
  return {
    delivered: !deliveryError,
    user: appUserView(user),
    expiresAt: issued.expiresAt,
    debug: config.auth.debugLinks
      ? { link, token: issued.raw, code: issued.code, redirectTo: redirect }
      : null,
  }
}

export async function sendMagicLinkForUser({ workspaceId, userId, purpose = 'magiclink', redirectTo, req }) {
  const user = findAppUserById(workspaceId, userId)
  if (!user) throw fail(404, 'user_not_found', 'User not found.')
  if (user.disabled_at) throw fail(400, 'user_disabled', 'Enable the account before sending a link.')
  return requestAuthLink({
    workspaceId,
    email: user.email,
    purpose,
    redirectTo,
    createUser: false,
    req,
    strictDelivery: true,
  })
}

export function verifyAuthToken({ workspaceId, token, email, purpose, req }) {
  const db = getDb()
  const raw = String(token || '').trim()
  if (!raw) throw fail(400, 'token_required', 'A token is required.')
  let row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ?').get(hashToken(raw))
  if (!row && email) {
    const normalised = requireEmail(email)
    const candidates = db
      .prepare(
        `SELECT * FROM auth_tokens
         WHERE workspace_id = ? AND email = ? AND used_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT 5`,
      )
      .all(workspaceId, normalised, nowIso())
    row = candidates.find((candidate) => candidate.code_hash === hashToken(raw))
  }
  if (!row || row.workspace_id !== workspaceId) {
    throw fail(400, 'invalid_token', 'This link or code is invalid.')
  }
  if (row.used_at) throw fail(400, 'token_used', 'This link or code has already been used.')
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw fail(400, 'token_expired', 'This link or code has expired.')
  }
  if (purpose && row.purpose !== purpose && row.purpose !== 'magiclink') {
    throw fail(400, 'invalid_token', 'This link is not valid for that action.')
  }
  const user = db.prepare('SELECT * FROM auth_users WHERE id = ? AND workspace_id = ?').get(row.user_id, workspaceId)
  assertActive(user)
  const consumed = db
    .prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(nowIso(), row.id)
  if (consumed.changes !== 1) throw fail(400, 'token_used', 'This link or code has already been used.')
  db.prepare('UPDATE auth_users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?').run(
    nowIso(),
    nowIso(),
    user.id,
  )
  const updated = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(user.id)
  authEvent(workspaceId, user.id, 'verified', { purpose: row.purpose })
  return {
    user: appUserView(updated),
    session: issueSession(updated, req, row.purpose === 'recovery' ? 'recovery' : 'magiclink'),
    redirectTo: row.redirect_to || config.appUrl,
    type: row.purpose,
  }
}

export function consumeAuthTokenByRaw({ token, req }) {
  const db = getDb()
  const raw = String(token || '').trim()
  if (!raw) throw fail(400, 'token_required', 'A token is required.')
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ?').get(hashToken(raw))
  if (!row) throw fail(400, 'invalid_token', 'This link is invalid.')
  if (row.used_at) throw fail(400, 'token_used', 'This link has already been used.')
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw fail(400, 'token_expired', 'This link has expired.')
  }
  if (row.purpose !== 'magiclink' && row.purpose !== 'recovery') {
    throw fail(400, 'invalid_token', 'This link is invalid.')
  }
  return verifyAuthToken({ workspaceId: row.workspace_id, token: raw, req })
}

export function getAppUserFromAccessToken(workspaceId, accessToken) {
  return appUserView(sessionUserFromAccessToken(workspaceId, accessToken).user)
}

export function listAppUsers(workspaceId, { search = '', limit = 100 } = {}) {
  const db = getDb()
  const term = `%${String(search || '').trim().toLowerCase()}%`
  const rows = db
    .prepare(
      `SELECT * FROM auth_users
       WHERE workspace_id = ? AND (LOWER(email) LIKE ? OR LOWER(name) LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(workspaceId, term, term, Math.min(Math.max(Number(limit) || 100, 1), 200))
  return rows.map(appUserView)
}

export function appAuthStats(workspaceId) {
  const db = getDb()
  const counts = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END) AS disabled,
        SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) AS with_password
       FROM auth_users WHERE workspace_id = ?`,
    )
    .get(workspaceId)
  const sessions = db
    .prepare(
      `SELECT COUNT(*) AS count FROM auth_sessions
       WHERE workspace_id = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(workspaceId, nowIso()).count
  const signups7d = db
    .prepare('SELECT COUNT(*) AS count FROM auth_users WHERE workspace_id = ? AND created_at >= ?')
    .get(workspaceId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).count
  return {
    total: counts.total || 0,
    verified: counts.verified || 0,
    disabled: counts.disabled || 0,
    withPassword: counts.with_password || 0,
    activeSessions: sessions,
    signups7d,
  }
}

export function setAppUserDisabled(workspaceId, userId, disabled) {
  const db = getDb()
  const user = findAppUserById(workspaceId, userId)
  if (!user) throw fail(404, 'user_not_found', 'User not found.')
  db.prepare('UPDATE auth_users SET disabled_at = ?, updated_at = ? WHERE id = ?').run(
    disabled ? nowIso() : null,
    nowIso(),
    userId,
  )
  if (disabled) {
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId)
  }
  authEvent(workspaceId, userId, disabled ? 'user_disabled' : 'user_enabled')
  return appUserView(db.prepare('SELECT * FROM auth_users WHERE id = ?').get(userId))
}

export function deleteAppUser(workspaceId, userId) {
  const db = getDb()
  const user = findAppUserById(workspaceId, userId)
  if (!user) throw fail(404, 'user_not_found', 'User not found.')
  db.prepare('DELETE FROM auth_users WHERE id = ?').run(userId)
  authEvent(workspaceId, null, 'user_deleted', { email: user.email })
}

export function authUserForAdmin(workspaceId, userId) {
  return appUserView(findAppUserById(workspaceId, userId))
}
