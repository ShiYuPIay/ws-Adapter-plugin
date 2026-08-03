# ws-Adapter WebSocket 网关重构设计

## 背景

ws-Adapter 是运行在 TRSS-Yunzai 内的 OneBot v11 WebSocket 网关。目标链路是：

```text
QQ 用户
  -> SnowLuma OneBot v11 reverse-ws 客户端
  -> ws-Adapter 独立 WebSocket 服务端
  -> TRSS-Yunzai 内置 OneBotv11 WebSocket 地址
  -> Yunzai 插件
  -> 原路返回 QQ 用户
```

SnowLuma 负责主动连接和断线重连。ws-Adapter 只负责验证连接、建立 TRSS 上游并透明转发双向 WebSocket 帧。

这里的 `reverse-ws` 描述的是 SnowLuma 的角色：SnowLuma 是主动拨号的 WebSocket 客户端，ws-Adapter 必须是被连接的 WebSocket 服务端。插件绑定 `0.0.0.0` 不会把 SnowLuma 变成正向模式；SnowLuma 界面中的“WebSocket 服务”才是 SnowLuma 自己监听的正向模式，本项目不使用该节点。

当前实现同时包含插件主动连接、插件监听、消息格式转换和 Docker 地址诊断等多套职责。其核心调用 `Bot.adapter.get('OneBotv11').connect(ws)` 与 TRSS-Yunzai 实际接口不匹配：`Bot.adapter` 是数组，而 OneBotv11 的 `connect(data, ws)` 是 lifecycle 事件处理器，不是原始 WebSocket 接入口。

## 目标

- SnowLuma 使用 `reverse-ws` 主动连接插件的独立监听地址，默认目标为 `ws://127.0.0.1:6099/ws`。
- 插件使用同一个授权 Token 连接 TRSS-Yunzai，默认上游地址为 `ws://127.0.0.1:2536/OneBotv11/ws`。
- SnowLuma 只有在 TRSS 上游已经连接成功后才完成 WebSocket 握手并显示已连接。
- OneBot lifecycle、事件、API action 和响应均按原始帧、原始顺序双向传输。
- 支持多个 SnowLuma 客户端并发连接，每个下游连接拥有独立的 TRSS 上游连接。
- 默认日志不泄露 Token、完整消息内容或 base64 媒体。
- 使用自动化测试验证鉴权、握手、消息循环、多连接隔离和关闭行为。

## 非目标

- 不实现插件主动连接 SnowLuma 的 WebSocket 客户端模式。
- 不实现 Forward HTTP、Reverse HTTP 或独立 OneBot 协议解析。
- 不转换 CQ 码、消息格式、`user_id` 或 `group_id`；这些语义由 SnowLuma 和 TRSS-Yunzai 的 OneBotv11 适配器处理。
- 不在插件内维护独立的上游重连循环。上游断开时关闭对应下游，由 SnowLuma 的 reverse-ws 重连机制重建整条链路。
- 不复制 miao-plugin 的业务框架、渲染系统或大型通用工具集。

## 方案选择

### 采用：延迟下游握手的透明网关

收到 SnowLuma 的 HTTP Upgrade 请求后，插件先完成路径和 Token 验证，再连接 TRSS 上游。只有上游触发 `open` 后，插件才调用 WebSocket 服务端的 Upgrade 处理完成 SnowLuma 握手。

此方案确保 SnowLuma 显示“已连接”时，两段连接都已可用。SnowLuma 会在 `open` 后立即发送 `connect`、`enable`、`heartbeat` 三个 bootstrap 帧；延迟握手让这些帧可以立即转发，无需维护容易失效的等待队列。

### 不采用：先接受下游再缓存帧

该方案实现较直接，但 SnowLuma 会在 TRSS 上游尚未可用时显示连接成功。还需要限制缓存大小、处理等待超时和清理半连接，状态语义不符合需求。

### 不采用：直接挂接 `Bot.wsf.OneBotv11`

该方案没有本地上游网络跳转，但依赖 TRSS-Yunzai 私有内部结构，并且不符合“插件连接默认 OneBotv11 地址”的明确链路要求。

## 项目结构

