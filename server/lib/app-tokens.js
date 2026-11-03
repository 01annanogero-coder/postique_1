import crypto from 'node:crypto'
import { config } from '../config.js'
import { constantTimeEqual, makeId } from './crypto.js'

const AUDIENCE = 'postique-auth'
const ISSUER = config.appUrl
const SECRET = crypto
  .createHmac('sha256', config.appSecret)
  .update('postique:auth:jwt:v1')
  .digest()

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function signature(input) {
  return crypto.createHmac('sha256', SECRET).update(input).digest('base64url')
}

export function issueAccessToken({ userId, email, workspaceId, sessionId, method = 'password' }) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    aud: AUDIENCE,
    iss: ISSUER,
    sub: userId,
    email,
    workspace_id: workspaceId,
    session_id: sessionId,
    role: 'authenticated',
    amr: method,
    jti: makeId('jti', 12),
    iat: now,
    exp: now + config.auth.accessTokenSeconds,
  }
  const unsigned = `${encode(header)}.${encode(payload)}`
  return {
    token: `${unsigned}.${signature(unsigned)}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    expiresIn: config.auth.accessTokenSeconds,
  }
}

export function verifyAccessToken(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const [headerPart, payloadPart, provided] = parts
    const header = decode(headerPart)
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
    const expected = signature(`${headerPart}.${payloadPart}`)
    if (!constantTimeEqual(provided, expected)) return null
    const payload = decode(payloadPart)
    if (payload.aud !== AUDIENCE || payload.iss !== ISSUER) return null
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now - 30) return null
    if (payload.iat && payload.iat > now + 30) return null
    return payload
  } catch {
    return null
  }
}
