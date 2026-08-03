import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import test from 'node:test'
import WebSocket, { WebSocketServer } from 'ws'
import { WebSocketGateway } from '../components/gateway.js'

function config(overrides = {}) {
  return {
    enable: true,
    listen: { host: '127.0.0.1', port: 0, path: '/' },
    upstream: { url: 'ws://127.0.0.1:1/OneBotv11/ws' },
    accessToken: '',
    connectTimeout: 500,
    debug: false,
    ...overrides
  }
}

async function startGateway(overrides, log) {
  const gateway = new WebSocketGateway(config(overrides), log)
  await gateway.start()
  return gateway
}

function gatewayUrl(gateway, path = '/') {
  return `ws://127.0.0.1:${gateway.getStatus().port}${path}`
}

async function startUpstream() {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(wss, 'listening')
  const { port } = wss.address()
  return { wss, url: `ws://127.0.0.1:${port}/OneBotv11/ws` }
}

async function closeUpstream(wss) {
  for (const client of wss.clients) client.terminate()
  await new Promise(resolve => wss.close(() => resolve()))
}

function openWebSocket(url, options) {
  const ws = new WebSocket(url, options)
  return Promise.race([
    once(ws, 'open').then(() => ws),
    once(ws, 'error').then(([err]) => Promise.reject(err))
  ])
}

function responseStatus(url, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options)
    let handled = false
    ws.once('unexpected-response', (_req, response) => {
      handled = true
      response.resume()
      resolve(response.statusCode)
    })
    ws.once('error', err => {
      if (!handled) reject(err)
    })
  })
}

function message(ws) {
  return once(ws, 'message').then(([data, isBinary]) => ({ data, isBinary }))
}

async function waitFor(check, timeout = 1000) {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= end) throw new Error('condition timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test('rejects invalid paths and tokens before contacting TRSS', async t => {
  const warnings = []
  const gateway = await startGateway(
    { accessToken: 'shared-secret' },
    { warn: value => warnings.push(String(value)) }
  )
  t.after(() => gateway.stop())

  assert.equal(await responseStatus(gatewayUrl(gateway, '/wrong')), 404)
  assert.equal(await responseStatus(gatewayUrl(gateway)), 401)
  assert.equal(await responseStatus(gatewayUrl(gateway), {
    headers: { Authorization: 'Bearer wrong-secret' }
  }), 403)
  assert.equal(gateway.getStatus().pending, 0)
  assert.equal(warnings.some(value => value.includes('路径应为')), true)
  assert.equal(warnings.some(value => value.includes('未提交授权 Token')), true)
  assert.equal(warnings.some(value => value.includes('授权 Token 不一致')), true)
  assert.equal(warnings.join('\n').includes('shared-secret'), false)
})

test('delays SnowLuma open until the TRSS handshake succeeds', async t => {
  const sockets = new Set()
  const stalled = createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  stalled.listen(0, '127.0.0.1')
  await once(stalled, 'listening')
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    stalled.close()
  })
  const gateway = await startGateway({
    upstream: { url: `ws://127.0.0.1:${stalled.address().port}/OneBotv11/ws` },
    connectTimeout: 150
  })
  t.after(() => gateway.stop())

  let opened = false
  const observer = new WebSocket(gatewayUrl(gateway))
  const statusPromise = new Promise((resolve, reject) => {
    let handled = false
    observer.on('unexpected-response', (_req, response) => {
      handled = true
      response.resume()
      resolve(response.statusCode)
    })
    observer.on('error', err => {
      if (!handled) reject(err)
    })
  })
  observer.on('open', () => { opened = true })

  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(opened, false)
  assert.equal(await statusPromise, 504)
})

test('returns 502 when TRSS rejects the upstream WebSocket', async t => {
  let authorization = ''
  const rejected = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    verifyClient: info => {
      authorization = info.req.headers.authorization || ''
      return false
    }
  })
  await once(rejected, 'listening')
  t.after(() => closeUpstream(rejected))
  const gateway = await startGateway({
    upstream: { url: `ws://127.0.0.1:${rejected.address().port}/OneBotv11/ws` },
    accessToken: 'shared-secret'
  })
  t.after(() => gateway.stop())

  assert.equal(await responseStatus(gatewayUrl(gateway), {
    headers: { Authorization: 'Bearer shared-secret' }
  }), 502)
  assert.equal(authorization, 'Bearer shared-secret')
  assert.match(gateway.getStatus().lastError, /HTTP 401/)
})

test('allows an unauthenticated SnowLuma client and omits upstream authorization', async t => {
  const { wss, url } = await startUpstream()
  t.after(() => closeUpstream(wss))
  const gateway = await startGateway({ upstream: { url }, accessToken: '' })
  t.after(() => gateway.stop())

  const upstreamConnection = once(wss, 'connection')
  const downstream = await openWebSocket(gatewayUrl(gateway))
  t.after(() => downstream.terminate())
  const [, request] = await upstreamConnection

  assert.equal(request.headers.authorization, undefined)
})