重构后采用小型、显式的模块结构：

```text
ws-Adapter-plugin/
├─ apps/
│  └─ adapter.js          # Yunzai 命令与插件生命周期
├─ components/
│  ├─ config.js           # 默认配置合并、验证、加载和保存
│  └─ gateway.js          # HTTP Upgrade、上下游会话和透明转发
├─ config/
│  └─ default.yaml        # 可提交的默认配置
├─ test/
│  ├─ config.test.js
│  └─ gateway.test.js
├─ index.js               # 显式导出插件应用
├─ package.json
└─ README.md
```

设计借鉴 miao-plugin 的显式入口、组件分层以及默认配置与用户配置分离方式，但只保留本项目需要的两个组件。

以下旧模块删除：

- `utils/ws-client.js`
- `utils/ws-server.js`
- `utils/message.js`
- `utils/polyfill.js`
- `utils/docker.js`

它们分别对应已取消的主动客户端模式、重复的消息解析、未加载的 polyfill 和与核心网关无关的诊断逻辑。

## 配置

默认配置：

```yaml
enable: true

listen:
  host: "0.0.0.0"
  port: 6099
  path: "/ws"

upstream:
  url: "ws://127.0.0.1:2536/OneBotv11/ws"

accessToken: ""
connectTimeout: 5000
debug: false
```

规则：

- `listen.port` 必须是 `1..65535` 的整数。
- `listen.path` 必须以 `/` 开头。
- `upstream.url` 只接受 `ws://` 或 `wss://`。
- `connectTimeout` 必须是正整数毫秒值。
- `accessToken` 是两段连接共用的唯一 Token。为空时两段连接均不启用 Token 验证。
- 首次运行从 `config/default.yaml` 生成 `config/config.yaml`；用户配置文件加入 `.gitignore`。
- 升级时仅将仍精确等于旧默认 `0.0.0.0:3002/` 的用户监听配置迁移到 `0.0.0.0:6099/ws`；任何自定义端口或路径保持不变。
- 重载时先验证新配置，再关闭旧网关并启动新网关。验证失败时保留现有运行实例。

地址含义严格区分：

- `0.0.0.0:6099` 是插件的绑定地址，只出现在插件配置和监听日志中，不能作为 SnowLuma 的目标 URL。
- SnowLuma 与 TRSS 在同一宿主环境时使用 `ws://127.0.0.1:6099/ws`。
- SnowLuma 与 TRSS 位于同一 Docker 网络但不同容器时，使用 `ws://<TRSS 服务名>:6099/ws`。
- 两者位于不同主机或不同 Docker 网络时，TRSS 容器必须发布 `6099` 端口，SnowLuma 使用 `ws://<TRSS 宿主机 IP>:6099/ws`。
- ws-Adapter 运行在 TRSS 进程内时，上游保持 `ws://127.0.0.1:2536/OneBotv11/ws`。

## 组件职责

### `components/config.js`

- 解析默认配置和用户配置。
- 递归合并已知配置项，不接受无关动态预设。
- 返回经过验证、字段类型稳定的配置对象。
- 首次运行生成用户配置。
- 不持有网络连接或 Yunzai 命令状态。

### `components/gateway.js`

- 创建 HTTP 服务和 `WebSocketServer({ noServer: true })`。
- 处理 Upgrade 请求、路径检查和 Token 验证。
- 在下游握手前创建 TRSS 上游 WebSocket。
- 上游成功后完成下游握手，并建立一对一会话。
- 透明转发文本帧和二进制帧，保留帧顺序和 binary 标记。
- 维护活动会话 Map，提供只读状态快照。
- 负责连接超时、双向关闭传播和停止时的完整清理。
- 接收注入的配置和日志器，不依赖 Yunzai 的插件基类，便于独立测试。

### `apps/adapter.js`

- 在 TRSS-Yunzai online 后启动网关。
- 提供帮助、状态查询和配置重载命令。
- 配置重载命令仅允许机器人主人执行。
- 将网关状态格式化为用户可读文本，不参与 OneBot 数据帧处理。

### `index.js`

- 显式导入并导出 `adapter.js` 中的插件类。
- 不扫描目录，不通过 `Object.keys()` 猜测导出名称。

