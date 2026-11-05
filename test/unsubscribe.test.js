import test from 'node:test'
import assert from 'node:assert/strict'
import { unsubscribeToken, unsubscribeUrl } from '../server/lib/unsubscribe.js'

test('unsubscribe tokens are deterministic and scoped to a recipient and campaign', () => {
  const token = unsubscribeToken('crp_one', 'cmp_one')
  assert.equal(token, unsubscribeToken('crp_one', 'cmp_one'))
  assert.notEqual(token, unsubscribeToken('crp_two', 'cmp_one'))
  assert.notEqual(token, unsubscribeToken('crp_one', 'cmp_two'))
  assert.match(unsubscribeUrl('crp_one', 'cmp_one'), /\/unsubscribe\/crp_one\?token=/)
})
