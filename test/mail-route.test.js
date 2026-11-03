import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptSecret } from '../server/lib/crypto.js'
import { resolveMailRoute } from '../server/lib/mail-route.js'

test('domain routes override the global transport', () => {
  const encrypted = encryptSecret(
    JSON.stringify({
      smtpUrl: 'smtp://relay.example.com:587',
      adapterUrl: 'https://gateway.example.com/v1/deliver',
      adapterToken: 'secret-token',
    }),
  )
  const route = resolveMailRoute({ route_transport: 'smtp', route_config_enc: encrypted })
  assert.equal(route.transport, 'smtp')
  assert.equal(route.source, 'domain')
  assert.equal(route.smtpUrl, 'smtp://relay.example.com:587')
})

test('domains inherit the global route when unset', () => {
  const route = resolveMailRoute({ route_transport: 'inherit' })
  assert.equal(route.source, 'global')
  assert.ok(['file', 'smtp', 'direct', 'http'].includes(route.transport))
})
