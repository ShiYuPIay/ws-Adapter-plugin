import plugin from '../../../lib/plugins/plugin.js'
import { ConfigStore } from '../components/config.js'
import { redactUrl, WebSocketGateway } from '../components/gateway.js'

function gatewayError(err, config) {
  if (err?.code === 'EADDRINUSE' && config) {
    return `监听 ${config.listen.host}:${config.listen.port}${config.listen.path} 失败：端口已被占用。请停止占用程序，或修改 config/config.yaml 后重启`
  }
  return err?.message || String(err)
}

export class wsAdapter extends plugin {
  constructor() {
    super({
      name: 'ws-Adapter',
      dsc: 'SnowLuma reverse-ws 到 TRSS OneBotv11 的透明网关',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#适配器帮助$', fnc: 'help' },
        { reg: '^#查看连接$', fnc: 'status' },
        { reg: '^#重载配置$', fnc: 'reloadConfig', permission: 'master' }
      ]
    })

    this.configStore = new ConfigStore()
    this.gateway = null
    this.starting = null
    this.lastError = ''

    if (Bot?.stat?.online === 2) void this.startGateway()
    else Bot.once('online', () => this.startGateway())
  }

  async startGateway() {
    if (this.starting) return this.starting
    this.starting = this.createGateway()
    try {
      await this.starting
    } finally {
      this.starting = null
    }
  }

  async createGateway() {
    let config
    let gateway
    try {
      config = this.configStore.load()
      gateway = new WebSocketGateway(config, logger)
      await gateway.start()
      this.gateway = gateway
      this.lastError = ''
      if (!config.enable) logger.mark('[ws-Adapter] 网关已在配置中禁用')
    } catch (err) {
      await gateway?.stop().catch(() => {})
      this.lastError = gatewayError(err, config)
      logger.error(`[ws-Adapter] 启动失败: ${this.lastError}`)
    }
  }

  async reloadConfig(e) {
    let config
    try {
      config = this.configStore.load()
    } catch (err) {
      this.lastError = err.message
      return e.reply(`配置无效，现有网关保持运行：${err.message}`)
    }

    const previous = this.gateway
    const next = new WebSocketGateway(config, logger)
    try {
      await e.reply('配置验证通过，正在重载网关；当前连接会短暂断开')
    } catch {}
    try {
      await previous?.stop()
      await next.start()
      this.gateway = next
      this.lastError = ''
      logger.mark(config.enable ? '[ws-Adapter] 配置重载完成' : '[ws-Adapter] 配置重载完成，网关已禁用')
    } catch (err) {
      this.lastError = gatewayError(err, config)
      logger.error(`[ws-Adapter] 重载失败: ${this.lastError}`)
      await next.stop().catch(() => {})
      try {
        await previous?.start()
        this.gateway = previous
      } catch (restoreErr) {
        this.lastError = `${this.lastError}; 恢复失败: ${restoreErr.message}`
        logger.error(`[ws-Adapter] 恢复旧网关失败: ${restoreErr.message}`)
      }
    }
  }

  async help(e) {
    let config
    try {
      config = this.configStore.load()
    } catch (err) {
      return e.reply(`配置加载失败：${err.message}`)
    }

    const listenPath = config.listen.path === '/' ? '/' : config.listen.path
    const lines = [
      '【ws-Adapter】',
      'SnowLuma reverse-ws → ws-Adapter → TRSS OneBotv11',
      '',
      `插件监听：${config.listen.host}:${config.listen.port}${listenPath}`,
      `SnowLuma 同机目标：ws://127.0.0.1:${config.listen.port}${listenPath}`,
      `Docker 同网络：ws://<TRSS服务名>:${config.listen.port}${listenPath}`,
      `TRSS 上游：${redactUrl(config.upstream.url)}`,
      `授权 Token：${config.accessToken ? '已配置（两段连接共用）' : '未配置'}`,
      '',
      '#查看连接',
      '#重载配置（主人）'
    ]
    await e.reply(lines.join('\n'))
  }

  async status(e) {
    const status = this.gateway?.getStatus()
    if (!status) {
      return e.reply(`【ws-Adapter】未启动${this.lastError ? `\n错误：${this.lastError}` : ''}`)
    }

    const lines = [
      '【ws-Adapter 连接状态】',
      `网关：${status.running ? '运行中' : '已停止'}`,
      `监听：${status.address || '-'}:${status.port || '-'}${status.path}`,
      `上游：${status.upstream}`,
      `活动连接：${status.sessions.length}`,
      `握手中：${status.pending}`
    ]
    for (const session of status.sessions) {
      lines.push(`- #${session.id} 账号：${session.selfId || '等待 lifecycle'}`)
    }
    if (status.lastError || this.lastError) lines.push(`最近错误：${status.lastError || this.lastError}`)
    await e.reply(lines.join('\n'))
  }
}
