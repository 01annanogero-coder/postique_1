import { config } from '../config.js'
import { getDb, nowIso, parseJson, transaction } from '../db/index.js'
import { makeId, normaliseEmail } from './crypto.js'
import { fail } from './http.js'
import { logger } from './logger.js'
import { createOutboundMessage } from './messages.js'
import { compileMjml, htmlToText, renderSubject } from './templates.js'
import { enqueue } from './queue.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACTIVE = ['draft', 'running', 'paused']

function normaliseRecipient(recipient, index) {
  const email = normaliseEmail(recipient?.email)
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 320) {
    throw fail(400, 'invalid_recipient', `Recipient ${index + 1} does not have a valid email address.`)
  }
  return {
    email,
    name: String(recipient.name || '').slice(0, 160),
    externalUserId: recipient.external_user_id ? String(recipient.external_user_id).slice(0, 200) : null,
    variables: recipient.variables && typeof recipient.variables === 'object' ? recipient.variables : {},
  }
}

function templateVersion(workspaceId, reference) {
  const db = getDb()
  const template = db
    .prepare('SELECT * FROM templates WHERE workspace_id = ? AND (slug = ? OR id = ?)')
    .get(workspaceId, String(reference || ''), String(reference || ''))
  if (!template) throw fail(404, 'template_not_found', 'Campaign template not found.')
  const version = db
    .prepare("SELECT * FROM template_versions WHERE template_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
    .get(template.id)
  if (!version) throw fail(400, 'template_not_published', 'Publish the campaign template before starting.')
  return { template, version }
}

export function campaignView(campaign) {
  const db = getDb()
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM campaign_recipients
       WHERE campaign_id = ? GROUP BY status`,
    )
    .all(campaign.id)
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row.count]))
  if (campaign.status === 'running' && !(byStatus.pending || byStatus.queued)) {
    db.prepare("UPDATE campaigns SET status = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?").run(
      nowIso(),
      nowIso(),
      campaign.id,
    )
    campaign = { ...campaign, status: 'completed', completed_at: nowIso() }
  }
  const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0)
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    total: total || campaign.total || 0,
    pending: byStatus.pending || 0,
    queued: byStatus.queued || 0,
    sent: byStatus.sent || 0,
    failed: byStatus.failed || 0,
    suppressed: byStatus.suppressed || 0,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    startedAt: campaign.started_at,
    completedAt: campaign.completed_at,
    templateId: campaign.template_id,
    fromEmail: campaign.from_email,
    subjectOverride: campaign.subject_override,
    batchSize: campaign.batch_size,
    options: parseJson(campaign.options_json, {}),
  }
}

export function listCampaigns(workspaceId, limit = 100) {
  return getDb()
    .prepare('SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(workspaceId, Math.min(Math.max(Number(limit) || 100, 1), 200))
    .map(campaignView)
}

export function getCampaign(workspaceId, id) {
  const campaign = getDb().prepare('SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?').get(id, workspaceId)
  if (!campaign) throw fail(404, 'campaign_not_found', 'Campaign not found.')
  return campaign
}

export function campaignDetail(workspaceId, id) {
  const campaign = getCampaign(workspaceId, id)
  const recipients = getDb()
    .prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY created_at ASC LIMIT 5000')
    .all(id)
    .map((recipient) => ({
      id: recipient.id,
      email: recipient.email,
      name: recipient.name,
      externalUserId: recipient.external_user_id,
      status: recipient.status,
      error: recipient.error,
      messageId: recipient.message_id,
      createdAt: recipient.created_at,
    }))
  return { campaign: campaignView(campaign), recipients }
}

export function createCampaign({ workspaceId, name, template, fromEmail, fromName, subject, options = {}, recipients = [] }) {
  if (!String(name || '').trim()) throw fail(400, 'campaign_name_required', 'Enter a campaign name.')
  if (recipients.length > config.campaigns.maxRecipientsPerRequest) {
    throw fail(413, 'too_many_recipients', `A single request can contain at most ${config.campaigns.maxRecipientsPerRequest} recipients.`)
  }
  const db = getDb()
  const campaignTemplate = template ? templateVersion(workspaceId, template) : null
  const id = makeId('cmp')
  const createdAt = new Date()
  const retentionAt = new Date(createdAt.getTime() + config.campaigns.retentionDays * 24 * 60 * 60 * 1000)
  db.prepare(
    `INSERT INTO campaigns
      (id, workspace_id, name, status, template_id, template_version_id, from_email, from_name,
       subject_override, total, batch_size, options_json, created_at, updated_at, retention_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    String(name).trim().slice(0, 160),
    campaignTemplate?.template.id || null,
    campaignTemplate?.version.id || null,
    String(fromEmail || '').slice(0, 320),
    String(fromName || '').slice(0, 160),
    String(subject || '').slice(0, 300),
    config.campaigns.batchSize,
    JSON.stringify(options && typeof options === 'object' ? options : {}),
    createdAt.toISOString(),
    createdAt.toISOString(),
    retentionAt.toISOString(),
  )
  const campaign = getCampaign(workspaceId, id)
  if (recipients.length) addCampaignRecipients({ workspaceId, campaignId: id, recipients })
  return campaignDetail(workspaceId, id)
}

export function addCampaignRecipients({ workspaceId, campaignId, recipients }) {
  const campaign = getCampaign(workspaceId, campaignId)
  if (!ACTIVE.includes(campaign.status)) throw fail(409, 'campaign_closed', 'This campaign can no longer accept recipients.')
  if (!Array.isArray(recipients) || recipients.length === 0) return { added: 0 }
  if (recipients.length > config.campaigns.maxRecipientsPerRequest) {
    throw fail(413, 'too_many_recipients', `A single request can contain at most ${config.campaigns.maxRecipientsPerRequest} recipients.`)
  }
  const prepared = recipients.map(normaliseRecipient)
  const unique = new Map()
  for (const recipient of prepared) if (!unique.has(recipient.email)) unique.set(recipient.email, recipient)
  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ?').get(campaignId).count
  if (existing + unique.size > config.campaigns.maxRecipients) {
    throw fail(413, 'campaign_recipient_limit', `A campaign can contain at most ${config.campaigns.maxRecipients} recipients.`)
  }
  let added = 0
  transaction((tx) => {
    const insert = tx.prepare(
      `INSERT OR IGNORE INTO campaign_recipients
        (id, campaign_id, workspace_id, external_user_id, email, name, variables_json, status,
         created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    const now = new Date()
    const expiresAt = new Date(now.getTime() + config.campaigns.retentionDays * 24 * 60 * 60 * 1000).toISOString()
    for (const recipient of unique.values()) {
      const result = insert.run(
        makeId('crp'),
        campaignId,
        workspaceId,
        recipient.externalUserId,
        recipient.email,
        recipient.name,
        JSON.stringify(recipient.variables),
        now.toISOString(),
        now.toISOString(),
        expiresAt,
      )
      added += result.changes
    }
    tx.prepare('UPDATE campaigns SET total = total + ?, updated_at = ? WHERE id = ?').run(added, nowIso(), campaignId)
  })
  const total = getDb().prepare('SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ?').get(campaignId).count
  if (total > config.campaigns.maxRecipients) {
    throw fail(413, 'campaign_recipient_limit', `A campaign can contain at most ${config.campaigns.maxRecipients} recipients.`)
  }
  return { added, total }
}

export function startCampaign(workspaceId, id) {
  const campaign = getCampaign(workspaceId, id)
  if (!['draft', 'paused'].includes(campaign.status)) {
    throw fail(409, 'campaign_not_startable', 'Only draft or paused campaigns can be started.')
  }
  const total = getDb().prepare('SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ?').get(id).count
  if (!total) throw fail(400, 'campaign_empty', 'Add at least one recipient before starting.')
  if (!campaign.template_id && !campaign.template_version_id) {
    throw fail(400, 'template_required', 'Choose a published template before starting.')
  }
  const version = campaign.template_version_id
    ? getDb().prepare('SELECT * FROM template_versions WHERE id = ?').get(campaign.template_version_id)
    : null
  if (!version || version.status !== 'published') {
    const resolved = templateVersion(workspaceId, campaign.template_id)
    getDb()
      .prepare('UPDATE campaigns SET template_id = ?, template_version_id = ? WHERE id = ?')
      .run(resolved.template.id, resolved.version.id, id)
  }
  getDb()
    .prepare("UPDATE campaigns SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?")
    .run(nowIso(), nowIso(), id)
  enqueue('campaign_batch', { campaignId: id })
  return campaignView(getCampaign(workspaceId, id))
}

export function pauseCampaign(workspaceId, id) {
  const campaign = getCampaign(workspaceId, id)
  if (campaign.status !== 'running') throw fail(409, 'campaign_not_running', 'This campaign is not running.')
  getDb().prepare("UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?").run(nowIso(), id)
  return campaignView(getCampaign(workspaceId, id))
}

export function resumeCampaign(workspaceId, id) {
  const campaign = getCampaign(workspaceId, id)
  if (campaign.status !== 'paused') throw fail(409, 'campaign_not_paused', 'This campaign is not paused.')
  getDb().prepare("UPDATE campaigns SET status = 'running', updated_at = ? WHERE id = ?").run(nowIso(), id)
  enqueue('campaign_batch', { campaignId: id })
  return campaignView(getCampaign(workspaceId, id))
}

export function cancelCampaign(workspaceId, id) {
  const campaign = getCampaign(workspaceId, id)
  if (['completed', 'cancelled'].includes(campaign.status)) return campaignView(campaign)
  getDb()
    .prepare("UPDATE campaign_recipients SET status = 'cancelled', updated_at = ? WHERE campaign_id = ? AND status IN ('pending','queued')")
    .run(nowIso(), id)
  getDb().prepare("UPDATE campaigns SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?").run(
    nowIso(),
    nowIso(),
    id,
  )
  return campaignView(getCampaign(workspaceId, id))
}

function resolveCampaignFrom(campaign) {
  if (campaign.from_email) return { name: campaign.from_name || '', email: campaign.from_email }
  const identity = getDb()
    .prepare('SELECT * FROM identities WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(campaign.workspace_id)
  if (!identity) throw fail(400, 'sender_required', 'Add and verify a sending domain before starting this campaign.')
  return { name: identity.from_name || '', email: identity.from_email }
}

export async function processCampaignBatch(campaignId) {
  const db = getDb()
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId)
  if (!campaign || campaign.status !== 'running') return
  const version = campaign.template_version_id
    ? db.prepare('SELECT * FROM template_versions WHERE id = ?').get(campaign.template_version_id)
    : null
  if (!version) throw new Error('Campaign template version is missing.')
  const from = resolveCampaignFrom(campaign)
  const recipients = db
    .prepare("SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT ?")
    .all(campaignId, campaign.batch_size || config.campaigns.batchSize)
  for (const recipient of recipients) {
    const current = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId)
    if (current?.status !== 'running') break
    const suppressed = db
      .prepare('SELECT 1 FROM suppressions WHERE workspace_id = ? AND email = ?')
      .get(campaign.workspace_id, recipient.email)
    if (suppressed) {
      db.prepare("UPDATE campaign_recipients SET status = 'suppressed', updated_at = ? WHERE id = ?").run(nowIso(), recipient.id)
      continue
    }
    try {
      const stored = parseJson(recipient.variables_json, {})
      const variables = {
        ...parseJson(campaign.options_json, {}),
        ...stored,
        email: recipient.email,
        name: recipient.name,
        external_user_id: recipient.external_user_id || '',
        campaign: campaign.name,
      }
      const compiled = await compileMjml(version.mjml, variables)
      const message = createOutboundMessage({
        workspaceId: campaign.workspace_id,
        threadId: null,
        from,
        to: [{ name: recipient.name, email: recipient.email }],
        subject: campaign.subject_override || renderSubject(version.subject, variables),
        html: compiled.html,
        text: htmlToText(compiled.html),
        templateVersionId: version.id,
        authorType: 'campaign',
        campaignId: campaign.id,
        campaignRecipientId: recipient.id,
      })
      db.prepare(
        "UPDATE campaign_recipients SET status = 'queued', message_id = ?, updated_at = ?, error = NULL WHERE id = ?",
      ).run(message.id, nowIso(), recipient.id)
    } catch (error) {
      logger.warn({ campaignId, recipientId: recipient.id, error: error.message }, 'Campaign recipient failed')
      db.prepare("UPDATE campaign_recipients SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(
        String(error.message).slice(0, 1000),
        nowIso(),
        recipient.id,
      )
    }
  }
  const pending = db
    .prepare("SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending'")
    .get(campaignId).count
  const running = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId)?.status === 'running'
  if (pending > 0 && running) enqueue('campaign_batch', { campaignId })
  else if (running && pending === 0) {
    const queued = db
      .prepare("SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ? AND status = 'queued'")
      .get(campaignId).count
    if (queued === 0) {
      db.prepare("UPDATE campaigns SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(
        nowIso(),
        nowIso(),
        campaignId,
      )
    }
  }
}

export function cleanupCampaignRecipients() {
  const now = nowIso()
  getDb()
    .prepare("DELETE FROM campaign_recipients WHERE expires_at < ? AND status NOT IN ('pending','queued')")
    .run(now)
}
