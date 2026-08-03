'use strict'

const STORAGE_KEY = 'ws-adapter-guide-progress-v1'
const stepIds = ['prepare', 'install', 'activate', 'environment', 'configurator', 'snowluma', 'verify', 'troubleshoot']

const state = {
  completed: new Set(),
  checks: new Set(),
  environment: 'same-host',
  tokenEnabled: true,
  token: ''
}

const elements = {
  toast: document.querySelector('#toast'),
  targetUrl: document.querySelector('#target-url'),
  mockTargetUrl: document.querySelector('#mock-target-url'),
  mockToken: document.querySelector('#mock-token'),
  environmentNote: document.querySelector('#environment-note'),
  dockerNameField: document.querySelector('#docker-name-field'),
  hostIpField: document.querySelector('#host-ip-field'),
  dockerName: document.querySelector('#docker-name'),
  hostIp: document.querySelector('#host-ip'),
  tokenToggle: document.querySelector('#token-toggle'),
  tokenState: document.querySelector('#token-state'),
  tokenField: document.querySelector('#token-field'),
  tokenInput: document.querySelector('#token-input'),
  tokenMessage: document.querySelector('#token-message'),
  trssConfig: document.querySelector('#trss-config code'),
  adapterConfig: document.querySelector('#adapter-config code'),
  snowlumaToken: document.querySelector('#snowluma-token code'),
  prepareStatus: document.querySelector('#prepare-status'),
  progressCount: document.querySelector('#progress-count'),
  diagnosis: document.querySelector('#diagnosis'),
  symptomSelect: document.querySelector('#symptom-select'),
  readingProgress: document.querySelector('#reading-progress')
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    state.completed = new Set(Array.isArray(saved.completed) ? saved.completed.filter(id => stepIds.includes(id)) : [])
    state.checks = new Set(Array.isArray(saved.checks) ? saved.checks : [])
    if (['same-host', 'same-docker', 'host-docker', 'cross-host'].includes(saved.environment)) {
      state.environment = saved.environment
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    completed: [...state.completed],
    checks: [...state.checks],
    environment: state.environment
  }))
}

function showToast(message) {
  elements.toast.textContent = message
  elements.toast.classList.add('show')
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove('show'), 2200)
}

async function copyText(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  let copied = document.execCommand('copy')
  area.remove()

  if (!copied && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
  }

  showToast(copied ? '已复制，可以粘贴了' : '复制失败，请手动选择并复制')
}

function bindCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.copyTarget)
      copyText(target?.textContent.trim() || '')
    })
  })
  document.querySelectorAll('[data-copy-value]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.copyValue)
      copyText(target?.textContent.trim() || '')
    })
  })
  document.querySelectorAll('[data-copy-text]').forEach(button => {
    button.addEventListener('click', () => copyText(button.dataset.copyText))
  })
}

function bindTabs() {
  document.querySelectorAll('[data-tabs]').forEach(tabGroup => {
    const tabs = [...tabGroup.querySelectorAll('[role="tab"]')]
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tabs, tab))
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        const direction = event.key === 'ArrowRight' ? 1 : -1
        const next = tabs[(index + direction + tabs.length) % tabs.length]
        selectTab(tabs, next)
        next.focus()
      })
    })
  })
}

function selectTab(tabs, selected) {
  tabs.forEach(tab => {
    const isSelected = tab === selected
    tab.setAttribute('aria-selected', String(isSelected))
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !isSelected
  })
}

function getEnvironmentUrl() {
  if (state.environment === 'same-docker') {
    const service = elements.dockerName.value.trim() || '<TRSS服务名>'
    return `ws://${service}:6099/ws`
  }
  if (state.environment === 'cross-host') {
    const host = elements.hostIp.value.trim() || '<TRSS宿主机IP>'
    return `ws://${host}:6099/ws`
  }
  return 'ws://127.0.0.1:6099/ws'
}

const environmentNotes = {
  'same-host': ['同机说明', '<code>127.0.0.1</code> 表示“这台电脑自己”。不需要开放防火墙端口。'],
  'same-docker': ['Docker 服务名', '两个容器必须加入同一个 Docker 网络。填写 Compose 中 TRSS 的服务名，不要填写 <code>127.0.0.1</code>。'],
  'host-docker': ['需要发布端口', '给 TRSS 容器增加 <code>6099:6099</code> 端口映射。SnowLuma 仍填写 <code>127.0.0.1</code>。'],
  'cross-host': ['跨主机访问', '填写 TRSS 宿主机在 SnowLuma 一侧可访问的 IP，并在防火墙中仅对可信来源开放 TCP 6099。']
}

function updateEnvironment() {
  const url = getEnvironmentUrl()
  elements.targetUrl.textContent = url
  elements.mockTargetUrl.textContent = url
  elements.dockerNameField.hidden = state.environment !== 'same-docker'
  elements.hostIpField.hidden = state.environment !== 'cross-host'
  const [title, body] = environmentNotes[state.environment]
  elements.environmentNote.innerHTML = `<b>${title}</b><p>${body}</p>`
}

