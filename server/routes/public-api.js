import fs from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { apiCors, authenticateApiKey, rateLimit } from '../lib/api-auth.js'
import { makeId, normaliseEmail, safeFilename } from '../lib/crypto.js'
import { fail } from '../lib/http.js'
import { createOutboundMessage } from '../lib/messages.js'
import { compileMjml, htmlToText, renderSubject } from '../lib/templates.js'
import { messageView, threadView } from '../lib/presenters.js'
import { createThread } from '../lib/workspace.js'
import { parseAddressList, resolveSendingIdentity } from '../lib/mailer.js'
import {
  assertPublicDailyLimit,
  assertPublicDailyVerifyLimit,
  assertPublicOrigin,
  assertPublicRecipientPolicy,
  assertPublicSendShape,
  assertPublicTemplateAllowed,
  assertPublicVerificationPolicy,
} from '../lib/public-key-policy.js'
import {
  consumeVerificationProof,
  confirmVerificationCode,
  createVerificationRequest,
  getVerificationProof,
  publicVerificationView,
} from '../lib/verification.js'
import { verifyPublicCaptcha } from '../lib/captcha.js'
import {
  addCampaignRecipients,
  campaignAnalytics,
  campaignDetail,
  cancelCampaign,
  createCampaign,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  scheduleCampaign,
  startCampaign,
} from '../lib/campaigns.js'
import { parseCampaignCsv } from '../lib/campaign-csv.js'
import { filterSuppressed } from '../lib/recipient-filter.js'

export const publicApiRouter = express.Router()

publicApiRouter.use(apiCors, authenticateApiKey)

function workspaceId(req) {
  return req.workspaceId
}

function ensureTemplateAllowed(req, slug) {
  assertPublicTemplateAllowed(req.apiKey, slug)
}

function ensureRecipientsAllowed(req, recipients, options) {
  assertPublicRecipientPolicy(req.apiKey, recipients, options)
}

function requirePublicKey(req) {
  if (req.apiKey.kind !== 'public') {
    throw fail(403, 'public_key_required', 'Use a public browser key for this endpoint.')
  }
}

function requireSecret(req) {
  if (req.apiKey.kind !== 'secret') {
    throw fail(
      403,
      'secret_key_required',
      'Use a secret key or the scoped embedded-inbox API for conversation access.',
    )
  }
}

function requirePublicPolicy(req, body) {
  assertPublicOrigin(req.apiKey, req.get('origin'))
  assertPublicSendShape(req.apiKey, body)
  assertPublicDailyLimit(req.apiKey)
}

function requireUnderLimit(wsId) {
  const db = getDb()
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE workspace_id = ? AND direction = 'out' AND created_at >= ?")
    .get(wsId, since).count
  if (count >= config.limits.sendPerHour) {
    throw fail(429, 'workspace_send_limit', 'This workspace has reached its hourly sending limit.')
  }
  const period = new Date().toISOString().slice(0, 7)
  const usage = db
    .prepare('SELECT sends FROM usage_counters WHERE workspace_id = ? AND period = ?')
    .get(wsId, period)
  if ((usage?.sends || 0) >= config.limits.monthlySends) {
    throw fail(429, 'workspace_monthly_limit', 'This workspace has reached its monthly sending limit.')
  }
}

async function saveApiAttachments(wsId, attachments) {
  const saved = []
  if (!Array.isArray(attachments) || attachments.length === 0) return saved
  if (attachments.length > 5) throw fail(400, 'too_many_attachments', 'A message can include at most 5 attachments.')
  let total = 0
  const folder = path.join(config.attachmentsDir, makeId('api', 8))
  await fs.mkdir(folder, { recursive: true })
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment?.content) continue
    const buffer = Buffer.from(String(attachment.content).replace(/^data:[^;]+;base64,/, ''), 'base64')
    total += buffer.length
    if (total > config.limits.maxAttachmentBytes) {
      throw fail(413, 'attachments_too_large', 'Attachments exceed the configured size limit.')
    }
    const filename = safeFilename(attachment.filename || `attachment-${index + 1}`)
    const storagePath = path.join(folder, `${index}-${filename}`)
    await fs.writeFile(storagePath, buffer)
    saved.push({
      filename,
      contentType: attachment.contentType || 'application/octet-stream',
      bytes: buffer.length,
      storagePath,
      contentId: attachment.contentId || null,
    })
  }
  return saved
}

