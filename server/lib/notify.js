import { getDb, getWorkspaceSetting } from '../db/index.js'
import { createOutboundMessage } from './messages.js'
import { logger } from './logger.js'

/**
 * Send an operational notification to the workspace owner through the same
 * outbound transport. Failures are logged and never interrupt email processing.
 */
export function notifyOwner(workspaceId, { subject, text, preference = 'notifyReplies' }) {
  try {
    const settings = getWorkspaceSetting(workspaceId, 'ui', {}) || {}
    if (settings[preference] === false) return null
    const db = getDb()
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId)
    if (!workspace) return null
    const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(workspace.owner_user_id)
    if (!owner?.email) return null
    const identity = db
      .prepare('SELECT * FROM identities WHERE workspace_id = ? ORDER BY created_at LIMIT 1')
      .get(workspaceId)
    if (!identity) return null
    return createOutboundMessage({
      workspaceId,
      from: { name: identity.from_name || 'Postique', email: identity.from_email },
      to: [{ name: owner.name, email: owner.email }],
      subject: subject.slice(0, 240),
      html: `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#20251f">${text
        .split('\n')
        .map((line) => `<p>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`)
        .join('')}</div>`,
      text,
      authorType: 'system',
      isTest: true,
    })
  } catch (error) {
    logger.warn({ error: error.message, workspaceId }, 'Owner notification could not be queued')
    return null
  }
}