function bindEnvironment() {
  const radios = [...document.querySelectorAll('input[name="environment"]')]
  radios.forEach(radio => {
    radio.checked = radio.value === state.environment
    radio.addEventListener('change', () => {
      state.environment = radio.value
      saveProgress()
      updateEnvironment()
    })
  })
  elements.dockerName.addEventListener('input', updateEnvironment)
  elements.hostIp.addEventListener('input', updateEnvironment)
  updateEnvironment()
}

function yamlQuoted(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '')
}

function updateTokenOutputs() {
  const enabled = state.tokenEnabled
  const token = enabled ? state.token : ''
  const safeToken = yamlQuoted(token)

  elements.tokenState.textContent = enabled ? '已启用' : '未启用'
  elements.tokenField.hidden = !enabled
  elements.mockToken.textContent = enabled ? (token ? '•'.repeat(Math.min(20, token.length)) : '等待填写 Token') : '留空'
  elements.trssConfig.textContent = enabled
    ? `auth:\n  Authorization: "Bearer ${safeToken}"`
    : 'auth: {}'
  elements.adapterConfig.textContent = `enable: true

listen:
  host: "0.0.0.0"
  port: 6099
  path: "/ws"

upstream:
  url: "ws://127.0.0.1:2536/OneBotv11/ws"

accessToken: "${safeToken}"
connectTimeout: 5000
debug: false`
  elements.snowlumaToken.textContent = enabled ? (token || '（请先输入或生成 Token）') : '（留空）'
  elements.tokenMessage.innerHTML = enabled
    ? '三处必须使用同一个原始 Token；只有 TRSS 配置需要加 <code>Bearer </code>。'
    : '无 Token 模式只适合可信本机或隔离网络：TRSS 使用 <code>auth: {}</code>，另外两处留空。'
}

function generateToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  state.token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  elements.tokenInput.value = state.token
  updateTokenOutputs()
  showToast('已在本机生成 256 位随机 Token')
}

function bindTokenControls() {
  elements.tokenToggle.addEventListener('change', () => {
    state.tokenEnabled = elements.tokenToggle.checked
    updateTokenOutputs()
  })
  elements.tokenInput.addEventListener('input', () => {
    state.token = elements.tokenInput.value
    updateTokenOutputs()
  })
  document.querySelector('#generate-token').addEventListener('click', generateToken)
  document.querySelector('#toggle-token').addEventListener('click', event => {
    const showing = elements.tokenInput.type === 'text'
    elements.tokenInput.type = showing ? 'password' : 'text'
    event.currentTarget.textContent = showing ? '显示' : '隐藏'
    event.currentTarget.setAttribute('aria-label', showing ? '显示 Token' : '隐藏 Token')
  })
  updateTokenOutputs()
}

function updatePrepareStatus() {
  const count = state.checks.size
  elements.prepareStatus.textContent = `完成 ${count} / 5 项检查`
}

function bindChecks() {
  document.querySelectorAll('[data-check]').forEach(input => {
    input.checked = state.checks.has(input.dataset.check)
    input.addEventListener('change', () => {
      if (input.checked) state.checks.add(input.dataset.check)
      else state.checks.delete(input.dataset.check)
      saveProgress()
      updatePrepareStatus()
    })
  })
  updatePrepareStatus()
}

function updateStepProgress() {
  stepIds.forEach(id => {
    const done = state.completed.has(id)
    document.querySelector(`[data-step-link="${id}"]`)?.classList.toggle('done', done)
    const button = document.querySelector(`[data-complete="${id}"]`)
    if (button) {
      button.classList.toggle('is-done', done)
      button.textContent = done ? '✓ 本步已完成' : '标记本步完成'
    }
  })
  elements.progressCount.textContent = `${state.completed.size} / ${stepIds.length}`
}

function bindStepProgress() {
  document.querySelectorAll('[data-complete]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.complete
      if (state.completed.has(id)) state.completed.delete(id)
      else state.completed.add(id)
      saveProgress()
      updateStepProgress()
      showToast(state.completed.has(id) ? '本步已记为完成' : '已取消完成标记')
    })
  })
  document.querySelector('#reset-progress').addEventListener('click', () => {
    state.completed.clear()
    state.checks.clear()
    document.querySelectorAll('[data-check]').forEach(input => { input.checked = false })
    saveProgress()
    updatePrepareStatus()
    updateStepProgress()
    showToast('已清除非敏感进度记录')
  })
  updateStepProgress()
}