test('forwards the shared token and preserves the complete OneBot message loop', async t => {
  const { wss, url } = await startUpstream()
  t.after(() => closeUpstream(wss))
  const logs = []
  const log = Object.fromEntries(
    ['mark', 'info', 'warn', 'error', 'debug'].map(level => [level, value => logs.push(String(value))])
  )
  const gateway = await startGateway({
    upstream: { url: `${url}?access_token=url-secret` },
    accessToken: 'shared-secret',
    debug: true
  }, log)
  t.after(() => gateway.stop())

  const upstreamConnection = once(wss, 'connection')
  const downstream = await openWebSocket(gatewayUrl(gateway), {
    headers: {
      Authorization: 'Bearer shared-secret',
      'X-Self-ID': '10001',
      'X-Client-Role': 'Universal'
    }
  })
  t.after(() => downstream.terminate())
  const [upstream, request] = await upstreamConnection
  assert.equal(request.headers.authorization, 'Bearer shared-secret')
  assert.equal(request.headers['x-self-id'], '10001')
  assert.equal(request.headers['x-client-role'], 'Universal')

  const received = []
  upstream.on('message', (data, isBinary) => {
    if (!isBinary) received.push(JSON.parse(data.toString()))
  })
  const secretMessage = 'this message must not appear in logs'
  const bootstrap = [
    { post_type: 'meta_event', meta_event_type: 'lifecycle', sub_type: 'connect', self_id: '10001' },
    { post_type: 'meta_event', meta_event_type: 'lifecycle', sub_type: 'enable', self_id: '10001' },
    { post_type: 'meta_event', meta_event_type: 'heartbeat', self_id: '10001' },
    { post_type: 'message', message_type: 'private', self_id: '10001', raw_message: secretMessage }
  ]
  for (const frame of bootstrap) downstream.send(JSON.stringify(frame))
  await waitFor(() => received.length === bootstrap.length)
  assert.deepEqual(received, bootstrap)

  const action = { action: 'send_msg', params: { user_id: 42, message: 'response' }, echo: 'echo-1' }
  const actionAtSnowLuma = message(downstream)
  upstream.send(JSON.stringify(action))
  assert.deepEqual(JSON.parse((await actionAtSnowLuma).data.toString()), action)

  const response = { status: 'ok', retcode: 0, data: { message_id: 7 }, echo: 'echo-1' }
  const responseAtTrss = message(upstream)
  downstream.send(JSON.stringify(response))
  assert.deepEqual(JSON.parse((await responseAtTrss).data.toString()), response)

  const binaryAtTrss = message(upstream)
  downstream.send(Buffer.from([1, 2, 3]))
  const binary = await binaryAtTrss
  assert.equal(binary.isBinary, true)
  assert.deepEqual([...binary.data], [1, 2, 3])

  const output = logs.join('\n')
  assert.equal(output.includes('shared-secret'), false)
  assert.equal(output.includes('url-secret'), false)
  assert.equal(output.includes(secretMessage), false)
  assert.equal(output.includes('event=message.private'), true)
  assert.equal(output.includes('已识别账号 self_id=10001'), true)
  assert.equal(gateway.getStatus().upstream.includes('url-secret'), false)
  assert.equal(gateway.getStatus().sessions[0].selfId, '10001')
})

test('keeps concurrent SnowLuma sessions isolated and cleans them up', async t => {
  const { wss, url } = await startUpstream()
  t.after(() => closeUpstream(wss))
  const gateway = await startGateway({ upstream: { url } })
  t.after(() => gateway.stop())

  const upstreamOnePromise = once(wss, 'connection')
  const downstreamOne = await openWebSocket(gatewayUrl(gateway))
  const [upstreamOne] = await upstreamOnePromise
  const upstreamTwoPromise = once(wss, 'connection')
  const downstreamTwo = await openWebSocket(gatewayUrl(gateway))
  const [upstreamTwo] = await upstreamTwoPromise
  t.after(() => downstreamOne.terminate())
  t.after(() => downstreamTwo.terminate())
  assert.equal(gateway.getStatus().sessions.length, 2)

  let secondMessages = 0
  downstreamTwo.on('message', () => { secondMessages++ })
  const firstMessage = message(downstreamOne)
  upstreamOne.send(JSON.stringify({ action: 'first', echo: 1 }))
  assert.equal(JSON.parse((await firstMessage).data.toString()).action, 'first')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(secondMessages, 0)

  downstreamOne.close(1000, 'done')
  await waitFor(() => gateway.getStatus().sessions.length === 1)
  const secondMessage = message(downstreamTwo)
  upstreamTwo.send(JSON.stringify({ action: 'second', echo: 2 }))
  assert.equal(JSON.parse((await secondMessage).data.toString()).action, 'second')

  await gateway.stop()
  assert.equal(gateway.getStatus().sessions.length, 0)
})
