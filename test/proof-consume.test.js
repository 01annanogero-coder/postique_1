import test from 'node:test'
import assert from 'node:assert/strict'
import { createVerificationRequest, confirmVerificationCode, consumeVerificationProofToken, publicVerificationView } from '../server/lib/verification.js'
import { fakeRequest, seedKey, seedWorkspace } from './helpers/seed.js'

const ORIGIN = 'https://app.example.com'

test('a proof can be consumed exactly once by a secret-key backend', async () => {
  const workspace = seedWorkspace()
  const key = seedKey(workspace.id)
  const started = await createVerificationRequest({
    workspaceId: workspace.id,
    apiKeyId: key.id,
    allowedRedirectOrigins: [ORIGIN],
    req: fakeRequest(),
    email: `consume-${Date.now()}@example.com`,
    debug: true,
  })
  confirmVerificationCode({
    workspaceId: workspace.id,
    id: started.id,
    apiKeyId: key.id,
    browserToken: started.browserToken,
    code: started.debug.code,
    req: fakeRequest(),
  })
  const proof = publicVerificationView({
    workspaceId: workspace.id,
    id: started.id,
    apiKeyId: key.id,
    browserToken: started.browserToken,
  }).proof
  const consumed = consumeVerificationProofToken({ workspaceId: workspace.id, proof })
  assert.equal(consumed.email, started.email)
  assert.equal(consumed.verificationId, started.id)
  assert.throws(
    () => consumeVerificationProofToken({ workspaceId: workspace.id, proof }),
    (error) => error.code === 'proof_already_consumed',
  )
  const otherWorkspace = seedWorkspace()
  assert.throws(
    () => consumeVerificationProofToken({ workspaceId: otherWorkspace.id, proof }),
    (error) => error.code === 'proof_workspace_mismatch',
  )
})
