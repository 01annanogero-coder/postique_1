import { getDb, closeDb } from './db/index.js'
import { logger } from './lib/logger.js'
import { startWorker, stopWorker } from './lib/queue.js'

getDb()
startWorker()

logger.info('Standalone Postique worker is running')

async function shutdown(signal) {
  logger.info({ signal }, 'Stopping worker')
  stopWorker()
  closeDb()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
