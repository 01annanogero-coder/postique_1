import test from 'node:test'
import assert from 'node:assert/strict'
import { issueEmbedToken, verifyEmbedToken } from '../server/lib/embed-tokens.js'

test('embed tokens are scoped to one workspace, user and origin', () => {
  const issued = issueEmbedToken({
    workspaceId: 'ws_test',
    externalUserId: 'app-user-42',
    email: 'buyer@example.com',
    name: 'Buyer',
    origin: 'https://shop.example.com',
  })
  const payload = verifyEmbedToken(issued.token)
  assert.equal(payload.sub, 'app-user-42')
  assert.equal(payload.workspace_id, 'ws_test')
  assert.equal(payload.origin, 'https://shop.example.com')
  assert.equal(payload.aud, 'postique-embed')
  assert.equal(payload.typ, 'embed')
})

test('embed tokens cannot be altered to change ownership', () => {
  const issued = issueEmbedToken({
    workspaceId: 'ws_test',
    externalUserId: 'app-user-42',
    origin: 'https://shop.example.com',
  })
  const [header, payload, signature] = issued.token.split('.')
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
  decoded.sub = 'app-user-99'
  const forged = `${header}.${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`
  assert.equal(verifyEmbedToken(forged), null)
})
