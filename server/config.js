import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config()

const serverDir = path.dirname(fileURLToPath(import.meta.url))
export const rootDir = path.resolve(serverDir, '..')

function bool(value, fallback = false) {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function number(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normaliseUrl(value, fallback) {
  return (value || fallback).replace(/\/+$/, '')
}

function pemValue(value) {
  if (!value) return ''
  try {
    if (fs.existsSync(value)) return fs.readFileSync(value, 'utf8')
  } catch {
    // If it is not a file path, treat the environment value itself as PEM content.
  }
  return value
}

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data')
const appUrl = normaliseUrl(process.env.APP_URL, `http://localhost:${number(process.env.PORT, 3000)}`)
const inboundDomain = (process.env.INBOUND_DOMAIN || 'in.postique.local').toLowerCase().replace(/^@/, '')
const inboundEnabled = bool(process.env.INBOUND_SMTP_ENABLED, true)
const mailTransport = (process.env.MAIL_TRANSPORT || 'file').toLowerCase()

function loadSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) {
    return process.env.APP_SECRET
  }
  fs.mkdirSync(dataDir, { recursive: true })
  const secretPath = path.join(dataDir, '.app-secret')
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim()
  const generated = crypto.randomBytes(48).toString('base64url')
  fs.writeFileSync(secretPath, `${generated}\n`, { mode: 0o600 })
  return generated
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  rootDir,
  port: number(process.env.PORT, 3000),
  appUrl,
  dataDir,
  dbPath: path.resolve(rootDir, process.env.DATABASE_PATH || path.join(dataDir, 'postique.db')),
  uploadsDir: path.join(dataDir, 'uploads'),
  attachmentsDir: path.join(dataDir, 'attachments'),
  outboxDir: path.join(dataDir, 'outbox'),
  appSecret: loadSecret(),
  sessionCookie: 'postique_session',
  csrfCookie: 'postique_csrf',
  sessionDays: number(process.env.SESSION_DAYS, 30),
  secureCookies: bool(process.env.SECURE_COOKIES, appUrl.startsWith('https://')),
  allowSignups: bool(process.env.ALLOW_SIGNUPS, false),
  auth: {
    accessTokenSeconds: number(process.env.AUTH_ACCESS_TOKEN_TTL, 3600),
    refreshDays: number(process.env.AUTH_REFRESH_TOKEN_DAYS, 30),
    magicLinkMinutes: number(process.env.AUTH_MAGIC_LINK_MINUTES, 15),
    otpMinutes: number(process.env.AUTH_OTP_MINUTES, 10),
    passwordMinLength: number(process.env.AUTH_PASSWORD_MIN_LENGTH, 8),
    debugLinks: bool(process.env.AUTH_DEBUG_LINKS, process.env.NODE_ENV !== 'production'),
  },
  embed: {
    tokenMinutes: number(process.env.EMBED_TOKEN_MINUTES, 60),
    maxThreads: number(process.env.EMBED_MAX_THREADS, 50),
    maxAttachments: number(process.env.EMBED_MAX_ATTACHMENTS, 5),
  },
  verification: {
    tokenMinutes: number(process.env.VERIFY_TOKEN_MINUTES, 30),
    retentionHours: number(process.env.VERIFY_RETENTION_HOURS, 24),
    maxPerHour: number(process.env.VERIFY_MAX_PER_HOUR, 5),
    debugLinks: bool(process.env.VERIFY_DEBUG_LINKS, process.env.NODE_ENV !== 'production'),
  },
  campaigns: {
    batchSize: number(process.env.CAMPAIGN_BATCH_SIZE, 50),
    maxRecipientsPerRequest: number(process.env.CAMPAIGN_MAX_RECIPIENTS_PER_REQUEST, 5000),
    maxRecipients: number(process.env.CAMPAIGN_MAX_RECIPIENTS, 100000),
    retentionDays: number(process.env.CAMPAIGN_RETENTION_DAYS, 30),
  },
  inbound: {
    enabled: inboundEnabled,
    host: process.env.INBOUND_SMTP_HOST || '0.0.0.0',
    port: number(process.env.INBOUND_SMTP_PORT, 2525),
    domain: inboundDomain,
    maxSize: number(process.env.INBOUND_MAX_BYTES, 25 * 1024 * 1024),
    tlsKey: pemValue(process.env.INBOUND_TLS_KEY || ''),
    tlsCert: pemValue(process.env.INBOUND_TLS_CERT || ''),
    httpSecret: process.env.INBOUND_HTTP_SECRET || '',
  },
  mail: {
    transport: ['file', 'smtp', 'direct', 'http'].includes(mailTransport) ? mailTransport : 'file',
    smtpUrl: process.env.SMTP_URL || '',
    adapterUrl: process.env.MAIL_ADAPTER_URL || '',
    adapterToken: process.env.MAIL_ADAPTER_TOKEN || '',
    adapterTimeoutMs: number(process.env.MAIL_ADAPTER_TIMEOUT_MS, 20000),
    heloName: process.env.SMTP_HELO_NAME || 'postique.local',
    fromDomain: (process.env.MAIL_FROM_DOMAIN || inboundDomain).toLowerCase(),
    directPort: number(process.env.SMTP_DIRECT_PORT, 25),
    spfRecord: process.env.SPF_RECORD || 'v=spf1 a mx ~all',
    dkimSelector: (process.env.DKIM_SELECTOR || 'postique').toLowerCase(),
  },
  limits: {
    sendPerHour: number(process.env.SEND_LIMIT_PER_HOUR, 1000),
    monthlySends: number(process.env.MONTHLY_SEND_LIMIT, 10000),
    publicSendPerMinute: number(process.env.PUBLIC_SEND_PER_MINUTE, 20),
    publicKeyPerMinute: number(process.env.PUBLIC_KEY_PER_MINUTE, 60),
    publicSendPerDay: number(process.env.PUBLIC_SEND_PER_DAY, 500),
    maxAttachmentBytes: number(process.env.MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024),
    maxAssetBytes: number(process.env.MAX_ASSET_BYTES, 10 * 1024 * 1024),
  },
  worker: {
    enabled: bool(process.env.WORKER_ENABLED, true),
    intervalMs: number(process.env.WORKER_INTERVAL_MS, 1000),
    concurrency: Math.max(1, number(process.env.WORKER_CONCURRENCY, 1)),
  },
  dns: {
    verificationEnabled: bool(process.env.DNS_VERIFICATION_ENABLED, true),
    allowManualVerification: bool(process.env.ALLOW_MANUAL_DOMAIN_VERIFICATION, true),
  },
  webhooks: {
    allowPrivate: bool(process.env.ALLOW_PRIVATE_WEBHOOKS, false),
    timeoutMs: number(process.env.WEBHOOK_TIMEOUT_MS, 10000),
  },
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
}

for (const directory of [config.dataDir, config.uploadsDir, config.attachmentsDir, config.outboxDir]) {
  fs.mkdirSync(directory, { recursive: true })
}

if (config.isProduction && !fs.existsSync(path.join(rootDir, 'dist', 'index.html'))) {
  // The API can still boot for setup/CLI use; serving the UI will explain the missing build.
}
