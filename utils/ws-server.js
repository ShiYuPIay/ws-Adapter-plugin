import WebSocket, { WebSocketServer } from 'ws'
import { EventEmitter } from 'events'
import { createServer } from 'http'
import { networkInterfaces } from 'os'
import { cqToArray } from './message.js'

function getLocalIPs() {
  const result = []
  for (const iface of Object.values(networkInterfaces())) {
    for (const entry of iface) {
      if (entry.family === 'IPv4' && !entry.internal) result.push(entry.address)
    }
  }
  return result.length ? result : ['127.0.0.1']
}

export class WsServer extends EventEmitter {
  constructor(options = {}) {
    super()
    this.name = options.name || 'forward'
    this.host = options.host || '0.0.0.0'
    this.port = options.port || 3002          // 默认 3002，避开 SnowLuma 的 3001
    this.path = options.path || '/'
    this.accessToken = options.accessToken || ''
    this.messageFormat = options.messageFormat || 'array'
    this.reportSelfMessage = options.reportSelfMessage ?? true
    this.debug = options.debug ?? true

    this.wss = null
    this.httpServer = null
    this.clients = new Set()
  }

  start() {
    if (this.wss) return

    this.httpServer = createServer()
    this.wss = new WebSocketServer({ server: this.httpServer, path: this.path })

    this.wss.on('connection', (ws, req) => this.onConnection(ws, req))
    this.wss.on('error', (err) => {
      logger.error(`[ws-Adapter][${this.name}] 服务端错误`, err)
      this.emit('error', err)
    })

    this.httpServer.listen(this.port, this.host, () => {
      const ips = this.host === '0.0.0.0' ? getLocalIPs() : [this.host]
      const addrList = ips.map(ip => `  ws://${ip}:${this.port}${this.path}`).join('\n')
      logger.mark(`[ws-Adapter][${this.name}] 正向服务已启动，协议端连接地址：\n${addrList}`)
      this.emit('listening')
    })

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`[ws-Adapter][${this.name}] 端口 ${this.port} 已被占用，请修改配置中的 port`)
      } else {
        logger.error(`[ws-Adapter][${this.name}] 监听失败`, err)
      }
    })
  }

  onConnection(ws, req) {
    if (this.accessToken) {
      const auth = req.headers['authorization'] || ''
      const token = auth.replace(/^Bearer\s+/i, '')
      if (token !== this.accessToken) {
        logger.warn(`[ws-Adapter][${this.name}] 鉴权失败`)
        ws.close(1008, 'Unauthorized')
        return
      }
    }

    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`
    logger.mark(`[ws-Adapter][${this.name}] 新客户端连接 ${clientId}`)
    this.clients.add(ws)
    this.emit('connection', ws)  // Bug 3 fix: expose raw socket so adapter can set up proxy

    ws.on('message', (raw) => this.onMessage(ws, raw))
    ws.on('close', () => {
      this.clients.delete(ws)
      logger.mark(`[ws-Adapter][${this.name}] 客户端断开 ${clientId}`)
    })
    ws.on('error', () => this.clients.delete(ws))
  }

  onMessage(ws, raw) {
    let data
    try {
      data = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (this.debug) {
      logger.debug(`[ws-Adapter][${this.name}] 收到原始数据: ${JSON.stringify(data).slice(0, 500)}`)
    }

    if (data.post_type === 'meta_event' && data.meta_event_type === 'heartbeat') return

    if (!this.reportSelfMessage && data.post_type === 'message' && String(data.self_id) === String(data.user_id)) {
      return
    }

    if (this.messageFormat === 'array' && typeof data.message === 'string') {
      data.message = cqToArray(data.message)
    }

    this.emit('message', data, ws)
    this.emit(data.post_type || 'unknown', data, ws)
  }

  sendTo(ws, data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
  }

  broadcast(data) {
    const str = JSON.stringify(data)
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(str)
    }
  }

  stop() {
    for (const ws of this.clients) {
      try { ws.close(1000, 'server stop') } catch {}
    }
    this.clients.clear()
    if (this.wss) { this.wss.close(); this.wss = null }
    if (this.httpServer) { this.httpServer.close(); this.httpServer = null }
    logger.mark(`[ws-Adapter][${this.name}] 正向服务已停止`)
  }
}
