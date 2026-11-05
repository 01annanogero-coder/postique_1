/* Postique proof verifier — dependency-free ESM for browsers, Node and edge. */

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

export class ProofError extends Error {
  constructor(code, message, status = 401) {
    super(message)
    this.name = 'ProofError'
    this.code = code
    this.status = status
  }
}

function base64Bytes(segment) {
  const value = String(segment || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  }
  /* global Buffer */
  return Uint8Array.from(Buffer.from(padded, 'base64'))
}

function decodeJson(segment) {
  try {
    return JSON.parse(new TextDecoder().decode(base64Bytes(segment)))
  } catch {
    throw new ProofError('invalid_proof', 'The verification proof is malformed.')
  }
}

async function loadJwks(jwksUrl, fetchImpl) {
  if (!jwksUrl) throw new ProofError('jwks_required', 'A jwksUrl is required.')
  const current = cache.get(jwksUrl)
  if (current && current.expiresAt > Date.now()) return current.jwks
  const fetcher = fetchImpl || globalThis.fetch
  if (typeof fetcher !== 'function') throw new ProofError('fetch_required', 'No fetch implementation is available.')
  const response = await fetcher(jwksUrl, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new ProofError('jwks_unavailable', 'The verification key set is unavailable.', 503)
  const jwks = await response.json()
  if (!jwks || !Array.isArray(jwks.keys)) throw new ProofError('jwks_invalid', 'The verification key set is invalid.', 503)
  cache.set(jwksUrl, { jwks, expiresAt: Date.now() + CACHE_TTL_MS })
  return jwks
}

export function clearJwksCache() {
  cache.clear()
}

/**
 * Verify a Postique proof token.
 *
 * @param {string} token
 * @param {object} options
 * @param {string} options.jwksUrl - e.g. https://mail.example.com/verify/v1/jwks.json
 * @param {string|string[]} options.audience - expected browser origin(s)
 * @param {string} [options.issuer] - expected Postique APP_URL
 * @param {object} [options.jwks] - preloaded JWKS (skips fetch)
 * @param {number} [options.clockToleranceSeconds]
 * @param {object} [options.crypto] - custom Web Crypto implementation
 * @param {Function} [options.fetch]
 * @returns {Promise<object>} verified claims
 */
export async function verifyProof(token, options = {}) {
  const audience = options.audience
  if (!audience) throw new ProofError('audience_required', 'An expected audience is required.')
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new ProofError('invalid_proof', 'The verification proof is malformed.')

  const header = decodeJson(parts[0])
  const claims = decodeJson(parts[1])
  if (header.alg !== 'EdDSA') throw new ProofError('invalid_proof', 'Unsupported proof algorithm.')
  if (claims.email_verified !== true || !claims.email) {
    throw new ProofError('invalid_proof', 'The proof does not assert email ownership.')
  }
  if (options.issuer && claims.iss !== options.issuer) {
    throw new ProofError('invalid_proof', 'The verification proof issuer is not expected.')
  }

  const jwks = options.jwks || (await loadJwks(options.jwksUrl, options.fetch))
  const key = (jwks.keys || []).find((entry) => entry.kid === header.kid)
  if (!key) throw new ProofError('invalid_proof', 'The verification proof uses an unknown key.')

  const cryptoImpl = options.crypto || globalThis.crypto
  if (!cryptoImpl || !cryptoImpl.subtle) throw new ProofError('crypto_required', 'Web Crypto is required.', 503)
  const publicKey = await cryptoImpl.subtle.importKey(
    'jwk',
    { kty: key.kty, crv: key.crv, x: key.x, ext: true },
    { name: 'Ed25519' },
    false,
    ['verify'],
  )
  const valid = await cryptoImpl.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    base64Bytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!valid) throw new ProofError('invalid_proof', 'The verification proof signature is invalid.')

  const tolerance = Number(options.clockToleranceSeconds ?? 30)
  const now = Math.floor(Date.now() / 1000)
  if (!claims.exp || claims.exp + tolerance < now) {
    throw new ProofError('proof_expired', 'The verification proof has expired.')
  }
  if (claims.iat && claims.iat - tolerance > now) {
    throw new ProofError('invalid_proof', 'The verification proof is not valid yet.')
  }
  const audiences = Array.isArray(audience) ? audience : [audience]
  if (!audiences.includes(claims.aud)) {
    throw new ProofError('invalid_proof', 'The verification proof audience does not match.')
  }
  return claims
}
