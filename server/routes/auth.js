import express from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../config.js'
import {
  countUsers,
  getDb,
  getWorkspaceForUser,
  getUserByEmail,
  nowIso,
  transaction,
} from '../db/index.js'
import { createSession, destroySession, publicUser, requireAuth, requireCsrf } from '../lib/auth.js'
import { makeId, hashPassword, normaliseEmail, verifyPassword } from '../lib/crypto.js'
import { fail } from '../lib/http.js'
import { createWorkspace, workspaceView } from '../lib/workspace.js'

export const authRouter = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many sign-in attempts. Try again later.' } },
})

function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
    throw fail(400, 'invalid_email', 'Enter a valid email address.')
  }
  if (String(password || '').length < 10) {
    throw fail(400, 'weak_password', 'Use a password with at least 10 characters.')
  }
}

function authResponse(req, res, user, csrfToken) {
  const workspace = getWorkspaceForUser(user.id)
  return res.json({
    user: publicUser(user),
    workspace: workspace ? workspaceView(workspace, user) : null,
    csrfToken: csrfToken || req.auth?.csrf_token,
    setupRequired: false,
  })
}

authRouter.get('/status', (req, res) => {
  const setupRequired = countUsers() === 0
  if (req.user) {
    const workspace = req.workspace || getWorkspaceForUser(req.user.id)
    return res.json({
      setupRequired: false,
      authenticated: true,
      user: publicUser(req.user),
      workspace: workspace ? workspaceView(workspace, req.user) : null,
      csrfToken: req.auth.csrf_token,
    })
  }
  return res.json({ setupRequired, authenticated: false, allowSignups: config.allowSignups })
})

authRouter.post('/setup', (req, res, next) => {
  try {
    if (countUsers() > 0) return next(fail(403, 'setup_complete', 'This Postique instance is already configured.'))
    const { name, email, password, workspaceName } = req.body || {}
    if (!String(name || '').trim()) return next(fail(400, 'name_required', 'Enter your name.'))
    validateCredentials(email, password)
    const normalisedEmail = normaliseEmail(email)
    if (getUserByEmail(normalisedEmail)) return next(fail(409, 'email_exists', 'An account with this email already exists.'))
    const user = transaction((db) => {
      const id = makeId('usr')
      const createdAt = nowIso()
      db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
        id,
        normalisedEmail,
        String(name).trim().slice(0, 120),
        hashPassword(password),
        createdAt,
      )
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    })
    const workspace = createWorkspace(
      user,
      String(workspaceName || `${String(name).trim().split(' ')[0]}'s workspace`).trim(),
    )
    const session = createSession(user, req, res)
    req.auth = { csrf_token: session.csrf }
    req.workspace = workspace
    return authResponse(req, res, user, session.csrf)
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/login', loginLimiter, (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return next(fail(400, 'credentials_required', 'Enter your email and password.'))
    const user = getUserByEmail(normaliseEmail(email))
    if (!user || !verifyPassword(password, user.password_hash)) {
      return next(fail(401, 'invalid_credentials', 'The email or password is incorrect.'))
    }
    getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id)
    const session = createSession(user, req, res)
    req.auth = { csrf_token: session.csrf }
    return authResponse(req, res, user, session.csrf)
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/logout', requireAuth, requireCsrf, (req, res) => {
  destroySession(req, res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, (req, res) => {
  const workspace = req.workspace || getWorkspaceForUser(req.user.id)
  res.json({
    user: publicUser(req.user),
    workspace: workspace ? workspaceView(workspace, req.user) : null,
    csrfToken: req.auth.csrf_token,
    setupRequired: false,
  })
})

authRouter.patch('/profile', requireAuth, requireCsrf, (req, res, next) => {
  try {
    const { name, password, currentPassword } = req.body || {}
    const db = getDb()
    if (password) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
      if (!verifyPassword(currentPassword || '', user.password_hash)) {
        return next(fail(403, 'current_password_invalid', 'Your current password is incorrect.'))
      }
      validateCredentials(req.user.email, password)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id)
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(req.user.id, req.auth.id)
    }
    if (name && String(name).trim()) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 120), req.user.id)
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    return res.json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})
