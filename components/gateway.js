import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'

const statusText = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
}

function createLogger(log = {}) {
  const noop = () => {}
  return {
    mark: typeof log.mark === 'function' ? log.mark.bind(log) : noop,
    info: typeof log.info === 'function' ? log.info.bind(log) : noop,
    warn: typeof log.warn === 'function' ? log.warn.bind(log) : noop,
    error: typeof log.error === 'function' ? log.error.bind(log) : noop,
    debug: typeof log.debug === 'function' ? log.debug.bind(log) : noop
  }
}

function rejectUpgrade(socket, status, body = statusText[status]) {
  if (socket.destroyed) return
  const content = Buffer.from(body)
  socket.end(
    `HTTP/1.1 ${status} ${statusText[status]}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    `Content-Length: ${content.length}\r\n\r\n` +
    body
  )
}

function tokenMatches(expected, actual) {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

function requestToken(req, url) {
  const auth = String(req.headers.authorization || '')
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]
  return bearer || url.searchParams.get('access_token') || ''
}

function safeScalar(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, 80)
}

function echoId(value) {
  if (value === undefined) return ''
  let input
  try {
    input = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    input = String(value)
  }
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

export function redactUrl(value) {
  try {
    const url = new URL(value)
    for (const key of url.searchParams.keys()) {
      if (/token|authorization|key|ticket|secret/i.test(key)) url.searchParams.set(key, '[redacted]')
    }
    return url.toString()
  } catch {
    return String(value).replace(/([?&](?:access_)?token=)[^&\s]+/gi, '$1[redacted]')
  }
}

function frameSummary(data) {
  try {
    const value = JSON.parse(data.toString())
    if (value.action) {
      const echo = echoId(value.echo)
      return `action=${safeScalar(value.action)}${echo ? ` echo=${echo}` : ''}`
    }
    if (value.post_type) {
      const type = [value.post_type, value.meta_event_type || value.message_type || value.notice_type]
        .filter(Boolean)
        .join('.')
      const selfId = safeScalar(value.self_id)
      return `event=${type}${selfId ? ` self_id=${selfId}` : ''}`
    }
    if (value.echo !== undefined) return `response echo=${echoId(value.echo)}`
    return 'json frame'
  } catch {
    return 'non-json frame'
  }
}

function closeReason(reason) {
  const value = Buffer.isBuffer(reason) ? reason.toString() : String(reason || '')
  return Buffer.byteLength(value) <= 123 ? value : 'peer closed'
}

function closeCode(code) {
  if (code === 1000 || (code >= 1001 && code <= 1014 && ![1004, 1005, 1006].includes(code))) {
    return code
  }
  if (code >= 3000 && code <= 4999) return code
  return 1011
}

function terminate(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return
  socket.once('error', () => {})
  socket.terminate()
}

export class WebSocketGateway {
  constructor(config, log) {
    this.config = config
    this.log = createLogger(log)
    this.server = null
    this.wss = null
    this.sessions = new Map()
    this.pending = new Map()
    this.nextSessionId = 1
    this.running = false
    this.stopping = false
    this.lastError = ''
  }

  async start() {
    if (this.running || !this.config.enable) return
    this.stopping = false
    this.wss = new WebSocketServer({ noServer: true, clientTracking: false })
    this.server = createServer((req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('WebSocket Upgrade Required')
    })
    this.server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head))

    await new Promise((resolve, reject) => {
      const onError = err => {
        this.lastError = err.message
        reject(err)
      }
      this.server.once('error', onError)
      this.server.listen(this.config.listen.port, this.config.listen.host, () => {
        this.server.off('error', onError)
        resolve()
      })
    })

    this.server.on('error', err => {
      this.lastError = err.message
      this.log.error(`[ws-Adapter] 网关错误: ${err.message}`)
    })
    this.running = true
    const { address, port } = this.server.address()
    this.log.mark(
      `[ws-Adapter] 网关已启动，绑定 ${address}:${port}${this.config.listen.path}；` +
      `SnowLuma 同机目标 ws://127.0.0.1:${port}${this.config.listen.path}`
    )
  }

  handleUpgrade(req, socket, head) {
    if (this.stopping || !this.wss) return rejectUpgrade(socket, 503)

    let url
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    } catch {
      return rejectUpgrade(socket, 404)
    }
    if (url.pathname !== this.config.listen.path) {
      this.log.warn(`[ws-Adapter] 拒绝 SnowLuma：路径应为 ${this.config.listen.path}，收到 ${url.pathname}`)
      return rejectUpgrade(socket, 404)
    }

    if (this.config.accessToken) {
      const token = requestToken(req, url)
      if (!token) {
        this.log.warn('[ws-Adapter] 拒绝 SnowLuma：未提交授权 Token')
        return rejectUpgrade(socket, 401)
      }
      if (!tokenMatches(this.config.accessToken, token)) {
        this.log.warn('[ws-Adapter] 拒绝 SnowLuma：授权 Token 不一致')
        return rejectUpgrade(socket, 403)
      }
    }

    const headers = {
      'User-Agent': 'ws-Adapter/1.1.0 OneBot/11',
      'X-Client-Role': req.headers['x-client-role'] || 'Universal'
    }
    if (req.headers['x-self-id']) headers['X-Self-ID'] = req.headers['x-self-id']
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`

    let upstream
    try {
      upstream = new WebSocket(this.config.upstream.url, { headers })
    } catch (err) {
      this.failPending(socket, null, 502, err)
      return
    }

    this.pending.set(socket, upstream)
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('close', onSocketClose)
      upstream.off('open', onOpen)
      upstream.off('error', onError)
      upstream.off('close', onClose)
      upstream.off('unexpected-response', onUnexpectedResponse)
      this.pending.delete(socket)
    }
    const fail = (status, err) => {
      if (settled) return
      settled = true
      cleanup()
      this.failPending(socket, upstream, status, err)
    }
    const onSocketClose = () => fail(502, new Error('SnowLuma 在握手完成前断开'))
    const onError = err => fail(502, err)
    const onClose = () => fail(502, new Error('TRSS 在握手完成前断开'))
    const onUnexpectedResponse = (_request, response) => {
      response.resume()
      fail(502, new Error(`TRSS 拒绝连接: HTTP ${response.statusCode}`))
    }
    const onOpen = () => {
      if (settled) return
      settled = true
      cleanup()
      if (socket.destroyed || this.stopping || !this.wss) {
        upstream.close(1001, 'gateway unavailable')
        return
      }
      try {
        this.wss.handleUpgrade(req, socket, head, downstream => {
          this.createSession(downstream, upstream, req)
        })
      } catch (err) {
        this.lastError = err.message
        this.log.error(`[ws-Adapter] SnowLuma 握手失败: ${err.message}`)
        upstream.close(1011, 'downstream handshake failed')
        socket.destroy()
      }
    }
    const timer = setTimeout(
      () => fail(504, new Error(`连接 TRSS 超时 (${this.config.connectTimeout}ms)`)),
      this.config.connectTimeout
    )
    timer.unref?.()

    socket.once('close', onSocketClose)
    upstream.once('open', onOpen)
    upstream.once('error', onError)
    upstream.once('close', onClose)
    upstream.once('unexpected-response', onUnexpectedResponse)
    this.log.info(`[ws-Adapter] SnowLuma 请求已验证，正在连接 TRSS ${redactUrl(this.config.upstream.url)}`)
  }

  failPending(socket, upstream, status, err) {
    this.lastError = err?.message || String(err)
    this.log.warn(`[ws-Adapter] 无法建立桥接: ${this.lastError}`)
    rejectUpgrade(socket, status)
    terminate(upstream)
  }

  createSession(downstream, upstream, req) {
    const id = this.nextSessionId++
    const session = {
      id,
      downstream,
      upstream,
      remoteAddress: req.socket.remoteAddress || '',
      connectedAt: Date.now(),
      selfId: '',
      closed: false
    }
    this.sessions.set(id, session)
    this.log.mark(`[ws-Adapter][${id}] 桥接成功 SnowLuma ↔ TRSS`)

    downstream.on('message', (data, isBinary) => {
      this.captureSelfId(session, data)
      if (this.config.debug) this.log.debug(`[ws-Adapter][${id}] SnowLuma → TRSS ${frameSummary(data)}`)
      this.relay(session, upstream, data, isBinary)
    })
    upstream.on('message', (data, isBinary) => {
      if (this.config.debug) this.log.debug(`[ws-Adapter][${id}] TRSS → SnowLuma ${frameSummary(data)}`)
      this.relay(session, downstream, data, isBinary)
    })

    downstream.on('close', (code, reason) => this.finishSession(session, upstream, code, reason))
    upstream.on('close', (code, reason) => this.finishSession(session, downstream, code, reason))
    downstream.on('error', err => this.failSession(session, upstream, 'SnowLuma', err))
    upstream.on('error', err => this.failSession(session, downstream, 'TRSS', err))
  }

  captureSelfId(session, data) {
    if (session.selfId) return
    try {
      const selfId = safeScalar(JSON.parse(data.toString()).self_id)
      if (selfId) {
        session.selfId = selfId
        this.log.mark(`[ws-Adapter][${session.id}] 已识别账号 self_id=${selfId}`)
      }
    } catch {}
  }

  relay(session, target, data, isBinary) {
    if (session.closed) return
    if (target.readyState !== WebSocket.OPEN) {
      this.failSession(session, target, '目标连接', new Error('连接未就绪'))
      return
    }
    try {
      target.send(data, { binary: isBinary }, err => {
        if (err) this.failSession(session, target, '发送', err)
      })
    } catch (err) {
      this.failSession(session, target, '发送', err)
    }
  }

  failSession(session, peer, side, err) {
    if (session.closed) return
    this.lastError = err.message
    this.log.warn(`[ws-Adapter][${session.id}] ${side} 错误: ${err.message}`)
    this.finishSession(session, peer, 1011, 'bridge error')
  }

  finishSession(session, peer, code = 1000, reason = '') {
    if (session.closed) return
    session.closed = true
    this.sessions.delete(session.id)
    const message = closeReason(reason)
    if (peer.readyState === WebSocket.OPEN) peer.close(closeCode(code), message)
    else if (peer.readyState === WebSocket.CONNECTING) terminate(peer)
    this.log.info(`[ws-Adapter][${session.id}] 桥接关闭 code=${code || 1000}`)
  }

  getStatus() {
    const address = this.server?.address()
    return {
      running: this.running,
      address: address && typeof address === 'object' ? address.address : '',
      port: address && typeof address === 'object' ? address.port : 0,
      path: this.config.listen.path,
      upstream: redactUrl(this.config.upstream.url),
      pending: this.pending.size,
      lastError: this.lastError,
      sessions: [...this.sessions.values()].map(session => ({
        id: session.id,
        selfId: session.selfId,
        remoteAddress: session.remoteAddress,
        connectedAt: session.connectedAt
      }))
    }
  }

  async stop() {
    if (this.stopping) return
    this.stopping = true
    this.running = false

    for (const [socket, upstream] of this.pending) {
      rejectUpgrade(socket, 503)
      terminate(upstream)
    }
    this.pending.clear()

    const closing = []
    for (const session of [...this.sessions.values()]) {
      session.closed = true
      closing.push(this.closeSocket(session.downstream), this.closeSocket(session.upstream))
      this.sessions.delete(session.id)
    }
    await Promise.all(closing)

    const server = this.server
    this.server = null
    if (server) {
      await new Promise(resolve => server.close(() => resolve()))
    }
    this.wss?.close()
    this.wss = null
    this.stopping = false
    this.log.mark('[ws-Adapter] 网关已停止')
  }

  closeSocket(socket) {
    if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise(resolve => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        terminate(socket)
        finish()
      }, 250)
      socket.once('close', finish)
      try {
        socket.close(1001, 'gateway stop')
      } catch {
        terminate(socket)
        finish()
      }
    })
  }
}
