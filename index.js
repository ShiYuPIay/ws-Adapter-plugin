import fs from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

logger.mark('[ws-Adapter] 正在加载...')

const appsDir = path.join(__dirname, 'apps')
const files = fs.readdirSync(appsDir).filter(f => f.endsWith('.js'))

const ret = await Promise.allSettled(
  files.map(f => import(`./apps/${f}`))
)

const apps = {}
for (let i = 0; i < files.length; i++) {
  const name = files[i].replace('.js', '')
  if (ret[i].status !== 'fulfilled') {
    logger.error(`[ws-Adapter] 载入失败：${name}`)
    logger.error(ret[i].reason)
    continue
  }
  const exported = ret[i].value
  const key = Object.keys(exported)[0]
  apps[name] = exported[key]
}

logger.mark('[ws-Adapter] 加载完成')
export { apps }
