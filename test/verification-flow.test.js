import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getDb } from '../server/db/index.js'
import {
  cleanupVerifications,
  confirmVerification,
  confirmVerificationCode,
  consumeVerificationProof,
  createVerificationRequest,
  getVerificationProof,
  lookupVerification,
  publicVerificationView,
} from '../server/lib/verification.js'
import { verificationJwks } from '../server/lib/verification-proof.js'
import { fakeRequest, seedKey, seedWorkspace } from './helpers/seed.js'

const ORIGIN = 'https://app.example.com'

function context() {
  const workspace = seedWorkspace()
  const key = seedKey(workspace.id)
  return { workspace, key }
}

async function begin(ctx, overrides = {}) {
  const email = overrides.email || `visitor-${crypto.randomUUID()}@example.com`
  const result = await createVerificationRequest({
    workspaceId: ctx.workspace.id,
    apiKeyId: ctx.key.id,
    allowedRedirectOrigins: [ORIGIN],
    req: fakeRequest(),
    ...overrides,
    email,
  })
  return { ...result, email }
}

function codeArgs(ctx, started, overrides = {}) {
  return {
    workspaceId: ctx.workspace.id,
    id: started.id,
    apiKeyId: ctx.key.id,
    browserToken: started.browserToken,
    code: started.debug.code,
    req: fakeRequest(),
    ...overrides,
  }
}

function setColumn(id, column, value) {
  getDb().prepare(`UPDATE verification_requests SET ${column} = ? WHERE id = ?`).run(value, id)
}

const past = () => new Date(Date.now() - 60_000).toISOString()

function proofParts(proof) {
  const [header, payload, signature] = proof.split('.')
  return {
    header,
    payload,
    signature,
    claims: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    jose: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
  }
}

function signatureValid({ header, payload, signature }) {
  const { x } = verificationJwks().keys[0]
  const publicKey = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' })
  return crypto.verify(null, Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'))
}

test('a correct code verifies and yields a proof signed by the published key', async () => {
  const ctx = context()
  const started = await begin(ctx)
  const result = confirmVerificationCode(codeArgs(ctx, started))
  assert.equal(result.status, 'verified')

  const view = publicVerificationView({
    workspaceId: ctx.workspace.id,
    id: started.id,
    apiKeyId: ctx.key.id,
    browserToken: started.browserToken,
  })
  assert.equal(view.status, 'verified')
  const parts = proofParts(view.proof)
  assert.equal(signatureValid(parts), true)
  assert.equal(parts.jose.kid, verificationJwks().keys[0].kid)
  assert.equal(parts.claims.email, started.email)
  assert.equal(parts.claims.email_verified, true)
  assert.equal(parts.claims.aud, ORIGIN)
  assert.ok(parts.claims.exp > parts.claims.iat)

  const forged = Buffer.from(JSON.stringify({ ...parts.claims, email: 'attacker@example.com' })).toString('base64url')
  assert.equal(signatureValid({ ...parts, payload: forged }), false)
})

test('no proof is issued until the email is verified', async () => {
  const ctx = context()
  const started = await begin(ctx)
  const view = publicVerificationView({
    workspaceId: ctx.workspace.id,
    id: started.id,
    apiKeyId: ctx.key.id,
    browserToken: started.browserToken,
  })
  assert.equal(view.status, 'pending')
  assert.equal(view.proof, null)
})

test('only the browser that started a verification can read or confirm it', async () => {
  const ctx = context()
  const other = seedKey(ctx.workspace.id)
  const started = await begin(ctx)
  const wrongToken = { browserToken: crypto.randomBytes(32).toString('base64url') }
  assert.throws(
    () => confirmVerificationCode(codeArgs(ctx, started, wrongToken)),
    (error) => error.code === 'verification_not_found',
  )
  assert.throws(
    () => confirmVerificationCode(codeArgs(ctx, started, { apiKeyId: other.id })),
    (error) => error.code === 'verification_not_found',
  )
  assert.throws(
    () =>
      publicVerificationView({
        workspaceId: ctx.workspace.id,
        id: started.id,
        apiKeyId: ctx.key.id,
        browserToken: wrongToken.browserToken,
      }),
    (error) => error.code === 'verification_not_found',
  )
})

test('five wrong codes lock a verification even for the correct code', async () => {
  const ctx = context()
  const started = await begin(ctx)
  const wrongCode = started.debug.code === '000000' ? '000001' : '000000'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.throws(
      () => confirmVerificationCode(codeArgs(ctx, started, { code: wrongCode })),
      (error) => error.code === 'invalid_verification_code',
    )
  }
  assert.throws(
    () => confirmVerificationCode(codeArgs(ctx, started)),
    (error) => error.code === 'too_many_code_attempts' && error.status === 429,
  )
  const row = getDb().prepare('SELECT status FROM verification_requests WHERE id = ?').get(started.id)
  assert.equal(row.status, 'pending')
})

