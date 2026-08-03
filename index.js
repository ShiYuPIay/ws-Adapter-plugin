import { wsAdapter } from './apps/adapter.js'

const apps = { adapter: wsAdapter }

logger.mark('[ws-Adapter] 插件已加载')

export { apps }
