import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../server/config.js'
import { getDb, nowIso } from '../server/db/index.js'
import { makeId } from '../server/lib/crypto.js'
import { rateLimit } from '../server/lib/api-auth.js'
import { cleanupUnmatchedInbound } from '../server/lib/inbound.js'
import { idempotencyReserve } from '../server/routes/public-api.js'
import { seedWorkspace } from './helpers/seed.js'

test('a stranded idempotency reservation is reclaimed after its TTL, a fresh one is not', () => {
  const workspace = seedWorkspace()
  const hash = '{"a":1}'
  assert.equal(idempotencyReserve(workspace.id, 'crashed', hash).reserved, true)
  assert.throws(() => idempotencyReserve(workspace.id, 'crashed', hash), (e) => e.code === 'idempotency_in_progress')
  getDb()
    .prepare('UPDATE idempotency_keys SET created_at = ? WHERE workspace_id = ? AND key = ?')
    .run(new Date(Date.now() - 10 * 60 * 1000).toISOString(), workspace.id, 'crashed')
  assert.equal(idempotencyReserve(workspace.id, 'crashed', hash).reserved, true)
})

test('"-key" rate limit scopes are shared across client IPs, other scopes are per IP', () => {
  const apiKey = { id: makeId('key') }
  const a = { ip: '203.0.113.1' }
  const b = { ip: '203.0.113.2' }
  const c = { ip: '203.0.113.3' }
  rateLimit(apiKey, a, 2, 60_000, 'auth-day-key')
  rateLimit(apiKey, b, 2, 60_000, 'auth-day-key')
  assert.throws(() => rateLimit(apiKey, c, 2, 60_000, 'auth-day-key'), 'third caller hits the shared cap')

  rateLimit(apiKey, a, 1, 60_000, 'auth-day')
  rateLimit(apiKey, b, 1, 60_000, 'auth-day')
  assert.throws(() => rateLimit(apiKey, a, 1, 60_000, 'auth-day'), 'same IP hits its own cap')
})

function seedInboundThread(workspaceId, { matched, createdAt }) {
  const db = getDb()
  const threadId = makeId('thr')
  const messageId = makeId('msg')
  db.prepare(
    `INSERT INTO threads (id, workspace_id, subject, matched, created_at, last_activity_at)
     VALUES (?, ?, 'Spam', ?, ?, ?)`,
  ).run(threadId, workspaceId, matched, createdAt, createdAt)
  db.prepare(
    `INSERT INTO messages (id, workspace_id, thread_id, direction, from_email, created_at)
     VALUES (?, ?, ?, 'in', 'stranger@example.net', ?)`,
  ).run(messageId, workspaceId, threadId, createdAt)
  const folder = path.join(config.attachmentsDir, messageId)
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, '0-note.txt')
  fs.writeFileSync(file, 'attachment bytes')
  db.prepare(
    `INSERT INTO attachments (id, message_id, filename, content_type, bytes, storage_path, created_at)
     VALUES (?, ?, 'note.txt', 'text/plain', 16, ?, ?)`,
  ).run(makeId('att'), messageId, file, createdAt)
  return { threadId, file, folder }
}

test('retention deletes expired unmatched threads and their attachment files, and nothing else', () => {
  const workspace = seedWorkspace()
  const old = '2000-01-01T00:00:00.000Z'
  const expired = seedInboundThread(workspace.id, { matched: 0, createdAt: old })
  const matchedOld = seedInboundThread(workspace.id, { matched: 1, createdAt: old })
  const freshUnmatched = seedInboundThread(workspace.id, { matched: 0, createdAt: nowIso() })

  cleanupUnmatchedInbound()

  const exists = (id) => Boolean(getDb().prepare('SELECT 1 FROM threads WHERE id = ?').get(id))
  assert.equal(exists(expired.threadId), false)
  assert.equal(fs.existsSync(expired.file), false, 'file removed from disk')
  assert.equal(fs.existsSync(expired.folder), false, 'empty folder removed')

  assert.equal(exists(matchedOld.threadId), true)
  assert.equal(fs.existsSync(matchedOld.file), true)
  assert.equal(exists(freshUnmatched.threadId), true)
  assert.equal(fs.existsSync(freshUnmatched.file), true)
})
