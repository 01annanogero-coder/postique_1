/* Postique embedded inbox — self-contained web component. */
(function (global) {
  'use strict'

  var DEFAULT_HEIGHT = 560
  var STYLE = [
    ':host{display:block;width:100%;height:100%;min-height:420px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#20251f;contain:content}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.pi-wrap{height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--pi-border,#e2ddd1);border-radius:var(--pi-radius,14px);background:var(--pi-bg,#fffefa);box-shadow:0 12px 35px rgba(22,30,20,.06)}',
    '.pi-dark{--pi-bg:#141a15;--pi-panel:#1b231b;--pi-panel-2:#202a20;--pi-ink:#eef2e8;--pi-muted:#9aa796;--pi-border:#303b30;--pi-soft:#263226}',
    '.pi-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--pi-border,#e2ddd1);background:var(--pi-bg,#fffefa)}',
    '.pi-title{display:flex;align-items:center;gap:9px;min-width:0}.pi-mark{display:flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:9px;background:var(--pi-accent,#c6f26b);color:#172014;font-weight:850;font-size:14px;letter-spacing:-.08em}',
    '.pi-title strong{display:block;font-size:13px;line-height:1.25;letter-spacing:-.02em}.pi-title small{display:block;color:var(--pi-muted,#8e9788);font-size:10px;line-height:1.3}',
    '.pi-head-actions{display:flex;align-items:center;gap:6px}.pi-icon{display:flex;align-items:center;justify-content:center;width:29px;height:29px;border:1px solid var(--pi-border,#e2ddd1);border-radius:7px;background:var(--pi-bg,#fffefa);color:var(--pi-muted,#7f8a7d);cursor:pointer}',
    '.pi-icon:hover{background:var(--pi-soft,#f3f5ec);color:var(--pi-ink,#20251f)}',
    '.pi-body{flex:1;min-height:0;overflow:auto;background:var(--pi-bg,#fffefa)}',
    '.pi-state{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px;text-align:center;color:var(--pi-muted,#8e9788)}',
    '.pi-state strong{color:var(--pi-ink,#20251f);font-size:13px}.pi-state p{max-width:300px;margin:0;font-size:11px;line-height:1.55}.pi-spin{width:19px;height:19px;border:2px solid var(--pi-border,#dfe4d9);border-top-color:var(--pi-accent,#78a64a);border-radius:50%;animation:pi-spin .8s linear infinite}',
    '@keyframes pi-spin{to{transform:rotate(360deg)}}',
    '.pi-list{padding:6px}',
    '.pi-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:start;gap:10px;width:100%;padding:10px 9px;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;cursor:pointer}',
    '.pi-row:hover{background:var(--pi-soft,#f5f6ee)}.pi-row.is-unread{background:color-mix(in srgb,var(--pi-accent,#c6f26b) 12%,transparent)}',
    '.pi-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--pi-soft,#e9efdf);color:#597044;font-size:11px;font-weight:750}',
    '.pi-row-main{min-width:0}.pi-row-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.pi-row-top strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;line-height:1.4}.pi-row-top time{flex:none;color:var(--pi-muted,#9aa294);font-size:9px}',
    '.pi-row p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:3px 0 0;color:var(--pi-muted,#8c9587);font-size:10.5px;line-height:1.4}.pi-row-count{align-self:center;min-width:18px;padding:2px 5px;border-radius:10px;background:var(--pi-accent,#c6f26b);color:#1b2516;font-size:9px;font-weight:800;text-align:center}',
    '.pi-thread{display:flex;flex-direction:column;min-height:100%}.pi-thread-head{display:flex;align-items:flex-start;gap:9px;padding:12px 14px;border-bottom:1px solid var(--pi-border,#e2ddd1);background:var(--pi-bg,#fffefa);position:sticky;top:0;z-index:2}.pi-thread-head h3{flex:1;min-width:0;margin:1px 0 0;font-size:12.5px;line-height:1.4;letter-spacing:-.01em}.pi-thread-head small{display:block;margin-top:2px;color:var(--pi-muted,#9aa294);font-size:9px}',
    '.pi-messages{display:flex;flex-direction:column;gap:10px;padding:14px}.pi-msg{max-width:86%;align-self:flex-start}.pi-msg.is-out{align-self:flex-end}.pi-msg-meta{display:flex;gap:5px;margin:0 0 4px 2px;color:var(--pi-muted,#9aa294);font-size:8.5px}.pi-msg.is-out .pi-msg-meta{justify-content:flex-end;margin-right:2px}',
    '.pi-bubble{padding:9px 11px;border:1px solid var(--pi-border,#e5e0d4);border-radius:10px;border-top-left-radius:3px;background:var(--pi-panel-2,#fbece2);font-size:11.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.pi-msg.is-out .pi-bubble{border-color:color-mix(in srgb,var(--pi-accent,#c6f26b) 45%,var(--pi-border,#e2ddd1));border-top-left-radius:10px;border-top-right-radius:3px;background:color-mix(in srgb,var(--pi-accent,#c6f26b) 18%,var(--pi-bg,#fffefa))}',
    '.pi-attach{display:flex;flex-direction:column;gap:4px;margin-top:6px}.pi-attach a{display:flex;align-items:center;gap:5px;width:fit-content;max-width:100%;padding:4px 7px;border:1px solid var(--pi-border,#e2ddd1);border-radius:5px;background:var(--pi-bg,#fffefa);color:var(--pi-ink,#3e4b39);font-size:9px;text-decoration:none}.pi-attach a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pi-attach small{color:var(--pi-muted,#9aa294);font-size:8px}',
    '.pi-compose{padding:10px 12px 12px;border-top:1px solid var(--pi-border,#e2ddd1);background:var(--pi-bg,#fffefa)}.pi-compose textarea{display:block;width:100%;min-height:64px;max-height:140px;padding:8px 9px;border:1px solid var(--pi-border,#e0dbcf);border-radius:7px;outline:none;resize:vertical;background:var(--pi-panel,#fffefa);color:var(--pi-ink,#20251f);font:inherit;font-size:11px;line-height:1.5}.pi-compose textarea:focus{border-color:var(--pi-accent,#8bad58);box-shadow:0 0 0 2px color-mix(in srgb,var(--pi-accent,#c6f26b) 22%,transparent)}',
    '.pi-compose-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px}.pi-compose-row span{color:var(--pi-muted,#a0a79b);font-size:8.5px}.pi-send{border:0;border-radius:6px;padding:7px 10px;background:var(--pi-ink,#182017);color:var(--pi-bg,#fffefa);font:inherit;font-size:9.5px;font-weight:700;cursor:pointer}.pi-send:disabled{opacity:.45;cursor:default}',
    '.pi-foot{padding:7px 12px;border-top:1px solid var(--pi-border,#e2ddd1);color:var(--pi-muted,#9aa294);font-size:8px;text-align:right}.pi-foot a{color:inherit;text-decoration:none}.pi-error{color:#a54f3e}.pi-error .pi-icon{color:#a54f3e}',
    '@media(max-width:520px){.pi-wrap{border-radius:10px}.pi-bubble{max-width:100%}.pi-msg{max-width:92%}}'
  ].join('')

  function escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function initials(value) {
    return String(value || '?')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part[0]
      })
      .join('')
      .toUpperCase()
  }

  function when(value) {
    var date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    var diff = Date.now() - date.getTime()
    if (diff < 60000) return 'Now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h'
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd'
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  function apiError(response) {
    return response
      .json()
      .catch(function () {
        return {}
      })
      .then(function (body) {
        var error = new Error((body.error && body.error.message) || 'Postique inbox request failed.')
        error.status = response.status
        error.code = body.error && body.error.code
        throw error
      })
  }

  class PostiqueInbox extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.state = {
        loading: true,
        error: null,
        user: null,
        threads: [],
        active: null,
        threadLoading: false,
        reply: '',
        sending: false,
      }
      this._onClick = this._onClick.bind(this)
      this._onInput = this._onInput.bind(this)
      this._onKey = this._onKey.bind(this)
    }

    connectedCallback() {
      this.shadowRoot.innerHTML = '<style>' + STYLE + '</style><div class="pi-root"></div>'
      this.shadowRoot.addEventListener('click', this._onClick)
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('keydown', this._onKey)
      this.height = Number(this.getAttribute('height')) || DEFAULT_HEIGHT
      this.renderShell()
      this.start()
      this._visibility = function () {
        if (document.visibilityState === 'visible') this.poll()
      }.bind(this)
      document.addEventListener('visibilitychange', this._visibility)
    }

    startPolling() {
      clearInterval(this._poll)
      this._poll = setInterval(
        function () {
          if (document.visibilityState === 'visible') this.poll()
        }.bind(this),
        15000,
      )
    }

    startEvents() {
      this.stopEvents()
      if (!this.token || !global.fetch || !global.AbortController) return
      var controller = new AbortController()
      this._events = controller
      this._eventsStopped = false
      var self = this
      global
        .fetch(this.apiBase + '/embed/v1/events', {
          headers: { authorization: 'Bearer ' + this.token },
          signal: controller.signal,
        })
        .then(function (response) {
          if (response.status === 401) {
            var error = new Error('Inbox token expired.')
            error.status = 401
            self.fail(error)
            return
          }
          if (!response.ok || !response.body || !response.body.getReader) return
          var reader = response.body.getReader()
          var decoder = new TextDecoder()
          var buffer = ''
          function read() {
            return reader.read().then(function (result) {
              if (result.done) {
                if (!self._eventsStopped) setTimeout(function () { self.startEvents() }, 5000)
                return
              }
              buffer += decoder.decode(result.value, { stream: true })
              var parts = buffer.split('\n\n')
              buffer = parts.pop()
              parts.forEach(function (part) {
                if (part.indexOf('event: refresh') >= 0) self.poll()
                if (part.indexOf('event: session.expired') >= 0) {
                  var error = new Error('Inbox token expired.')
                  error.status = 401
                  self.fail(error)
                }
              })
              return read()
            })
          }
          return read()
        })
        .catch(function (error) {
          if (!error || error.name === 'AbortError' || self._eventsStopped) return
          setTimeout(function () { self.startEvents() }, 5000)
        })
    }

    stopEvents() {
      this._eventsStopped = true
      if (this._events) {
        this._events.abort()
        this._events = null
      }
    }

    static get observedAttributes() {
      return ['token', 'base-url', 'thread-id']
    }

    attributeChangedCallback() {
      if (this.isConnected && this.shadowRoot.querySelector('.pi-root')) this.start()
    }

    disconnectedCallback() {
      clearInterval(this._poll)
      this.stopEvents()
      document.removeEventListener('visibilitychange', this._visibility)
      this.shadowRoot.removeEventListener('click', this._onClick)
      this.shadowRoot.removeEventListener('input', this._onInput)
      this.shadowRoot.removeEventListener('keydown', this._onKey)
    }

    get apiBase() {
      return (this.getAttribute('base-url') || (global.location && global.location.origin) || '').replace(/\/+$/, '')
    }

    get token() {
      return this.getAttribute('token') || ''
    }

    set token(value) {
      this.setAttribute('token', value)
    }

    get threadId() {
      return this.getAttribute('thread-id') || ''
    }

    async request(path, options) {
      var settings = options || {}
      var headers = { authorization: 'Bearer ' + this.token }
      if (settings.body) headers['content-type'] = 'application/json'
      var response = await fetch(this.apiBase + path, {
        method: settings.method || 'GET',
        headers: headers,
        body: settings.body ? JSON.stringify(settings.body) : undefined,
        credentials: 'omit',
      })
      if (!response.ok) await apiError(response)
      return response.json()
    }

    renderShell() {
      var dark = this.getAttribute('theme') === 'dark'
      var accent = this.getAttribute('accent') || '#c6f26b'
      var radius = this.getAttribute('radius') || '14px'
      var branding = this.getAttribute('branding') !== 'false'
      var root = this.shadowRoot.querySelector('.pi-root')
      root.innerHTML =
        '<div class="pi-wrap' +
        (dark ? ' pi-dark' : '') +
        '" style="--pi-accent:' +
        escape(accent) +
        ';--pi-radius:' +
        escape(radius) +
        ';min-height:' +
        this.height +
        'px;height:100%">' +
        '<div class="pi-head"><div class="pi-title"><span class="pi-mark">P</span><div><strong>' +
        escape(this.getAttribute('title') || 'Messages') +
        '</strong><small id="pi-subtitle">Loading…</small></div></div><div class="pi-head-actions"><button class="pi-icon" data-action="refresh" aria-label="Refresh">↻</button></div></div>' +
        '<div class="pi-body" id="pi-body"></div>' +
        (branding ? '<div class="pi-foot">Powered by <a href="https://postique.fyi" target="_blank" rel="noreferrer">Postique</a></div>' : '') +
        '</div>'
      this.render()
    }

    render() {
      var body = this.shadowRoot.getElementById('pi-body')
      var subtitle = this.shadowRoot.getElementById('pi-subtitle')
      if (!body) return
      if (subtitle) {
        subtitle.textContent = this.state.active
          ? this.state.active.subject
          : this.state.user
            ? (this.state.user.name || this.state.user.email || 'Your conversations')
            : 'Secure inbox'
      }
      if (this.state.loading) {
        body.innerHTML = '<div class="pi-state"><div class="pi-spin"></div><strong>Loading conversations…</strong></div>'
        return
      }
      if (this.state.error) {
        body.innerHTML =
          '<div class="pi-state pi-error"><strong>' +
          (this.state.error.status === 401 ? 'Session expired' : 'Inbox unavailable') +
          '</strong><p>' +
          escape(this.state.error.message) +
          '</p><button class="pi-send" data-action="refresh">Try again</button></div>'
        return
      }
      if (this.state.active) {
        this.renderThread(body)
        return
      }
      this.renderList(body)
    }

    renderList(body) {
      var threads = this.state.threads
      if (!threads.length) {
        body.innerHTML =
          '<div class="pi-state"><strong>No conversations yet</strong><p>When you email support, the conversation will appear here.</p></div>'
        return
      }
      body.innerHTML =
        '<div class="pi-list">' +
        threads
          .map(function (thread) {
            var unread = thread.unread
            return (
              '<button class="pi-row' +
              (unread ? ' is-unread' : '') +
              '" data-action="open" data-id="' +
              escape(thread.id) +
              '"><span class="pi-avatar">' +
              escape(initials(thread.subject)) +
              '</span><span class="pi-row-main"><span class="pi-row-top"><strong>' +
              escape(thread.subject) +
              '</strong><time>' +
              escape(when(thread.lastActivityAt)) +
              '</time></span><p>' +
              escape(thread.snippet || 'No messages yet') +
              '</p></span>' +
              (unread ? '<span class="pi-row-count">1</span>' : '<span></span>') +
              '</button>'
            )
          })
          .join('') +
        '</div>'
    }

    renderThread(body) {
      var thread = this.state.active
      var messages = thread.messages || []
      body.innerHTML =
        '<div class="pi-thread"><div class="pi-thread-head"><button class="pi-icon" data-action="back" aria-label="Back to conversations">←</button><div><h3>' +
        escape(thread.subject) +
        '</h3><small>' +
        escape(thread.messageCount || messages.length) +
        ' message' +
        ((thread.messageCount || messages.length) === 1 ? '' : 's') +
        '</small></div></div><div class="pi-messages" id="pi-messages">' +
        (this.state.threadLoading
          ? '<div class="pi-state"><div class="pi-spin"></div></div>'
          : messages
              .map(function (message) {
                var out = message.direction === 'out'
                var attach = message.attachments || []
                return (
                  '<div class="pi-msg' +
                  (out ? ' is-out' : '') +
                  '"><div class="pi-msg-meta"><span>' +
                  escape(out ? 'You' : message.author || 'Support') +
                  '</span><span>·</span><time>' +
                  escape(when(message.createdAt)) +
                  '</time></div><div class="pi-bubble">' +
                  escape(message.text || '') +
                  (attach.length
                    ? '<div class="pi-attach">' +
                      attach
                        .map(function (file) {
                          return (
                            '<a href="' +
                            escape(file.url) +
                            '" target="_blank" rel="noreferrer">📎 <span>' +
                            escape(file.name) +
                            '</span></a>'
                          )
                        })
                        .join('') +
                      '</div>'
                    : '') +
                  '</div></div>'
                )
              })
              .join('') || '<div class="pi-state"><p>No messages in this conversation.</p></div>') +
        '</div>' +
        (this.state.threadLoading
          ? ''
          : '<div class="pi-compose"><textarea id="pi-reply" placeholder="Write a reply…" maxlength="10000">' +
            escape(this.state.reply) +
            '</textarea><div class="pi-compose-row"><span>Reply by email</span><button class="pi-send" data-action="send" ' +
            (this.state.sending || !this.state.reply.trim() ? 'disabled' : '') +
            '>' +
            (this.state.sending ? 'Sending…' : 'Send reply') +
            '</button></div></div>') +
        '</div>'
      var messagesEl = this.shadowRoot.getElementById('pi-messages')
      var bodyEl = this.shadowRoot.getElementById('pi-body')
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight
      if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight
    }

    async start() {
      if (!this.apiBase) {
        this.fail(new Error('Set the base-url attribute to your Postique URL.'))
        return
      }
      if (!this.token) {
        this.fail(new Error('A short-lived inbox token is required. Create one on your server with POST /embed/v1/session.'))
        return
      }
      this.startPolling()
      this.startEvents()
      this.state.loading = true
      this.state.error = null
      this.render()
      try {
        var session = await this.request('/embed/v1/session')
        this.state.user = session.user
        this.emit('ready', session.user)
        if (this.threadId) {
          await this.openThread(this.threadId)
        } else {
          await this.loadThreads()
        }
      } catch (error) {
        this.fail(error)
      }
    }

    async loadThreads() {
      var result = await this.request('/embed/v1/threads')
      this.state.threads = result.threads || []
      this.state.loading = false
      this.state.active = null
      this.render()
    }

    async openThread(id) {
      this.state.threadLoading = true
      this.state.active = { id: id, subject: 'Loading…', messages: [] }
      this.state.loading = false
      this.render()
      try {
        var result = await this.request('/embed/v1/threads/' + encodeURIComponent(id))
        this.state.active = result.thread
        this.state.threads = this.state.threads.map(function (thread) {
          return thread.id === result.thread.id ? { ...thread, unread: false } : thread
        })
        this.emit('thread.opened', result.thread)
      } catch (error) {
        this.fail(error)
      } finally {
        this.state.threadLoading = false
        this.render()
      }
    }

    async sendReply() {
      if (!this.state.active || !this.state.reply.trim() || this.state.sending) return
      this.state.sending = true
      this.render()
      try {
        await this.request('/embed/v1/threads/' + encodeURIComponent(this.state.active.id) + '/messages', {
          method: 'POST',
          body: { text: this.state.reply.trim() },
        })
        this.state.reply = ''
        this.emit('reply.sent', { threadId: this.state.active.id })
        await this.openThread(this.state.active.id)
      } catch (error) {
        this.fail(error)
      } finally {
        this.state.sending = false
        this.render()
      }
    }

    async poll() {
      if (!this.token || this.state.loading || this.state.error || this.state.sending) return
      try {
        if (this.state.active) {
          var result = await this.request('/embed/v1/threads/' + encodeURIComponent(this.state.active.id))
          this.state.active = result.thread
        } else {
          var list = await this.request('/embed/v1/threads')
          this.state.threads = list.threads || []
        }
        this.render()
      } catch (error) {
        if (error && error.status === 401) this.fail(error)
      }
    }

    fail(error) {
      clearInterval(this._poll)
      this.stopEvents()
      this.state.loading = false
      this.state.threadLoading = false
      this.state.error = error
      if (error && error.status === 401) {
        this.emit('session.expired', { message: error.message, status: 401 })
      }
      this.emit('error', { message: error.message, status: error.status })
      this.render()
    }

    emit(name, detail) {
      this.dispatchEvent(
        new CustomEvent('postique:' + name, {
          bubbles: true,
          composed: true,
          detail: detail,
        }),
      )
    }

    _onClick(event) {
      var target = event.target.closest('[data-action]')
      if (!target) return
      var action = target.getAttribute('data-action')
      if (action === 'refresh') {
        if (this.state.error) {
          this.state.error = null
          this.state.loading = true
          this.render()
          this.start()
        } else if (this.state.active) {
          this.openThread(this.state.active.id)
        } else {
          this.loadThreads().catch(this.fail.bind(this))
        }
      }
      if (action === 'open') this.openThread(target.getAttribute('data-id'))
      if (action === 'back') {
        this.state.active = null
        this.state.reply = ''
        this.render()
        this.poll()
      }
      if (action === 'send') this.sendReply()
    }

    _onInput(event) {
      if (event.target.id === 'pi-reply') {
        this.state.reply = event.target.value
        var button = this.shadowRoot.querySelector('[data-action="send"]')
        if (button) button.disabled = this.state.sending || !this.state.reply.trim()
      }
    }

    _onKey(event) {
      if (event.target.id === 'pi-reply' && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        this.sendReply()
      }
    }

    refresh() {
      return this.start()
    }

    setToken(token) {
      if (!token) return this.fail(new Error('A short-lived inbox token is required.'))
      if (this.token === token) return this.start()
      this.setAttribute('token', token)
      return Promise.resolve()
    }
  }

  if (global.customElements && !global.customElements.get('postique-inbox')) {
    global.customElements.define('postique-inbox', PostiqueInbox)
  }
  global.PostiqueInbox = PostiqueInbox
})(typeof window !== 'undefined' ? window : globalThis)
