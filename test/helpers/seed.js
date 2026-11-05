// Database fixtures for integration tests. Everything here runs against the
// isolated data directory created by test/setup.mjs.
import { getDb, nowIso } from '../../server/db/index.js'
import { generateApiKey, hashApiKey, keyPrefix, makeId } from '../../server/lib/crypto.js'
import { createWorkspace } from '../../server/lib/workspace.js'

export function seedWorkspace(name = 'Test workspace') {
  const user = {
    id: makeId('usr'),
    email: `${makeId('own', 6).toLowerCase()}@owner.test`,
    name: 'Owner',
  }
  getDb()
    .prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.email, user.name, 'not-a-real-hash', nowIso())
  return createWorkspace(user, name)
}

export function seedKey(workspaceId, overrides = {}) {
  const kind = overrides.kind || 'public'
  const value = generateApiKey(kind)
  const record = {
    id: makeId('key'),
    name: 'Test key',
    allowedOrigins: ['https://app.example.com'],
    allowedTemplates: [],
    allowedRecipients: [],
    recipientPolicy: 'verified',
    verificationTemplate: '',
    ...overrides,
  }
  getDb()
    .prepare(
      `INSERT INTO api_keys
        (id, workspace_id, name, kind, prefix, hash, allowed_origins_json, allowed_templates_json,
         allowed_recipients_json, rate_limit, recipient_policy, verification_template, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      workspaceId,
      record.name,
      kind,
      keyPrefix(value),
      hashApiKey(value),
      JSON.stringify(record.allowedOrigins),
      JSON.stringify(record.allowedTemplates),
      JSON.stringify(record.allowedRecipients),
      60,
      record.recipientPolicy,
      record.verificationTemplate,
      nowIso(),
    )
  return { id: record.id, value }
}

export function fakeRequest({ origin = 'https://app.example.com', ip = '203.0.113.7' } = {}) {
  const headers = { origin, 'user-agent': 'postique-test' }
  return { ip, get: (name) => headers[String(name).toLowerCase()] ?? '' }
}
