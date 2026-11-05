import path from 'node:path'
import fs from 'node:fs'
import express from 'express'
import { config } from '../config.js'
import { getDb, nowIso } from '../db/index.js'
import { apiCors, authenticateApiKey } from '../lib/api-auth.js'
import { issueEmbedToken, verifyEmbedToken } from '../lib/embed-tokens.js'
import { createOutboundMessage } from '../lib/messages.js'
import { resolveSendingIdentity } from '../lib/mailer.js'
import { escapeHtml } from '../lib/format.js'
import { replySubject } from '../lib/crypto.js'
import { fail } from '../lib/http.js'

export const embedApiRouter = express.Router()

function bearer(req) {
  const header = req.get('authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function tokenFrom(req) {
  return bearer(req) || String(req.query.token || '').trim()
}

function embedAuth(req, _res, next) {
  const payload = verifyEmbedToken(tokenFrom(req))
  if (!payload) return next(fail(401, 'invalid_embed_token', 'This inbox session is invalid or has expired.'))
  const origin = req.get('origin')
  if (payload.origin && origin && origin !== payload.origin) {
    return next(fail(403, 'origin_not_allowed', 'This inbox session is not valid from this origin.'))
  }
  req.embed = payload
  return next()
}

function ownedThread(req, id) {
  const thread = getDb()
    .prepare('SELECT * FROM threads WHERE id = ? AND workspace_id = ? AND embed_user_id = ?')
    .get(id, req.embed.workspace_id, req.embed.sub)
  if (!thread) throw fail(404, 'thread_not_found', 'Conversation not found.')
  return thread
}

function attachmentRows(messageIds) {
  if (!messageIds.length) return new Map()
  const rows = getDb()
    .prepare(`SELECT * FROM attachments WHERE message_id IN (${messageIds.map(() => '?').join(',')}) ORDER BY created_at`)
    .all(...messageIds)
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.message_id)) map.set(row.message_id, [])
    map.get(row.message_id).push(row)
  }
  return map
}

function embedThreadView(thread, { token, includeMessages = true, markRead = false } = {}) {
  const db = getDb()
  if (markRead && thread.unread) {
    db.prepare('UPDATE threads SET unread = 0 WHERE id = ?').run(thread.id)
    thread = { ...thread, unread: 0 }
  }
  const messages = includeMessages
    ? db
        .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 200')
        .all(thread.id)
    : []
  const attachments = attachmentRows(messages.map((message) => message.id))
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM messages WHERE thread_id = ?')
    .get(thread.id).count
  return {
    id: thread.id,
    subject: thread.subject,
    status: thread.status,
    unread: Boolean(thread.unread),
    snippet: thread.snippet || messages.at(-1)?.text?.replace(/\s+/g, ' ').slice(0, 140) || '',
    lastActivityAt: thread.last_activity_at,
    messageCount: count,
    messages: includeMessages
      ? messages.map((message) => ({
          id: message.id,
          direction: message.direction,
          author: message.from_name || (message.direction === 'out' ? 'Support' : 'Customer'),
          text: message.text || '',
          status: message.status,
          createdAt: message.created_at,
          attachments: (attachments.get(message.id) || []).map((attachment) => ({
            id: attachment.id,
            name: attachment.filename,
            size: attachment.bytes,
            contentType: attachment.content_type,
            url: `/embed/v1/attachments/${attachment.id}?token=${encodeURIComponent(token)}`,
          })),
        }))
      : undefined,
  }
}