async function prepareContent(req, body) {
  const templateSlug = String(body.template || '').trim()
  if (templateSlug) {
    ensureTemplateAllowed(req, templateSlug)
    const template = getDb()
      .prepare('SELECT t.* FROM templates t WHERE t.workspace_id = ? AND t.slug = ?')
      .get(workspaceId(req), templateSlug)
    if (!template) throw fail(404, 'template_not_found', `Template “${templateSlug}” was not found.`)
    const version = getDb()
      .prepare("SELECT * FROM template_versions WHERE template_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
      .get(template.id)
    if (!version) throw fail(409, 'template_not_published', `Template “${templateSlug}” has no published version.`)
    const variables = body.variables && typeof body.variables === 'object' ? body.variables : {}
    const compiled = await compileMjml(version.mjml, variables)
    return {
      html: compiled.html,
      text: htmlToText(compiled.html),
      subject: renderSubject(req.apiKey.kind === 'public' ? version.subject || '' : body.subject || version.subject || '', variables),
      templateVersionId: version.id,
      templateName: template.name,
    }
  }
  if (req.apiKey.kind === 'public') {
    throw fail(400, 'template_required', 'Public keys must send an approved template.')
  }
  const html = String(body.html || '')
  const text = String(body.text || '')
  if (!html && !text) throw fail(400, 'content_required', 'Provide a template, HTML or text body.')
  return {
    html: html || `<p>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')}</p>`,
    text: text || htmlToText(html),
    subject: String(body.subject || 'No subject'),
    templateVersionId: null,
  }
}

function idempotencyRecord(wsId, key) {
  return getDb()
    .prepare('SELECT * FROM idempotency_keys WHERE workspace_id = ? AND key = ?')
    .get(wsId, key)
}

export function idempotencyLookup(wsId, key, requestHash) {
  if (!key) return null
  const record = idempotencyRecord(wsId, key)
  if (!record) return null
  if (record.request_hash !== requestHash) {
    throw fail(409, 'idempotency_conflict', 'This idempotency key was used with a different request.')
  }
  const response = parseJson(record.response_json, null)
  if (!response || !response.id) {
    throw fail(409, 'idempotency_in_progress', 'A request with this idempotency key is still being processed.')
  }
  return response
}

const RESERVATION_TTL_MS = 2 * 60 * 1000

export function idempotencyReserve(wsId, key, requestHash) {
  if (!key) return { reserved: false, cached: null }
  const db = getDb()
  const insert = () =>
    db
      .prepare(
        `INSERT INTO idempotency_keys (workspace_id, key, request_hash, message_id, response_json, created_at)
         VALUES (?, ?, ?, NULL, '{}', ?)
         ON CONFLICT(workspace_id, key) DO NOTHING`,
      )
      .run(wsId, key, requestHash, nowIso())
  if (insert().changes === 1) return { reserved: true, cached: null }
  // A reservation that never completed (process crashed mid-request) would
  // otherwise block retries until the 24-hour purge. Reclaim it after a short TTL.
  const stale = db
    .prepare(
      `DELETE FROM idempotency_keys
       WHERE workspace_id = ? AND key = ? AND response_json = '{}' AND created_at < ?`,
    )
    .run(wsId, key, new Date(Date.now() - RESERVATION_TTL_MS).toISOString())
  if (stale.changes === 1 && insert().changes === 1) return { reserved: true, cached: null }
  return { reserved: false, cached: idempotencyLookup(wsId, key, requestHash) }
}

export function idempotencyStore(wsId, key, requestHash, message, reserved) {
  if (!key) return
  if (reserved) {
    getDb()
      .prepare(
        `UPDATE idempotency_keys SET message_id = ?, response_json = ?
         WHERE workspace_id = ? AND key = ?`,
      )
      .run(message.id, JSON.stringify(message), wsId, key)
    return
  }
  getDb()
    .prepare(
      `INSERT INTO idempotency_keys (workspace_id, key, request_hash, message_id, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(wsId, key, requestHash, message.id, JSON.stringify(message), nowIso())
}

export function cleanupIdempotencyKeys() {
  return getDb()
    .prepare('DELETE FROM idempotency_keys WHERE created_at < ?')
    .run(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
}

publicApiRouter.post('/send', async (req, res, next) => {
  let idempotencyReservation = null
  let messageCreated = false
  try {
    const body = req.body || {}
    const wsId = workspaceId(req)
    requirePublicPolicy(req, body)
    requireUnderLimit(wsId)
    const idempotencyKey = String(req.get('idempotency-key') || body.idempotency_key || '').slice(0, 200)
    const requestHash = JSON.stringify(body)
    if (idempotencyKey) {
      idempotencyReservation = idempotencyReserve(wsId, idempotencyKey, requestHash)
      if (idempotencyReservation.cached) return res.status(200).json(idempotencyReservation.cached)
    }
    let recipients = parseAddressList(body.to)
    if (!recipients.length) throw fail(400, 'recipient_required', 'At least one valid recipient is required.')
    if (recipients.length > 20) throw fail(400, 'too_many_recipients', 'A message can have at most 20 recipients.')
    const verificationId = String(body.verification_id || '').trim()
    let verificationProof = null
    if (verificationId) {
      assertPublicVerificationPolicy(req.apiKey)
      if (recipients.length !== 1) {
        throw fail(403, 'verification_single_recipient', 'A verification proof can send to exactly one recipient.')
      }
      verificationProof = getVerificationProof({
        workspaceId: wsId,
        id: verificationId,
        email: recipients[0].email,
        apiKeyId: req.apiKey.id,
      })
    }
    ensureRecipientsAllowed(req, recipients, { verificationEmail: verificationProof?.email })
    const filtered = filterSuppressed(wsId, {
      to: recipients,
      cc: parseAddressList(body.cc),
      bcc: parseAddressList(body.bcc),
    })
    recipients = filtered.to
    const cc = filtered.cc
    const bcc = filtered.bcc

    let thread = null
    const externalUserId = body.external_user_id ?? body.end_user_id ?? null
    const normalisedExternalUserId =
      externalUserId === null || externalUserId === undefined ? null : String(externalUserId).trim().slice(0, 200)
    if (externalUserId !== null && externalUserId !== undefined && !normalisedExternalUserId) {
      throw fail(400, 'invalid_external_user_id', 'external_user_id cannot be empty.')
    }
    const requestedThread = String(body.thread_id || '').trim()
    if (requestedThread) {
      thread = getDb().prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?').get(requestedThread, wsId)
      if (!thread) throw fail(404, 'thread_not_found', 'Conversation not found.')
      if (normalisedExternalUserId && thread.embed_user_id && thread.embed_user_id !== normalisedExternalUserId) {
        throw fail(403, 'thread_user_mismatch', 'This conversation belongs to a different application user.')
      }
      if (normalisedExternalUserId && !thread.embed_user_id) {
        if (req.apiKey.kind === 'public') {
          throw fail(403, 'ownership_requires_secret', 'Use a secret key to attach ownership to an existing conversation.')
        }
        getDb().prepare('UPDATE threads SET embed_user_id = ? WHERE id = ?').run(normalisedExternalUserId, thread.id)
        thread = getDb().prepare('SELECT * FROM threads WHERE id = ?').get(thread.id)
      }
    } else if (body.in_reply_to) {
      const reference = String(body.in_reply_to)
      const message = getDb()
        .prepare('SELECT * FROM messages WHERE (message_id = ? OR id = ?) AND workspace_id = ?')
        .get(reference, reference, wsId)
      if (message?.thread_id) {
        thread = getDb().prepare('SELECT * FROM threads WHERE id = ?').get(message.thread_id)
      }
    }

    const content = await prepareContent(req, body)
    const sender = req.apiKey.kind === 'public' ? req.apiKey.sender_identity_email || null : body.from || null
    let identity
    try {
      identity = resolveSendingIdentity(wsId, sender)
    } catch (error) {
      throw fail(400, 'invalid_sender', error.message)
    }
    let threadId = thread?.id || null
    if (!thread) {
      thread = createThread({
        workspaceId: wsId,
        subject: String(content.subject || body.subject || 'No subject').slice(0, 500),
        customerName: recipients[0].name,
        customerEmail: recipients[0].email,
        matched: true,
        unread: false,
        orderRef: body.order_ref || null,
        embedUserId: normalisedExternalUserId,
      })
      threadId = thread.id
    }
    const attachments = await saveApiAttachments(wsId, req.apiKey.kind === 'public' ? [] : body.attachments)
    if (verificationProof) {
      consumeVerificationProof({
        workspaceId: wsId,
        id: verificationProof.id,
        email: recipients[0].email,
        apiKeyId: req.apiKey.id,
      })
    }
    const message = createOutboundMessage({
      workspaceId: wsId,
      threadId,
      from: { name: identity.from.name, email: identity.from.email },
      to: recipients,
      cc,
      bcc,
      subject: thread.subject || content.subject,
      html: content.html,
      text: content.text,
      templateVersionId: content.templateVersionId,
      apiKeyId: req.apiKey.id,
      authorType: 'api',
      attachments,
      verificationId: verificationProof?.id || null,
    })
    messageCreated = true
    const response = {
      id: message.id,
      thread_id: threadId,
      status: message.status,
      message_id: message.message_id,
    }
    idempotencyStore(wsId, idempotencyKey, requestHash, response, idempotencyReservation?.reserved)
    res.status(202).json(response)
  } catch (error) {
    if (idempotencyReservation?.reserved && !messageCreated) {
      getDb()
        .prepare('DELETE FROM idempotency_keys WHERE workspace_id = ? AND key = ? AND message_id IS NULL')
        .run(req.workspaceId, String(req.get('idempotency-key') || req.body?.idempotency_key || '').slice(0, 200))
    }
    next(error)
  }
})

publicApiRouter.get('/messages/:id', (req, res, next) => {
  try {
    requireSecret(req)
    const message = getDb()
      .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
      .get(req.params.id, workspaceId(req))
    if (!message) return next(fail(404, 'message_not_found', 'Message not found.'))
    res.json({ message: messageView(message) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.get('/threads', (req, res, next) => {
  try {
    requireSecret(req)
    const q = String(req.query.q || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim()
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
    const rows = getDb()
      .prepare(
        `SELECT * FROM threads WHERE workspace_id = ?
         ${status ? 'AND status = ?' : ''}
         ORDER BY last_activity_at DESC LIMIT ?`,
      )
      .all(workspaceId(req), ...(status ? [status] : []), limit)
    const threads = rows
      .map((thread) => threadView(thread))
      .filter((thread) => !q || `${thread.subject} ${thread.customer.name} ${thread.customer.email}`.toLowerCase().includes(q))
    res.json({ threads })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.patch('/threads/:id', (req, res, next) => {
  try {
    requireSecret(req)
    const wsId = workspaceId(req)
    const thread = getDb()
      .prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?')
      .get(req.params.id, wsId)
    if (!thread) throw fail(404, 'thread_not_found', 'Conversation not found.')
    const provided = Object.hasOwn(req.body || {}, 'external_user_id')
    if (!provided) throw fail(400, 'external_user_id_required', 'Provide external_user_id (or null).')
    const raw = req.body.external_user_id
    const externalUserId = raw === null || raw === '' ? null : String(raw).trim().slice(0, 200)
    if (raw !== null && raw !== '' && !externalUserId) {
      throw fail(400, 'invalid_external_user_id', 'external_user_id cannot be empty.')
    }
    getDb().prepare('UPDATE threads SET embed_user_id = ? WHERE id = ?').run(externalUserId, thread.id)
    res.json({ thread: threadView(getDb().prepare('SELECT * FROM threads WHERE id = ?').get(thread.id)) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.get('/threads/:id', (req, res, next) => {
  try {
    requireSecret(req)
    const thread = getDb().prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!thread) return next(fail(404, 'thread_not_found', 'Conversation not found.'))
    res.json({ thread: threadView(thread) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/threads/:id/reply', async (req, res, next) => {
  try {
    requireSecret(req)
    const wsId = workspaceId(req)
    const thread = getDb().prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?').get(req.params.id, wsId)
    if (!thread) throw fail(404, 'thread_not_found', 'Conversation not found.')
    const blocked = getDb()
      .prepare('SELECT 1 FROM suppressions WHERE workspace_id = ? AND email = ?')
      .get(wsId, normaliseEmail(thread.customer_email))
    if (blocked) throw fail(422, 'suppressed_recipient', 'This recipient is suppressed.')
    const body = req.body || {}
    const content = await prepareContent(req, { ...body, thread_id: thread.id })
    const identity = resolveSendingIdentity(wsId, body.from || null)
    const message = createOutboundMessage({
      workspaceId: wsId,
      threadId: thread.id,
      from: { name: identity.from.name, email: identity.from.email },
      to: [{ name: thread.customer_name, email: thread.customer_email }],
      subject: `Re: ${String(thread.subject || '').replace(/^(\s*re\s*:\s*)+/i, '').trim()}`,
      html: content.html,
      text: content.text,
      templateVersionId: content.templateVersionId,
      apiKeyId: req.apiKey.id,
      authorType: 'api',
    })
    res.status(202).json({
      id: message.id,
      thread_id: thread.id,
      status: message.status,
      message_id: message.message_id,
    })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/verifications', async (req, res, next) => {
  try {
    requirePublicKey(req)
    assertPublicOrigin(req.apiKey, req.get('origin'))
    assertPublicVerificationPolicy(req.apiKey)
    assertPublicDailyVerifyLimit(req.apiKey)
    rateLimit(req.apiKey, req, config.limits.publicVerifyPerHour, 60 * 60 * 1000, 'verify-ip')
    await verifyPublicCaptcha(req.body?.captcha_token, req.ip)
    const result = await createVerificationRequest({
      workspaceId: workspaceId(req),
      email: req.body?.email,
      name: req.body?.name,
      template: req.apiKey.verification_template || '',
      redirectUrl: req.body?.redirect_url,
      metadata: req.body?.metadata,
      apiKeyId: req.apiKey.id,
      allowedRedirectOrigins: parseJson(req.apiKey.allowed_origins_json, []),
      req,
    })
    res.status(202).json({
      verification: {
        id: result.id,
        email: result.email,
        status: result.status,
        expires_at: result.expiresAt,
      },
      browser_token: result.browserToken,
      debug: result.debug || null,
    })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.get('/verifications/:id', (req, res, next) => {
  try {
    requirePublicKey(req)
    assertPublicOrigin(req.apiKey, req.get('origin'))
    const browserToken = req.get('x-postique-browser-token') || String(req.query.browser_token || '')
    res.json({
      verification: publicVerificationView({
        workspaceId: workspaceId(req),
        id: req.params.id,
        apiKeyId: req.apiKey.id,
        browserToken,
      }),
    })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/verifications/:id/confirm-code', (req, res, next) => {
  try {
    requirePublicKey(req)
    assertPublicOrigin(req.apiKey, req.get('origin'))
    const browserToken = req.get('x-postique-browser-token') || String(req.body?.browser_token || '')
    const result = confirmVerificationCode({
      workspaceId: workspaceId(req),
      id: req.params.id,
      apiKeyId: req.apiKey.id,
      browserToken,
      code: req.body?.code,
      req,
    })
    const view = publicVerificationView({
      workspaceId: workspaceId(req),
      id: req.params.id,
      apiKeyId: req.apiKey.id,
      browserToken,
    })
    res.json({ verification: view, redirect_url: result.redirectUrl })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/templates/:slug/render', async (req, res, next) => {
  try {
    assertPublicTemplateAllowed(req.apiKey, req.params.slug)
    const template = getDb()
      .prepare('SELECT * FROM templates WHERE workspace_id = ? AND slug = ?')
      .get(workspaceId(req), req.params.slug)
    if (!template) return next(fail(404, 'template_not_found', 'Template not found.'))
    const version = getDb()
      .prepare("SELECT * FROM template_versions WHERE template_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
      .get(template.id)
    if (!version) return next(fail(409, 'template_not_published', 'Template has no published version.'))
    const variables = req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {}
    const compiled = await compileMjml(version.mjml, variables)
    res.json({
      html: compiled.html,
      text: htmlToText(compiled.html),
      subject: renderSubject(version.subject, variables),
      template: { id: template.id, slug: template.slug, name: template.name, version: version.version },
    })
  } catch (error) {
    next(error)
  }
})

/* BYOA campaign API for developer backends (secret key required). */
publicApiRouter.get('/campaigns', (req, res, next) => {
  try {
    requireSecret(req)
    res.json({ campaigns: listCampaigns(workspaceId(req), req.query.limit) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns', (req, res, next) => {
  try {
    requireSecret(req)
    const result = createCampaign({
      workspaceId: workspaceId(req),
      name: req.body?.name,
      template: req.body?.template,
      fromEmail: req.body?.from_email,
      fromName: req.body?.from_name,
      subject: req.body?.subject,
      options: req.body?.options,
      recipients: Array.isArray(req.body?.recipients) ? req.body.recipients : [],
      scheduledAt: req.body?.scheduled_at,
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

publicApiRouter.get('/campaigns/:id', (req, res, next) => {
  try {
    requireSecret(req)
    res.json(campaignDetail(workspaceId(req), req.params.id))
  } catch (error) {
    next(error)
  }
})

publicApiRouter.get('/campaigns/:id/analytics', (req, res, next) => {
  try {
    requireSecret(req)
    res.json(campaignAnalytics(workspaceId(req), req.params.id))
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/recipients', (req, res, next) => {
  try {
    requireSecret(req)
    res.status(201).json(
      addCampaignRecipients({
        workspaceId: workspaceId(req),
        campaignId: req.params.id,
        recipients: req.body?.recipients,
      }),
    )
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/recipients/csv', (req, res, next) => {
  try {
    requireSecret(req)
    const recipients = parseCampaignCsv(req.body?.csv)
    if (!recipients.length) throw fail(400, 'csv_empty', 'No recipient rows were found in the CSV.')
    res.status(201).json(
      addCampaignRecipients({
        workspaceId: workspaceId(req),
        campaignId: req.params.id,
        recipients,
      }),
    )
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/start', (req, res, next) => {
  try {
    requireSecret(req)
    res.status(202).json({ campaign: startCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/schedule', (req, res, next) => {
  try {
    requireSecret(req)
    res.json({ campaign: scheduleCampaign(workspaceId(req), req.params.id, req.body?.scheduled_at) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/pause', (req, res, next) => {
  try {
    requireSecret(req)
    res.json({ campaign: pauseCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/resume', (req, res, next) => {
  try {
    requireSecret(req)
    res.json({ campaign: resumeCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.post('/campaigns/:id/cancel', (req, res, next) => {
  try {
    requireSecret(req)
    res.json({ campaign: cancelCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

publicApiRouter.get('/me', (req, res) => {
  res.json({
    workspace: { id: req.workspace.id, name: req.workspace.name, slug: req.workspace.slug },
    key: { id: req.apiKey.id, kind: req.apiKey.kind, name: req.apiKey.name },
  })
})
