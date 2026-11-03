import { config } from '../config.js'
import { getDb, parseJson } from '../db/index.js'
import { templateView } from './templates.js'
import {
  assetView,
  domainView,
  faqView,
  keyView,
  logView,
  relativeTime,
  statusLabel,
  threadView,
  webhookView,
} from './presenters.js'
import { automationSettings, authSettings, workspaceView } from './workspace.js'
import { appAuthStats, listAppUsers } from './app-auth.js'
import { publicUser } from './auth.js'

const ACTIVITY_COLORS = {
  received: '#C6F26B',
  sent: '#9CCB5B',
  bounced: '#E0996A',
  failed: '#D17848',
  complained: '#B84A3B',
  automation: '#9B7AC8',
}

function templateList(workspaceId) {
  const db = getDb()
  const templates = db
    .prepare('SELECT * FROM templates WHERE workspace_id = ? ORDER BY updated_at DESC')
    .all(workspaceId)
  return templates.map((template) => {
    const versions = db.prepare('SELECT * FROM template_versions WHERE template_id = ?').all(template.id)
    const view = templateView(template, versions)
    return {
      ...view,
      updated: relativeTime(template.updated_at),
    }
  })
}

function threadList(workspaceId) {
  const db = getDb()
  return db
    .prepare('SELECT * FROM threads WHERE workspace_id = ? ORDER BY last_activity_at DESC LIMIT 200')
    .all(workspaceId)
    .map((thread) => threadView(thread))
}

function logList(workspaceId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT m.*, t.name AS template_name
       FROM messages m
       LEFT JOIN template_versions tv ON tv.id = m.template_version_id
       LEFT JOIN templates t ON t.id = tv.template_id
       WHERE m.workspace_id = ?
       ORDER BY m.created_at DESC LIMIT 100`,
    )
    .all(workspaceId)
    .map((message) => logView(message))
}

function domainList(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM domains WHERE workspace_id = ? ORDER BY created_at ASC')
    .all(workspaceId)
    .map((domain) => domainView(domain))
}

function assetList(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM assets WHERE workspace_id = ? ORDER BY created_at DESC')
    .all(workspaceId)
    .map((asset) => assetView(asset))
}

function keyList(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC')
    .all(workspaceId)
    .map((key) => keyView(key))
}

function faqList(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM faqs WHERE workspace_id = ? ORDER BY created_at ASC')
    .all(workspaceId)
    .map((faq) => faqView(faq))
}

function webhookList(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC')
    .all(workspaceId)
    .map((webhook) => webhookView(webhook))
}

function volumeSeries(workspaceId) {
  const db = getDb()
  const days = []
  const today = new Date()
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    const row = db
      .prepare(
        `SELECT
          SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) AS sent,
          SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) AS replies
         FROM messages WHERE workspace_id = ? AND created_at >= ? AND created_at <= ?`,
      )
      .get(workspaceId, start.toISOString(), end.toISOString())
    days.push({
      day: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      sent: row.sent || 0,
      delivered: row.sent || 0,
      replies: row.replies || 0,
    })
  }
  return days
}

function activityList(workspaceId) {
  const db = getDb()
  const events = db
    .prepare(
      `SELECT e.*, m.subject, m.thread_id, m.direction
       FROM message_events e
       JOIN messages m ON m.id = e.message_id
       WHERE m.workspace_id = ?
       ORDER BY e.at DESC LIMIT 8`,
    )
    .all(workspaceId)
  return events.map((event) => {
    const payload = parseJson(event.payload_json, {})
    const title =
      event.type === 'received'
        ? 'Reply received'
        : event.type === 'sent'
          ? 'Message sent'
          : event.type === 'bounced'
            ? 'Bounce recorded'
            : event.type === 'failed'
              ? 'Send failed'
              : event.type === 'automation'
                ? 'Automation replied'
                : statusLabel(event.type)
    return {
      id: event.id,
      type: event.type,
      title,
      detail: event.subject || payload.detail || '',
      time: relativeTime(event.at),
      color: ACTIVITY_COLORS[event.type] || '#A5A79F',
    }
  })
}

function metricsFor(workspaceId, threads, templates, domains, assets) {
  const db = getDb()
  const counts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) AS outbound,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) AS inbound,
        SUM(CASE WHEN direction = 'out' AND status IN ('sent','bounced','complained') THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN direction = 'out' AND status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN direction = 'out' AND status = 'complained' THEN 1 ELSE 0 END) AS complained,
        SUM(CASE WHEN direction = 'out' AND status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM messages WHERE workspace_id = ?`,
    )
    .get(workspaceId)
  const delivered = counts.sent - counts.bounced - counts.complained
  const deliveryRate = counts.outbound > 0 ? (delivered / counts.outbound) * 100 : 0
  const suppressions = getDb()
    .prepare('SELECT COUNT(*) AS count FROM suppressions WHERE workspace_id = ?')
    .get(workspaceId).count
  return {
    sent: counts.sent || 0,
    outbound: counts.outbound || 0,
    inbound: counts.inbound || 0,
    replies: counts.inbound || 0,
    bounced: counts.bounced || 0,
    complained: counts.complained || 0,
    failed: counts.failed || 0,
    suppressions,
    deliveryRate: Number(deliveryRate.toFixed(1)),
    openConversations: threads.filter((thread) => thread.status === 'open').length,
    unread: threads.filter((thread) => thread.unread).length,
    templates: templates.length,
    domains: domains.length,
    assets: assets.length,
    storageBytes: assets.reduce((total, asset) => total + (asset.bytes || 0), 0),
  }
}

