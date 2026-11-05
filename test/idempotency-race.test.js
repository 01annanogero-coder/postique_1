import test from 'node:test'
import assert from 'node:assert/strict'
import { idempotencyLookup, idempotencyReserve, idempotencyStore } from '../server/routes/public-api.js'
import { createOutboundMessage } from '../server/lib/messages.js'
import { seedWorkspace } from './helpers/seed.js'

test('an idempotency key is reserved before async work completes', () => {
  const workspace = seedWorkspace()
  const hash = JSON.stringify({ to: 'customer@example.com' })
  const first = idempotencyReserve(workspace.id, 'idem-race', hash)
  assert.equal(first.reserved, true)
  assert.throws(
    () => idempotencyReserve(workspace.id, 'idem-race', hash),
    (error) => error.code === 'idempotency_in_progress',
  )
  const message = createOutboundMessage({
    workspaceId: workspace.id,
    from: 'sender@example.com',
    to: 'customer@example.com',
    subject: 'Idempotency test',
    html: '<p>Hello</p>',
    text: 'Hello',
  })
  idempotencyStore(workspace.id, 'idem-race', hash, { id: message.id, thread_id: null }, true)
  assert.deepEqual(idempotencyLookup(workspace.id, 'idem-race', hash), { id: message.id, thread_id: null })
  const replay = idempotencyReserve(workspace.id, 'idem-race', hash)
  assert.equal(replay.cached.id, message.id)
})
