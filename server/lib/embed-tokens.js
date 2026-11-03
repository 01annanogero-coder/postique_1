import crypto from 'node:crypto'
import { config } from '../config.js'
import { constantTimeEqual, makeId } from './crypto.js'

const AUDIENCE = 'postique-embed'
const ISSUER = config.appUrl
const SECRET = crypto
  .createHmac('sha256', config.appSecret)
  .update('postique:embed:jwt:v1')
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

export function issueEmbedToken({ workspaceId, externalUserId, email, name, origin }) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: AUDIENCE,
    iss: ISSUER,
    typ: 'embed',
    sub: String(externalUserId),
    workspace_id: workspaceId,
    email: email || '',
    name: name || '',
    origin: origin || '',
    jti: makeId('ejs', 12),
    iat: now,
    exp: now + config.embed.tokenMinutes * 60,
  }
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`
  return {
    token: `${unsigned}.${signature(unsigned)}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    expiresIn: config.embed.tokenMinutes * 60,
  }
}

export function verifyEmbedToken(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const [headerPart, payloadPart, provided] = parts
    const header = decode(headerPart)
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
    if (!constantTimeEqual(provided, signature(`${headerPart}.${payloadPart}`))) return null
    const payload = decode(payloadPart)
    if (payload.aud !== AUDIENCE || payload.iss !== ISSUER || payload.typ !== 'embed') return null
    if (!payload.sub || !payload.workspace_id) return null
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now - 30) return null
    if (payload.iat && payload.iat > now + 30) return null
    return payload
  } catch {
    return null
  }
}
