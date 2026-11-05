import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useToast } from './ToastContext'

const StoreContext = createContext(null)

function initialData() {
  return {
    workspace: null,
    threads: [],
    templates: [],
    domains: [],
    keys: [],
    assets: [],
    logs: [],
    faqs: [],
    automation: {
      enabled: false,
      autoSend: false,
      humanReview: true,
      combine: true,
      confidence: 92,
      tone: 'Warm and concise',
    },
    webhooks: [],
    auth: {
      settings: {
        signupsEnabled: true,
        passwordEnabled: true,
        magicLinkEnabled: true,
        requireEmailVerification: false,
      },
      users: [],
      metrics: {},
    },
    labels: [],
    metrics: {},
    volume: [],
    activity: [],
    usage: {},
    config: {},
  }
}

function Loader({ error, onRetry }) {
  return (
    <div className="boot-screen">
      {error ? (
        <>
          <strong>Workspace could not be loaded</strong>
          <span>{error}</span>
          <button className="button button--secondary button--sm" onClick={onRetry} style={{ marginTop: 10 }}>
            Try again
          </button>
        </>
      ) : (
        <>
          <span className="button__spinner" style={{ color: '#5f6d53' }} />
          <span>Loading workspace…</span>
        </>
      )}
    </div>
  )
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(initialData)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const payload = await api.bootstrap()
      setData({ ...initialData(), ...payload })
      setError(null)
      setReady(true)
      return payload
    } catch (loadError) {
      setError(loadError.message)
      setReady(false)
      return null
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!ready) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.bootstrap().then((payload) => setData({ ...initialData(), ...payload })).catch(() => {})
      }
    }, 20_000)
    return () => clearInterval(timer)
  }, [ready])

  const refresh = useCallback(async () => {
    const payload = await load()
    if (!payload) toast('Could not refresh the workspace', 'error', error)
    return payload
  }, [load, toast, error])

  const updateThread = useCallback((thread) => {
    if (!thread) return
    setData((current) => ({
      ...current,
      threads: current.threads.map((item) => (item.id === thread.id ? thread : item)),
    }))
  }, [])

  const markRead = useCallback((id) => {
    let shouldUpdate = false
    setData((current) => ({
      ...current,
      threads: current.threads.map((thread) => {
        if (thread.id !== id || !thread.unread) return thread
        shouldUpdate = true
        return { ...thread, unread: false }
      }),
    }))
    if (shouldUpdate) {
      api.thread(id, { unread: false }).catch(() => {})
    }
  }, [])

  const sendReply = useCallback(
    async (threadId, text) => {
      try {
        const result = await api.reply(threadId, text)
        updateThread(result.thread)
        toast('Reply queued', 'success', 'Thread headers preserved · In-Reply-To set')
        setTimeout(() => refresh().catch(() => {}), 2500)
        return result
      } catch (sendError) {
        toast('Reply could not be sent', 'error', sendError.message)
        return null
      }
    },
    [refresh, toast, updateThread],
  )

  const toggleThreadStatus = useCallback(
    async (id) => {
      try {
        const current = data.threads.find((thread) => thread.id === id)
        const status = current?.status === 'open' ? 'closed' : 'open'
        const result = await api.thread(id, { status })
        updateThread(result.thread)
        toast(status === 'closed' ? 'Conversation closed' : 'Conversation reopened')
      } catch (actionError) {
        toast('Conversation could not be updated', 'error', actionError.message)
      }
    },
    [data.threads, toast, updateThread],
  )

  const toggleStar = useCallback(
    async (id) => {
      try {
        const current = data.threads.find((thread) => thread.id === id)
        const result = await api.thread(id, { starred: !current?.starred })
        updateThread(result.thread)
      } catch (actionError) {
        toast('Conversation could not be updated', 'error', actionError.message)
      }
    },
    [data.threads, toast, updateThread],
  )

  const setThreadLabels = useCallback(
    async (id, labels) => {
      try {
        const result = await api.threadLabels(id, labels)
        updateThread(result.thread)
      } catch (actionError) {
        toast('Labels could not be updated', 'error', actionError.message)
      }
    },
    [toast, updateThread],
  )

  const linkThread = useCallback(
    async (threadId, targetThreadId) => {
      try {
        const result = await api.linkThread(threadId, targetThreadId)
        setData((current) => ({
          ...current,
          threads: current.threads
            .filter((thread) => thread.id !== threadId)
            .map((thread) => (thread.id === result.thread.id ? result.thread : thread)),
        }))
        toast('Conversation linked', 'success', `Attached to “${result.thread.subject}”`)
        return result.thread
      } catch (actionError) {
        toast('Conversation could not be linked', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const saveTemplate = useCallback(
    async (id, patch, options = {}) => {
      try {
        const result = await api.updateTemplate(id, patch)
        setData((current) => ({
          ...current,
          templates: current.templates.map((template) => (template.id === id ? result.template : template)),
        }))
        if (!options.silent) toast('Draft saved', 'success')
        return result.template
      } catch (actionError) {
        toast('Draft could not be saved', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const publishTemplate = useCallback(
    async (id) => {
      try {
        const result = await api.publishTemplate(id)
        setData((current) => ({
          ...current,
          templates: current.templates.map((template) => (template.id === id ? result.template : template)),
        }))
        toast('Template published', 'success', 'New sends will use this version')
        return result.template
      } catch (actionError) {
        toast('Template could not be published', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const createTemplate = useCallback(async () => {
    try {
      const result = await api.createTemplate({
        name: 'Untitled template',
        subject: 'A new message from {{company}}',
        description: 'A new template in your workspace.',
      })
      setData((current) => ({ ...current, templates: [result.template, ...current.templates] }))
      toast('Template created', 'success')
      return result.template.id
    } catch (actionError) {
      toast('Template could not be created', 'error', actionError.message)
      return null
    }
  }, [toast])

  const duplicateTemplate = useCallback(
    async (id) => {
      try {
        const result = await api.duplicateTemplate(id)
        setData((current) => ({ ...current, templates: [result.template, ...current.templates] }))
        toast('Template duplicated', 'success')
        return result.template
      } catch (actionError) {
        toast('Template could not be duplicated', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const testTemplate = useCallback(
    async (id, to) => {
      try {
        const result = await api.testTemplate(id, to)
        toast('Test message queued', 'success', result.note || `Sending to ${to}`)
        setTimeout(() => refresh().catch(() => {}), 2000)
        return result
      } catch (actionError) {
        toast('Test message could not be sent', 'error', actionError.message)
        return null
      }
    },
    [refresh, toast],
  )

  const addDomain = useCallback(
    async (name) => {
      try {
        const result = await api.addDomain(name)
        setData((current) => ({ ...current, domains: [...current.domains, result.domain] }))
        toast('Domain added', 'success', 'Publish the DNS records, then verify')
        return result.domain
      } catch (actionError) {
        toast('Domain could not be added', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const verifyDomain = useCallback(
    async (id, force = false) => {
      try {
        const result = await api.verifyDomain(id, force)
        setData((current) => ({
          ...current,
          domains: current.domains.map((domain) => (domain.id === id ? result.domain : domain)),
        }))
        if (result.verified) toast('Domain verified', 'success', 'SPF, DKIM and DMARC are active')
        else toast('DNS is not ready yet', 'error', 'Publish the records, then try again')
        return result
      } catch (actionError) {
        toast('Domain verification failed', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const updateDomainRoute = useCallback(
    async (id, patch) => {
      try {
        const result = await api.updateDomainRoute(id, patch)
        setData((current) => ({
          ...current,
          domains: current.domains.map((domain) => (domain.id === id ? result.domain : domain)),
        }))
        toast('Delivery route saved', 'success')
        return result.domain
      } catch (actionError) {
        toast('Delivery route could not be saved', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const addIdentity = useCallback(
    async (domainId, email, name) => {
      try {
        await api.addIdentity(domainId, email, name)
        await refresh()
        toast('Sender identity added', 'success', email)
        return true
      } catch (actionError) {
        toast('Sender could not be added', 'error', actionError.message)
        return false
      }
    },
    [refresh, toast],
  )

  const removeIdentity = useCallback(
    async (identityId) => {
      try {
        await api.removeIdentity(identityId)
        await refresh()
        toast('Sender identity removed')
        return true
      } catch (actionError) {
        toast('Sender could not be removed', 'error', actionError.message)
        return false
      }
    },
    [refresh, toast],
  )

  const addKey = useCallback(
    async ({ name, kind, origins, allowedTemplates, allowedRecipients }) => {
      try {
        const result = await api.createKey({
          name,
          kind,
          allowedOrigins:
            kind === 'public'
              ? String(origins || '')
                  .split(',')
                  .map((origin) => origin.trim())
                  .filter(Boolean)
              : [],
          allowedTemplates: allowedTemplates || [],
          allowedRecipients:
            typeof allowedRecipients === 'string'
              ? allowedRecipients.split(/[\s,]+/).map((email) => email.trim()).filter(Boolean)
              : allowedRecipients || [],
        })
        setData((current) => ({ ...current, keys: [result.key, ...current.keys] }))
        toast('API key created', 'success', 'Copy it now — it is only shown once')
        return result.secret
      } catch (actionError) {
        toast('API key could not be created', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const revokeKey = useCallback(
    async (id) => {
      try {
        const result = await api.updateKey(id, { revoked: true })
        setData((current) => ({
          ...current,
          keys: current.keys.map((key) => (key.id === id ? result.key : key)),
        }))
        toast('Key revoked', 'success', 'Requests using this key will now fail')
      } catch (actionError) {
        toast('Key could not be revoked', 'error', actionError.message)
      }
    },
    [toast],
  )

  const addAsset = useCallback(
    async (file, { name, kind, publicAsset = true }) => {
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('name', name)
        form.append('kind', kind)
        form.append('public', String(publicAsset))
        const result = await api.uploadAsset(form)
        setData((current) => ({ ...current, assets: [result.asset, ...current.assets] }))
        toast('Asset uploaded', 'success', 'Direct URL ready for your templates')
        return result.asset
      } catch (actionError) {
        toast('Asset could not be uploaded', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const deleteAsset = useCallback(
    async (id) => {
      try {
        await api.deleteAsset(id)
        setData((current) => ({ ...current, assets: current.assets.filter((asset) => asset.id !== id) }))
        toast('Asset removed')
      } catch (actionError) {
        toast('Asset could not be deleted', 'error', actionError.message)
      }
    },
    [toast],
  )

  const toggleAsset = useCallback(
    async (id) => {
      try {
        const current = data.assets.find((asset) => asset.id === id)
        const result = await api.updateAsset(id, { public: !current?.public })
        setData((currentData) => ({
          ...currentData,
          assets: currentData.assets.map((asset) => (asset.id === id ? result.asset : asset)),
        }))
      } catch (actionError) {
        toast('Asset could not be updated', 'error', actionError.message)
      }
    },
    [data.assets, toast],
  )

  const updateAutomation = useCallback(
    async (patch) => {
      try {
        const result = await api.updateAutomation(patch)
        setData((current) => ({ ...current, automation: result.automation }))
        return result.automation
      } catch (actionError) {
        toast('Automation setting could not be saved', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const addFaq = useCallback(
    async (faq) => {
      try {
        const result = await api.addFaq(faq)
        setData((current) => ({ ...current, faqs: [...current.faqs, result.faq] }))
        toast('Approved response added', 'success')
        return result.faq
      } catch (actionError) {
        toast('Response could not be added', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const updateFaq = useCallback(
    async (id, patch) => {
      try {
        const result = await api.updateFaq(id, patch)
        setData((current) => ({
          ...current,
          faqs: current.faqs.map((faq) => (faq.id === id ? result.faq : faq)),
        }))
        toast('Approved response updated', 'success')
        return result.faq
      } catch (actionError) {
        toast('Response could not be updated', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const deleteFaq = useCallback(
    async (id) => {
      try {
        await api.deleteFaq(id)
        setData((current) => ({ ...current, faqs: current.faqs.filter((faq) => faq.id !== id) }))
        toast('Approved response removed')
      } catch (actionError) {
        toast('Response could not be removed', 'error', actionError.message)
      }
    },
    [toast],
  )

  const addWebhook = useCallback(
    async (url, events) => {
      try {
        const result = await api.addWebhook({ url, events })
        setData((current) => ({ ...current, webhooks: [...current.webhooks, result.webhook] }))
        toast('Webhook endpoint added', 'success', 'Signing secret generated')
        return result.secret
      } catch (actionError) {
        toast('Webhook could not be added', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const toggleWebhook = useCallback(
    async (id) => {
      try {
        const current = data.webhooks.find((webhook) => webhook.id === id)
        const result = await api.updateWebhook(id, { status: current?.status === 'active' ? 'paused' : 'active' })
        setData((currentData) => ({
          ...currentData,
          webhooks: currentData.webhooks.map((webhook) => (webhook.id === id ? result.webhook : webhook)),
        }))
      } catch (actionError) {
        toast('Webhook could not be updated', 'error', actionError.message)
      }
    },
    [data.webhooks, toast],
  )

  const testWebhook = useCallback(
    async (id) => {
      try {
        await api.testWebhook(id)
        toast('Test event queued', 'success')
      } catch (actionError) {
        toast('Test event could not be queued', 'error', actionError.message)
      }
    },
    [toast],
  )

  const updateWorkspace = useCallback(
    async (patch) => {
      try {
        const result = await api.workspace(patch)
        setData((current) => ({ ...current, workspace: result.workspace }))
        toast('Workspace settings saved', 'success')
        return result.workspace
      } catch (actionError) {
        toast('Workspace could not be updated', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const updateAppAuthSettings = useCallback(
    async (patch) => {
      try {
        const result = await api.updateAppAuthSettings(patch)
        setData((current) => ({
          ...current,
          auth: { ...current.auth, settings: result.settings },
        }))
        toast('Authentication settings saved', 'success')
        return result.settings
      } catch (actionError) {
        toast('Authentication settings could not be saved', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const setAppAuthUserDisabled = useCallback(
    async (id, disabled) => {
      try {
        const result = await api.setAppAuthUserDisabled(id, disabled)
        setData((current) => ({
          ...current,
          auth: {
            ...current.auth,
            users: current.auth.users.map((user) => (user.id === id ? result.user : user)),
          },
        }))
        toast(disabled ? 'User disabled' : 'User enabled', 'success')
        return result.user
      } catch (actionError) {
        toast('User could not be updated', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const deleteAppAuthUser = useCallback(
    async (id) => {
      try {
        await api.deleteAppAuthUser(id)
        setData((current) => ({
          ...current,
          auth: {
            ...current.auth,
            users: current.auth.users.filter((user) => user.id !== id),
            metrics: {
              ...current.auth.metrics,
              total: Math.max(0, (current.auth.metrics.total || 0) - 1),
            },
          },
        }))
        toast('User deleted', 'success')
        return true
      } catch (actionError) {
        toast('User could not be deleted', 'error', actionError.message)
        return false
      }
    },
    [toast],
  )

  const sendAppAuthLink = useCallback(
    async (id, purpose = 'magiclink') => {
      try {
        const result = await api.sendAppAuthLink(id, { purpose })
        toast(result.debug ? 'Magic link generated' : 'Magic link queued', 'success')
        return result
      } catch (actionError) {
        toast('Magic link could not be sent', 'error', actionError.message)
        return null
      }
    },
    [toast],
  )

  const unreadCount = useMemo(() => data.threads.filter((thread) => thread.unread).length, [data.threads])
  const openCount = useMemo(() => data.threads.filter((thread) => thread.status === 'open').length, [data.threads])

  const value = {
    ...data,
    ready,
    loading: !ready && !error,
    loadError: error,
    unreadCount,
    openCount,
    toast,
    refresh,
    markRead,
    sendReply,
    toggleThreadStatus,
    toggleStar,
    setThreadLabels,
    linkThread,
    saveTemplate,
    publishTemplate,
    createTemplate,
    duplicateTemplate,
    testTemplate,
    addDomain,
    verifyDomain,
    updateDomainRoute,
    addIdentity,
    removeIdentity,
    addKey,
    revokeKey,
    addAsset,
    deleteAsset,
    toggleAsset,
    updateAutomation,
    addFaq,
    updateFaq,
    deleteFaq,
    addWebhook,
    toggleWebhook,
    testWebhook,
    updateWorkspace,
    updateAppAuthSettings,
    setAppAuthUserDisabled,
    deleteAppAuthUser,
    sendAppAuthLink,
  }

  if (!ready) {
    return (
      <StoreContext.Provider value={value}>
        <Loader error={error} onRetry={load} />
      </StoreContext.Provider>
    )
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside StoreContext')
  return value
}
