import express from 'express'
import { apiCors, authenticateApiKey } from '../lib/api-auth.js'
import { fail } from '../lib/http.js'
import {
  confirmVerification,
  createVerificationRequest,
  getVerification,
} from '../lib/verification.js'

export const verifyApiRouter = express.Router()

function confirmationPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f3f0e8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#20251f">
<main style="max-width:480px;margin:12vh auto;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px;padding:32px">
<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8e9588">Postique verification</div>
<h1 style="font-size:26px;margin:12px 0 8px">${title}</h1>
<p style="font-size:14px;line-height:1.65;color:#687262;margin:0">${message}</p>
</main></body></html>`
}

// The verification link is opened directly by the email recipient. The
// single-use token is the credential; no API key is exposed in the email.
verifyApiRouter.get('/confirm', (req, res) => {
  try {
    const result = confirmVerification(req.query.token, req)
    const destination = new URL(result.redirectUrl)
    destination.searchParams.set('verification_id', result.id)
    destination.searchParams.set('verification', 'success')
    return res.redirect(302, destination.toString())
  } catch (error) {
    const status = error.statusCode || error.status || 400
    res.status(status).type('html').send(confirmationPage('That link did not work', error.message))
  }
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
