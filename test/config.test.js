import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import yaml from 'yaml'
import { ConfigStore, mergeConfig, validateConfig } from '../components/config.js'

const defaults = {
  enable: true,
  listen: { host: '0.0.0.0', port: 6099, path: '/ws' },
  upstream: { url: 'ws://127.0.0.1:2536/OneBotv11/ws' },
  accessToken: '',
  connectTimeout: 5000,
  debug: false
}

test('shipped defaults expose the documented SnowLuma endpoint', () => {
  const shipped = yaml.parse(fs.readFileSync(new URL('../config/default.yaml', import.meta.url), 'utf8'))

  assert.deepEqual(shipped.listen, defaults.listen)
  assert.equal(shipped.upstream.url, defaults.upstream.url)
  assert.equal(shipped.accessToken, '')
})

test('ConfigStore creates and loads the user config', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-adapter-config-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const defaultPath = path.join(dir, 'default.yaml')
  const userPath = path.join(dir, 'nested', 'config.yaml')
  fs.writeFileSync(defaultPath, yaml.stringify(defaults))

  const config = new ConfigStore({ defaultPath, userPath }).load()

  assert.deepEqual(config, defaults)
  assert.equal(fs.existsSync(userPath), true)
})

test('ConfigStore migrates only the untouched legacy listen defaults', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-adapter-migration-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const defaultPath = path.join(dir, 'default.yaml')
  const legacyPath = path.join(dir, 'legacy.yaml')
  const customPath = path.join(dir, 'custom.yaml')
  fs.writeFileSync(defaultPath, yaml.stringify(defaults))
  fs.writeFileSync(legacyPath, yaml.stringify({
    ...defaults,
    listen: { host: '0.0.0.0', port: 3002, path: '/' }
  }))
  fs.writeFileSync(customPath, yaml.stringify({
    ...defaults,
    listen: { host: '0.0.0.0', port: 3002, path: '/custom' }
  }))

  const migrated = new ConfigStore({ defaultPath, userPath: legacyPath }).load()
  const custom = new ConfigStore({ defaultPath, userPath: customPath }).load()

  assert.deepEqual(migrated.listen, defaults.listen)
  assert.deepEqual(yaml.parse(fs.readFileSync(legacyPath, 'utf8')).listen, defaults.listen)
  assert.deepEqual(custom.listen, { host: '0.0.0.0', port: 3002, path: '/custom' })
})

test('mergeConfig accepts known overrides and ignores unknown fields', () => {
  const config = mergeConfig(defaults, {
    listen: { port: 4000 },
    debug: true,
    presets: [{ name: 'dead-code' }]
  })

  assert.deepEqual(config, {
    ...defaults,
    listen: { ...defaults.listen, port: 4000 },
    debug: true
  })
  assert.equal('presets' in config, false)
})

test('validateConfig rejects invalid values', () => {
  const invalid = [
    { key: 'enable', value: 'true' },
    { key: 'listen', value: { ...defaults.listen, port: 0 } },
    { key: 'listen', value: { ...defaults.listen, path: 'gateway' } },
    { key: 'upstream', value: { url: 'http://127.0.0.1' } },
    { key: 'accessToken', value: 123 },
    { key: 'connectTimeout', value: 0 },
    { key: 'debug', value: 'false' }
  ]

  for (const { key, value } of invalid) {
    assert.throws(() => validateConfig({ ...defaults, [key]: value }))
  }
  assert.throws(() => mergeConfig(defaults, { listen: null }))
  assert.throws(() => validateConfig(mergeConfig(defaults, { enable: null })))
})
