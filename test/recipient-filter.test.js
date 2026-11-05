import test from 'node:test'
import assert from 'node:assert/strict'
import { getDb, nowIso } from '../server/db/index.js'
import { filterSuppressed } from '../server/lib/recipient-filter.js'
import { seedWorkspace } from './helpers/seed.js'

test('suppressed addresses are filtered from to, cc and bcc', () => {
  const workspace = seedWorkspace()
  for (const email of ['blocked@example.com', 'cc-blocked@example.com']) {
    getDb()
      .prepare('INSERT INTO suppressions (workspace_id, email, reason, created_at) VALUES (?, ?, ?, ?)')
      .run(workspace.id, email, 'bounce', nowIso())
  }
  const filtered = filterSuppressed(workspace.id, {
    to: [{ email: 'good@example.com' }, { email: 'blocked@example.com' }],
    cc: [{ email: 'cc-blocked@example.com' }],
    bcc: [{ email: 'bcc@example.com' }],
  })
  assert.deepEqual(filtered.to.map((item) => item.email), ['good@example.com'])
  assert.deepEqual(filtered.cc, [])
  assert.deepEqual(filtered.bcc.map((item) => item.email), ['bcc@example.com'])
})

test('a send with every to address suppressed is rejected', () => {
  const workspace = seedWorkspace()
  getDb()
    .prepare('INSERT INTO suppressions (workspace_id, email, reason, created_at) VALUES (?, ?, ?, ?)')
    .run(workspace.id, 'blocked@example.com', 'unsubscribe', nowIso())
  assert.throws(
    () => filterSuppressed(workspace.id, { to: [{ email: 'blocked@example.com' }] }),
    (error) => error.code === 'suppressed_recipient' && error.status === 422,
  )
})