## 握手与鉴权流程

1. SnowLuma 请求升级到配置的 `listen.path`。
2. 插件从 `Authorization: Bearer <token>` 读取 Token；同时兼容 OneBot 常见的 `access_token` 查询参数。
3. 当 `accessToken` 为空时，插件不要求 SnowLuma 提交 Token，连接 TRSS 时也不发送授权头。
4. 当 `accessToken` 非空时，插件要求 SnowLuma 提交完全相同的 Token；缺少返回 `401`，不匹配返回 `403`。路径不匹配始终返回 `404`。
5. 插件创建 TRSS 上游连接，并设置：
   - `Authorization: Bearer <同一 Token>`，Token 非空时发送；
   - 转发下游的 `X-Self-ID`；
   - 转发下游的 `X-Client-Role`，默认 `Universal`；
   - 使用明确的 ws-Adapter User-Agent。
6. TRSS 自己验证上游请求中的 Token。插件无法读取 TRSS 内部保存的 Token，因此以上游握手成功作为“两端 Token 相同”的最终判定。
7. 上游在 `connectTimeout` 内成功后，插件完成下游 Upgrade。
8. 上游拒绝、报错或超时时，插件向尚未升级的下游返回 `502` 或 `504` 并关闭 TCP socket。
9. 下游完成握手后，SnowLuma 的 bootstrap 帧立即原样转发给 TRSS。

Token 比较使用长度检查和常量时间比较，日志永远不打印 Token 值。

## 适配器与账号注册时机

TRSS-Yunzai 启动时已经通过 `Bot.adapter.push()` 安装内置 OneBotv11 适配器，监听器加载阶段调用该适配器的 `load()` 注册 `/OneBotv11` WebSocket 处理入口。ws-Adapter 不得再向 `Bot.adapter` 重复注册另一个 OneBotv11 适配器。

SnowLuma 连接成功后会发送 lifecycle bootstrap 元事件。该帧经 ws-Adapter 原样到达 TRSS 后，内置 OneBotv11 适配器才调用 `connect(data, ws)`，将 QQ 账号登记到 `Bot[data.self_id]` 并发出 `connect.<self_id>`。因此顺序是“默认适配器随 TRSS 启动加载 -> 完整 WebSocket 链路建立 -> lifecycle 到达 -> QQ 账号上线”，不存在每次 SnowLuma 连接时重新安装插件或重新注册适配器。

## 数据流

建立会话后，每个方向只做两件事：检查目标连接仍为 OPEN，然后转发原始帧。

```text
SnowLuma event/meta/response  --raw frame-->  TRSS OneBotv11
SnowLuma event/meta/response  <--raw frame--  TRSS action request
```

网关可以为日志读取 JSON 摘要，但不得修改或重新序列化被转发的原始数据。解析失败不影响转发。

TRSS 发出的 `get_login_info`、`send_msg` 等 action 原样到达 SnowLuma；SnowLuma 返回带相同 `echo` 的响应并原样返回 TRSS。TRSS 注册 Bot 后，普通 Yunzai 插件即可处理 QQ 命令并通过同一链路回复。

## 会话与关闭语义

- 每个会话包含下游 socket、上游 socket、连接时间和可选的 `self_id` 摘要。
- 多个 SnowLuma 客户端互不共享上游 socket 或消息队列。
- 任意一端正常关闭时，将有效 close code 和 reason 传播给另一端。
- 任意一端异常、发送失败或上游失活时，终止另一端，确保不会留下半开会话。
- 网关停止或重载时先拒绝新的 Upgrade，再关闭所有活动会话，最后关闭 HTTP/WebSocket 服务。
- 插件不在单个会话内重连上游，避免与 SnowLuma 自带重连形成重复连接风暴。

## 日志

默认记录：

- 监听地址和上游地址；
- 下游请求、上游连接中、桥接成功、断开和失败原因；
- 当前活动会话数量；
- 识别到的 `self_id`；
- debug 模式下的 OneBot 帧摘要，例如 `meta_event.lifecycle`、`message.group`、`action=send_msg` 和 `echo`。

始终隐藏：

