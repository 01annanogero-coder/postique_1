import { getDb, nowIso } from '../db/index.js'
import { fail } from './http.js'
import { kick } from './queue.js'

function jobView(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    runAt: job.run_at,
    lastError: job.last_error,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }
}

export function queueOverview(workspaceId, limit = 50) {
  const db = getDb()
  const size = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const counts = Object.fromEntries(
    db
      .prepare('SELECT status, COUNT(*) AS count FROM jobs WHERE workspace_id = ? GROUP BY status')
      .all(workspaceId)
      .map((row) => [row.status, row.count]),
  )
  const recent = db
    .prepare(
      `SELECT id, type, status, attempts, max_attempts, run_at, last_error, created_at, updated_at
       FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(workspaceId, size)
    .map(jobView)
  const failures = db
    .prepare(
      `SELECT id, type, status, attempts, max_attempts, run_at, last_error, created_at, updated_at
       FROM jobs WHERE workspace_id = ? AND status = 'failed' ORDER BY updated_at DESC LIMIT 25`,
    )
    .all(workspaceId)
    .map(jobView)
  const next = db
    .prepare("SELECT run_at FROM jobs WHERE workspace_id = ? AND status = 'pending' ORDER BY run_at ASC LIMIT 1")
    .get(workspaceId)
  return {
    counts: {
      pending: counts.pending || 0,
      running: counts.running || 0,
      done: counts.done || 0,
      failed: counts.failed || 0,
      cancelled: counts.cancelled || 0,
    },
    nextRunAt: next?.run_at || null,
    recent,
    failures,
  }
}

export function retryQueueJob(workspaceId, id) {
  const result = getDb()
    .prepare(
      `UPDATE jobs SET status = 'pending', attempts = 0, run_at = ?, locked_at = NULL,
       last_error = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND status IN ('failed','cancelled')`,
    )
    .run(nowIso(), nowIso(), id, workspaceId)
  if (!result.changes) throw fail(404, 'job_not_retryable', 'Only failed or cancelled jobs can be retried.')
  kick()
  return queueOverview(workspaceId)
}

export function cancelQueueJob(workspaceId, id) {
  const result = getDb()
    .prepare(
      `UPDATE jobs SET status = 'cancelled', locked_at = NULL, last_error = 'Cancelled from the dashboard.', updated_at = ?
       WHERE id = ? AND workspace_id = ? AND status IN ('pending','failed')`,
    )
    .run(nowIso(), id, workspaceId)
  if (!result.changes) throw fail(404, 'job_not_cancellable', 'This job can no longer be cancelled.')
  return queueOverview(workspaceId)
}