function usageFor(workspaceId) {
  const db = getDb()
  const period = new Date().toISOString().slice(0, 7)
  const row = db
    .prepare('SELECT * FROM usage_counters WHERE workspace_id = ? AND period = ?')
    .get(workspaceId, period)
  const storage = db.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM assets WHERE workspace_id = ?').get(workspaceId)
  return {
    period,
    sends: row?.sends || 0,
    inbound: row?.inbound || 0,
    storageBytes: storage.bytes || 0,
    sendLimit: config.limits.monthlySends,
    hourlySendLimit: config.limits.sendPerHour,
  }
}

export function bootstrap(workspace, user) {
  const threads = threadList(workspace.id)
  const templates = templateList(workspace.id)
  const domains = domainList(workspace.id)
  const assets = assetList(workspace.id)
  return {
    user: publicUser(user),
    workspace: workspaceView(workspace, user),
    threads,
    templates,
    domains,
    assets,
    keys: keyList(workspace.id),
    logs: logList(workspace.id),
    faqs: faqList(workspace.id),
    automation: automationSettings(workspace.id),
    auth: {
      settings: authSettings(workspace.id),
      users: listAppUsers(workspace.id, { limit: 100 }),
      metrics: appAuthStats(workspace.id),
    },
    webhooks: webhookList(workspace.id),
    labels: getDb()
      .prepare('SELECT id, name, color FROM labels WHERE workspace_id = ? ORDER BY name')
      .all(workspace.id),
    metrics: metricsFor(workspace.id, threads, templates, domains, assets),
    volume: volumeSeries(workspace.id),
    activity: activityList(workspace.id),
    usage: usageFor(workspace.id),
    config: {
      inboundDomain: config.inbound.domain,
      appUrl: config.appUrl,
      mailTransport: config.mail.transport,
      inboundPort: config.inbound.port,
      inboundEnabled: config.inbound.enabled,
      allowManualVerification: config.dns.allowManualVerification,
      sendLimit: config.limits.sendPerHour,
      maxAttachmentBytes: config.limits.maxAttachmentBytes,
      maxInboundBytes: config.inbound.maxSize,
    },
  }
}