const diagnoses = {
  'no-start': {
    title: '插件还没有被 TRSS 加载',
    cause: '安装目录不正确、依赖未安装，或 TRSS 没有完整重启。',
    steps: ['确认路径是 TRSS-Yunzai/plugins/ws-Adapter-plugin。', '进入该目录执行 npm install --omit=dev。', '完整关闭并重新启动 TRSS-Yunzai。'],
    expected: '控制台出现“网关已启动，绑定 0.0.0.0:6099/ws”。'
  },
  port: {
    title: '6099 端口正在被其他进程占用',
    cause: '通常是重复启动了 ws-Adapter 或旧 TRSS 进程没有退出。',
    steps: ['Windows 执行：Get-NetTCPConnection -LocalPort 6099 -ErrorAction SilentlyContinue', 'Linux 执行：ss -ltnp | grep 6099', '停止重复进程后重启 TRSS；不要先改源码。'],
    expected: 'EADDRINUSE 消失，并出现网关启动日志。'
  },
  retry: {
    title: 'SnowLuma 没有到达插件',
    cause: '最常见的是选错节点类型、目标主机写错，或 Docker 端口没有发布。',
    steps: ['确认创建的是“WebSocket 反向客户端”，不是“WebSocket 服务”。', '确认目标 URL 末尾包含 /ws，且没有使用 0.0.0.0。', 'Docker 跨网络访问时确认发布 6099:6099。'],
    expected: 'TRSS 控制台出现“SnowLuma 请求已验证”。'
  },
  path: {
    title: '目标 URL 缺少正确路径',
    cause: 'SnowLuma 连接到了 6099 端口，但 URL 末尾不是 /ws。',
    steps: ['把同机地址完整填写为 ws://127.0.0.1:6099/ws。', 'Docker 或跨主机环境只替换主机部分，保留 :6099/ws。', '保存 SnowLuma 节点并等待重连。'],
    expected: '不再出现路径错误，开始连接 TRSS 上游。'
  },
  auth: {
    title: '三处 Token 没有完全对齐',
    cause: 'SnowLuma 或插件填了 Bearer 前缀，或者 TRSS server.yaml 没有完整请求头。',
    steps: ['SnowLuma 授权 Token：只填原始 Token。', 'ws-Adapter accessToken：只填相同原始 Token。', 'TRSS Authorization：填写 Bearer + 空格 + 原始 Token。', '保存后完整重启 TRSS。'],
    expected: '出现“SnowLuma 请求已验证”，随后“桥接成功”。'
  },
  upstream: {
    title: '插件无法连接 TRSS OneBotv11',
    cause: 'TRSS 的 2536 服务未启动、上游 URL 被改错，或 TRSS 拒绝了鉴权。',
    steps: ['确认 TRSS 已启动，默认上游应为 ws://127.0.0.1:2536/OneBotv11/ws。', '不要把 6099 和 2536 对调。', '启用 Token 时再次核对 TRSS 的 Authorization 请求头。', '修改后完整重启 TRSS。'],
    expected: '502/504 消失并出现“桥接成功 SnowLuma ↔ TRSS”。'
  },
  'no-self': {
    title: 'SnowLuma 没有发送 lifecycle 元事件',
    cause: '连接已经建立，但 TRSS 还不知道这个连接属于哪个 QQ 账号。',
    steps: ['确认 SnowLuma 节点角色设置为 Universal。', '确认消息格式为“数组”。', '关闭再启用该 SnowLuma 节点，或重启 SnowLuma。'],
    expected: '桥接成功后出现“已识别账号 self_id=你的QQ号”。'
  },
  'no-reply': {
    title: '网络已接通，需要定位消息停在哪一段',
    cause: '可能是 SnowLuma 没上报消息、Yunzai 命令未命中，或 SnowLuma 没执行发送动作。',
    steps: ['把 ws-Adapter 的 debug 临时改成 true 并重启 TRSS。', 'QQ 发送 #适配器帮助，依次找 event=message、action=send_msg、response echo 三类摘要。', '缺 event：检查 SnowLuma 消息上报；缺 action：检查 Yunzai 插件和权限；缺 echo：检查 SnowLuma API 响应。', '排查结束后把 debug 改回 false。'],
    expected: '三类摘要都有，并且 QQ 收到回复。'
  }
}

function renderDiagnosis() {
  const item = diagnoses[elements.symptomSelect.value]
  elements.diagnosis.innerHTML = `<h3>${item.title}</h3><p><b>可能原因：</b>${item.cause}</p><ol>${item.steps.map(step => `<li>${step}</li>`).join('')}</ol><p class="expected"><b>修复成功时：</b>${item.expected}</p>`
}

function bindDiagnosis() {
  elements.symptomSelect.addEventListener('change', renderDiagnosis)
  renderDiagnosis()
}

function bindObservers() {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        revealObserver.unobserve(entry.target)
      }
    })
  }, { threshold: 0.08 })
  document.querySelectorAll('.reveal').forEach(item => revealObserver.observe(item))

  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
    if (!visible) return
    document.querySelectorAll('[data-step-link]').forEach(link => link.classList.remove('active'))
    document.querySelector(`[data-step-link="${visible.target.dataset.step}"]`)?.classList.add('active')
  }, { rootMargin: '-25% 0px -55% 0px', threshold: [0, .2, .5] })
  document.querySelectorAll('[data-step]').forEach(section => sectionObserver.observe(section))
}

function updateReadingProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const percent = max > 0 ? (window.scrollY / max) * 100 : 0
  elements.readingProgress.style.width = `${Math.min(100, Math.max(0, percent))}%`
}

loadProgress()
bindCopyButtons()
bindTabs()
bindEnvironment()
bindTokenControls()
bindChecks()
bindStepProgress()
bindDiagnosis()
bindObservers()
updateReadingProgress()
window.addEventListener('scroll', updateReadingProgress, { passive: true })
