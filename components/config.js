import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'

const pluginPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const defaultPaths = {
  defaultPath: path.join(pluginPath, 'config/default.yaml'),
  userPath: path.join(pluginPath, 'config/config.yaml')
}

function readYaml(file) {
  const data = yaml.parse(fs.readFileSync(file, 'utf8'))
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError(`配置文件必须是对象: ${file}`)
  }
  return data
}

function migrateLegacyListen(file, defaults, user) {
  const listen = user.listen
  if (
    !listen ||
    Object.keys(listen).length !== 3 ||
    listen.host !== '0.0.0.0' ||
    listen.port !== 3002 ||
    listen.path !== '/'
  ) return user

  const next = { ...user, listen: { ...defaults.listen } }
  const document = yaml.parseDocument(fs.readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(next.listen)) document.setIn(['listen', key], value)
  fs.writeFileSync(file, document.toString(), 'utf8')
  return next
}

function value(source, key, fallback) {
  return Object.hasOwn(source, key) ? source[key] : fallback
}

export function mergeConfig(defaults, user = {}) {
  if (Object.hasOwn(user, 'listen') && (!user.listen || typeof user.listen !== 'object' || Array.isArray(user.listen))) {
    throw new TypeError('listen 必须是对象')
  }
  if (Object.hasOwn(user, 'upstream') && (!user.upstream || typeof user.upstream !== 'object' || Array.isArray(user.upstream))) {
    throw new TypeError('upstream 必须是对象')
  }
  const listen = user.listen || {}
  const upstream = user.upstream || {}
  return {
    enable: value(user, 'enable', defaults.enable),
    listen: {
      host: value(listen, 'host', defaults.listen?.host),
      port: value(listen, 'port', defaults.listen?.port),
      path: value(listen, 'path', defaults.listen?.path)
    },
    upstream: {
      url: value(upstream, 'url', defaults.upstream?.url)
    },
    accessToken: value(user, 'accessToken', defaults.accessToken),
    connectTimeout: value(user, 'connectTimeout', defaults.connectTimeout),
    debug: value(user, 'debug', defaults.debug)
  }
}

export function validateConfig(config) {
  if (typeof config.enable !== 'boolean') throw new TypeError('enable 必须是布尔值')
  if (!config.listen || typeof config.listen !== 'object') throw new TypeError('listen 必须是对象')
  if (typeof config.listen.host !== 'string' || !config.listen.host.trim()) {
    throw new TypeError('listen.host 必须是非空字符串')
  }
  if (!Number.isInteger(config.listen.port) || config.listen.port < 1 || config.listen.port > 65535) {
    throw new RangeError('listen.port 必须是 1 到 65535 的整数')
  }
  if (typeof config.listen.path !== 'string' || !config.listen.path.startsWith('/')) {
    throw new TypeError('listen.path 必须是以 / 开头的字符串')
  }
  if (!config.upstream || typeof config.upstream !== 'object') throw new TypeError('upstream 必须是对象')
  if (typeof config.upstream.url !== 'string' || !/^wss?:\/\//i.test(config.upstream.url)) {
    throw new TypeError('upstream.url 必须是 ws:// 或 wss:// 地址')
  }
  if (typeof config.accessToken !== 'string') throw new TypeError('accessToken 必须是字符串')
  if (!Number.isInteger(config.connectTimeout) || config.connectTimeout < 1) {
    throw new RangeError('connectTimeout 必须是正整数')
  }
  if (typeof config.debug !== 'boolean') throw new TypeError('debug 必须是布尔值')
  return config
}

export class ConfigStore {
  constructor(paths = {}) {
    this.defaultPath = paths.defaultPath || defaultPaths.defaultPath
    this.userPath = paths.userPath || defaultPaths.userPath
  }

  load() {
    if (!fs.existsSync(this.defaultPath)) {
      throw new Error(`默认配置不存在: ${this.defaultPath}`)
    }
    if (!fs.existsSync(this.userPath)) {
      fs.mkdirSync(path.dirname(this.userPath), { recursive: true })
      fs.copyFileSync(this.defaultPath, this.userPath)
    }
    const defaults = readYaml(this.defaultPath)
    const user = migrateLegacyListen(this.userPath, defaults, readYaml(this.userPath))
    const config = mergeConfig(defaults, user)
    return validateConfig(config)
  }
}
