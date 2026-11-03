import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import { config } from '../config.js'
import { getDb, nowIso, parseJson } from '../db/index.js'
import { decryptSecret, encryptSecret, makeId } from './crypto.js'
import { fail } from './http.js'
import { normaliseEmail } from './crypto.js'
import { domainView } from './presenters.js'
import { DOMAIN_TRANSPORTS } from './mail-route.js'

export function generateDkim(selector = config.mail.dkimSelector) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const publicDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' }).toString('base64')
  return {
    selector,
    publicKey: publicDer,
    privateKey,
  }
}

function recordsFor(name, dkim) {
  return [
    {
      id: 'spf',
      type: 'TXT',
      host: '@',
      value: config.mail.spfRecord,
      purpose: 'Sender policy',
      status: 'pending',
    },
    {
      id: 'dkim',
      type: 'TXT',
      host: `${dkim.selector}._domainkey`,
      value: `v=DKIM1; k=rsa; p=${dkim.publicKey}`,
      purpose: 'DKIM signature',
      status: 'pending',
    },
    {
      id: 'dmarc',
      type: 'TXT',
      host: '_dmarc',
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${name}`,
      purpose: 'DMARC policy',
      status: 'pending',
    },
  ]
}

export function addDomain(workspaceId, rawName, fromName = '') {
  const name = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^@/, '')
    .replace(/\.+$/, '')
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) {
    throw fail(400, 'invalid_domain', 'Enter a valid domain such as example.com.')
  }
  const db = getDb()
  if (db.prepare('SELECT 1 FROM domains WHERE workspace_id = ? AND name = ?').get(workspaceId, name)) {
    throw fail(409, 'domain_exists', 'This domain is already configured.')
  }
  const count = db.prepare('SELECT COUNT(*) AS count FROM domains WHERE workspace_id = ?').get(workspaceId).count
  if (count >= 10) throw fail(400, 'domain_limit', 'A workspace can have at most 10 sending domains.')
  const dkim = generateDkim()
  const id = makeId('dom')
  const createdAt = nowIso()
  db.prepare(
    `INSERT INTO domains
      (id, workspace_id, name, status, dkim_selector, dkim_public, dkim_private_enc, records_json, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    name,
    dkim.selector,
    dkim.publicKey,
    encryptSecret(dkim.privateKey),
    JSON.stringify(recordsFor(name, dkim)),
    createdAt,
  )
  db.prepare(
    `INSERT INTO identities (id, workspace_id, domain_id, from_email, from_name, signature_html, created_at)
     VALUES (?, ?, ?, ?, ?, '', ?)`,
  ).run(makeId('idt', 6), workspaceId, id, `noreply@${name}`, fromName || 'Postique', createdAt)
  return domainView(db.prepare('SELECT * FROM domains WHERE id = ?').get(id))
}

function flattenTxt(records) {
  return records.map((record) => record.join('')).join('\n')
}

export async function verifyDomain(workspaceId, domainId, { force = false } = {}) {
  const db = getDb()
  const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?').get(domainId, workspaceId)
  if (!domain) throw fail(404, 'domain_not_found', 'Domain not found.')
  const records = JSON.parse(domain.records_json || '[]')
  const dkimRecord = records.find((record) => record.id === 'dkim')
  const checks = []
  let verified = false

  if (force && config.dns.allowManualVerification) {
    verified = true
    checks.push({ name: 'manual', ok: true, detail: 'Marked verified by the workspace operator.' })
  } else if (!config.dns.verificationEnabled) {
    verified = true
    checks.push({ name: 'dns', ok: true, detail: 'DNS verification is disabled; domain marked verified.' })
  } else {
    const runCheck = async (label, resolver) => {
      try {
        const value = await resolver()
        checks.push({ name: label, ok: true, detail: value })
        return true
      } catch (error) {
        checks.push({ name: label, ok: false, detail: error.code || error.message })
        return false
      }
    }
    const [spfOk, dkimOk, dmarcOk] = await Promise.all([
      runCheck('SPF', async () => {
        const values = await dns.resolveTxt(domain.name)
        const txt = flattenTxt(values)
        if (!/v=spf1/i.test(txt)) throw new Error('No SPF record found')
        return 'SPF record found'
      }),
      runCheck('DKIM', async () => {
        const values = await dns.resolveTxt(`${domain.dkim_selector}._domainkey.${domain.name}`)
        const txt = flattenTxt(values)
        if (!/v=DKIM1/i.test(txt) || !/p=/i.test(txt)) throw new Error('No DKIM key found')
        return 'DKIM key found'
      }),
      runCheck('DMARC', async () => {
        const values = await dns.resolveTxt(`_dmarc.${domain.name}`)
        const txt = flattenTxt(values)
        if (!/v=DMARC1/i.test(txt)) throw new Error('No DMARC record found')
        return 'DMARC record found'
      }),
    ])
    verified = spfOk && dkimOk && dmarcOk
  }

  const updatedRecords = records.map((record) => ({
    ...record,
    status: verified ? 'verified' : 'pending',
  }))
  if (verified) {
    db.prepare("UPDATE domains SET status = 'verified', verified_at = ?, records_json = ? WHERE id = ?").run(
      nowIso(),
      JSON.stringify(updatedRecords),
      domainId,
    )
  } else {
    db.prepare('UPDATE domains SET records_json = ? WHERE id = ?').run(JSON.stringify(updatedRecords), domainId)
  }
  return {
    verified,
    checks,
    domain: domainView(db.prepare('SELECT * FROM domains WHERE id = ?').get(domainId)),
    dkimRecord,
  }
}

export function updateDomainRoute(workspaceId, domainId, patch = {}) {
  const db = getDb()
  const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?').get(domainId, workspaceId)
  if (!domain) throw fail(404, 'domain_not_found', 'Domain not found.')
  const transport = String(patch.transport || '')
  if (!DOMAIN_TRANSPORTS.includes(transport)) {
    throw fail(400, 'invalid_transport', 'Choose inherit, smtp, direct or http.')
  }
  if (transport === 'inherit' || transport === 'direct') {
    db.prepare('UPDATE domains SET route_transport = ?, route_config_enc = NULL WHERE id = ?').run(transport, domainId)
    return domainView(db.prepare('SELECT * FROM domains WHERE id = ?').get(domainId))
  }

  let stored = {}
  if (domain.route_config_enc) {
    try {
      stored = parseJson(decryptSecret(domain.route_config_enc), {})
    } catch {
      throw fail(400, 'route_config_invalid', 'The existing delivery route could not be decrypted.')
    }
  }
  if (patch.smtpUrl !== undefined) {
    const smtpUrl = String(patch.smtpUrl || '').trim()
    if (!smtpUrl) delete stored.smtpUrl
    else {
      try {
        const parsed = new URL(smtpUrl)
        if (!['smtp:', 'smtps:'].includes(parsed.protocol)) throw new Error('protocol')
      } catch {
        throw fail(400, 'invalid_smtp_url', 'Use an smtp:// or smtps:// URL.')
      }
      stored.smtpUrl = smtpUrl
    }
  }
  if (patch.adapterUrl !== undefined) {
    const adapterUrl = String(patch.adapterUrl || '').trim()
    if (!adapterUrl) delete stored.adapterUrl
    else {
      try {
        const parsed = new URL(adapterUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol')
      } catch {
        throw fail(400, 'invalid_adapter_url', 'Use an http:// or https:// adapter URL.')
      }
      stored.adapterUrl = adapterUrl
    }
  }
  if (patch.adapterToken !== undefined) {
    const token = String(patch.adapterToken || '').trim()
    if (!token) delete stored.adapterToken
    else {
      if (token.length < 8) throw fail(400, 'adapter_token_too_short', 'Use an adapter token of at least 8 characters.')
      stored.adapterToken = token
    }
  }
  if (transport === 'http') {
    if (!stored.adapterUrl && !config.mail.adapterUrl) {
      throw fail(400, 'adapter_url_required', 'An adapter URL is required for HTTP delivery.')
    }
    if (!stored.adapterToken && !config.mail.adapterToken) {
      throw fail(400, 'adapter_token_required', 'An adapter token is required for HTTP delivery.')
    }
  }
  db.prepare('UPDATE domains SET route_transport = ?, route_config_enc = ? WHERE id = ?').run(
    transport,
    Object.keys(stored).length ? encryptSecret(JSON.stringify(stored)) : null,
    domainId,
  )
  return domainView(db.prepare('SELECT * FROM domains WHERE id = ?').get(domainId))
}

export function addIdentity(workspaceId, domainId, fromEmail, fromName = '') {
  const db = getDb()
  const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?').get(domainId, workspaceId)
  if (!domain) throw fail(404, 'domain_not_found', 'Domain not found.')
  const email = normaliseEmail(fromEmail)
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw fail(400, 'invalid_email', 'Enter a valid email address.')
  if (email.split('@')[1] !== domain.name) throw fail(400, 'wrong_domain', `The address must use @${domain.name}.`)
  if (db.prepare('SELECT 1 FROM identities WHERE workspace_id = ? AND from_email = ?').get(workspaceId, email)) {
    throw fail(409, 'identity_exists', 'That sender identity already exists.')
  }
  const id = makeId('idt', 6)
  db.prepare(
    `INSERT INTO identities (id, workspace_id, domain_id, from_email, from_name, signature_html, created_at)
     VALUES (?, ?, ?, ?, ?, '', ?)`,
  ).run(id, workspaceId, domainId, email, String(fromName || '').slice(0, 120), nowIso())
  return { id, email, name: fromName }
}

export function removeIdentity(workspaceId, identityId) {
  const db = getDb()
  const identity = db.prepare('SELECT * FROM identities WHERE id = ? AND workspace_id = ?').get(identityId, workspaceId)
  if (!identity) throw fail(404, 'identity_not_found', 'Sender identity not found.')
  const count = db.prepare('SELECT COUNT(*) AS count FROM identities WHERE domain_id = ?').get(identity.domain_id).count
  if (count <= 1) throw fail(400, 'last_identity', 'A sending domain must keep at least one identity.')
  db.prepare('DELETE FROM identities WHERE id = ?').run(identityId)
}

export function removeDomain(workspaceId, domainId) {
  const db = getDb()
  const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?').get(domainId, workspaceId)
  if (!domain) throw fail(404, 'domain_not_found', 'Domain not found.')
  db.prepare('DELETE FROM domains WHERE id = ?').run(domainId)
}