- Authorization 和查询参数中的 Token；
- 完整聊天文本；
- cookie、票据和其他敏感字段；
- base64 媒体内容。

## Yunzai 命令

- `#适配器帮助`：显示 SnowLuma 目标 URL、TRSS 上游 URL 和配置位置。
- `#查看连接`：显示监听状态、活动会话数、已识别账号和最近错误，不显示 Token。
- `#重载配置`：主人权限；验证并应用用户配置。

删除动态添加/删除连接、消息格式切换、上报自身切换和网络诊断命令。消息格式、角色、上报自身消息与重连间隔由 SnowLuma 自己配置，网关不应重复控制。

## 测试与验证

使用 Node.js 内置 `node:test` 和现有 `ws` 依赖，不增加测试框架依赖。

自动化测试覆盖：

1. 默认配置生成、合并和非法配置拒绝。
2. 默认监听值严格为 `0.0.0.0:6099/ws`。
3. Token 为空时，下游无需授权且上游不发送授权头。
4. Token 非空时，错误路径、缺少 Token 和错误 Token 分别返回正确状态。
5. 同一个 Token 被验证并作为 Bearer Token 发送到 TRSS 上游；上游拒绝时下游不得报告连接成功。
6. TRSS 上游未 open 前，SnowLuma 下游不会触发 open。
7. 上游成功后 lifecycle、enable 和 heartbeat bootstrap 帧按原始顺序到达上游。
8. lifecycle 帧包含的 `self_id` 可被状态摘要识别，且不被网关修改。
9. TRSS action 到达 SnowLuma，SnowLuma 的 echo 响应返回 TRSS。
10. 文本帧与二进制帧保持内容和类型不变。
11. 多个 SnowLuma 客户端分别使用独立上游且消息不会串线。
12. 上游失败、超时、下游断开和网关停止均完整清理连接。
13. 日志输出不包含 Token、完整聊天文本或 base64 数据。

项目命令：

```text
npm test
npm run check
```

最终手工验收：

1. TRSS-Yunzai 启用 OneBotv11 默认地址并配置 Token。
2. ws-Adapter 使用相同 Token，监听 `0.0.0.0:6099/ws`。
3. SnowLuma reverse-ws 按环境填写目标：同机为 `ws://127.0.0.1:6099/ws`，同一 Docker 网络为 `ws://<TRSS 服务名>:6099/ws`，跨主机为 `ws://<TRSS 宿主机 IP>:6099/ws`；角色选择 `Universal`。
4. SnowLuma 只有在插件成功连接 TRSS 后显示已连接。
5. 日志依次显示插件监听、SnowLuma 请求已验证、TRSS 上游连接成功、桥接会话建立和 `self_id` 识别。
6. QQ 用户发送 `#适配器帮助`。
7. 日志显示事件进入、TRSS action 返回和带相同 `echo` 的响应回流。
8. QQ 用户收到插件响应。

若第 6 步无响应，用户必须先执行 `#查看连接` 并按状态分流：未建立下游检查地址/端口/路径，`401/403` 检查 Token，`502/504` 检查 TRSS 上游，已桥接但无 `self_id` 检查 lifecycle，已识别账号后才检查 Yunzai 命令和权限。教程不得建议零基础用户直接修改插件源代码。

## 完成标准

- 当前错误接入与所有列出的死代码均已移除。
- 自动化测试和 JavaScript 语法检查通过。
- 工作树只包含本次网关重构所需改动。
- README、默认配置和实际行为一致。
- SnowLuma 到 TRSS 的完整 OneBot 请求/响应循环可按手工验收步骤复现。

## 交付顺序

1. 先按本文修正插件默认地址、Token 状态机、日志、测试和 README，并完成自动化与手工通信验收。
2. 插件通过验收后，另行编写零基础教学网站设计与实施计划。
3. 教学网站使用 GitHub Pages 从仓库内容发布，覆盖安装、启用、环境选择、SnowLuma 逐字段配置、QQ 实测、Docker 和故障决策树。
4. 网站上线后，将公开网址写入 GitHub 仓库 About 区域的 Website/Homepage 字段；Cloudflare 自定义域名在用户提供具体域名后绑定。
