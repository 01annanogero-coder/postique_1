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
  addCampaignRecipients,
  campaignDetail,
  cancelCampaign,
  createCampaign,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  scheduleCampaign,
  startCampaign,
} from '../lib/campaigns.js'

export const publicApiRouter = express.Router()

publicApiRouter.use(apiCors, authenticateApiKey)

function workspaceId(req) {
  return req.workspaceId
}

function ensureTemplateAllowed(req, slug) {
  if (req.apiKey.kind !== 'public') return
  const allowed = parseJson(req.apiKey.allowed_templates_json, [])
  if (allowed.length === 0) {
    throw fail(403, 'template_not_allowed', 'This public key has no approved templates yet.')
  }
  if (!allowed.includes(slug)) {
    throw fail(403, 'template_not_allowed', 'This public key is not allowed to send that template.')
  }
  if (!slug) throw fail(400, 'template_required', 'Public keys must send an approved template.')
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

function ensureRecipientsAllowed(req, recipients) {
  if (req.apiKey.kind !== 'public') return
  const allowed = parseJson(req.apiKey.allowed_recipients_json, [])
  if (!allowed.length) return
  for (const recipient of recipients) {
    if (!allowed.includes(recipient.email)) {
      throw fail(403, 'recipient_not_allowed', `This public key cannot send to ${recipient.email}.`)
    }
  }
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
      subject: renderSubject(body.subject || version.subject || '', variables),
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

function idempotencyCheck(wsId, key, requestHash) {
  if (!key) return null
  const record = getDb()
    .prepare('SELECT * FROM idempotency_keys WHERE workspace_id = ? AND key = ?')
    .get(wsId, key)
  if (!record) return null
  if (record.request_hash !== requestHash) {
    throw fail(409, 'idempotency_conflict', 'This idempotency key was used with a different request.')
  }
  return parseJson(record.response_json, null)
}

function idempotencyStore(wsId, key, requestHash, message) {
  if (!key) return
  getDb()
    .prepare(
      `INSERT INTO idempotency_keys (workspace_id, key, request_hash, message_id, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(wsId, key, requestHash, message.id, JSON.stringify(message), nowIso())
}

publicApiRouter.post('/send', async (req, res, next) => {
  try {
    const body = req.body || {}
    const wsId = workspaceId(req)
    requireUnderLimit(wsId)
    const idempotencyKey = String(req.get('idempotency-key') || body.idempotency_key || '').slice(0, 200)
    const requestHash = JSON.stringify(body)
    if (idempotencyKey) {
      const existing = idempotencyCheck(wsId, idempotencyKey, requestHash)
      if (existing) return res.status(200).json(existing)
    }
    const recipients = parseAddressList(body.to)
    if (!recipients.length) throw fail(400, 'recipient_required', 'At least one valid recipient is required.')
    if (recipients.length > 20) throw fail(400, 'too_many_recipients', 'A message can have at most 20 recipients.')
    ensureRecipientsAllowed(req, recipients)
    const cc = parseAddressList(body.cc)
    const bcc = parseAddressList(body.bcc)
    const suppressed = getDb()
      .prepare(
        `SELECT email FROM suppressions WHERE workspace_id = ? AND email IN (${recipients.map(() => '?').join(',')})`,
      )
      .all(wsId, ...recipients.map((item) => item.email))
    if (suppressed.length) {
      const emails = suppressed.map((item) => item.email)
      if (emails.length === recipients.length) {
        throw fail(422, 'suppressed_recipient', 'All recipients are suppressed.')
      }
    }

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
    const sender = body.from || null
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
    })
    const response = {
      id: message.id,
      thread_id: threadId,
      status: message.status,
      message_id: message.message_id,
    }
    idempotencyStore(wsId, idempotencyKey, requestHash, response)
    res.status(202).json(response)
  } catch (error) {
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

publicApiRouter.post('/templates/:slug/render', async (req, res, next) => {
  try {
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
