import { config } from '../config.js'
import { getDb, getWorkspaceForUser, getUserById, nowIso } from '../db/index.js'
import { hashToken, randomToken } from './crypto.js'
import { fail } from './http.js'

const SESSION_DURATION_MS = config.sessionDays * 24 * 60 * 60 * 1000

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}

function csrfOptions(maxAge) {
  return {
    httpOnly: false,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}

export function createSession(user, req, res) {
  const db = getDb()
  const token = randomToken(32)
  const csrf = randomToken(24)
  const id = `ses_${randomToken(12)}`
  const created = new Date()
  const expires = new Date(created.getTime() + SESSION_DURATION_MS)
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, csrf_token, user_agent, ip, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    user.id,
    hashToken(token),
    csrf,
    String(req.get('user-agent') || '').slice(0, 400),
    req.ip,
    created.toISOString(),
    created.toISOString(),
    expires.toISOString(),
  )
  res.cookie(config.sessionCookie, token, cookieOptions(SESSION_DURATION_MS))
  res.cookie(config.csrfCookie, csrf, csrfOptions(SESSION_DURATION_MS))
  return { id, csrf, expiresAt: expires.toISOString() }
}

export function destroySession(req, res) {
  const token = req.cookies?.[config.sessionCookie]
  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  }
  res.clearCookie(config.sessionCookie, { path: '/' })
  res.clearCookie(config.csrfCookie, { path: '/' })
}

export function loadAuth(req, _res, next) {
  const token = req.cookies?.[config.sessionCookie]
  if (!token) return next()
  const db = getDb()
  const row = db
    .prepare(
      `SELECT s.*, u.email AS user_email, u.name AS user_name, u.created_at AS user_created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token))
  if (!row) return next()
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id)
    return next()
  }
  const lastSeen = new Date(row.last_seen_at).getTime()
  if (Date.now() - lastSeen > 5 * 60 * 1000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.id)
  }
  req.auth = row
  req.user = {
    id: row.user_id,
    email: row.user_email,
    name: row.user_name,
    createdAt: row.user_created_at,
  }
  req.workspace = getWorkspaceForUser(row.user_id) || null
  return next()
}

export function requireAuth(req, _res, next) {
  if (!req.user || !req.auth) return next(fail(401, 'auth_required', 'Sign in to continue.'))
  return next()
}

export function requireWorkspace(req, _res, next) {
  if (!req.workspace) return next(fail(409, 'workspace_required', 'Your account is not attached to a workspace.'))
  return next()
}

export function requireCsrf(req, _res, next) {
  if (!req.auth) return next(fail(401, 'auth_required', 'Sign in to continue.'))
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const header = req.get('x-csrf-token')
  if (!header || header !== req.auth.csrf_token) {
    return next(fail(403, 'csrf_failed', 'The request could not be verified. Refresh the page and try again.'))
  }
  return next()
}

export function publicUser(user) {
  const record = user || {}
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    createdAt: record.created_at || record.createdAt,
  }
}

export function getSessionUser(id) {
  return getUserById(id)
}

export function cleanupSessions() {
  return getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso())
}
