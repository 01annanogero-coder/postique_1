import test from 'node:test'
import assert from 'node:assert/strict'
import { verificationView } from '../server/lib/verification.js'

test('verification records are ephemeral and do not expose account fields', () => {
  const view = verificationView({
    id: 'vrf_test',
    email: 'person@example.com',
    name: 'Person',
    status: 'verified',
    metadata_json: '{"submission_id":"sub_123"}',
    template_version_id: 'tv_test',
    redirect_url: 'https://app.example.com/verified',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T00:30:00.000Z',
    verified_at: '2026-01-01T00:05:00.000Z',
  })
  assert.equal(view.status, 'verified')
  assert.equal(view.metadata.submission_id, 'sub_123')
  assert.equal(Object.hasOwn(view, 'password_hash'), false)
  assert.equal(Object.hasOwn(view, 'user_id'), false)
})
