# ws-Adapter-plugin

让 SnowLuma 的 OneBot v11 `reverse-ws` 接入 TRSS-Yunzai 默认 OneBotv11 适配器的透明 WebSocket 网关。

```text
QQ 用户
  ↕
SnowLuma reverse-ws 客户端
  ↕ ws://127.0.0.1:6099/ws（同机示例）
ws-Adapter 插件
  ↕ ws://127.0.0.1:2536/OneBotv11/ws
TRSS-Yunzai 默认 OneBotv11 适配器 ↔ Yunzai 插件
```

SnowLuma 是主动连接方，ws-Adapter 是被连接方。插件虽然监听端口，但 SnowLuma 中创建的仍然是“WebSocket 反向客户端（reverse-ws）”，不是“WebSocket 服务”。

插件不解析或修改 OneBot 数据。lifecycle、QQ 事件、API action、`echo` 响应、文本帧和二进制帧均原样双向转发。

## 开始前先确认

需要准备：

- 已经能正常启动的 TRSS-Yunzai；
- 已经登录 QQ 的 SnowLuma；
- Node.js 18 或更高版本；
- 能够重启 TRSS-Yunzai；
- 如果启用 Token，准备一个自己生成的长随机字符串。

不要把真实 Token 发到群聊、Issue、截图或日志中。

## 第 1 步：安装插件

打开 TRSS-Yunzai 所在目录的终端，进入 `plugins` 目录：

```bash
cd TRSS-Yunzai/plugins
git clone https://github.com/ShiYuPIay/ws-Adapter-plugin.git
cd ws-Adapter-plugin
npm install --omit=dev
```

完成后，目录结构中应当存在：

```text
TRSS-Yunzai/
└─ plugins/
   └─ ws-Adapter-plugin/
      ├─ apps/
      ├─ components/
      ├─ config/
      └─ package.json
```

如果 `git clone` 提示目录已经存在，不要重复安装；进入原目录执行 `git pull` 和 `npm install --omit=dev`。

## 第 2 步：首次启动

重启 TRSS-Yunzai。插件首次加载会自动创建：

```text
TRSS-Yunzai/plugins/ws-Adapter-plugin/config/config.yaml
```

看到以下日志表示插件已经开始监听：

```text
[ws-Adapter] 网关已启动，绑定 0.0.0.0:6099/ws；SnowLuma 同机目标 ws://127.0.0.1:6099/ws
```

如果没有生成 `config/config.yaml`，说明插件尚未被 TRSS-Yunzai 加载。先确认安装目录是否位于 TRSS-Yunzai 的 `plugins` 下，以及依赖是否安装成功。

## 第 3 步：选择是否启用 Token

### 方案 A：不启用 Token

适合只在可信本机或隔离 Docker 网络中测试。

TRSS-Yunzai 的 `config/config/server.yaml` 保持无鉴权：

```yaml
auth: {}
```

ws-Adapter 的 `config/config.yaml`：

```yaml
accessToken: ""
```

SnowLuma 的“授权 Token”也留空。

### 方案 B：启用共用 Token（推荐）

假设原始 Token 是：

```text
请替换成自己的随机Token
```

TRSS-Yunzai 的 `config/config/server.yaml` 必须填写完整请求头：

```yaml
auth:
  Authorization: "Bearer 请替换成自己的随机Token"
```

ws-Adapter 的 `config/config.yaml` 只填写原始 Token，不写 `Bearer`：

```yaml
accessToken: "请替换成自己的随机Token"
```

SnowLuma 的“授权 Token”同样只填写原始 Token：

```text
请替换成自己的随机Token
```

三处含义必须一致：SnowLuma 把 Token 发给 ws-Adapter，ws-Adapter 验证成功后把同一个 Token 发给 TRSS。TRSS 的上游握手成功，才代表完整鉴权通过。

## 第 4 步：配置插件

编辑 `config/config.yaml`：

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

字段解释：

| 字段 | 作用 | 默认值 |
|---|---|---|
| `enable` | 是否启动网关 | `true` |
| `listen.host` | 插件绑定的网卡；跨容器必须使用 `0.0.0.0` | `0.0.0.0` |
| `listen.port` | SnowLuma 要连接的插件端口 | `6099` |
| `listen.path` | SnowLuma 目标 URL 的路径 | `/ws` |
| `upstream.url` | TRSS 默认 OneBotv11 地址 | `ws://127.0.0.1:2536/OneBotv11/ws` |
| `accessToken` | SnowLuma 与 TRSS 共用的原始 Token | 空 |
| `connectTimeout` | 等待 TRSS 上游的毫秒数 | `5000` |
| `debug` | 是否记录不含正文的 OneBot 帧摘要 | `false` |

`0.0.0.0` 只能用于插件监听，不能填写到 SnowLuma 的目标 URL。

从旧版升级时，如果用户配置仍然精确等于旧默认 `0.0.0.0:3002/`，插件会自动迁移为 `0.0.0.0:6099/ws`；修改过端口或路径的自定义配置不会被覆盖。

首次连接尚未成功时，保存配置后应重启 TRSS-Yunzai。只有 QQ 已经能够通信后，机器人才可能收到 `#重载配置` 命令。

## 第 5 步：确定 SnowLuma 目标 URL

根据实际环境只选择一行：

| 运行环境 | SnowLuma 目标 URL |
|---|---|
| SnowLuma 与 TRSS 在同一台主机 | `ws://127.0.0.1:6099/ws` |
| 两者在同一 Docker 网络的不同容器 | `ws://实际TRSS服务名:6099/ws` |
| SnowLuma 在宿主机，TRSS 在 Docker | `ws://127.0.0.1:6099/ws`，并发布容器端口 `6099:6099` |
| 两者位于不同主机 | `ws://TRSS宿主机IP:6099/ws`，并开放 TCP 6099 |

