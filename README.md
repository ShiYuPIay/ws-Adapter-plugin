# ws-Adapter-plugin

TRSS-Yunzai 的 OneBot v11 透明 WebSocket 网关，用于让 SnowLuma `reverse-ws` 通过独立端口连接 TRSS 内置 OneBotv11 适配器。

```text
QQ 用户
  ↕
SnowLuma reverse-ws
  ↕ ws://<TRSS 主机>:3002/
ws-Adapter
  ↕ ws://127.0.0.1:2536/OneBotv11/ws
TRSS-Yunzai OneBotv11 ↔ Yunzai 插件
```

插件不解析或修改 OneBot 数据。事件、API action、echo 响应、文本帧和二进制帧都会原样双向转发。

## 工作方式

SnowLuma 主动连接 ws-Adapter。插件验证 Token 后，先连接 TRSS 上游；只有上游连接成功，插件才完成 SnowLuma 的 WebSocket 握手。

因此 SnowLuma 显示“已连接”时，完整链路已经可用。TRSS 不可用或 Token 错误时，SnowLuma 不会得到虚假的连接成功状态，并会按照自己的重连间隔重试。

每个 SnowLuma 连接都有独立的 TRSS 上游连接，可同时接入多个账号。任意一端断开时整条会话关闭，由 SnowLuma 重建连接。

## 安装

需要 Node.js 18 或更高版本，以及已经能正常启动的 TRSS-Yunzai。

将仓库放入 TRSS-Yunzai 的 `plugins` 目录并安装生产依赖：

```bash
cd TRSS-Yunzai/plugins
git clone https://github.com/ShiYuPIay/ws-Adapter-plugin.git
cd ws-Adapter-plugin
npm install --omit=dev
```

重启 TRSS-Yunzai。插件首次加载会从 `config/default.yaml` 生成 `config/config.yaml`。

## 配置

编辑 `config/config.yaml`：

```yaml
enable: true

listen:
  host: "0.0.0.0"
  port: 3002
  path: "/"

upstream:
  url: "ws://127.0.0.1:2536/OneBotv11/ws"

accessToken: "请填写与 TRSS 相同的 Token"
connectTimeout: 5000
debug: false
```

`accessToken` 在两段连接中共用：

- SnowLuma 使用它连接 ws-Adapter。
- ws-Adapter 使用它连接 TRSS-Yunzai。

如果 TRSS 没有启用 Token，保持空字符串即可。修改配置后发送 `#重载配置`，该命令仅机器人主人可用。

## SnowLuma reverse-ws

在 SnowLuma 新建“WebSocket 反向客户端（reverse-ws）”：

| 字段 | 建议值 |
|---|---|
| 目标 URL | `ws://<TRSS 主机 IP>:3002/` |
| 重连间隔 | `5000` ms |
| 授权 Token | 与 ws-Adapter、TRSS 相同 |
| 消息格式 | 数组 |
| 角色 | `Universal` |
| 上报自身消息 | 按需 |

同一台机器可使用 `ws://127.0.0.1:3002/`。同一 Docker 网络可使用 TRSS 容器服务名，例如 `ws://trss-yunzai:3002/`。

如果 SnowLuma 位于其他 Docker 网络或宿主机，必须把 TRSS 容器的 `3002` 端口发布到可访问的网络。TRSS 的 `2536` 端口不需要暴露给 SnowLuma，因为 ws-Adapter 从 TRSS 内部连接它。

## 命令

| 命令 | 说明 |
|---|---|
| `#适配器帮助` | 显示 SnowLuma 地址、TRSS 上游和 Token 配置状态 |
| `#查看连接` | 显示监听状态、握手数量、活动账号和最近错误 |
| `#重载配置` | 验证并应用配置，仅机器人主人可用 |

## 日志与隐私

默认只记录监听、握手、桥接、关闭和错误状态。`debug: true` 时额外记录 OneBot 帧摘要，例如 `message.group` 或 `action=send_msg`。

插件不会在日志中打印：

- 授权 Token；
- 完整聊天正文；
- cookie、票据或其他敏感字段；
- base64 媒体内容。

## 故障排查

### SnowLuma 一直重连

1. 确认 ws-Adapter 日志中出现“网关已启动”。
2. 确认 SnowLuma 连接的是 `3002`，不是 TRSS 内部 `2536`。
3. 确认三处 Token 完全一致。
4. 确认 `upstream.url` 是 `ws://127.0.0.1:2536/OneBotv11/ws`。
5. Docker 场景确认 `3002` 已发布或两个容器处于同一网络。

### SnowLuma 已连接，但 QQ 命令没有响应

发送 `#查看连接`，确认活动连接中已经识别到账号。然后开启 `debug`，检查是否依次出现：

```text
SnowLuma → TRSS event=message.*
TRSS → SnowLuma action=send_msg
SnowLuma → TRSS response echo=*
```

### `401` 或 `403`

SnowLuma 未提交 Token 或 Token 与 `config/config.yaml` 不一致。

### `502` 或 `504`

ws-Adapter 无法连接 TRSS 上游。检查 TRSS 是否已启动、端口是否为 `2536`，以及 TRSS 是否接受相同 Token。

## 开发验证

```bash
npm test
npm run check
```

测试覆盖配置验证、鉴权、延迟握手、完整 OneBot action/echo 循环、二进制帧、多连接隔离和关闭清理。

## License

AGPL-3.0-or-later
