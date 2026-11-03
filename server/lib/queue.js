import { config } from '../config.js'
import { getDb, nowIso } from '../db/index.js'
import { makeId } from './crypto.js'
import { logger } from './logger.js'
import { SendError, deliverMessage } from './mailer.js'
import { deliverWebhook, enqueueWebhookEvent } from './webhooks.js'

let timer = null
let running = false
let stopped = false

export function enqueue(type, payload, { runAt = nowIso(), maxAttempts = 5 } = {}) {
  const db = getDb()
  const id = makeId('job')
  const now = nowIso()
  db.prepare(
    `INSERT INTO jobs (id, type, payload_json, status, attempts, max_attempts, run_at, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
  ).run(id, type, JSON.stringify(payload), maxAttempts, runAt, now, now)
  kick()
  return id
}

function failMessage(messageId, error, permanent) {
  const db = getDb()
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
  if (!message) return
  const status = permanent ? 'failed' : 'queued'
  db.prepare('UPDATE messages SET status = ?, error = ? WHERE id = ?').run(status, error, messageId)
  db.prepare('INSERT INTO message_events (id, message_id, type, payload_json, at) VALUES (?, ?, ?, ?, ?)').run(
    makeId('evt', 6),
    messageId,
    permanent ? 'failed' : 'retry',
    JSON.stringify({ detail: error, permanent: Boolean(permanent) }),
    nowIso(),
  )
  if (permanent) {
    enqueueWebhookEvent(message.workspace_id, 'message.failed', {
      message: { id: message.id, threadId: message.thread_id, status: 'failed', error },
    })
  }
}

async function runJob(job) {
  const payload = JSON.parse(job.payload_json || '{}')
  if (job.type === 'send_message') {
    try {
      await deliverMessage(payload.messageId)
    } catch (error) {
      const permanent = error instanceof SendError ? !error.retryable : job.attempts + 1 >= job.max_attempts
      failMessage(payload.messageId, error.message, permanent)
      throw Object.assign(error, { permanent })
    }
    return
  }
  if (job.type === 'webhook_delivery') {
    await deliverWebhook(payload.deliveryId)
    return
  }
  throw new Error(`Unknown job type: ${job.type}`)
}

async function processNext() {
  if (running || stopped) return
  running = true
  const db = getDb()
  try {
    const job = db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'pending' AND run_at <= ?
         ORDER BY run_at ASC LIMIT 1`,
      )
      .get(nowIso())
    if (!job) return
    const claimed = db
      .prepare("UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'")
      .run(nowIso(), nowIso(), job.id)
    if (claimed.changes !== 1) return
    const current = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id)
    try {
      await runJob(current)
      db.prepare("UPDATE jobs SET status = 'done', locked_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), job.id)
    } catch (error) {
      const attempts = current.attempts
      const permanent = error.permanent || attempts >= current.max_attempts
      if (permanent) {
        db.prepare(
          "UPDATE jobs SET status = 'failed', locked_at = NULL, last_error = ?, updated_at = ? WHERE id = ?",
        ).run(String(error.message).slice(0, 2000), nowIso(), job.id)
        logger.error({ jobId: job.id, type: job.type, error: error.message }, 'Job failed permanently')
      } else {
        const delayMs = Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.max(0, attempts - 1))
        const nextRun = new Date(Date.now() + delayMs).toISOString()
        db.prepare(
          "UPDATE jobs SET status = 'pending', locked_at = NULL, last_error = ?, run_at = ?, updated_at = ? WHERE id = ?",
        ).run(String(error.message).slice(0, 2000), nextRun, nowIso(), job.id)
        logger.warn({ jobId: job.id, type: job.type, attempts, nextRun, error: error.message }, 'Job will retry')
      }
    }
  } finally {
    running = false
  }
}

async function tick() {
  if (stopped) return
  for (let index = 0; index < config.worker.concurrency; index += 1) {
    // Jobs are processed serially in a local single-process deployment. The
    // loop allows the event loop to flush between jobs.
    // eslint-disable-next-line no-await-in-loop
    await processNext()
  }
}

export function kick() {
  setTimeout(() => {
    tick().catch((error) => logger.error({ error: error.message }, 'Worker tick failed'))
  }, 0)
}

export function startWorker() {
  if (!config.worker.enabled) {
    logger.info('Background worker disabled by configuration')
    return
  }
  const db = getDb()
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  db.prepare("UPDATE jobs SET status = 'pending', locked_at = NULL WHERE status = 'running' AND locked_at < ?").run(stale)
  stopped = false
  timer = setInterval(() => {
    tick().catch((error) => logger.error({ error: error.message }, 'Worker tick failed'))
  }, config.worker.intervalMs)
  timer.unref?.()
  kick()
  logger.info({ intervalMs: config.worker.intervalMs }, 'Background worker started')
}

export function stopWorker() {
  stopped = true
  if (timer) clearInterval(timer)
  timer = null
}