同一 Docker 网络示例：如果 Compose 中 TRSS 服务名为 `trss-yunzai`，目标就是：

```text
ws://trss-yunzai:6099/ws
```

不同容器且不在同一网络时，需要给 TRSS 容器增加端口发布：

```yaml
ports:
  - "6099:6099"
```

TRSS 内部的 `2536` 不需要暴露给 SnowLuma，因为 ws-Adapter 与 TRSS 运行在同一容器/进程环境中。

## 第 6 步：配置 SnowLuma reverse-ws

在 SnowLuma 新建“WebSocket 反向客户端（reverse-ws）”，不要选择“WebSocket 服务”。

| SnowLuma 字段 | 填写内容 |
|---|---|
| 启用 | 打开 |
| 名称 | `TRSS-Yunzai` 或任意便于识别的名称 |
| 目标 URL | 使用上一步选择出的地址 |
| 重连间隔 | `5000` ms |
| 授权 Token | 与 ws-Adapter 相同；未启用鉴权则留空 |
| 消息格式 | 数组 |
| 角色 | `Universal` |
| 上报自身消息 | 按需，初次配置建议关闭 |

保存后，SnowLuma 会主动连接 ws-Adapter。插件先连接 TRSS 上游，只有上游成功后才完成 SnowLuma 握手。

## 第 7 步：核对日志

正常情况下，TRSS 控制台应按顺序出现：

```text
[ws-Adapter] SnowLuma 请求已验证，正在连接 TRSS ws://127.0.0.1:2536/OneBotv11/ws
[ws-Adapter][1] 桥接成功 SnowLuma ↔ TRSS
[ws-Adapter][1] 已识别账号 self_id=你的QQ号
```

此时 TRSS 默认 OneBotv11 适配器收到 SnowLuma 的 lifecycle 元事件，并登记对应 QQ 账号。插件不会重复安装或注册另一个 OneBotv11 适配器。

## 第 8 步：在 QQ 验证完整通信

在已经连接的 QQ 私聊或群聊中发送：

```text
#适配器帮助
```

收到 ws-Adapter 的帮助回复，代表以下路径全部成功：

```text
QQ → SnowLuma → ws-Adapter → TRSS → Yunzai 插件
QQ ← SnowLuma ← ws-Adapter ← TRSS ← Yunzai 插件
```

连接成功后还可以发送：

```text
#查看连接
```

机器人会显示监听状态、TRSS 上游、活动会话和已识别的账号。`#重载配置` 仅机器人主人可用，并会短暂断开当前连接。

## QQ 命令不响应时不要修改源码

先查看 TRSS 控制台，从上到下只处理命中的第一种情况。

### 没有“网关已启动”

- 检查插件目录是否正确；
- 在插件目录执行 `npm install --omit=dev`；
- 重启 TRSS-Yunzai。

### 出现 `EADDRINUSE`

`6099` 已被其他程序或另一个 ws-Adapter 实例占用。不要重复启动插件。

Windows 检查：

```powershell
Get-NetTCPConnection -LocalPort 6099 -ErrorAction SilentlyContinue
```

Linux 检查：

```bash
ss -ltnp | grep 6099
```

停止重复实例，或同时修改插件端口与 SnowLuma 目标 URL。

### 日志提示“路径应为 /ws”

SnowLuma 目标 URL 缺少 `/ws`。正确同机地址：

```text
ws://127.0.0.1:6099/ws
```

### 日志提示“未提交授权 Token”或“授权 Token 不一致”

检查 SnowLuma Token 与插件 `accessToken`。不要在插件值中写 `Bearer`。

### 出现 `502`、`504` 或“无法建立桥接”

插件无法连接 TRSS：

1. 确认 TRSS 已经启动并监听 `2536`；
2. 确认 `upstream.url` 没有改错；
3. 启用 Token 时，确认 TRSS `server.yaml` 使用 `Authorization: "Bearer 原始Token"`；
4. 修改 TRSS 鉴权后重启 TRSS-Yunzai。

### 已经“桥接成功”，但没有“已识别账号”

SnowLuma 没有发送 lifecycle 元事件。确认 SnowLuma 节点角色为 `Universal`，然后重启该节点。

### 已识别账号，但 QQ 仍然没有回复

把插件配置中的 `debug` 临时改为 `true`，重启 TRSS 后观察是否依次出现：

```text
SnowLuma → TRSS event=message.*
TRSS → SnowLuma action=send_msg
SnowLuma → TRSS response echo=*
```

- 没有第一行：SnowLuma 没有上报 QQ 消息；
- 有第一行、没有第二行：检查 Yunzai 插件是否加载、命令是否正确、机器人权限是否允许；
- 有第二行、没有第三行：SnowLuma 没有返回 API 响应；
- 三行都有：检查 SnowLuma 发送消息的结果和 QQ 风控状态。

排查完成后把 `debug` 改回 `false`。

## 日志与隐私

默认只记录监听、握手、桥接、账号识别、关闭和错误状态。插件不会打印：

- 授权 Token；
- 完整聊天正文；
- cookie、票据或其他敏感字段；
- base64 媒体内容。

## 开发验证

```bash
npm test
npm run check
```

测试覆盖默认地址、无 Token、错误 Token、TRSS 拒绝鉴权、延迟握手、SnowLuma bootstrap、完整 action/echo 循环、二进制帧、多连接隔离、隐私日志和关闭清理。

## License

AGPL-3.0-or-later
