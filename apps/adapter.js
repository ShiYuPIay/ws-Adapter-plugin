/**
 * ws-Adapter 主逻辑
 * 正反向 WebSocket + 配置保存/热重载 + 事件分发
 * 适配 TRSS-Yunzai 插件规范，路径动态获取，不抢核心 2536
 * 不收集任何敏感信息
 */

import plugin from '../../../lib/plugins/plugin.js'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import { fileURLToPath } from 'url'
import WebSocket from 'ws'
import { WsClient } from '../utils/ws-client.js'
import { WsServer } from '../utils/ws-server.js'
import { getRecommendedUrls } from '../utils/docker.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class wsAdapter extends plugin {
  constructor() {
    super({
      name: 'ws-Adapter',
      dsc: '便捷 OneBot 正反向 WebSocket 适配器（跨环境/Docker 优化）',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#适配器帮助$', fnc: 'help' },
        { reg: '^#查看连接$', fnc: 'listConnections' },
        { reg: '^#添加连接\\s*(.+)$', fnc: 'addConnection' },
        { reg: '^#删除连接\\s*(.+)$', fnc: 'delConnection' },
        { reg: '^#重连\\s*(.+)$', fnc: 'reconnect' },
        { reg: '^#重载配置$', fnc: 'reloadConfig' },
        { reg: '^#保存配置$', fnc: 'saveConfigCmd' },
        { reg: '^#网络诊断$', fnc: 'networkDiagnose' },
        { reg: '^#切换消息格式\\s*(数组|字符串)$', fnc: 'setFormat' },
        { reg: '^#上报自身\\s*(开|关)$', fnc: 'setReportSelf' },
        { reg: '^#调试模式\\s*(开|关)$', fnc: 'setDebug' }
      ]
    })

    // 动态获取插件根目录（改文件夹名也不影响）
    this.pluginPath = path.join(__dirname, '..')
    this.configPath = path.join(this.pluginPath, 'config/config.yaml')
    this.defaultConfigPath = path.join(this.pluginPath, 'config/default.yaml')

    this.clients = new Map()   // reverse 客户端 name → WsClient
    this.servers = new Map()   // forward 服务端 name → WsServer

    this.config = this.loadConfig()
    this.initConnections()
  }

  // ==================== 配置相关 ====================

  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        fs.mkdirSync(path.dirname(this.configPath), { recursive: true })
        if (fs.existsSync(this.defaultConfigPath)) {
          fs.copyFileSync(this.defaultConfigPath, this.configPath)
        } else {
          const defaultCfg = {
            enable: true,
            messageFormat: 'array',
            role: 'Universal',
            reportSelfMessage: true,
            accessToken: '',
            reconnectInterval: 5000,
            heartbeatInterval: 10000,
            debug: true,
            presets: [
              { name: 'snowluma-local',  type: 'reverse', url: 'ws://localhost:3001/',                   desc: '连接本机 SnowLuma 反向 WS 客户端（同一台机器）' },
              { name: 'snowluma-docker', type: 'reverse', url: 'ws://snowluma:3001/',                     desc: '连接同一 Docker 网络中的 SnowLuma 反向 WS 客户端（通过服务名）' },
              { name: 'host-internal',   type: 'reverse', url: 'ws://host.docker.internal:3001/', desc: '容器内连接宿主机上的 SnowLuma 反向 WS 客户端（Docker Desktop）' },
              { name: 'adapter-forward', type: 'forward', host: '0.0.0.0', port: 3002, path: '/', desc: '插件本地监听服务（SnowLuma 主动连入，备用）' }
            ],
            active: ['snowluma-local']
          }
          fs.writeFileSync(this.configPath, yaml.stringify(defaultCfg), 'utf8')
        }
      }
      const content = fs.readFileSync(this.configPath, 'utf8')
      return yaml.parse(content) || {}
    } catch (e) {
      logger.error('[ws-Adapter] 配置加载失败', e)
      return { enable: false, presets: [], active: [] }
    }
  }

  saveConfig() {
    try {
      const content = yaml.stringify(this.config)
      fs.writeFileSync(this.configPath, content, 'utf8')
      logger.mark('[ws-Adapter] 配置已保存')
      return true
    } catch (e) {
      logger.error('[ws-Adapter] 配置保存失败', e)
      return false
    }
  }

  async saveConfigCmd(e) {
    const ok = this.saveConfig()
    await e.reply(ok ? '配置已保存到文件' : '保存失败，请查看日志')
  }

  async reloadConfig(e) {
    this.destroyConnections()
    this.config = this.loadConfig()
    this.initConnections()
    await e.reply('配置已热重载，连接已重新初始化')
    logger.mark('[ws-Adapter] 热重载完成')
  }

  // ==================== 连接管理 ====================

  initConnections() {
    if (!this.config.enable) {
      logger.mark('[ws-Adapter] 插件已禁用')
      return
    }

    const active = this.config.active || []
    for (const name of active) {
      const preset = (this.config.presets || []).find(p => p.name === name)
      if (!preset) {
        logger.warn(`[ws-Adapter] 预设不存在: ${name}`)
        continue
      }
      if (preset.type === 'reverse') {
        this.createClient(preset)
      } else if (preset.type === 'forward') {
        this.createServer(preset)
      }
    }
  }

  createClient(preset) {
    if (this.clients.has(preset.name)) {
      this.clients.get(preset.name).close()
    }

    const client = new WsClient({
      name: preset.name,
      url: preset.url,
      accessToken: this.config.accessToken || '',
      messageFormat: this.config.messageFormat || 'array',
      role: this.config.role || 'Universal',
      reconnectInterval: this.config.reconnectInterval || 5000,
      heartbeatInterval: this.config.heartbeatInterval || 10000,
      reportSelfMessage: this.config.reportSelfMessage ?? true,
      debug: this.config.debug ?? true
    })

    client.on('open', () => {
      logger.mark(`[ws-Adapter] 反向客户端 [${preset.name}] 已连接，建立代理通道`)
      this.setupProxy(client.ws, preset.name)
    })
    client.on('close', () => {
      logger.warn(`[ws-Adapter] 反向客户端 [${preset.name}] 已断开`)
    })

    client.connect()
    this.clients.set(preset.name, client)
  }

  createServer(preset) {
    if (this.servers.has(preset.name)) {
      this.servers.get(preset.name).stop()
    }

    const server = new WsServer({
      name: preset.name,
      host: preset.host || '0.0.0.0',
      port: preset.port || 3002,
      path: preset.path || '/',
      accessToken: this.config.accessToken || '',
      messageFormat: this.config.messageFormat || 'array',
      reportSelfMessage: this.config.reportSelfMessage ?? true,
      debug: this.config.debug ?? true
    })

    server.on('connection', (snowlumaWs) => {
      logger.mark(`[ws-Adapter] 正向服务 [${preset.name}] 新连接，建立代理通道`)
      this.setupProxy(snowlumaWs, preset.name)
    })
    server.on('listening', () => {
      logger.mark(`[ws-Adapter] 正向服务 [${preset.name}] 已启动`)
    })

    server.start()
    this.servers.set(preset.name, server)
  }

  destroyConnections() {
    for (const client of this.clients.values()) {
      try { client.close() } catch {}
    }
    this.clients.clear()

    for (const server of this.servers.values()) {
      try { server.stop() } catch {}
    }
    this.servers.clear()
  }

  // ==================== 代理通道 ====================

  /**
   * Bug 1 fix: pipe all traffic between a SnowLuma WebSocket and TRSS's own
   * OneBotv11 server (ws://localhost:2536/OneBotv11).
   *
   * TRSS's built-in OneBotv11Adapter handles the full handshake:
   *   meta_event/lifecycle → get_login_info → Bot[self_id] registration → plugin events
   *
   * Previous dispatchToTrss() called Bot.emit('message', rawOBv11) directly,
   * but Bot[self_id] was never registered so plugins could never reply.
   */
  setupProxy(snowlumaWs, name) {
    const trssUrl = 'ws://localhost:2536/OneBotv11'
    const trssWs = new WebSocket(trssUrl)

    trssWs.on('open', () => {
      if (this.config.debug) logger.mark(`[ws-Adapter][${name}] 代理通道已就绪 SnowLuma ↔ TRSS`)

      // SnowLuma → TRSS (events, API responses from SnowLuma)
      snowlumaWs.on('message', (data) => {
        if (trssWs.readyState === 1 /* OPEN */) trssWs.send(data)
      })

      // TRSS → SnowLuma (API calls: send_msg, etc.)
      trssWs.on('message', (data) => {
        if (snowlumaWs.readyState === 1 /* OPEN */) snowlumaWs.send(data)
      })
    })

    trssWs.on('error', (err) => {
      logger.error(`[ws-Adapter][${name}] 无法连接 TRSS (${trssUrl}): ${err.message}`)
      try { snowlumaWs.close(1011, 'upstream unavailable') } catch {}
    })

    trssWs.on('close', () => { try { snowlumaWs.close() } catch {} })
    snowlumaWs.on('close', () => { try { trssWs.close() } catch {} })
  }

  // ==================== 指令实现 ====================

  async help(e) {
    const msg = [
      '【ws-Adapter 便捷适配器 v1.1】',
      '',
      '常用指令：',
      '#查看连接          查看预设与当前状态',
      '#添加连接 预设名    启用某个预设',
      '#添加连接 ws://xxx 自定义反向地址',
      '#删除连接 名称',
      '#重连 名称',
      '#重载配置          热重载配置文件',
      '#保存配置',
      '#网络诊断',
      '#切换消息格式 数组/字符串',
      '#上报自身 开/关',
      '#调试模式 开/关',
      '',
      '【推荐最稳方式】',
      '1. 发送：#添加连接 adapter-forward',
      '2. 在 SnowLuma 新建反向客户端',
      '   地址填 → ws://你的IP:3002/',
      '',
      '注意：不要使用 2536 端口（那是 TRSS 核心占用的）',
      '本插件不收集任何 Token、账号或消息内容。'
    ].join('\n')
    await e.reply(msg)
  }

  async listConnections(e) {
    const presets = this.config.presets || []
    const active = this.config.active || []

    let text = '【当前预设列表】\n'
    if (presets.length === 0) {
      text += '暂无预设，请先编辑 config/config.yaml\n'
    } else {
      for (const p of presets) {
        const isActive = active.includes(p.name)
        const status = isActive ? '✅运行中' : '⬜未启用'
        const addr = p.type === 'forward'
          ? `${p.host || '0.0.0.0'}:${p.port || 3002}${p.path || '/'}`
          : p.url
        text += `${status} ${p.name} (${p.type})\n   ${addr}\n   ${p.desc || ''}\n`
      }
    }

    text += '\n【实际连接状态】\n'
    text += `反向客户端: ${this.clients.size} 个\n`
    text += `正向服务端: ${this.servers.size} 个\n`

    await e.reply(text)
  }

  async addConnection(e) {
    const arg = e.msg.replace(/^#添加连接\s*/, '').trim()
    if (!arg) return e.reply('请指定预设名或自定义地址')

    const preset = (this.config.presets || []).find(p => p.name === arg)
    if (preset) {
      if (!this.config.active) this.config.active = []
      if (!this.config.active.includes(arg)) {
        this.config.active.push(arg)
        this.saveConfig()
      }
      if (preset.type === 'reverse') this.createClient(preset)
      else if (preset.type === 'forward') this.createServer(preset)
      return e.reply(`已启用预设: ${arg}`)
    }

    if (arg.startsWith('ws://') || arg.startsWith('wss://')) {
      const name = `custom-${Date.now().toString(36)}`
      const newPreset = {
        name,
        type: 'reverse',
        url: arg,
        desc: '用户自定义'
      }
      if (!this.config.presets) this.config.presets = []
      this.config.presets.push(newPreset)
      if (!this.config.active) this.config.active = []
      this.config.active.push(name)
      this.saveConfig()
      this.createClient(newPreset)
      return e.reply(`已添加自定义连接: ${name}\n地址: ${arg}`)
    }

    await e.reply('未找到该预设，也不是有效的 ws:// 地址')
  }

  async delConnection(e) {
    const name = e.msg.replace(/^#删除连接\s*/, '').trim()
    if (!name) return e.reply('请指定连接名称')

    if (this.config.active) {
      this.config.active = this.config.active.filter(n => n !== name)
    }

    if (this.clients.has(name)) {
      this.clients.get(name).close()
      this.clients.delete(name)
    }
    if (this.servers.has(name)) {
      this.servers.get(name).stop()
      this.servers.delete(name)
    }

    this.saveConfig()
    await e.reply(`已删除/停止连接: ${name}`)
  }

  async reconnect(e) {
    const name = e.msg.replace(/^#重连\s*/, '').trim()
    if (!name) return e.reply('请指定连接名称')

    const client = this.clients.get(name)
    if (client) {
      client.reconnect()
      return e.reply(`正在重连反向客户端: ${name}`)
    }

    const server = this.servers.get(name)
    if (server) {
      const preset = (this.config.presets || []).find(p => p.name === name)
      if (preset) this.createServer(preset)  // createServer stops the existing instance first
      return e.reply(`正在重启正向服务: ${name}`)
    }

    await e.reply(`未找到连接: ${name}`)
  }

  async networkDiagnose(e) {
    const urls = getRecommendedUrls()

    const lines = [
      '【网络诊断】',
      `是否在 Docker 内: ${urls.inDocker ? '是' : '否'}`,
      ''
    ]

    if (urls.inDocker) {
      lines.push('推荐连接地址（按优先级）：')
      if (urls.snowlumaGateway) {
        lines.push(`① 宿主机网关 (Linux Docker 跨网络): ${urls.snowlumaGateway}`)
      }
      lines.push(`② Docker Desktop 宿主机: ${urls.hostInternal}`)
      lines.push(`③ 同网络服务名: ${urls.snowlumaDocker}`)
      lines.push(`④ 本机回环: ${urls.snowlumaLocal}`)
      lines.push('')
      if (urls.gatewayIp) {
        lines.push(`检测到网关 IP: ${urls.gatewayIp}`)
      }
      lines.push('若 ③ 提示 ENOTFOUND，说明两个容器不在同一 Docker 网络，请改用 ①')
    } else {
      lines.push('推荐地址：')
      lines.push(`SnowLuma 本机: ${urls.snowlumaLocal}`)
    }

    lines.push('')
    lines.push('注意：TRSS 核心已占用 2536 端口，本插件默认使用 3002')

    await e.reply(lines.join('\n'))
  }

  async setFormat(e) {
    const format = e.msg.includes('数组') ? 'array' : 'string'
    this.config.messageFormat = format
    this.saveConfig()
    await e.reply(`消息格式已切换为: ${format}`)
  }

  async setReportSelf(e) {
    const on = e.msg.includes('开')
    this.config.reportSelfMessage = on
    this.saveConfig()
    await e.reply(`上报自身消息已${on ? '开启' : '关闭'}`)
  }

  async setDebug(e) {
    const on = e.msg.includes('开')
    this.config.debug = on
    this.saveConfig()
    await e.reply(`调试模式已${on ? '开启' : '关闭'}`)
  }
}