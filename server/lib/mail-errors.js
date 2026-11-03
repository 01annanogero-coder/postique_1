export class SendError extends Error {
  constructor(message, { retryable = true, code = 'send_failed' } = {}) {
    super(message)
    this.name = 'SendError'
    this.retryable = retryable
    this.code = code
  }
}
