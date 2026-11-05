import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateAddress } from '../server/lib/webhooks.js'

test('webhook destination checks reject private IPv4 and IPv6 ranges', () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '172.16.4.9', '192.168.1.5', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888']) {
    assert.equal(isPrivateAddress(address), false, address)
  }
})
