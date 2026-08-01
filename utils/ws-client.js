import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { cqToArray } from './message.js'

export class WsClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.url = options.url
    this.name = options.name || 'default'
    this.accessToken = options.accessToken || ''
    this.messageFormat = options.messageFormat || 'array'
    this.role = options.role || 'Universal'
    this.reconnectInterval = options.reconnectInterval || 5000
    this.heartbeatInterval = options.heartbeatInterval || 10000
    this.reportSelfMessage = options.reportSelfMessage ?? true
    this.debug = options.debug ?? true

    this.ws = null
    this.isConnected = false
    this.isManualClose = false
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.lastPong = Date.now()
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return

    this.isManualClose = false
    logger.mark(`[ws-Adapter][${this.name}] 正在连接 → ${this.url}`)

    const headers = {
      'X-Client-Role': this.role,
      'User-Agent': 'OneBot/11 (ws-Adapter)'
    }
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`

    try {
      this.ws = new WebSocket(this.url, { headers })
    } catch (err) {
      logger.error(`[ws-Adapter][${this.name}] 创建失败`, err)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => this.onOpen())
    this.ws.on('message', (data) => this.onMessage(data))
    this.ws.on('close', (code, reason) => this.onClose(code, reason))
    this.ws.on('error', (err) => this.onError(err))
    this.ws.on('pong', () => { this.lastPong = Date.now() })
  }

  onOpen() {
    this.isConnected = true
    logger.mark(`[ws-Adapter][${this.name}] 连接成功 → ${this.url}`)
    this.emit('open')
    this.startHeartbeat()
  }

  onMessage(raw) {
    let data
    try {
      data = JSON.parse(raw.toString())
    } catch {
      if (this.debug) logger.warn(`[ws-Adapter][${this.name}] 非JSON消息已忽略`)
      return
    }

    if (this.debug) {
      logger.debug(`[ws-Adapter][${this.name}] 收到原始数据: ${JSON.stringify(data).slice(0, 500)}`)
    }

    if (data.post_type === 'meta_event' && data.meta_event_type === 'heartbeat') {
      this.lastPong = Date.now()
      return
    }

    if (!this.reportSelfMessage && data.post_type === 'message' && String(data.self_id) === String(data.user_id)) {
      return
    }

    if (this.messageFormat === 'array' && typeof data.message === 'string') {
      data.message = cqToArray(data.message)
    }

    this.emit('message', data)
    this.emit(data.post_type || 'unknown', data)
  }

  onClose(code, reason) {
    this.isConnected = false
    this.stopHeartbeat()
    logger.warn(`[ws-Adapter][${this.name}] 连接关闭 code=${code}`)
    this.emit('close', code, reason)
    if (!this.isManualClose) this.scheduleReconnect()
  }

  onError(err) {
    logger.error(`[ws-Adapter][${this.name}] 错误: ${err.message || err}`)
    this.emit('error', err)
  }

  send(data) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(data))
      return true
    } catch (err) {
      logger.error(`[ws-Adapter][${this.name}] 发送失败`, err)
      return false
    }
  }

  close() {
    this.isManualClose = true
    this.stopHeartbeat()
    clearTimeout(this.reconnectTimer)
    if (this.ws) {
      try { this.ws.close(1000, 'manual') } catch {}
      this.ws = null
    }
    this.isConnected = false
  }

  reconnect() {
    this.close()
    this.connect()  // connect() resets isManualClose to false before proceeding
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      logger.mark(`[ws-Adapter][${this.name}] 尝试重连...`)
      this.connect()
    }, this.reconnectInterval)
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected) return
      if (Date.now() - this.lastPong > this.heartbeatInterval * 2.5) {
        logger.warn(`[ws-Adapter][${this.name}] 心跳超时，重连`)
        this.ws?.terminate()
        return
      }
      try { this.ws.ping() } catch {}
    }, this.heartbeatInterval)
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }
}
