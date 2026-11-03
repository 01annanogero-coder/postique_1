#!/usr/bin/env node
/**
 * Postique reference mail adapter.
 *
 * Run this on a VPS or any host that can reach your SMTP relay. It accepts
 * DKIM-signed raw MIME from Postique and relays it without rebuilding headers.
 *
 *   ADAPTER_TOKEN=... SMTP_URL=smtp://user:pass@relay:587 node adapter/server.mjs
 */
import crypto from 'node:crypto'
import http from 'node:http'
import nodemailer from 'nodemailer'

const PORT = Number(process.env.PORT || 8787)
const TOKEN = process.env.ADAPTER_TOKEN || ''
const SMTP_URL = process.env.SMTP_URL || process.env.ADAPTER_SMTP_URL || ''
const MAX_BYTES = Number(process.env.ADAPTER_MAX_BYTES || 35 * 1024 * 1024)
const cache = new Map()

if (!TOKEN || TOKEN.length < 8) {
  console.error('ADAPTER_TOKEN must be set to at least 8 characters.')
  process.exit(1)
}
if (!SMTP_URL) {
  console.error('SMTP_URL must point at your relay, for example smtp://user:pass@relay:587.')
  process.exit(1)
}

const transport = nodemailer.createTransport(SMTP_URL)

function signature(body) {
  return `sha256=${crypto.createHmac('sha256', TOKEN).update(body).digest('hex')}`
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BYTES) {
        reject(Object.assign(new Error('Payload too large.'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function deliver(payload) {
  const raw = Buffer.from(String(payload.raw || ''), 'base64')
  if (!raw.length) throw Object.assign(new Error('raw MIME is required.'), { status: 400 })
  const envelope = payload.envelope || {}
  if (!envelope.from || !Array.isArray(envelope.to) || envelope.to.length === 0) {
    throw Object.assign(new Error('envelope.from and envelope.to are required.'), { status: 400 })
  }
  const info = await transport.sendMail({
    envelope: { from: envelope.from, to: envelope.to },
    raw,
  })
  return {
    status: 'sent',
    id: info.messageId || payload.messageId || crypto.randomUUID(),
    accepted: info.accepted || envelope.to,
    rejected: info.rejected || [],
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'postique-mail-adapter' }))
      return
    }
    if (req.method !== 'POST' || !['/v1/deliver', '/'].includes(req.url)) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'not_found', message: 'Not found.' } }))
      return
    }
    const authorization = req.headers.authorization || ''
    const provided = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
    if (!safeEqual(provided, TOKEN)) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'unauthorized', message: 'Invalid adapter token.' } }))
      return
    }
    const body = await readBody(req)
    const providedSignature = req.headers['x-postique-signature'] || ''
    if (!safeEqual(providedSignature, signature(body))) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'invalid_signature', message: 'Invalid HMAC signature.' } }))
      return
    }
    const payload = JSON.parse(body)
    const key = String(payload.messageId || req.headers['idempotency-key'] || '')
    if (key && cache.has(key)) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(cache.get(key)))
      return
    }
    const result = await deliver(payload)
    if (key) cache.set(key, result)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch (error) {
    const status = error.status || 500
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'failed',
        retryable: status >= 500,
        error: { code: 'adapter_delivery_failed', message: error.message },
      }),
    )
  }
})

server.listen(PORT, () => {
  console.log(`Postique mail adapter listening on :${PORT}`)
})
