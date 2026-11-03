import crypto from 'node:crypto'
import { SendError } from './mail-errors.js'

function signature(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
}

export async function sendViaAdapter({ adapterUrl, adapterToken, timeoutMs = 20000, mail, raw, messageId }) {
  if (!adapterUrl) {
    throw new SendError('No HTTP mail adapter URL is configured.', {
      retryable: false,
      code: 'adapter_not_configured',
    })
  }
  if (!adapterToken) {
    throw new SendError('No HTTP mail adapter token is configured.', {
      retryable: false,
      code: 'adapter_token_required',
    })
  }
  const payload = JSON.stringify({
    envelope: {
      from: mail.from,
      to: mail.to,
      cc: mail.cc || [],
      bcc: mail.bcc || [],
    },
    raw: Buffer.from(raw).toString('base64'),
    messageId,
    metadata: {
      subject: mail.subject,
      messageId: messageId,
      headers: mail.headers || {},
    },
  })
  let response
  try {
    response = await fetch(adapterUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adapterToken}`,
        'content-type': 'application/json',
        'x-postique-signature': signature(adapterToken, payload),
        'idempotency-key': messageId,
      },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new SendError(`Mail adapter could not be reached: ${error.message}`, {
      retryable: true,
      code: 'adapter_unreachable',
    })
  }
  const text = await response.text()
  let body = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = {}
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500
    throw new SendError(
      body.error?.message || body.message || `Mail adapter rejected the message (${response.status}).`,
      { retryable, code: body.error?.code || 'adapter_rejected' },
    )
  }
  if (body.status === 'failed') {
    throw new SendError(body.error?.message || 'The mail adapter reported a delivery failure.', {
      retryable: Boolean(body.retryable),
      code: body.error?.code || 'adapter_failed',
    })
  }
  return {
    messageId: body.id || body.messageId || messageId,
    response: text,
    accepted: Array.isArray(body.accepted) && body.accepted.length ? body.accepted : mail.to,
    rejected: Array.isArray(body.rejected) ? body.rejected : [],
  }
}
