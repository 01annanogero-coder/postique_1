import crypto from 'node:crypto'
import { config } from '../config.js'

const SECRET = crypto.createHmac('sha256', config.appSecret).update('postique:verp:v1').digest()

function signature(messageId) {
  return crypto.createHmac('sha256', SECRET).update(String(messageId)).digest('base64url').slice(0, 24)
}

/** Signed VERP return path used to authenticate delivery-status reports. */
export function verpAddress(messageId) {
  const local = `bounce+${String(messageId).replace(/[^A-Za-z0-9_-]/g, '')}.${signature(messageId)}`
  return `${local}@${config.inbound.domain}`
}

export function parseVerpAddress(address) {
  const value = String(address || '').trim()
  const at = value.lastIndexOf('@')
  if (at < 0) return null
  const local = value.slice(0, at)
  const domain = value.slice(at + 1).toLowerCase()
  if (domain !== String(config.inbound.domain).toLowerCase()) return null
  const match = local.match(/^bounce\+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/)
  if (!match) return null
  if (signature(match[1]) !== match[2]) return null
  return match[1]
}
