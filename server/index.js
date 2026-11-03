import { app } from './app.js'
import { config } from './config.js'
import { getDb, closeDb } from './db/index.js'
import { logger } from './lib/logger.js'
import { cleanupSessions } from './lib/auth.js'
import { startInboundServer, stopInboundServer } from './lib/inbound.js'
import { startWorker, stopWorker } from './lib/queue.js'

getDb()

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      appUrl: config.appUrl,
      dataDir: config.dataDir,
      mailTransport: config.mail.transport,
      inboundDomain: config.inbound.domain,
    },
    `Postique is running at ${config.appUrl}`,
  )
  if (config.mail.transport === 'file') {
    logger.warn('MAIL_TRANSPORT=file: outbound email is written to data/outbox and is not delivered externally.')
  }
  if (config.mail.transport === 'smtp' && !config.mail.smtpUrl) {
    logger.error('MAIL_TRANSPORT=smtp but SMTP_URL is not configured. Sends will fail.')
  }
})

server.on('error', (error) => {
  logger.error({ code: error.code, message: error.message }, 'HTTP server error')
  if (error.code === 'EADDRINUSE') {
    process.exitCode = 1
  }
})

try {
  const inbound = startInboundServer()
  if (inbound) {
    inbound.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(
          { port: config.inbound.port },
          'Inbound SMTP port is already in use. Set INBOUND_SMTP_PORT to a free port or disable inbound SMTP.',
        )
      }
    })
  }
} catch (error) {
  logger.error({ error: error.message }, 'Inbound SMTP failed to start')
}

startWorker()

const sessionCleanup = setInterval(() => {
  try {
    cleanupSessions()
  } catch (error) {
    logger.warn({ error: error.message }, 'Session cleanup failed')
  }
}, 60 * 60 * 1000)
sessionCleanup.unref?.()

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down')
  clearInterval(sessionCleanup)
  stopWorker()
  await stopInboundServer().catch(() => {})
  server.close(() => {
    closeDb()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (error) => {
  logger.error({ error: String(error) }, 'Unhandled promise rejection')
})
