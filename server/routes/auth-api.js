import express from 'express'
import { config } from '../config.js'
import { parseJson } from '../db/index.js'
import {
  getAppUserFromAccessToken,
  refreshSession,
  requestAuthLink,
  revokeSession,
  sessionUserFromAccessToken,
  signInWithPassword,
  signUp,
  updateSessionUser,
  verifyAuthToken,
  consumeAuthTokenByRaw,
  lookupAuthToken,
  appUserView,
} from '../lib/app-auth.js'
import { apiCors, authenticateApiKey, rateLimit } from '../lib/api-auth.js'
import { fail } from '../lib/http.js'
import { authSettings } from '../lib/workspace.js'
import { assertPublicAuthRecipient, assertPublicOrigin } from '../lib/public-key-policy.js'
import { verifyPublicCaptcha } from '../lib/captcha.js'
import { logger } from '../lib/logger.js'

export const authApiRouter = express.Router()

function bearer(req) {
  const header = req.get('authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function allowedOrigins(req) {
  return parseJson(req.apiKey?.allowed_origins_json, [])
}

async function publicAuthGuard(req, email) {
  if (req.apiKey.kind !== 'public') return
  if (!req.apiKey.allow_auth) throw fail(403, 'auth_not_enabled', 'Application auth is not enabled on this public key.')
  assertPublicOrigin(req.apiKey, req.get('origin'))
  assertPublicAuthRecipient(req.apiKey, email)
  rateLimit(req.apiKey, req, config.limits.publicAuthPerDay, 24 * 60 * 60 * 1000, 'auth-day')
  // The per-IP bucket above is not enough alone: rotating IPs would sidestep it.
  rateLimit(req.apiKey, req, config.limits.publicAuthKeyPerDay, 24 * 60 * 60 * 1000, 'auth-day-key')
  await verifyPublicCaptcha(req.body?.captcha_token, req.ip)
}

function escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function confirmPage(title, message, token = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;background:#f3f0e8;font-family:system-ui,sans-serif;color:#20251f"><main style="max-width:480px;margin:12vh auto;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px;padding:32px"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8e9588">Postique</div><h1 style="font-size:26px;margin:12px 0 8px">${escape(title)}</h1><p style="font-size:14px;line-height:1.65;color:#687262;margin:0">${escape(message)}</p>${token ? `<form method="post" action="/auth/v1/verify/confirm" style="margin-top:24px"><input type="hidden" name="token" value="${escape(token)}"><button type="submit" style="border:0;border-radius:7px;padding:12px 18px;background:#171b17;color:#fff;font:inherit;font-weight:700;cursor:pointer">Sign in</button></form>` : ''}</main></body></html>`
}

function redirectPage(destination) {
  const safe = escape(destination)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safe}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signed in</title></head><body style="margin:0;background:#f3f0e8;font-family:system-ui,sans-serif;color:#20251f"><main style="max-width:480px;margin:12vh auto;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px;padding:32px"><h1 style="font-size:24px;margin:0 0 8px">Signed in</h1><p style="font-size:14px;line-height:1.6;color:#687262">Returning you to the application…</p><p><a href="${safe}" style="color:#40553a">Continue</a></p></main></body></html>`
}

// Magic links are opened by mail clients and link scanners. GET only renders a
// page; the human click submits the POST that consumes the single-use token.
authApiRouter.get('/verify', apiCors, (req, res) => {
  try {
    lookupAuthToken(req.query.token)
    res.setHeader('Cache-Control', 'no-store')
    return res.type('html').send(
      confirmPage('Sign in to Postique', 'Click the button below to finish signing in.', req.query.token),
    )
  } catch (error) {
    return res.status(error.status || 400).type('html').send(confirmPage('That link did not work', error.message))
  }
})

authApiRouter.post('/verify/confirm', apiCors, (req, res, next) => {
  try {
    const result = consumeAuthTokenByRaw({ token: req.body?.token, req })
    const destination = new URL(result.redirectTo || config.appUrl)
    const params = new URLSearchParams({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      token_type: result.session.token_type,
      expires_in: String(result.session.expires_in),
      type: result.type || 'magiclink',
    })
    destination.hash = params.toString()
    res.setHeader('Cache-Control', 'no-store')
    return res.type('html').send(redirectPage(destination.toString()))
  } catch (error) {
    return next(error)
  }
})

authApiRouter.use(apiCors, authenticateApiKey)

authApiRouter.get('/settings', (req, res) => {
  const settings = authSettings(req.workspaceId)
  res.json({
    workspace: {
      id: req.workspace.id,
      name: req.workspace.name,
      slug: req.workspace.slug,
    },
    auth: {
      signupsEnabled: settings.signupsEnabled,
      passwordEnabled: settings.passwordEnabled,
      magicLinkEnabled: settings.magicLinkEnabled,
      requireEmailVerification: settings.requireEmailVerification,
    },
    endpoints: {
      signup: '/auth/v1/signup',
      token: '/auth/v1/token',
      verify: '/auth/v1/verify',
      recover: '/auth/v1/recover',
      user: '/auth/v1/user',
    },
  })
})

authApiRouter.post('/signup', async (req, res, next) => {
  try {
    if (!req.body?.password) {
      return next(fail(400, 'password_required', 'A password is required for signup. Use /auth/v1/otp for magic-link signup.'))
    }
    await publicAuthGuard(req, req.body.email)
    const result = await signUp({
      workspaceId: req.workspaceId,
      email: req.body.email,
      password: req.body.password,
      name: req.body.name || req.body.data?.name,
      metadata: req.body.data || req.body.metadata,
      redirectTo: req.body.redirect_to,
      allowedOrigins: allowedOrigins(req),
      req,
    })
    return res.status(201).json({
      user: result.user,
      session: result.session,
    })
  } catch (error) {
    return next(error)
  }
})

authApiRouter.post('/token', (req, res, next) => {
  try {
    const grantType = String(req.query.grant_type || req.body?.grant_type || '').toLowerCase()
    if (grantType === 'password') {
      const session = signInWithPassword({
        workspaceId: req.workspaceId,
        email: req.body.email,
        password: req.body.password,
        req,
      })
      return res.json(session)
    }
    if (grantType === 'refresh_token') {
      const session = refreshSession({
        refreshToken: req.body.refresh_token,
        workspaceId: req.workspaceId,
        req,
      })
      return res.json(session)
    }
    return next(fail(400, 'unsupported_grant_type', 'Use grant_type=password or grant_type=refresh_token.'))
  } catch (error) {
    return next(error)
  }
})

authApiRouter.post('/refresh', (req, res, next) => {
  try {
    return res.json(refreshSession({ refreshToken: req.body?.refresh_token, workspaceId: req.workspaceId, req }))
  } catch (error) {
    return next(error)
  }
})

authApiRouter.post('/logout', (req, res, next) => {
  try {
    revokeSession({
      accessToken: bearer(req),
      refreshToken: req.body?.refresh_token,
      workspaceId: req.workspaceId,
    })
    return res.status(204).end()
  } catch (error) {
    return next(error)
  }
})

authApiRouter.get('/user', (req, res, next) => {
  try {
    const user = getAppUserFromAccessToken(req.workspaceId, bearer(req))
    return res.json({ user })
  } catch (error) {
    return next(error)
  }
})

authApiRouter.put('/user', (req, res, next) => {
  try {
    const user = updateSessionUser({
      workspaceId: req.workspaceId,
      accessToken: bearer(req),
      patch: {
        currentPassword: req.body?.current_password,
        password: req.body?.password,
        name: req.body?.name,
        metadata: req.body?.data ?? req.body?.metadata,
      },
    })
    return res.json({ user })
  } catch (error) {
    return next(error)
  }
})

async function sendLink(req, res, next, purpose) {
  try {
    await publicAuthGuard(req, req.body?.email)
    const delivery = requestAuthLink({
      workspaceId: req.workspaceId,
      email: req.body?.email,
      purpose,
      redirectTo: req.body?.redirect_to,
      allowedOrigins: allowedOrigins(req),
      createUser: req.body?.create_user !== false,
      req,
    })
    // In production the response must not reveal whether an account exists or
    // wait on SMTP. The delivery promise is logged and the client gets the same
    // generic response either way.
    if (!config.auth.debugLinks) {
      delivery.catch((error) => logger.warn({ error: error.message }, 'Auth link delivery failed'))
      return res.status(202).json({
        message: 'If that email can sign in, a magic link and one-time code have been sent.',
      })
    }
    const result = await delivery
    if (result.debug) {
      return res.status(202).json({
        message: 'Authentication link generated.',
        debug: result.debug,
      })
    }
    return res.status(202).json({
      message: 'If that email can sign in, a magic link and one-time code have been sent.',
    })
  } catch (error) {
    return next(error)
  }
}

authApiRouter.post('/otp', (req, res, next) => sendLink(req, res, next, 'magiclink'))
authApiRouter.post('/magiclink', (req, res, next) => sendLink(req, res, next, 'magiclink'))
authApiRouter.post('/recover', (req, res, next) => sendLink(req, res, next, 'recovery'))

authApiRouter.post('/verify', (req, res, next) => {
  try {
    if (req.apiKey.kind === 'public') {
      if (!req.apiKey.allow_auth) return next(fail(403, 'auth_not_enabled', 'Application auth is not enabled on this public key.'))
      assertPublicOrigin(req.apiKey, req.get('origin'))
    }
    const result = verifyAuthToken({
      workspaceId: req.workspaceId,
      token: req.body?.token || req.body?.code,
      email: req.body?.email,
      purpose: req.body?.type,
      req,
    })
    return res.json({
      user: result.user,
      session: result.session,
      type: result.type || req.body?.type || 'magiclink',
    })
  } catch (error) {
    return next(error)
  }
})

authApiRouter.get('/session', (req, res, next) => {
  try {
    const { user, session, payload } = sessionUserFromAccessToken(req.workspaceId, bearer(req))
    return res.json({
      user: appUserView(user),
      session: {
        id: session.id,
        method: session.method,
        expiresAt: session.expires_at,
        issuedAt: payload.iat,
      },
    })
  } catch (error) {
    return next(error)
  }
})
