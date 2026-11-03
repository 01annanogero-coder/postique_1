/* Postique browser SDK — self-hosted, dependency-free. */
(function (global) {
  'use strict'

  function scriptOrigin() {
    try {
      var script = document.currentScript
      if (script && script.src) return new URL(script.src).origin
    } catch (_) {}
    return global.location && global.location.origin ? global.location.origin : ''
  }

  function memoryStorage() {
    var data = {}
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
      },
      setItem: function (key, value) {
        data[key] = String(value)
      },
      removeItem: function (key) {
        delete data[key]
      },
    }
  }

  function defaultStorage() {
    try {
      if (global.localStorage) return global.localStorage
    } catch (_) {}
    return memoryStorage()
  }

  function Postique(publicKey, options) {
    if (!(this instanceof Postique)) return new Postique(publicKey, options)
    if (!publicKey) throw new Error('A Postique public key is required.')
    this.publicKey = publicKey
    this.baseUrl = (options && options.baseUrl) || scriptOrigin()
    this.fetch = (options && options.fetch) || global.fetch.bind(global)
    this.storage = (options && options.storage) || defaultStorage()
    this.auth = new AuthClient(this)
  }

  Postique.prototype.call = function (path, options) {
    var settings = options || {}
    var headers = { 'content-type': 'application/json', 'x-postique-key': this.publicKey }
    if (settings.token) headers.authorization = 'Bearer ' + settings.token
    if (settings.headers) {
      Object.keys(settings.headers).forEach(function (key) {
        headers[key] = settings.headers[key]
      })
    }
    var init = {
      method: settings.method || 'POST',
      headers: headers,
      credentials: 'omit',
    }
    if (settings.payload !== undefined) init.body = JSON.stringify(settings.payload)
    return this.fetch(this.baseUrl + path, init).then(function (response) {
      return response
        .text()
        .then(function (raw) {
          var body = {}
          try {
            body = raw ? JSON.parse(raw) : {}
          } catch (_) {}
          if (!response.ok) {
            var error = new Error((body.error && body.error.message) || 'Postique request failed.')
            error.code = body.error && body.error.code
            error.status = response.status
            error.details = body.error && body.error.details
            throw error
          }
          return body
        })
    })
  }

  Postique.prototype.request = function (path, payload) {
    return this.call(path, { method: 'POST', payload: payload })
  }

  Postique.prototype.send = function (payload) {
    return this.request('/v1/send', payload)
  }

  Postique.prototype.render = function (slug, variables) {
    return this.request('/v1/templates/' + encodeURIComponent(slug) + '/render', {
      variables: variables || {},
    })
  }

  Postique.prototype.reply = function (threadId, payload) {
    return this.request('/v1/threads/' + encodeURIComponent(threadId) + '/reply', payload || {})
  }

  function AuthClient(client) {
    this.client = client
    this.storageKey = 'postique.auth.' + client.publicKey.slice(0, 18)
    this.listeners = []
    this.session = this.loadSession()
  }

  AuthClient.prototype.loadSession = function () {
    try {
      var raw = this.client.storage.getItem(this.storageKey)
      return raw ? JSON.parse(raw) : null
    } catch (_) {
      return null
    }
  }

  AuthClient.prototype.emit = function (event, session) {
    this.listeners.slice().forEach(function (listener) {
      try {
        listener(event, session)
      } catch (_) {}
    })
  }

  AuthClient.prototype.saveSession = function (session) {
    if (!session || !session.access_token) return null
    this.session = session
    try {
      this.client.storage.setItem(this.storageKey, JSON.stringify(session))
    } catch (_) {}
    this.emit('SIGNED_IN', session)
    return session
  }

  AuthClient.prototype.clearSession = function () {
    this.session = null
    try {
      this.client.storage.removeItem(this.storageKey)
    } catch (_) {}
    this.emit('SIGNED_OUT', null)
  }

  AuthClient.prototype.unwrap = function (body) {
    var session = body.session || (body.access_token ? body : null)
    if (session) this.saveSession(session)
    return body
  }

  AuthClient.prototype.signUp = function (payload) {
    var self = this
    return this.client
      .call('/auth/v1/signup', {
        payload: {
          email: payload.email,
          password: payload.password,
          name: payload.name,
          data: payload.data || payload.metadata,
        },
      })
      .then(function (body) {
        return self.unwrap(body)
      })
  }

  AuthClient.prototype.signInWithPassword = function (payload) {
    return this.signIn(payload)
  }

  AuthClient.prototype.signIn = function (payload) {
    var self = this
    return this.client
      .call('/auth/v1/token?grant_type=password', {
        payload: { email: payload.email, password: payload.password },
      })
      .then(function (body) {
        return self.unwrap(body)
      })
  }

  AuthClient.prototype.signInWithOtp = function (payload) {
    return this.client.call('/auth/v1/otp', {
      payload: {
        email: payload.email,
        create_user: payload.createUser !== false,
        redirect_to: payload.redirectTo,
      },
    })
  }

  AuthClient.prototype.verifyOtp = function (payload) {
    var self = this
    return this.client
      .call('/auth/v1/verify', {
        payload: {
          email: payload.email,
          token: payload.token || payload.code,
          type: payload.type || 'magiclink',
        },
      })
      .then(function (body) {
        return self.unwrap(body)
      })
  }

  AuthClient.prototype.refreshSession = function () {
    var self = this
    if (!this.session || !this.session.refresh_token) {
      return Promise.reject(new Error('There is no refresh token to use.'))
    }
    return this.client
      .call('/auth/v1/refresh', {
        payload: { refresh_token: this.session.refresh_token },
      })
      .then(function (body) {
        return self.unwrap(body)
      })
  }

  AuthClient.prototype.getSession = function () {
    return this.session
  }

  AuthClient.prototype.getUser = function () {
    var self = this
    if (!this.session || !this.session.access_token) {
      return Promise.reject(new Error('Not signed in.'))
    }
    return this.client
      .call('/auth/v1/user', { method: 'GET', token: this.session.access_token })
      .then(function (body) {
        if (self.session && body.user) {
          self.session.user = body.user
          self.saveSession(self.session)
        }
        return body.user
      })
  }

  AuthClient.prototype.updateUser = function (payload) {
    var self = this
    if (!this.session || !this.session.access_token) {
      return Promise.reject(new Error('Not signed in.'))
    }
    return this.client
      .call('/auth/v1/user', {
        method: 'PUT',
        token: this.session.access_token,
        payload: {
          name: payload.name,
          password: payload.password,
          current_password: payload.currentPassword,
          data: payload.data || payload.metadata,
        },
      })
      .then(function (body) {
        if (self.session && body.user) {
          self.session.user = body.user
          self.saveSession(self.session)
        }
        return body.user
      })
  }

  AuthClient.prototype.signOut = function () {
    var self = this
    var session = this.session
    var request = session
      ? this.client
          .call('/auth/v1/logout', {
            token: session.access_token,
            payload: { refresh_token: session.refresh_token },
          })
          .catch(function () {})
      : Promise.resolve()
    return request.then(function () {
      self.clearSession()
    })
  }

  AuthClient.prototype.setSession = function (session) {
    return this.saveSession(session)
  }

  AuthClient.prototype.onAuthStateChange = function (callback) {
    var self = this
    this.listeners.push(callback)
    return function () {
      self.listeners = self.listeners.filter(function (listener) {
        return listener !== callback
      })
    }
  }

  global.Postique = Postique
  if (typeof module !== 'undefined' && module.exports) module.exports = Postique
})(typeof window !== 'undefined' ? window : globalThis)
