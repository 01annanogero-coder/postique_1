import crypto from 'node:crypto'
import { config } from '../config.js'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

export function makeId(prefix, bytes = 12) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function hashApiKey(value) {
  return crypto.createHmac('sha256', config.appSecret).update(value).digest('hex')
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString('base64url')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, expected] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    })
    const expectedBuffer = Buffer.from(expected, 'base64url')
    return hash.length === expectedBuffer.length && crypto.timingSafeEqual(hash, expectedBuffer)
  } catch {
    return false
  }
}

function encryptionKey() {
  return crypto.createHash('sha256').update(`${config.appSecret}:encryption:v1`).digest()
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(value) {
  try {
    const [version, iv, tag, encrypted] = String(value).split('.')
    if (version !== 'v1') throw new Error('Unsupported encryption version')
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Stored secret could not be decrypted. Check APP_SECRET.')
  }
}

export function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export function generateApiKey(kind) {
  const prefix = kind === 'public' ? 'pq_pub' : 'pq_live'
  const token = crypto.randomBytes(24).toString('base64url')
  return `${prefix}_${token}`
}

export function keyPrefix(key) {
  return key.slice(0, 13)
}

export function makeMessageId(domain) {
  return `<${Date.now().toString(36)}.${crypto.randomBytes(12).toString('hex')}@${domain}>`
}

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function normaliseSubject(value) {
  return String(value || '')
    .replace(/^(\s*re\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function replySubject(subject) {
  return `Re: ${normaliseSubject(subject) || 'Your message'}`
}

export function safeFilename(name) {
  const cleaned = String(name || 'file')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return cleaned || 'file'
}
