import { config } from '../config.js'
import { parseJson } from '../db/index.js'
import { decryptSecret } from './crypto.js'

export const DOMAIN_TRANSPORTS = ['inherit', 'smtp', 'direct', 'http']

export function resolveMailRoute(domain) {
  const selected = DOMAIN_TRANSPORTS.includes(domain?.route_transport) ? domain.route_transport : 'inherit'
  const route = {
    transport: config.mail.transport,
    source: 'global',
    smtpUrl: config.mail.smtpUrl,
    adapterUrl: config.mail.adapterUrl,
    adapterToken: config.mail.adapterToken,
    adapterTimeoutMs: config.mail.adapterTimeoutMs,
    configError: null,
  }
  if (selected === 'inherit') return route
  route.transport = selected
  route.source = 'domain'
  if (domain.route_config_enc) {
    try {
      const stored = parseJson(decryptSecret(domain.route_config_enc), {})
      if (stored.smtpUrl) route.smtpUrl = stored.smtpUrl
      if (stored.adapterUrl) route.adapterUrl = stored.adapterUrl
      if (stored.adapterToken) route.adapterToken = stored.adapterToken
    } catch (error) {
      route.configError = error.message
    }
  }
  return route
}
