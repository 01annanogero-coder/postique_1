import test from 'node:test'
import assert from 'node:assert/strict'
import { issueAccessToken, verifyAccessToken } from '../server/lib/app-tokens.js'
import { appUserView } from '../server/lib/app-auth.js'

test('application access tokens carry workspace-scoped claims', () => {
  const issued = issueAccessToken({
    userId: 'au_test',
    email: 'user@example.com',
    workspaceId: 'ws_test',
    sessionId: 'aus_test',
    method: 'password',
  })
  const payload = verifyAccessToken(issued.token)
  assert.equal(payload.sub, 'au_test')
  assert.equal(payload.workspace_id, 'ws_test')
  assert.equal(payload.session_id, 'aus_test')
  assert.equal(payload.aud, 'postique-auth')
  assert.equal(payload.role, 'authenticated')
  assert.ok(payload.exp > payload.iat)
})

test('tampered application access tokens are rejected', () => {
  const issued = issueAccessToken({
    userId: 'au_test',
    email: 'user@example.com',
    workspaceId: 'ws_test',
    sessionId: 'aus_test',
  })
  const parts = issued.token.split('.')
  const tampered = `${parts[0]}.${Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), sub: 'au_attacker' }),
  ).toString('base64url')}.${parts[2]}`
  assert.equal(verifyAccessToken(tampered), null)
  assert.equal(verifyAccessToken('not-a-jwt'), null)
})

test('application user views hide password hashes', () => {
  const view = appUserView({
    id: 'au_test',
    email: 'user@example.com',
    name: 'Test User',
    password_hash: 'scrypt$secret',
    metadata_json: '{"plan":"pro"}',
    email_verified_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(view.email, 'user@example.com')
  assert.equal(view.hasPassword, true)
  assert.equal(view.metadata.plan, 'pro')
  assert.equal(Object.hasOwn(view, 'password_hash'), false)
})
