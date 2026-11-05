import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import { config } from '../config.js'
import { getDb, getWorkspaceSetting, nowIso, parseJson, setWorkspaceSetting } from '../db/index.js'
import { bootstrap } from '../lib/bootstrap.js'
import {
  encryptSecret,
  generateApiKey,
  hashApiKey,
  keyPrefix,
  makeId,
  normaliseEmail,
  randomToken,
} from '../lib/crypto.js'
import { addDomain, addIdentity, removeDomain, removeIdentity, updateDomainRoute, verifyDomain } from '../lib/domains.js'
import { fail } from '../lib/http.js'
import { createOutboundMessage } from '../lib/messages.js'
import { analyseFaqs } from '../lib/automation.js'
import { compileMjml, htmlToText, normaliseVariables, renderSubject, slugify, templateView } from '../lib/templates.js'
import { assetView, domainView, faqView, keyView, relativeTime, threadView, webhookView } from '../lib/presenters.js'
import { automationSettings, authSettings, updateAuthSettings, updateAutomationSettings, workspaceView } from '../lib/workspace.js'
import {
  appAuthStats,
  deleteAppUser,
  listAppUsers,
  sendMagicLinkForUser,
  setAppUserDisabled,
} from '../lib/app-auth.js'
import { enqueueWebhookDelivery } from '../lib/webhooks.js'
import { cancelQueueJob, queueOverview, retryQueueJob } from '../lib/queue-admin.js'
import { parseCampaignCsv } from '../lib/campaign-csv.js'
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
import { createVerificationRequest, listVerifications } from '../lib/verification.js'
import { requireAuth, requireCsrf, requireWorkspace, publicUser } from '../lib/auth.js'

export const dashboardRouter = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxAssetBytes, files: 1 },
})

dashboardRouter.use(requireAuth, requireWorkspace, requireCsrf)

function db() {
  return getDb()
}

function workspaceId(req) {
  return req.workspace.id
}

function threadOr404(req) {
  const thread = db().prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
  if (!thread) throw fail(404, 'thread_not_found', 'Conversation not found.')
  return thread
}

