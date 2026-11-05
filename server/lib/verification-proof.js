import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { fail } from './http.js'

/**
 * Ed25519 proof signing for frontend-only verification.
 *
 * The private key lives beside the database and never leaves the server. Sites
 * verify the proof with the public JWKS, so a frontend can attach ownership
 * proof to a form without holding a Postique secret.
 */

let cached = null

function loadOrCreate() {
  if (cached) return cached
  const keyPath = path.join(config.dataDir, '.verification-signing-key.json')
  if (fs.existsSync(keyPath)) {
    const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
    const privateKey = crypto.createPrivateKey({ key: parsed.privateJwk, format: 'jwk' })
    cached = { kid: parsed.kid, privateKey, publicJwk: parsed.publicJwk }
    return cached
  }
  const pair = crypto.generateKeyPairSync('ed25519')
  const privateJwk = pair.privateKey.export({ format: 'jwk' })
  const publicJwk = pair.publicKey.export({ format: 'jwk' })
  const kid = crypto.createHash('sha256').update(publicJwk.x).digest('base64url').slice(0, 16)
  fs.writeFileSync(keyPath, JSON.stringify({ kid, privateJwk, publicJwk }), { mode: 0o600 })
  cached = { kid, privateKey: pair.privateKey, publicJwk }
  return cached
}

export function verificationJwks() {
  const { kid, publicJwk } = loadOrCreate()
  return {
    keys: [{ kty: 'OKP', crv: 'Ed25519', use: 'sig', alg: 'EdDSA', kid, x: publicJwk.x }],
  }
}

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function signVerificationProof(row) {
  const { kid, privateKey } = loadOrCreate()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'EdDSA', typ: 'JWT', kid }
  const payload = {
    iss: config.appUrl,
    aud: row.origin || config.appUrl,
    sub: row.id,
    email: row.email,
    email_verified: true,
    workspace_id: row.workspace_id,
    api_key_id: row.api_key_id || null,
    iat: now,
    exp: now + config.verification.proofMinutes * 60,
    jti: row.id,
  }
  const signingInput = `${b64(header)}.${b64(payload)}`
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey).toString('base64url')
  return `${signingInput}.${signature}`
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

export function verifyVerificationProof(token, { audience = null, issuer = config.appUrl, clockToleranceSeconds = 30 } = {}) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw fail(401, 'invalid_proof', 'The verification proof is malformed.')
  let header
  let claims
  try {
    header = decode(parts[0])
    claims = decode(parts[1])
  } catch {
    throw fail(401, 'invalid_proof', 'The verification proof is malformed.')
  }
  if (header.alg !== 'EdDSA') throw fail(401, 'invalid_proof', 'Unsupported proof algorithm.')
  const { kid, publicJwk } = loadOrCreate()
  if (header.kid !== kid) throw fail(401, 'invalid_proof', 'The verification proof uses an unknown key.')
  const publicKey = crypto.createPublicKey({ key: publicJwk, format: 'jwk' })
  const valid = crypto.verify(
    null,
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], 'base64url'),
  )
  if (!valid) throw fail(401, 'invalid_proof', 'The verification proof signature is invalid.')
  const now = Math.floor(Date.now() / 1000)
  if (claims.email_verified !== true) throw fail(401, 'invalid_proof', 'The proof does not assert email ownership.')
  if (claims.iss !== issuer) throw fail(401, 'invalid_proof', 'The verification proof issuer is not this Postique instance.')
  if (!claims.exp || claims.exp + clockToleranceSeconds < now) throw fail(401, 'proof_expired', 'The verification proof has expired.')
  if (claims.iat && claims.iat - clockToleranceSeconds > now) throw fail(401, 'invalid_proof', 'The verification proof is not valid yet.')
  if (audience) {
    const allowed = Array.isArray(audience) ? audience : [audience]
    if (!allowed.includes(claims.aud)) throw fail(401, 'invalid_proof', 'The verification proof audience does not match.')
  }
  return claims
}
