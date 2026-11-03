export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function fail(status, code, message, details) {
  throw new ApiError(status, code, message, details)
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

export function sendJson(res, status, body) {
  res.status(status).json(body)
}

export function requireObject(value, name = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(400, 'invalid_body', `${name} must be a JSON object`)
  }
  return value
}

export function text(value, max = 10000) {
  return String(value ?? '').slice(0, max)
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  return value === true || value === 'true' || value === 1 || value === '1'
}