function textHtml(text) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#20251f;line-height:1.65;font-size:15px">${String(text)
    .split(/\n\s*\n/)
    .map((part) => `<p>${escapeHtml(part).replaceAll('\n', '<br>')}</p>`)
    .join('')}</div>`
}

// Server-to-server exchange. The application's secret key proves it may mint an
// inbox session for one of its own users. Public keys are not accepted here.
embedApiRouter.post('/session', apiCors, authenticateApiKey, (req, res, next) => {
  try {
    if (req.apiKey.kind !== 'secret') {
      return next(fail(403, 'secret_key_required', 'Embed sessions must be created with a secret API key.'))
    }
    const externalUserId = String(req.body?.external_user_id ?? req.body?.userId ?? '').trim()
    if (!externalUserId || externalUserId.length > 200) {
      return next(fail(400, 'external_user_id_required', 'A stable external_user_id is required.'))
    }
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(fail(400, 'invalid_email', 'Enter a valid email address.'))
    }
    let origin = ''
    if (req.body?.origin) {
      try {
        origin = new URL(String(req.body.origin)).origin
      } catch {
        return next(fail(400, 'invalid_origin', 'origin must be an absolute URL origin.'))
      }
    }
    const issued = issueEmbedToken({
      workspaceId: req.workspaceId,
      externalUserId,
      email,
      name: String(req.body?.name || '').trim().slice(0, 120),
      origin,
    })
    res.status(201).json({
      token: issued.token,
      token_type: 'bearer',
      expires_in: issued.expiresIn,
      expires_at: issued.expiresAt,
      external_user_id: externalUserId,
    })
  } catch (error) {
    next(error)
  }
})

embedApiRouter.use(apiCors, embedAuth)

embedApiRouter.get('/session', (req, res) => {
  res.json({
    user: {
      external_user_id: req.embed.sub,
      email: req.embed.email || '',
      name: req.embed.name || '',
    },
    expires_at: new Date(req.embed.exp * 1000).toISOString(),
  })
})

embedApiRouter.get('/events', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write('retry: 5000\n\n')

  const db = getDb()
  const fingerprint = () => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(MAX(last_activity_at), '') AS updated
         FROM threads WHERE workspace_id = ? AND embed_user_id = ?`,
      )
      .get(req.embed.workspace_id, req.embed.sub)
    const unread = db
      .prepare(
        'SELECT COALESCE(SUM(unread), 0) AS count FROM threads WHERE workspace_id = ? AND embed_user_id = ?',
      )
      .get(req.embed.workspace_id, req.embed.sub).count
    return `${row.count}:${row.updated}:${unread}:${req.embed.exp}`
  }

  let previous = fingerprint()
  const check = setInterval(() => {
    if (Date.now() >= req.embed.exp * 1000) {
      res.write('event: session.expired\ndata: {"message":"Inbox token expired."}\n\n')
      res.end()
      clearInterval(check)
      clearInterval(heartbeat)
      return
    }
    const next = fingerprint()
    if (next !== previous) {
      previous = next
      res.write('event: refresh\ndata: {}\n\n')
    }
  }, 5000)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15000)

  const close = () => {
    clearInterval(check)
    clearInterval(heartbeat)
  }
  req.on('close', close)
  res.on('close', close)
})

embedApiRouter.get('/threads', (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim()
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), config.embed.maxThreads)
    const rows = getDb()
      .prepare(
        `SELECT * FROM threads
         WHERE workspace_id = ? AND embed_user_id = ?
         ${status ? 'AND status = ?' : ''}
         ORDER BY last_activity_at DESC LIMIT ?`,
      )
      .all(
        req.embed.workspace_id,
        req.embed.sub,
        ...(status ? [status] : []),
        limit,
      )
    res.json({
      threads: rows.map((thread) => embedThreadView(thread, { token: tokenFrom(req), includeMessages: false })),
      external_user_id: req.embed.sub,
    })
  } catch (error) {
    next(error)
  }
})

embedApiRouter.get('/threads/:id', (req, res, next) => {
  try {
    const thread = ownedThread(req, req.params.id)
    res.json({ thread: embedThreadView(thread, { token: tokenFrom(req), markRead: true }) })
  } catch (error) {
    next(error)
  }
})

embedApiRouter.post('/threads/:id/messages', (req, res, next) => {
  try {
    const thread = ownedThread(req, req.params.id)
    const text = String(req.body?.text || req.body?.body || '').trim()
    if (!text) return next(fail(400, 'empty_message', 'Write a message before sending.'))
    if (text.length > 10000) return next(fail(400, 'message_too_long', 'Keep replies under 10,000 characters.'))
    const identity = resolveSendingIdentity(req.embed.workspace_id, null)
    const message = createOutboundMessage({
      workspaceId: req.embed.workspace_id,
      threadId: thread.id,
      from: { name: identity.from.name, email: identity.from.email },
      to: [{ name: thread.customer_name, email: thread.customer_email }],
      subject: replySubject(thread.subject),
      html: textHtml(text),
      text,
      authorType: 'human',
    })
    res.status(202).json({
      id: message.id,
      thread_id: thread.id,
      status: message.status,
      message_id: message.message_id,
      created_at: message.created_at,
    })
  } catch (error) {
    next(error)
  }
})

embedApiRouter.get('/attachments/:id', (req, res, next) => {
  try {
    const token = tokenFrom(req)
    const payload = verifyEmbedToken(token)
    if (!payload) return next(fail(401, 'invalid_embed_token', 'This attachment link has expired.'))
    const attachment = getDb()
      .prepare(
        `SELECT a.*, m.workspace_id, t.embed_user_id
         FROM attachments a
         JOIN messages m ON m.id = a.message_id
         LEFT JOIN threads t ON t.id = m.thread_id
         WHERE a.id = ?`,
      )
      .get(req.params.id)
    if (
      !attachment ||
      attachment.workspace_id !== payload.workspace_id ||
      attachment.embed_user_id !== payload.sub
    ) {
      return next(fail(404, 'attachment_not_found', 'Attachment not found.'))
    }
    res.setHeader('Content-Type', attachment.content_type)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${String(attachment.filename).replace(/[\r\n"]/g, '')}"`,
    )
    res.setHeader('Cache-Control', 'private, max-age=60')
    const stream = fs.createReadStream(path.resolve(attachment.storage_path))
    stream.on('error', (error) => next(error))
    return stream.pipe(res)
  } catch (error) {
    return next(error)
  }
})
