import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../server/config.js'
import { parseVerpAddress, verpAddress } from '../server/lib/verp.js'

test('VERP return paths are signed and scoped to one message', () => {
  const address = verpAddress('msg_test_123')
  assert.equal(parseVerpAddress(address), 'msg_test_123')
  assert.equal(parseVerpAddress(address.replace(/@.*$/, '@other.example')), null)
  assert.equal(parseVerpAddress(address.replace(/\.[^.@]+@/, '.tampered@')), null)
  assert.ok(address.endsWith(`@${config.inbound.domain}`))
})
