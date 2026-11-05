import { config } from '../config.js'
import { fail } from './http.js'

/**
 * Optional Cloudflare Turnstile gate for public-key verification requests.
 * No provider is required for self-hosted use; when TURNSTILE_SECRET_KEY is set,
 * a valid token is mandatory.
 */
export async function verifyPublicCaptcha(token, remoteIp) {
  if (!config.verification.turnstileSecret) return
  if (!token) throw fail(400, 'captcha_required', 'Complete the verification challenge first.')
  const body = new URLSearchParams({
    secret: config.verification.turnstileSecret,
    response: String(token),
  })
  if (remoteIp) body.set('remoteip', String(remoteIp))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  let response
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    })
  } catch {
    throw fail(503, 'captcha_unavailable', 'The verification challenge is unavailable. Try again.')
  } finally {
    clearTimeout(timer)
  }
  const result = await response.json().catch(() => ({}))
  if (!result.success) throw fail(403, 'captcha_failed', 'The verification challenge failed.')
}
