import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { config } from './config.js'
import { getDb, nowIso } from './db/index.js'
import { logger } from './lib/logger.js'
import { loadAuth } from './lib/auth.js'
import { constantTimeEqual } from './lib/crypto.js'
import { ApiError } from './lib/http.js'
import { authRouter } from './routes/auth.js'
import { authApiRouter } from './routes/auth-api.js'
import { embedApiRouter } from './routes/embed-api.js'
import { dashboardRouter } from './routes/dashboard.js'
import { publicApiRouter } from './routes/public-api.js'
import { processEmail } from './lib/inbound.js'
import { bootstrap } from './lib/bootstrap.js'

export const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/system/health' || req.url?.startsWith('/media/'),
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
  }),
)
app.use(compression())
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }),
)
app.use(cookieParser())
app.use(loadAuth)

app.get('/api/system/health', (_req, res) => {
  const db = getDb()
  const check = db.prepare('SELECT 1 AS ok').get()
  res.json({
    ok: Boolean(check?.ok),
    service: 'postique',
    time: nowIso(),
    mailTransport: config.mail.transport,
    inboundDomain: config.inbound.domain,
  })
})

// Raw inbound pipe for self-hosted MTAs (Postfix, Haraka, etc.).
app.post(
  '/inbound/http',
  express.raw({ type: '*/*', limit: config.inbound.maxSize }),
  async (req, res, next) => {
    try {
      if (!config.inbound.httpSecret) {
        return res.status(404).json({ error: { code: 'not_found', message: 'Inbound HTTP is not enabled.' } })
      }
      const provided = req.get('x-postique-inbound-secret') || ''
      if (!provided || !constantTimeEqual(provided, config.inbound.httpSecret)) {
        return res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid inbound secret.' } })
      }
      const recipients = String(req.get('x-postique-rcpt') || '')
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean)
        .map((address) => ({ address }))
      const result = await processEmail(req.body, { rcptTo: recipients })
      return res.status(202).json({ ok: true, ...result })
    } catch (error) {
      return next(error)
    }
  },
)

app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: false }))

app.use('/api/auth', authRouter)
app.use('/auth/v1', authApiRouter)
app.use('/embed/v1', embedApiRouter)
app.use('/api', dashboardRouter)
app.use('/v1', publicApiRouter)

app.get('/api/meta', (req, res) => {
  res.json({
    name: 'Postique',
    version: '1.0.0',
    authenticated: Boolean(req.user),
  })
})

app.get('/sdk/postique.js', (_req, res) => {
  res.type('application/javascript')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.sendFile(path.join(config.rootDir || path.resolve(config.dataDir, '..'), 'server', 'public', 'postique-sdk.js'))
})

app.get('/sdk/postique-inbox.js', (_req, res) => {
  res.type('application/javascript')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.sendFile(path.join(config.rootDir || path.resolve(config.dataDir, '..'), 'server', 'public', 'postique-inbox.js'))
})

app.get('/media/assets/:filename', (req, res, next) => {
  try {
    const asset = getDb().prepare('SELECT * FROM assets WHERE storage_name = ?').get(req.params.filename)
    if (!asset) return res.status(404).end()
    if (!asset.public && !req.user) return res.status(401).end()
    if (!asset.public && req.user) {
      const membership = getDb()
        .prepare('SELECT 1 FROM members WHERE workspace_id = ? AND user_id = ?')
        .get(asset.workspace_id, req.user.id)
      if (!membership) return res.status(403).end()
    }
    res.setHeader('Content-Type', asset.mime)
    if (asset.public) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    }
    res.setHeader('Cache-Control', asset.public ? 'public, max-age=31536000, immutable' : 'private, max-age=300')
    return res.sendFile(path.resolve(config.uploadsDir, asset.storage_name))
  } catch (error) {
    return next(error)
  }
})

app.get('/media/attachments/:id', (req, res, next) => {
  try {
    if (!req.user) return res.status(401).end()
    const attachment = getDb()
      .prepare(
        `SELECT a.*, m.workspace_id FROM attachments a
         JOIN messages m ON m.id = a.message_id
         WHERE a.id = ?`,
      )
      .get(req.params.id)
    if (!attachment) return res.status(404).end()
    const membership = getDb()
      .prepare('SELECT 1 FROM members WHERE workspace_id = ? AND user_id = ?')
      .get(attachment.workspace_id, req.user.id)
    if (!membership) return res.status(403).end()
    res.setHeader('Content-Type', attachment.content_type)
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replaceAll('"', '')}"`)
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.sendFile(path.resolve(attachment.storage_path))
  } catch (error) {
    return next(error)
  }
})

// Public API 404s stay JSON so integrations get useful errors.
app.use('/v1', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'API endpoint not found.' } })
})
app.use('/embed/v1', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Embed endpoint not found.' } })
})
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'API endpoint not found.' } })
})

app.use(express.static(path.join(config.rootDir, 'dist'), { index: false, maxAge: '1h' }))
app.use((req, res, next) => {
  if (req.method !== 'GET') return next()
  if (req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path.startsWith('/media')) return next()
  res.sendFile(path.join(config.rootDir, 'dist', 'index.html'), (error) => {
    if (error) {
      res
        .status(503)
        .type('text/plain')
        .send('Postique UI is not built. Run `npm run build` and restart the server.')
    }
  })
})

app.use((error, req, res, _next) => {
  if (error instanceof ApiError) {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter))
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    })
  }
  if (error?.type === 'entity.too.large' || error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'The uploaded content is too large.' } })
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'The JSON body could not be parsed.' } })
  }
  logger.error({ error: error.message, stack: error.stack, path: req.originalUrl }, 'Unhandled request error')
  return res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } })
})

export { bootstrap }
