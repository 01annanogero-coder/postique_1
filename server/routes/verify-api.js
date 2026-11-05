import express from 'express'
import { apiCors, authenticateApiKey } from '../lib/api-auth.js'
import { fail } from '../lib/http.js'
import { verificationJwks } from '../lib/verification-proof.js'
import {
  confirmVerification,
  consumeVerificationProofToken,
  createVerificationRequest,
  getVerification,
  lookupVerification,
} from '../lib/verification.js'

export const verifyApiRouter = express.Router()

function escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function confirmationPage(title, message, { token = '', action = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;background:#f3f0e8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#20251f">
<main style="max-width:480px;margin:12vh auto;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px;padding:32px">
<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8e9588">Postique verification</div>
<h1 style="font-size:26px;margin:12px 0 8px">${escape(title)}</h1>
<p style="font-size:14px;line-height:1.65;color:#687262;margin:0">${escape(message)}</p>
${action ? `<form method="post" action="${escape(action)}" style="margin-top:24px"><input type="hidden" name="token" value="${escape(token)}"><button type="submit" style="border:0;border-radius:7px;padding:12px 18px;background:#171b17;color:#fff;font:inherit;font-weight:700;cursor:pointer">Confirm email</button></form>` : ''}
</main></body></html>`
}

// Link scanners follow GET requests. This page deliberately does not verify;
// the POST submitted by the human does.
verifyApiRouter.get('/confirm', (req, res) => {
  try {
    const verification = lookupVerification(req.query.token)
    res.setHeader('Cache-Control', 'no-store')
    if (verification.status === 'verified') {
      return res.type('html').send(confirmationPage('Email already confirmed', 'This address has already been verified. You can return to the site that sent you here.'))
    }
    return res.type('html').send(
      confirmationPage('Confirm your email', 'Click the button below to confirm that you own this address.', {
        token: req.query.token,
        action: '/verify/v1/confirm',
      }),
    )
  } catch (error) {
    return res.status(error.status || 400).type('html').send(confirmationPage('That link did not work', error.message))
  }
})

function redirectPage(destination) {
  const safe = escape(destination)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safe}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verified</title></head><body style="margin:0;background:#f3f0e8;font-family:system-ui,sans-serif;color:#20251f"><main style="max-width:480px;margin:12vh auto;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px;padding:32px"><h1 style="font-size:24px;margin:0 0 8px">Email confirmed</h1><p style="font-size:14px;line-height:1.6;color:#687262">Returning you to the application…</p><p><a href="${safe}" style="color:#40553a">Continue</a></p></main></body></html>`
}

verifyApiRouter.post('/confirm', (req, res) => {
  try {
    const result = confirmVerification(req.body?.token, req)
    const destination = new URL(result.redirectUrl)
    destination.searchParams.set('verification_id', result.id)
    destination.searchParams.set('verification', 'success')
    res.setHeader('Cache-Control', 'no-store')
    return res.type('html').send(redirectPage(destination.toString()))
  } catch (error) {
    const status = error.statusCode || error.status || 400
    return res.status(status).type('html').send(confirmationPage('That link did not work', error.message))
  }
})

verifyApiRouter.get('/jwks.json', (_req, res) => {
  res.setHeader('cache-control', 'public, max-age=300')
  res.json(verificationJwks())
})

verifyApiRouter.use(apiCors, authenticateApiKey)

verifyApiRouter.post('/requests', async (req, res, next) => {
  try {
    if (req.apiKey.kind !== 'secret') {
      return next(fail(403, 'secret_key_required', 'Create verification requests with a secret API key.'))
    }
    const result = await createVerificationRequest({
      workspaceId: req.workspaceId,
      email: req.body?.email,
      name: req.body?.name,
      template: req.body?.template,
      redirectUrl: req.body?.redirect_url,
      metadata: req.body?.metadata,
      fromEmail: req.body?.from_email,
      subject: req.body?.subject,
      req,
    })
    return res.status(202).json({
      verification: {
        id: result.id,
        status: result.status,
        email: result.email,
        expires_at: result.expiresAt,
      },
      debug: result.debug || undefined,
    })
  } catch (error) {
    return next(error)
  }
})

verifyApiRouter.get('/requests/:id', (req, res, next) => {
  try {
    res.json({ verification: getVerification(req.workspaceId, req.params.id) })
  } catch (error) {
    next(error)
  }
})

verifyApiRouter.post('/proofs/consume', (req, res, next) => {
  try {
    if (req.apiKey.kind !== 'secret') {
      return next(fail(403, 'secret_key_required', 'Consume verification proofs with a secret API key.'))
    }
    res.json(consumeVerificationProofToken({ workspaceId: req.workspaceId, proof: req.body?.proof }))
  } catch (error) {
    next(error)
  }
})