test('looking up a link does not verify; confirming it does, and repeating is harmless', async () => {
  const ctx = context()
  const started = await begin(ctx)
  const token = new URL(started.debug.verifyUrl).searchParams.get('token')
  assert.equal(lookupVerification(token).status, 'pending')
  assert.equal(lookupVerification(token).status, 'pending')
  assert.equal(confirmVerification(token, fakeRequest()).status, 'verified')
  assert.equal(confirmVerification(token, fakeRequest()).status, 'verified')
  assert.throws(() => confirmVerification('not-a-token', fakeRequest()), (error) => error.code === 'invalid_token')
})

test('expired verifications cannot be confirmed by link or by code', async () => {
  const ctx = context()
  const byLink = await begin(ctx)
  setColumn(byLink.id, 'expires_at', past())
  const token = new URL(byLink.debug.verifyUrl).searchParams.get('token')
  assert.throws(() => confirmVerification(token, fakeRequest()), (error) => error.code === 'token_expired')

  const byCode = await begin(ctx)
  setColumn(byCode.id, 'expires_at', past())
  assert.throws(() => confirmVerificationCode(codeArgs(ctx, byCode)), (error) => error.code === 'token_expired')
})

test('a proof is single-use and bound to one email and one key', async () => {
  const ctx = context()
  const other = seedKey(ctx.workspace.id)
  const started = await begin(ctx)
  const proofArgs = { workspaceId: ctx.workspace.id, id: started.id, email: started.email, apiKeyId: ctx.key.id }

  assert.throws(() => getVerificationProof(proofArgs), (error) => error.code === 'verification_proof_required')
  confirmVerificationCode(codeArgs(ctx, started))

  assert.equal(getVerificationProof(proofArgs).email, started.email)
  assert.equal(getVerificationProof({ ...proofArgs, email: started.email.toUpperCase() }).id, started.id)
  assert.throws(
    () => getVerificationProof({ ...proofArgs, email: 'someone-else@example.com' }),
    (error) => error.code === 'verification_proof_required',
  )
  assert.throws(
    () => getVerificationProof({ ...proofArgs, apiKeyId: other.id }),
    (error) => error.code === 'verification_proof_required',
  )

  assert.equal(consumeVerificationProof(proofArgs).id, started.id)
  assert.throws(() => consumeVerificationProof(proofArgs), (error) => error.code === 'verification_proof_required')
})

test('redirect URLs must match the key origins, and unsafe schemes fall back to the app URL', async () => {
  const ctx = context()
  await assert.rejects(
    () => begin(ctx, { redirectUrl: 'https://evil.example/steal' }),
    (error) => error.code === 'redirect_not_allowed',
  )
  const allowed = await begin(ctx, { redirectUrl: `${ORIGIN}/done` })
  const allowedToken = new URL(allowed.debug.verifyUrl).searchParams.get('token')
  assert.equal(lookupVerification(allowedToken).redirectUrl, `${ORIGIN}/done`)

  const unsafe = await begin(ctx, { redirectUrl: 'javascript:alert(1)' })
  const unsafeToken = new URL(unsafe.debug.verifyUrl).searchParams.get('token')
  assert.equal(lookupVerification(unsafeToken).redirectUrl, 'http://localhost:3000')
})

test('one address can request at most five verifications per hour', async () => {
  const ctx = context()
  const email = `limit-${crypto.randomUUID()}@example.com`
  for (let count = 0; count < 5; count += 1) await begin(ctx, { email })
  await assert.rejects(
    () => begin(ctx, { email }),
    (error) => error.code === 'too_many_verifications' && error.status === 429,
  )
  await begin(ctx, { email: `other-${crypto.randomUUID()}@example.com` })
})

test('cleanup purges records past their retention time and keeps the rest', async () => {
  const ctx = context()
  const stale = await begin(ctx)
  const fresh = await begin(ctx)
  setColumn(stale.id, 'purge_at', past())
  cleanupVerifications()
  const exists = (id) => getDb().prepare('SELECT 1 FROM verification_requests WHERE id = ?').get(id) !== undefined
  assert.equal(exists(stale.id), false)
  assert.equal(exists(fresh.id), true)
})
