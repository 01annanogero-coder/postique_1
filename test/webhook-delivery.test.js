import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { isPrivateAddress, pinnedLookup, sendWebhookRequest } from '../server/lib/webhooks.js'

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const LOOPBACK = [{ address: '127.0.0.1', family: 4 }]

test('a pinned webhook delivery reaches the vetted address under Node happy-eyeballs lookup', async () => {
  const { server, port } = await listen((_req, res) => res.end('ok'))
  try {
    // The hostname does not resolve; only the pinned lookup can connect it.
    const result = await sendWebhookRequest(
      new URL(`http://pinned.example.test:${port}/hook`),
      '{}',
      { 'content-type': 'application/json' },
      LOOPBACK,
    )
    assert.equal(result.status, 200)
    assert.equal(result.ok, true)
    assert.equal(result.text, 'ok')
  } finally {
    server.close()
  }
})

test('pinnedLookup answers both the array and the single-address callback forms', () => {
  const lookup = pinnedLookup([
    { address: '203.0.113.9', family: 4 },
    { address: '2001:db8::1', family: 6 },
  ])
  lookup('x', { all: true }, (error, list) => {
    assert.equal(error, null)
    assert.deepEqual(list, [
      { address: '203.0.113.9', family: 4 },
      { address: '2001:db8::1', family: 6 },
    ])
  })
  lookup('x', {}, (error, address, family) => {
    assert.equal(error, null)
    assert.equal(address, '203.0.113.9')
    assert.equal(family, 4)
  })
})

test('an endpoint that streams forever cannot hold the worker', async () => {
  let timer
  const { server, port } = await listen((_req, res) => {
    res.writeHead(200)
    timer = setInterval(() => res.write('x'.repeat(200)), 5)
    res.on('close', () => clearInterval(timer))
  })
  try {
    const started = Date.now()
    const result = await sendWebhookRequest(new URL(`http://stream.example.test:${port}/`), '{}', {}, LOOPBACK, {
      timeoutMs: 5000,
    })
    assert.equal(result.status, 200)
    assert.ok(result.text.length <= 500)
    assert.ok(Date.now() - started < 2000, 'returned long before the deadline')
  } finally {
    clearInterval(timer)
    server.closeAllConnections?.()
    server.close()
  }
})

test('an endpoint that never answers is cut off by the overall deadline', async () => {
  const { server, port } = await listen(() => {})
  try {
    await assert.rejects(
      sendWebhookRequest(new URL(`http://silent.example.test:${port}/`), '{}', {}, LOOPBACK, { timeoutMs: 150 }),
      /timed out/i,
    )
  } finally {
    server.closeAllConnections?.()
    server.close()
  }
})

test('NAT64 addresses embedding private IPv4 ranges are rejected in compressed hex form', () => {
  for (const address of ['64:ff9b::7f00:1', '64:ff9b::a00:1', '64:ff9b::c0a8:101']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  assert.equal(isPrivateAddress('64:ff9b::808:808'), false)
})

test('normal hostnames are not mistaken for private IP addresses', () => {
  assert.equal(isPrivateAddress('hooks.example.com'), false)
  assert.equal(isPrivateAddress('api.stripe.com'), false)
})
