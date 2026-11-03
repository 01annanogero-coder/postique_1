import pino from 'pino'
import { config } from '../config.js'

export const logger = pino({
  level: config.logLevel,
  base: { service: 'postique' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'secret',
      'apiKey',
    ],
    censor: '[redacted]',
  },
})
