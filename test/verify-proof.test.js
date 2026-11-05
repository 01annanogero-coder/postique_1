import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../server/config.js'
import { signVerificationProof, verificationJwks } from '../server/lib/verification-proof.js'
import { ProofError, verifyProof } from '../packages/verify/index.js'

const origin = 'https://app.example.com'

function token(overrides = {}) {
  return signVerificationProof({
    id: 'vrf_package_test',
    workspace_id: 'ws_package',
    api_key_id: 'key_package',
    email: 'visitor@example.com',
    origin,
    verified_at: new Date().toISOString(),
    ...overrides,
  })
}

test('the standalone verifier accepts a Postique Ed25519 proof', async () => {
  const claims = await verifyProof(token(), {
    jwks: verificationJwks(),
    audience: origin,
    issuer: config.appUrl,
  })
  assert.equal(claims.email, 'visitor@example.com')
  assert.equal(claims.email_verified, true)
  assert.equal(claims.sub, 'vrf_package_test')
})

test('the standalone verifier rejects tampering, wrong audience and missing audience', async () => {
  const value = token()
  const [header, payload, signature] = value.split('.')
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), email: 'attacker@example.com' })).toString('base64url')
  await assert.rejects(
    () => verifyProof(`${header}.${forged}.${signature}`, { jwks: verificationJwks(), audience: origin }),
    (error) => error instanceof ProofError && error.code === 'invalid_proof',
  )
  await assert.rejects(
    () => verifyProof(value, { jwks: verificationJwks(), audience: 'https://evil.example' }),
    (error) => error instanceof ProofError && error.code === 'invalid_proof',
  )
  await assert.rejects(
    () => verifyProof(value, { jwks: verificationJwks() }),
    (error) => error instanceof ProofError && error.code === 'audience_required',
  )
})
