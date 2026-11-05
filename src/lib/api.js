let csrfToken = ''

export function setCsrfToken(value) {
  csrfToken = value || ''
}

export function getCsrfToken() {
  if (csrfToken) return csrfToken
  const match = document.cookie.match(/(?:^|;\s*)postique_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export class ApiClientError extends Error {
  constructor(status, body) {
    super(body?.error?.message || body?.message || `Request failed with status ${status}`)
    this.status = status
    this.code = body?.error?.code
    this.details = body?.error?.details
  }
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, formData = null } = {}) {
  const requestHeaders = { ...headers }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    requestHeaders['x-csrf-token'] = getCsrfToken()
  }
  let payload
  if (formData) {
    payload = formData
  } else if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const response = await fetch(path, {
    method,
    headers: requestHeaders,
    body: payload,
    credentials: 'include',
  })
  const contentType = response.headers.get('content-type') || ''
  const parsed = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {}
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('postique:unauthorized'))
    }
    throw new ApiClientError(response.status, parsed)
  }
  return parsed
}

export const api = {
  status: () => apiRequest('/api/auth/status'),
  setup: (data) => apiRequest('/api/auth/setup', { method: 'POST', body: data }),
  login: (data) => apiRequest('/api/auth/login', { method: 'POST', body: data }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST', body: {} }),
  updateProfile: (data) => apiRequest('/api/auth/profile', { method: 'PATCH', body: data }),
  bootstrap: () => apiRequest('/api/bootstrap'),
  updateWorkspace: (data) => apiRequest('/api/workspace', { method: 'PATCH', body: data }),
  campaigns: () => apiRequest('/api/campaigns'),
  verifications: () => apiRequest('/api/verifications'),
  sendVerificationTest: (data) => apiRequest('/api/verifications/test', { method: 'POST', body: data }),
  campaign: (id) => apiRequest(`/api/campaigns/${id}`),
  createCampaign: (data) => apiRequest('/api/campaigns', { method: 'POST', body: data }),
  addCampaignRecipients: (id, recipients) =>
    apiRequest(`/api/campaigns/${id}/recipients`, { method: 'POST', body: { recipients } }),
  startCampaign: (id) => apiRequest(`/api/campaigns/${id}/start`, { method: 'POST', body: {} }),
  scheduleCampaign: (id, scheduledAt) =>
    apiRequest(`/api/campaigns/${id}/schedule`, { method: 'POST', body: { scheduled_at: scheduledAt } }),
  pauseCampaign: (id) => apiRequest(`/api/campaigns/${id}/pause`, { method: 'POST', body: {} }),
  resumeCampaign: (id) => apiRequest(`/api/campaigns/${id}/resume`, { method: 'POST', body: {} }),
  cancelCampaign: (id) => apiRequest(`/api/campaigns/${id}/cancel`, { method: 'POST', body: {} }),
  queue: () => apiRequest('/api/queue'),
  retryQueueJob: (id) => apiRequest(`/api/queue/jobs/${id}/retry`, { method: 'POST', body: {} }),
  cancelQueueJob: (id) => apiRequest(`/api/queue/jobs/${id}/cancel`, { method: 'POST', body: {} }),
  appAuth: (params = '') => apiRequest(`/api/app-auth${params}`),
  updateAppAuthSettings: (data) => apiRequest('/api/app-auth/settings', { method: 'PATCH', body: data }),
  sendAppAuthLink: (id, data) => apiRequest(`/api/app-auth/users/${id}/magic-link`, { method: 'POST', body: data }),
  setAppAuthUserDisabled: (id, disabled) =>
    apiRequest(`/api/app-auth/users/${id}`, { method: 'PATCH', body: { disabled } }),
  deleteAppAuthUser: (id) => apiRequest(`/api/app-auth/users/${id}`, { method: 'DELETE' }),
  thread: (id, data) => apiRequest(`/api/threads/${id}`, { method: 'PATCH', body: data }),
  threadLabels: (id, labels) => apiRequest(`/api/threads/${id}/labels`, { method: 'PATCH', body: { labels } }),
  reply: (id, text) => apiRequest(`/api/threads/${id}/reply`, { method: 'POST', body: { text } }),
  linkThread: (id, targetThreadId) =>
    apiRequest(`/api/threads/${id}/link`, { method: 'POST', body: { targetThreadId } }),
  createTemplate: (data) => apiRequest('/api/templates', { method: 'POST', body: data }),
  updateTemplate: (id, data) => apiRequest(`/api/templates/${id}`, { method: 'PUT', body: data }),
  publishTemplate: (id) => apiRequest(`/api/templates/${id}/publish`, { method: 'POST', body: {} }),
  duplicateTemplate: (id) => apiRequest(`/api/templates/${id}/duplicate`, { method: 'POST', body: {} }),
  deleteTemplate: (id) => apiRequest(`/api/templates/${id}`, { method: 'DELETE' }),
  testTemplate: (id, to) => apiRequest(`/api/templates/${id}/test`, { method: 'POST', body: { to } }),
  addDomain: (name) => apiRequest('/api/domains', { method: 'POST', body: { name } }),
  verifyDomain: (id, force = false) => apiRequest(`/api/domains/${id}/verify`, { method: 'POST', body: { force } }),
  updateDomainRoute: (id, data) => apiRequest(`/api/domains/${id}/route`, { method: 'PATCH', body: data }),
  deleteDomain: (id) => apiRequest(`/api/domains/${id}`, { method: 'DELETE' }),
  addIdentity: (domainId, email, name) =>
    apiRequest(`/api/domains/${domainId}/identities`, { method: 'POST', body: { email, name } }),
  removeIdentity: (id) => apiRequest(`/api/identities/${id}`, { method: 'DELETE' }),
  createKey: (data) => apiRequest('/api/keys', { method: 'POST', body: data }),
  updateKey: (id, data) => apiRequest(`/api/keys/${id}`, { method: 'PATCH', body: data }),
  uploadAsset: (formData) => apiRequest('/api/assets', { method: 'POST', formData }),
  updateAsset: (id, data) => apiRequest(`/api/assets/${id}`, { method: 'PATCH', body: data }),
  deleteAsset: (id) => apiRequest(`/api/assets/${id}`, { method: 'DELETE' }),
  addFaq: (data) => apiRequest('/api/faqs', { method: 'POST', body: data }),
  updateFaq: (id, data) => apiRequest(`/api/faqs/${id}`, { method: 'PATCH', body: data }),
  deleteFaq: (id) => apiRequest(`/api/faqs/${id}`, { method: 'DELETE' }),
  updateAutomation: (data) => apiRequest('/api/automation', { method: 'PATCH', body: data }),
  analyze: (message) => apiRequest('/api/automation/analyze', { method: 'POST', body: { message } }),
  addWebhook: (data) => apiRequest('/api/webhooks', { method: 'POST', body: data }),
  updateWebhook: (id, data) => apiRequest(`/api/webhooks/${id}`, { method: 'PATCH', body: data }),
  deleteWebhook: (id) => apiRequest(`/api/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id) => apiRequest(`/api/webhooks/${id}/test`, { method: 'POST', body: {} }),
  system: () => apiRequest('/api/system'),
}
