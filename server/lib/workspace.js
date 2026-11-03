import { config } from '../config.js'
import {
  getDb,
  getWorkspaceSetting,
  nowIso,
  setWorkspaceSetting,
  transaction,
} from '../db/index.js'
import { makeId, randomToken } from './crypto.js'
import { slugify } from './templates.js'

const DEFAULT_LABELS = [
  ['Orders', '#5E8C3A'],
  ['Payments', '#A86A2E'],
  ['Returns', '#B4543B'],
  ['Shipping', '#4A6C9A'],
  ['Sales', '#7A5A9E'],
  ['Account', '#66736A'],
  ['Billing', '#8C6A36'],
  ['Needs review', '#C4714A'],
]

export const DEFAULT_AUTOMATION = {
  enabled: false,
  autoSend: false,
  humanReview: true,
  combine: true,
  confidence: 92,
  tone: 'Warm and concise',
}

export const DEFAULT_AUTH = {
  signupsEnabled: true,
  passwordEnabled: true,
  magicLinkEnabled: true,
  requireEmailVerification: false,
}

export function createWorkspace(user, name = 'My workspace') {
  return transaction((db) => {
    const baseSlug = slugify(name, 'workspace')
    let slug = baseSlug
    let suffix = 1
    while (db.prepare('SELECT 1 FROM workspaces WHERE slug = ?').get(slug)) {
      suffix += 1
      slug = `${baseSlug}-${suffix}`
    }
    const workspaceId = makeId('ws')
    const createdAt = nowIso()
    db.prepare(
      `INSERT INTO workspaces (id, name, slug, plan, owner_user_id, created_at)
       VALUES (?, ?, ?, 'self_hosted', ?, ?)`,
    ).run(workspaceId, name, slug, user.id, createdAt)
    db.prepare('INSERT INTO members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(
      workspaceId,
      user.id,
      'owner',
      createdAt,
    )
    const insertLabel = db.prepare(
      'INSERT INTO labels (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    for (const [label, color] of DEFAULT_LABELS) {
      insertLabel.run(makeId('lbl', 6), workspaceId, label, color, createdAt)
    }
    setWorkspaceSetting(workspaceId, 'automation', DEFAULT_AUTOMATION)
    setWorkspaceSetting(workspaceId, 'auth', DEFAULT_AUTH)
    return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId)
  })
}

export function authSettings(workspaceId) {
  return { ...DEFAULT_AUTH, ...(getWorkspaceSetting(workspaceId, 'auth', {}) || {}) }
}

export function updateAuthSettings(workspaceId, patch) {
  const next = { ...authSettings(workspaceId), ...patch }
  setWorkspaceSetting(workspaceId, 'auth', next)
  return next
}

export function automationSettings(workspaceId) {
  return { ...DEFAULT_AUTOMATION, ...(getWorkspaceSetting(workspaceId, 'automation', {}) || {}) }
}

export function updateAutomationSettings(workspaceId, patch) {
  const next = { ...automationSettings(workspaceId), ...patch }
  setWorkspaceSetting(workspaceId, 'automation', next)
  return next
}

export function createThread({
  workspaceId,
  subject,
  customerName = '',
  customerEmail = '',
  customerCompany = '',
  matched = true,
  orderRef = null,
  status = 'open',
  unread = true,
  embedUserId = null,
}) {
  const db = getDb()
  const id = makeId('thr')
  const createdAt = nowIso()
  const token = matched ? randomToken(12).replace(/[^a-z0-9]/gi, '').toLowerCase() : null
  db.prepare(
    `INSERT INTO threads
      (id, workspace_id, subject, customer_name, customer_email, customer_company,
       participants_json, reply_token, status, matched, unread, order_ref, snippet,
       created_at, last_activity_at, embed_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    subject || 'No subject',
    customerName,
    customerEmail,
    customerCompany,
    JSON.stringify(customerEmail ? [customerEmail] : []),
    token,
    status,
    matched ? 1 : 0,
    unread ? 1 : 0,
    orderRef,
    '',
    createdAt,
    createdAt,
    embedUserId ? String(embedUserId).slice(0, 200) : null,
  )
  return db.prepare('SELECT * FROM threads WHERE id = ?').get(id)
}

export function addThreadParticipant(threadId, email) {
  if (!email) return
  const db = getDb()
  const thread = db.prepare('SELECT participants_json FROM threads WHERE id = ?').get(threadId)
  const participants = new Set(JSON.parse(thread?.participants_json || '[]'))
  participants.add(email)
  db.prepare('UPDATE threads SET participants_json = ? WHERE id = ?').run(
    JSON.stringify([...participants]),
    threadId,
  )
}

export function touchThread(threadId, { snippet, unread = true } = {}) {
  const db = getDb()
  db.prepare(
    'UPDATE threads SET last_activity_at = ?, snippet = COALESCE(?, snippet), unread = ? WHERE id = ?',
  ).run(nowIso(), snippet ? String(snippet).replace(/\s+/g, ' ').slice(0, 180) : null, unread ? 1 : 0, threadId)
}

export function workspaceView(workspace, user) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    plan: 'Self-hosted',
    region: 'Local',
    replyDomain: config.inbound.domain,
    fromDomain: config.mail.fromDomain,
    owner: user?.name || '',
    email: user?.email || '',
    initials: (user?.name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
    aiEnabled: automationSettings(workspace.id).enabled,
    inboundDomain: config.inbound.domain,
    appUrl: config.appUrl,
    settings: getWorkspaceSetting(workspace.id, 'ui', {}),
  }
}
