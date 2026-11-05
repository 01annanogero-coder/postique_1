import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPublicOrigin,
  assertPublicRecipientPolicy,
  assertPublicSendShape,
  assertPublicTemplateAllowed,
  assertPublicVerificationPolicy,
} from '../server/lib/public-key-policy.js'

const key = {
  kind: 'public',
  allowed_origins_json: '["https://app.example.com"]',
  allowed_templates_json: '["contact-receipt"]',
  allowed_recipients_json: '["customer@example.com"]',
}

test('public keys require an explicit recipient allow-list', () => {
  assert.doesNotThrow(() => assertPublicRecipientPolicy(key, [{ email: 'CUSTOMER@example.com' }]))
  assert.throws(
    () => assertPublicRecipientPolicy({ ...key, allowed_recipients_json: '[]' }, [{ email: 'customer@example.com' }]),
    (error) => error.code === 'recipient_policy_required',
  )
  assert.throws(
    () => assertPublicRecipientPolicy(key, [{ email: 'other@example.com' }]),
    (error) => error.code === 'recipient_not_allowed',
  )
})

test('public keys require a matching browser origin', () => {
  assert.doesNotThrow(() => assertPublicOrigin(key, 'https://app.example.com'))
  assert.throws(() => assertPublicOrigin(key, ''), (error) => error.code === 'origin_required')
  assert.throws(() => assertPublicOrigin(key, 'https://evil.example'), (error) => error.code === 'origin_not_allowed')
})

test('public keys cannot use conversation threading or carbon copies', () => {
  assert.throws(
    () => assertPublicSendShape(key, { thread_id: 'thr_1' }),
    (error) => error.code === 'public_thread_not_allowed',
  )
  assert.throws(
    () => assertPublicSendShape(key, { in_reply_to: 'msg_1' }),
    (error) => error.code === 'public_thread_not_allowed',
  )
  assert.throws(
    () => assertPublicSendShape(key, { cc: ['other@example.com'] }),
    (error) => error.code === 'public_carbon_copy_not_allowed',
  )
  assert.doesNotThrow(() => assertPublicSendShape(key, { to: 'customer@example.com' }))
})

test('public keys only render approved templates', () => {
  assert.doesNotThrow(() => assertPublicTemplateAllowed(key, 'contact-receipt'))
  assert.throws(
    () => assertPublicTemplateAllowed(key, 'other-template'),
    (error) => error.code === 'template_not_allowed',
  )
})

test('verified-visitor keys require a matching proof for unlisted recipients', () => {
  const verifiedKey = { ...key, recipient_policy: 'verified', allowed_recipients_json: '[]' }
  assert.doesNotThrow(() =>
    assertPublicRecipientPolicy(verifiedKey, [{ email: 'visitor@example.com' }], {
      verificationEmail: 'visitor@example.com',
    }),
  )
  assert.throws(
    () => assertPublicRecipientPolicy(verifiedKey, [{ email: 'visitor@example.com' }]),
    (error) => error.code === 'recipient_not_allowed',
  )
  assert.throws(
    () =>
      assertPublicRecipientPolicy(verifiedKey, [{ email: 'visitor@example.com' }, { email: 'two@example.com' }], {
        verificationEmail: 'visitor@example.com',
      }),
    (error) => error.code === 'recipient_not_allowed',
  )
  assert.throws(
    () => assertPublicVerificationPolicy({ ...key, recipient_policy: 'fixed' }),
    (error) => error.code === 'verified_policy_required',
  )
  assert.doesNotThrow(() => assertPublicVerificationPolicy(verifiedKey))
})