function firstIdentity(wsId) {
  const identity = db()
    .prepare('SELECT * FROM identities WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(wsId)
  if (!identity) {
    throw fail(400, 'sender_required', 'Add and verify a sending domain before sending email.')
  }
  return identity
}

function templateWithVersions(wsId, id) {
  const template = db().prepare('SELECT * FROM templates WHERE id = ? AND workspace_id = ?').get(id, wsId)
  if (!template) throw fail(404, 'template_not_found', 'Template not found.')
  const versions = db().prepare('SELECT * FROM template_versions WHERE template_id = ?').all(template.id)
  const view = templateView(template, versions)
  return { template, versions, view: { ...view, updated: relativeTime(template.updated_at) } }
}

function messageHtmlFromText(text) {
  const escaped = String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  const paragraphs = escaped.split(/\n\s*\n/).map((part) => `<p>${part.replaceAll('\n', '<br>')}</p>`).join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#20251f;line-height:1.65;font-size:15px">${paragraphs || '<p></p>'}</div>`
}

function defaultMjml() {
  return `<mjml>
  <mj-head>
    <mj-title>{{subject}}</mj-title>
    <mj-preview>Write a short preview line.</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica Neue, Helvetica, Arial, sans-serif" />
      <mj-text color="#171B17" font-size="15px" line-height="1.7" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#EFEBE1" width="600px">
    <mj-section background-color="#FFFFFF" padding="44px 40px">
      <mj-column>
        <mj-text font-size="34px" font-weight="800">Hello {{name}}.</mj-text>
        <mj-text>This is your new Postique template.</mj-text>
        <mj-button href="{{cta_url}}" background-color="#131713" color="#F7F4EB">Open the app</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}

dashboardRouter.get('/bootstrap', (req, res) => {
  res.json(bootstrap(req.workspace, req.user))
})

dashboardRouter.get('/system', (req, res) => {
  const ws = workspaceId(req)
  const dbc = db()
  res.json({
    appUrl: config.appUrl,
    inboundDomain: config.inbound.domain,
    inboundPort: config.inbound.port,
    mailTransport: config.mail.transport,
    smtpConfigured: Boolean(config.mail.smtpUrl),
    allowManualVerification: config.dns.allowManualVerification,
    sendLimit: config.limits.sendPerHour,
    maxAttachmentBytes: config.limits.maxAttachmentBytes,
    user: publicUser(req.user),
    workspace: workspaceView(req.workspace, req.user),
    counts: {
      users: dbc.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      threads: dbc.prepare('SELECT COUNT(*) AS count FROM threads WHERE workspace_id = ?').get(ws).count,
      messages: dbc.prepare('SELECT COUNT(*) AS count FROM messages WHERE workspace_id = ?').get(ws).count,
    },
  })
})

dashboardRouter.patch('/workspace', (req, res, next) => {
  try {
    const { name, settings } = req.body || {}
    if (name !== undefined && !String(name || '').trim()) {
      return next(fail(400, 'name_required', 'Enter a workspace name.'))
    }
    if (name !== undefined) {
      db().prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 120), workspaceId(req))
    }
    if (settings && typeof settings === 'object') {
      setWorkspaceSetting(workspaceId(req), 'ui', settings)
    }
    const workspace = db().prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId(req))
    req.workspace = workspace
    res.json({ workspace: workspaceView(workspace, req.user) })
  } catch (error) {
    next(error)
  }
})

/* Application end-user authentication */
dashboardRouter.get('/app-auth', (req, res, next) => {
  try {
    const ws = workspaceId(req)
    res.json({
      settings: authSettings(ws),
      metrics: appAuthStats(ws),
      users: listAppUsers(ws, { search: req.query.search, limit: req.query.limit }),
    })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/app-auth/settings', (req, res, next) => {
  try {
    const keys = ['signupsEnabled', 'passwordEnabled', 'magicLinkEnabled', 'requireEmailVerification']
    const patch = {}
    for (const key of keys) {
      if (typeof req.body?.[key] === 'boolean') patch[key] = req.body[key]
    }
    if (!Object.keys(patch).length) {
      return next(fail(400, 'empty_patch', 'Provide at least one authentication setting.'))
    }
    const settings = updateAuthSettings(workspaceId(req), patch)
    res.json({ settings })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.get('/app-auth/users', (req, res, next) => {
  try {
    const ws = workspaceId(req)
    res.json({
      users: listAppUsers(ws, { search: req.query.search, limit: req.query.limit }),
      metrics: appAuthStats(ws),
    })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/app-auth/users/:id/magic-link', async (req, res, next) => {
  try {
    const result = await sendMagicLinkForUser({
      workspaceId: workspaceId(req),
      userId: req.params.id,
      purpose: req.body?.purpose === 'recovery' ? 'recovery' : 'magiclink',
      redirectTo: req.body?.redirectTo || config.appUrl,
    })
    res.status(202).json({
      sent: result.delivered,
      expiresAt: result.expiresAt,
      debug: result.debug || null,
    })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/app-auth/users/:id', (req, res, next) => {
  try {
    if (typeof req.body?.disabled !== 'boolean') {
      return next(fail(400, 'invalid_user_update', 'Provide disabled: true or disabled: false.'))
    }
    const user = setAppUserDisabled(workspaceId(req), req.params.id, req.body.disabled)
    res.json({ user })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/app-auth/users/:id', (req, res, next) => {
  try {
    deleteAppUser(workspaceId(req), req.params.id)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

/* Conversations */
dashboardRouter.patch('/threads/:id', (req, res, next) => {
  try {
    const thread = threadOr404(req)
    const { status, unread, starred } = req.body || {}
    const nextStatus = ['open', 'closed'].includes(status) ? status : thread.status
    const nextUnread = typeof unread === 'boolean' ? Number(unread) : thread.unread
    const nextStarred = typeof starred === 'boolean' ? Number(starred) : thread.starred
    db()
      .prepare('UPDATE threads SET status = ?, unread = ?, starred = ? WHERE id = ?')
      .run(nextStatus, nextUnread, nextStarred, thread.id)
    res.json({ thread: threadView(db().prepare('SELECT * FROM threads WHERE id = ?').get(thread.id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/threads/:id/labels', (req, res, next) => {
  try {
    const thread = threadOr404(req)
    const names = Array.isArray(req.body?.labels) ? req.body.labels.map(String) : []
    const labels = db()
      .prepare(
        `SELECT * FROM labels WHERE workspace_id = ? AND name IN (${names.length ? names.map(() => '?').join(',') : 'NULL'})`,
      )
      .all(workspaceId(req), ...names)
    db().prepare('DELETE FROM thread_labels WHERE thread_id = ?').run(thread.id)
    const insert = db().prepare('INSERT OR IGNORE INTO thread_labels (thread_id, label_id) VALUES (?, ?)')
    for (const label of labels) insert.run(thread.id, label.id)
    res.json({ thread: threadView(db().prepare('SELECT * FROM threads WHERE id = ?').get(thread.id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/threads/:id/reply', (req, res, next) => {
  try {
    const thread = threadOr404(req)
    if (!thread.customer_email || !thread.matched) {
      return next(
        fail(
          400,
          'conversation_not_linked',
          'Link this conversation to a known customer before replying.',
        ),
      )
    }
    const text = String(req.body?.text || req.body?.body || '').trim()
    if (!text) return next(fail(400, 'empty_reply', 'Write a reply before sending.'))
    const identity = firstIdentity(workspaceId(req))
    const html = messageHtmlFromText(text)
    const message = createOutboundMessage({
      workspaceId: workspaceId(req),
      threadId: thread.id,
      from: { name: identity.from_name, email: identity.from_email },
      to: [{ name: thread.customer_name, email: thread.customer_email }],
      subject: `Re: ${String(thread.subject || '').replace(/^(\s*re\s*:\s*)+/i, '').trim()}`,
      html,
      text,
      authorType: 'human',
    })
    res.status(201).json({
      message,
      thread: threadView(db().prepare('SELECT * FROM threads WHERE id = ?').get(thread.id)),
    })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/threads/:id/link', (req, res, next) => {
  try {
    const source = threadOr404(req)
    const target = db()
      .prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ?')
      .get(String(req.body?.targetThreadId || ''), workspaceId(req))
    if (!target) return next(fail(404, 'target_thread_not_found', 'Choose an existing conversation.'))
    if (target.id === source.id) return next(fail(400, 'same_thread', 'Choose a different conversation.'))
    db().prepare('UPDATE messages SET thread_id = ? WHERE thread_id = ?').run(target.id, source.id)
    db().prepare('DELETE FROM threads WHERE id = ?').run(source.id)
    db().prepare('UPDATE threads SET matched = 1, status = \'open\' WHERE id = ?').run(target.id)
    res.json({ thread: threadView(db().prepare('SELECT * FROM threads WHERE id = ?').get(target.id)) })
  } catch (error) {
    next(error)
  }
})

/* Templates */
dashboardRouter.get('/templates', (req, res) => {
  const rows = db().prepare('SELECT * FROM templates WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId(req))
  res.json({ templates: rows.map((row) => templateWithVersions(workspaceId(req), row.id).view) })
})

dashboardRouter.post('/templates', async (req, res, next) => {
  try {
    const body = req.body || {}
    const name = String(body.name || 'Untitled template').trim().slice(0, 140)
    const baseSlug = slugify(body.slug || name, 'template')
    let slug = baseSlug
    let suffix = 1
    while (db().prepare('SELECT 1 FROM templates WHERE workspace_id = ? AND slug = ?').get(workspaceId(req), slug)) {
      suffix += 1
      slug = `${baseSlug}-${suffix}`
    }
    const mjml = String(body.mjml || defaultMjml())
    const subject = String(body.subject || 'A new message from {{company}}').slice(0, 255)
    const variables = normaliseVariables(body.variables || [
      { key: 'name', sample: 'Wanjiru' },
      { key: 'company', sample: 'Acme' },
      { key: 'cta_url', sample: config.appUrl },
    ])
    const sampleValues = Object.fromEntries(variables.map((variable) => [variable.key, variable.sample]))
    const compiled = await compileMjml(mjml, sampleValues)
    const templateId = makeId('tpl')
    const versionId = makeId('tv')
    const createdAt = nowIso()
    db().prepare(
      `INSERT INTO templates (id, workspace_id, name, slug, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(templateId, workspaceId(req), name, slug, String(body.description || '').slice(0, 500), createdAt, createdAt)
    db().prepare(
      `INSERT INTO template_versions
        (id, template_id, version, mjml, html, subject, variables_json, status, created_by, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).run(versionId, templateId, mjml, compiled.html, subject, JSON.stringify(variables), req.user.id, createdAt)
    res.status(201).json({ template: templateWithVersions(workspaceId(req), templateId).view })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.put('/templates/:id', async (req, res, next) => {
  try {
    const { template, versions } = templateWithVersions(workspaceId(req), req.params.id)
    const body = req.body || {}
    const name = body.name !== undefined ? String(body.name).trim().slice(0, 140) : template.name
    const description = body.description !== undefined ? String(body.description).slice(0, 500) : template.description
    const latest = [...versions].sort((a, b) => b.version - a.version)[0]
    const mjml = String(body.mjml ?? latest?.mjml ?? defaultMjml())
    const subject = String(body.subject ?? latest?.subject ?? '').slice(0, 255)
    const variables = normaliseVariables(body.variables ?? JSON.parse(latest?.variables_json || '[]'))
    const sampleValues = Object.fromEntries(variables.map((variable) => [variable.key, variable.sample]))
    const compiled = await compileMjml(mjml, sampleValues)
    const createdAt = nowIso()
    db().prepare('UPDATE templates SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
      name || template.name,
      description,
      createdAt,
      template.id,
    )
    if (latest && latest.status === 'draft') {
      db().prepare(
        `UPDATE template_versions SET mjml = ?, html = ?, subject = ?, variables_json = ? WHERE id = ?`,
      ).run(mjml, compiled.html, subject, JSON.stringify(variables), latest.id)
    } else {
      db().prepare(
        `INSERT INTO template_versions
          (id, template_id, version, mjml, html, subject, variables_json, status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      ).run(makeId('tv'), template.id, (latest?.version || 0) + 1, mjml, compiled.html, subject, JSON.stringify(variables), req.user.id, createdAt)
    }
    res.json({ template: templateWithVersions(workspaceId(req), template.id).view })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/templates/:id/publish', async (req, res, next) => {
  try {
    const { template, versions } = templateWithVersions(workspaceId(req), req.params.id)
    const latest = [...versions].sort((a, b) => b.version - a.version)[0]
    if (!latest) return next(fail(400, 'template_empty', 'Save a draft before publishing.'))
    const variables = JSON.parse(latest.variables_json || '[]')
    const sampleValues = Object.fromEntries(variables.map((variable) => [variable.key, variable.sample]))
    const compiled = await compileMjml(latest.mjml, sampleValues)
    const now = nowIso()
    db().prepare("UPDATE template_versions SET status = 'archived' WHERE template_id = ? AND status = 'published'").run(template.id)
    db().prepare("UPDATE template_versions SET status = 'published', html = ?, published_at = ? WHERE id = ?").run(
      compiled.html,
      now,
      latest.id,
    )
    db().prepare('UPDATE templates SET updated_at = ? WHERE id = ?').run(now, template.id)
    res.json({ template: templateWithVersions(workspaceId(req), template.id).view })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/templates/:id/duplicate', (req, res, next) => {
  try {
    const { template, versions } = templateWithVersions(workspaceId(req), req.params.id)
    const latest = [...versions].sort((a, b) => b.version - a.version)[0]
    const baseSlug = slugify(`${template.slug}-copy`, 'template-copy')
    let slug = baseSlug
    let suffix = 1
    while (db().prepare('SELECT 1 FROM templates WHERE workspace_id = ? AND slug = ?').get(workspaceId(req), slug)) {
      suffix += 1
      slug = `${baseSlug}-${suffix}`
    }
    const id = makeId('tpl')
    const createdAt = nowIso()
    db().prepare(
      `INSERT INTO templates (id, workspace_id, name, slug, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId(req), `${template.name} copy`, slug, template.description, createdAt, createdAt)
    db().prepare(
      `INSERT INTO template_versions
        (id, template_id, version, mjml, html, subject, variables_json, status, created_by, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).run(
      makeId('tv'),
      id,
      latest?.mjml || defaultMjml(),
      latest?.html || '',
      latest?.subject || '',
      latest?.variables_json || '[]',
      req.user.id,
      createdAt,
    )
    res.status(201).json({ template: templateWithVersions(workspaceId(req), id).view })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/templates/:id', (req, res, next) => {
  try {
    const { template } = templateWithVersions(workspaceId(req), req.params.id)
    db().prepare('DELETE FROM templates WHERE id = ?').run(template.id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/templates/:id/test', async (req, res, next) => {
  try {
    const { versions } = templateWithVersions(workspaceId(req), req.params.id)
    const to = String(req.body?.to || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return next(fail(400, 'invalid_recipient', 'Enter a valid test recipient.'))
    const latest = [...versions].sort((a, b) => b.version - a.version)[0]
    const variables = Object.fromEntries(JSON.parse(latest.variables_json || '[]').map((variable) => [variable.key, variable.sample]))
    const compiled = await compileMjml(latest.mjml, variables)
    const identity = firstIdentity(workspaceId(req))
    const message = createOutboundMessage({
      workspaceId: workspaceId(req),
      from: { name: identity.from_name, email: identity.from_email },
      to,
      subject: `[Test] ${renderSubject(latest.subject, variables)}`,
      html: compiled.html,
      text: htmlToText(compiled.html),
      templateVersionId: latest.id,
      authorType: 'human',
      isTest: true,
    })
    res.status(202).json({
      message: { id: message.id, status: 'queued' },
      note: config.mail.transport === 'file' ? 'Test message written to the local outbox.' : 'Test message queued for SMTP delivery.',
    })
  } catch (error) {
    next(error)
  }
})

/* Domains */
dashboardRouter.post('/domains', (req, res, next) => {
  try {
    const domain = addDomain(workspaceId(req), req.body?.name, req.user.name)
    res.status(201).json({ domain })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/domains/:id/verify', async (req, res, next) => {
  try {
    const result = await verifyDomain(workspaceId(req), req.params.id, { force: Boolean(req.body?.force) })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/domains/:id/route', (req, res, next) => {
  try {
    const domain = updateDomainRoute(workspaceId(req), req.params.id, req.body || {})
    res.json({ domain })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/domains/:id', (req, res, next) => {
  try {
    removeDomain(workspaceId(req), req.params.id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/domains/:id/identities', (req, res, next) => {
  try {
    const identity = addIdentity(workspaceId(req), req.params.id, req.body?.email, req.body?.name)
    res.status(201).json({ identity })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/identities/:id', (req, res, next) => {
  try {
    removeIdentity(workspaceId(req), req.params.id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

/* Ephemeral email verification */
dashboardRouter.get('/verifications', (req, res, next) => {
  try {
    res.json({ verifications: listVerifications(workspaceId(req), req.query.limit) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/verifications/test', async (req, res, next) => {
  try {
    const result = await createVerificationRequest({
      workspaceId: workspaceId(req),
      email: req.body?.email,
      name: req.body?.name,
      template: req.body?.template,
      redirectUrl: req.body?.redirect_url,
      metadata: req.body?.metadata,
      fromEmail: req.body?.from_email,
      subject: req.body?.subject,
      req,
    })
    res.status(202).json({
      verification: {
        id: result.id,
        status: result.status,
        email: result.email,
        expires_at: result.expiresAt,
      },
      debug: result.debug || null,
    })
  } catch (error) {
    next(error)
  }
})

/* BYOA campaigns */
dashboardRouter.get('/campaigns', (req, res, next) => {
  try {
    res.json({ campaigns: listCampaigns(workspaceId(req), req.query.limit) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns', (req, res, next) => {
  try {
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

dashboardRouter.get('/campaigns/:id', (req, res, next) => {
  try {
    res.json(campaignDetail(workspaceId(req), req.params.id))
  } catch (error) {
    next(error)
  }
})

dashboardRouter.get('/campaigns/:id/analytics', (req, res, next) => {
  try {
    res.json(campaignAnalytics(workspaceId(req), req.params.id))
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/recipients', (req, res, next) => {
  try {
    const result = addCampaignRecipients({
      workspaceId: workspaceId(req),
      campaignId: req.params.id,
      recipients: req.body?.recipients,
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/recipients/csv', (req, res, next) => {
  try {
    const recipients = parseCampaignCsv(req.body?.csv)
    if (!recipients.length) return next(fail(400, 'csv_empty', 'No recipient rows were found in the CSV.'))
    const result = addCampaignRecipients({
      workspaceId: workspaceId(req),
      campaignId: req.params.id,
      recipients,
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/start', (req, res, next) => {
  try {
    res.status(202).json({ campaign: startCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/schedule', (req, res, next) => {
  try {
    res.json({ campaign: scheduleCampaign(workspaceId(req), req.params.id, req.body?.scheduled_at) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/pause', (req, res, next) => {
  try {
    res.json({ campaign: pauseCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/resume', (req, res, next) => {
  try {
    res.json({ campaign: resumeCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/campaigns/:id/cancel', (req, res, next) => {
  try {
    res.json({ campaign: cancelCampaign(workspaceId(req), req.params.id) })
  } catch (error) {
    next(error)
  }
})

/* Queue operations */
dashboardRouter.get('/queue', (req, res, next) => {
  try {
    res.json(queueOverview(workspaceId(req), req.query.limit))
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/queue/jobs/:id/retry', (req, res, next) => {
  try {
    res.json(retryQueueJob(workspaceId(req), req.params.id))
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/queue/jobs/:id/cancel', (req, res, next) => {
  try {
    res.json(cancelQueueJob(workspaceId(req), req.params.id))
  } catch (error) {
    next(error)
  }
})

/* API keys */
dashboardRouter.post('/keys', (req, res, next) => {
  try {
    const kind = req.body?.kind === 'public' ? 'public' : 'secret'
    const name = String(req.body?.name || (kind === 'public' ? 'Browser integration' : 'API key')).slice(0, 120)
    const recipientPolicy = req.body?.recipientPolicy === 'verified' ? 'verified' : 'fixed'
    const origins = Array.isArray(req.body?.allowedOrigins) ? req.body.allowedOrigins.map(String) : []
    const recipientInput = Array.isArray(req.body?.allowedRecipients)
      ? req.body.allowedRecipients.map((email) => normaliseEmail(email)).filter(Boolean)
      : []
    const allowedRecipients = recipientInput.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    if (kind === 'public' && origins.length === 0) {
      return next(fail(400, 'origins_required', 'Public keys require at least one allowed origin.'))
    }
    if (allowedRecipients.length !== recipientInput.length) {
      return next(fail(400, 'invalid_allowed_recipient', 'Every allowed recipient must be a valid email address.'))
    }
    if (kind === 'public' && recipientPolicy === 'fixed' && allowedRecipients.length === 0) {
      return next(fail(400, 'allowed_recipients_required', 'Fixed-recipient public keys require at least one allowed recipient.'))
    }
    if (allowedRecipients.length > 500) {
      return next(fail(400, 'too_many_allowed_recipients', 'A public key can have at most 500 allowed recipients.'))
    }
    for (const origin of origins) {
      try {
        const parsed = new URL(origin)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol')
      } catch {
        return next(fail(400, 'invalid_origin', `Invalid origin: ${origin}`))
      }
    }
    const key = generateApiKey(kind)
    const id = makeId('key')
    const createdAt = nowIso()
    db().prepare(
      `INSERT INTO api_keys
        (id, workspace_id, name, kind, prefix, hash, allowed_origins_json, allowed_templates_json,
         allowed_recipients_json, rate_limit, recipient_policy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workspaceId(req),
      name,
      kind,
      keyPrefix(key),
      hashApiKey(key),
      JSON.stringify(origins),
      JSON.stringify(Array.isArray(req.body?.allowedTemplates) ? req.body.allowedTemplates : []),
      JSON.stringify(allowedRecipients),
      Number(req.body?.rateLimit) || (kind === 'public' ? config.limits.publicSendPerMinute : 120),
      recipientPolicy,
      createdAt,
    )
    res.status(201).json({
      secret: key,
      key: keyView(db().prepare('SELECT * FROM api_keys WHERE id = ?').get(id)),
    })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/keys/:id', (req, res, next) => {
  try {
    const key = db().prepare('SELECT * FROM api_keys WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!key) return next(fail(404, 'key_not_found', 'API key not found.'))
    const revoked = req.body?.revoked === true || req.body?.status === 'revoked'
    db().prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').run(revoked ? nowIso() : null, key.id)
    res.json({ key: keyView(db().prepare('SELECT * FROM api_keys WHERE id = ?').get(key.id)) })
  } catch (error) {
    next(error)
  }
})

/* Assets */
dashboardRouter.post('/assets', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(fail(400, 'file_required', 'Choose an image to upload.'))
    const detected = await fileTypeFromBuffer(req.file.buffer)
    const allowed = new Map([
      ['image/png', '.png'],
      ['image/jpeg', '.jpg'],
      ['image/gif', '.gif'],
      ['image/webp', '.webp'],
    ])
    if (!detected || !allowed.has(detected.mime)) {
      return next(fail(415, 'unsupported_asset', 'Upload a PNG, JPEG, GIF or WebP image. SVG is disabled for safety.'))
    }
    const storageName = `${crypto.randomUUID()}${allowed.get(detected.mime)}`
    await fs.writeFile(path.join(config.uploadsDir, storageName), req.file.buffer)
    const id = makeId('asset', 6)
    const asset = {
      id,
      workspaceId: workspaceId(req),
      name: String(req.body?.name || req.file.originalname || 'Untitled asset').slice(0, 160),
      kind: String(req.body?.kind || 'Image').slice(0, 40),
      storageName,
      urlPath: `/media/assets/${storageName}`,
      mime: detected.mime,
      bytes: req.file.size,
      dimensions: '',
      public: String(req.body?.public ?? 'true') !== 'false',
      createdAt: nowIso(),
    }
    db().prepare(
      `INSERT INTO assets (id, workspace_id, name, kind, storage_name, url_path, mime, bytes, dimensions, public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      asset.id,
      asset.workspaceId,
      asset.name,
      asset.kind,
      asset.storageName,
      asset.urlPath,
      asset.mime,
      asset.bytes,
      asset.dimensions,
      asset.public ? 1 : 0,
      asset.createdAt,
    )
    res.status(201).json({ asset: assetView(db().prepare('SELECT * FROM assets WHERE id = ?').get(asset.id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/assets/:id', (req, res, next) => {
  try {
    const asset = db().prepare('SELECT * FROM assets WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!asset) return next(fail(404, 'asset_not_found', 'Asset not found.'))
    if (typeof req.body?.public === 'boolean') {
      db().prepare('UPDATE assets SET public = ? WHERE id = ?').run(req.body.public ? 1 : 0, asset.id)
    }
    if (typeof req.body?.name === 'string') {
      db().prepare('UPDATE assets SET name = ? WHERE id = ?').run(req.body.name.slice(0, 160), asset.id)
    }
    res.json({ asset: assetView(db().prepare('SELECT * FROM assets WHERE id = ?').get(asset.id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/assets/:id', async (req, res, next) => {
  try {
    const asset = db().prepare('SELECT * FROM assets WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!asset) return next(fail(404, 'asset_not_found', 'Asset not found.'))
    await fs.unlink(path.join(config.uploadsDir, asset.storage_name)).catch(() => {})
    db().prepare('DELETE FROM assets WHERE id = ?').run(asset.id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

/* FAQs and automation */
dashboardRouter.post('/faqs', (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim()
    const answer = String(req.body?.answer || '').trim()
    if (!title || !answer) return next(fail(400, 'faq_required', 'Add a title and an approved response.'))
    const triggers = Array.isArray(req.body?.triggers)
      ? req.body.triggers
      : String(req.body?.triggers || title).split(',').map((item) => item.trim())
    const id = makeId('faq', 6)
    const now = nowIso()
    db().prepare(
      `INSERT INTO faqs (id, workspace_id, title, answer, triggers_json, usage_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(id, workspaceId(req), title.slice(0, 180), answer.slice(0, 5000), JSON.stringify(triggers.filter(Boolean)), now, now)
    res.status(201).json({ faq: faqView(db().prepare('SELECT * FROM faqs WHERE id = ?').get(id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/faqs/:id', (req, res, next) => {
  try {
    const faq = db().prepare('SELECT * FROM faqs WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!faq) return next(fail(404, 'faq_not_found', 'Approved response not found.'))
    const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 180) : faq.title
    const answer = req.body?.answer !== undefined ? String(req.body.answer).trim().slice(0, 5000) : faq.answer
    const triggers =
      req.body?.triggers !== undefined
        ? JSON.stringify((Array.isArray(req.body.triggers) ? req.body.triggers : String(req.body.triggers).split(','))
            .map((item) => String(item).trim())
            .filter(Boolean))
        : faq.triggers_json
    if (!title || !answer) return next(fail(400, 'faq_required', 'Add a title and an approved response.'))
    db().prepare('UPDATE faqs SET title = ?, answer = ?, triggers_json = ?, updated_at = ? WHERE id = ?').run(
      title,
      answer,
      triggers,
      nowIso(),
      faq.id,
    )
    res.json({ faq: faqView(db().prepare('SELECT * FROM faqs WHERE id = ?').get(faq.id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/faqs/:id', (req, res, next) => {
  try {
    const result = db().prepare('DELETE FROM faqs WHERE id = ? AND workspace_id = ?').run(req.params.id, workspaceId(req))
    if (!result.changes) return next(fail(404, 'faq_not_found', 'Approved response not found.'))
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/automation', (req, res) => {
  const allowed = ['enabled', 'autoSend', 'humanReview', 'combine', 'confidence', 'tone']
  const patch = {}
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) patch[key] = req.body[key]
  }
  if (patch.confidence !== undefined) patch.confidence = Math.max(0, Math.min(100, Number(patch.confidence)))
  res.json({ automation: updateAutomationSettings(workspaceId(req), patch) })
})

dashboardRouter.post('/automation/analyze', (req, res) => {
  const text = String(req.body?.message || '').trim()
  if (!text) return res.status(400).json({ error: { code: 'message_required', message: 'Enter an incoming message.' } })
  const faqs = db()
    .prepare('SELECT * FROM faqs WHERE workspace_id = ?')
    .all(workspaceId(req))
    .map((faq) => ({ ...faq, triggers: parseJson(faq.triggers_json, []) }))
  res.json({ result: analyseFaqs(faqs, text, automationSettings(workspaceId(req))) })
})

/* Webhooks */
dashboardRouter.post('/webhooks', (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim()
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return next(fail(400, 'invalid_webhook', 'Enter a valid HTTPS webhook URL.'))
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return next(fail(400, 'invalid_webhook', 'Webhook URLs must use HTTP or HTTPS.'))
    const events = Array.isArray(req.body?.events) && req.body.events.length
      ? req.body.events
      : ['thread.reply_received']
    const secret = randomToken(24)
    const id = makeId('wh', 6)
    db().prepare(
      `INSERT INTO webhooks (id, workspace_id, url, secret_enc, events_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    ).run(id, workspaceId(req), url, encryptSecret(secret), JSON.stringify(events), nowIso())
    res.status(201).json({
      webhook: webhookView(db().prepare('SELECT * FROM webhooks WHERE id = ?').get(id)),
      secret,
    })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch('/webhooks/:id', (req, res, next) => {
  try {
    const hook = db().prepare('SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!hook) return next(fail(404, 'webhook_not_found', 'Webhook not found.'))
    if (req.body?.status === 'active' || req.body?.status === 'paused') {
      db().prepare('UPDATE webhooks SET status = ? WHERE id = ?').run(req.body.status, hook.id)
    }
    res.json({ webhook: webhookView(db().prepare('SELECT * FROM webhooks WHERE id = ?').get(hook.id)) })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete('/webhooks/:id', (req, res, next) => {
  try {
    const result = db().prepare('DELETE FROM webhooks WHERE id = ? AND workspace_id = ?').run(req.params.id, workspaceId(req))
    if (!result.changes) return next(fail(404, 'webhook_not_found', 'Webhook not found.'))
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post('/webhooks/:id/test', (req, res, next) => {
  try {
    const hook = db().prepare('SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId(req))
    if (!hook) return next(fail(404, 'webhook_not_found', 'Webhook not found.'))
    enqueueWebhookDelivery(hook, 'webhook.test', {
      message: 'This is a test event from Postique.',
    })
    res.status(202).json({ ok: true })
  } catch (error) {
    next(error)
  }
})
