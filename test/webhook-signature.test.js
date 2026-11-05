import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { signPayload } from '../server/lib/crypto.js'

test('webhook signatures cover the raw payload with the webhook secret', () => {
  const body = '{"event":"message.sent"}'
  const secret = 'whsec_test'
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  assert.equal(signPayload(body, secret), expected)
  assert.notEqual(signPayload(`${body} `, secret), expected)
  assert.notEqual(signPayload(body, 'different'), expected)
})
