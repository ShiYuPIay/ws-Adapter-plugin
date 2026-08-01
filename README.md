# ws-Adapter

TRSS-Yunzai 的 OneBot WebSocket 适配器，支持插件监听（协议端主动连入）和插件主动连接（连接到协议端服务）两种模式，专为跨容器 / Docker 环境优化。

---

## 目录

- [这是什么](#这是什么)
- [两种连接角色，先看清楚](#两种连接角色先看清楚)
- [安装](#安装)
- [快速上手](#快速上手)
- [配置文件详解](#配置文件详解)
- [指令参考](#指令参考)
- [Docker 环境网络指南](#docker-环境网络指南)
- [常见问题](#常见问题)

---

## 这是什么

**ws-Adapter** 是 TRSS-Yunzai 的一个插件，负责把 SnowLuma（或其他 OneBot 实现）发来的 QQ 消息事件通过 WebSocket 传递给 Yunzai 框架处理。

```
SnowLuma（协议端）  ←—— WebSocket ——→  ws-Adapter  ←——→  TRSS-Yunzai（Bot 框架）
```

> **为什么需要它？**  
> TRSS-Yunzai 的核心 WebSocket 服务运行在 `2536` 端口，在 Docker 跨网络场景下，SnowLuma 无法直接连到它。ws-Adapter 提供独立端口作为中转，解决网络隔离问题。

---

## 两种连接角色，先看清楚

WebSocket 连接必定有一端**监听（listen）**，另一端**主动连接（connect）**。请在配置前先弄清楚各自扮演的角色。

### SnowLuma 侧的两种工作模式

| SnowLuma 页签 | OneBot 术语 | 行为 |
|---|---|---|
| **WS 客户端** | reverse-ws | SnowLuma **主动连接**到外部 WS 服务器，不在本地开端口 |
| **WS 服务端** | ws | SnowLuma 在本地**监听**一个端口，等待外部连入 |

> **这两者完全不同，不可混用。**  
> WS 客户端不会占用本地端口，它是一条向外发起的持久连接。  
> WS 服务端会占用本地端口，它被动等待别人连进来。

### 插件侧的两种预设类型

| 预设 `type` | 行为 | 对接 SnowLuma 的哪种模式 |
|---|---|---|
| `forward` | 插件在本地**监听**端口，等待协议端连入 | SnowLuma **WS 客户端**（主动连到插件） |
| `reverse` | 插件**主动连接**到协议端的 WS 服务 | SnowLuma **WS 服务端**（监听等待插件连入） |

---

## 安装

1. 将整个 `ws-Adapter` 文件夹放入 TRSS-Yunzai 的 `plugins/` 目录：

   ```
   plugins/
   └── ws-Adapter/
       ├── apps/
       ├── config/
       ├── utils/
       └── index.js
   ```

2. 重启 TRSS-Yunzai

3. 插件启动后自动在 `config/` 目录生成 `config.yaml`

4. 向机器人发送 `#适配器帮助` 验证插件已加载

---

## 快速上手

根据你想让哪一端主动连接来选择方案。

---

### 方案一：插件主动连接 SnowLuma WS 服务端（默认）

**角色分工：**
- SnowLuma **WS 服务端** → 在 `3001` 端口**监听**，等待连入
- 插件（`type: reverse`）→ **主动连出**，连接到 SnowLuma 的 `3001` 端口

插件默认启动时会自动以 `snowluma-local` 预设连接 `ws://127.0.0.1:3001/`，日志中可以看到：

```
[ws-Adapter][snowluma-local] 正在连接 → ws://127.0.0.1:3001/
[ws-Adapter][snowluma-local] 连接成功 → ws://127.0.0.1:3001/
```

**第一步：** 确认 SnowLuma 已开启 **WS 服务端**（在后台找到「WS 服务端」页签，确认已启用并监听 `3001` 端口）

**第二步：** 根据你的网络情况选择对应预设：

| 场景 | 指令 | 连接地址 |
|---|---|---|
| 同一台机器（无 Docker，默认已激活） | `#添加连接 snowluma-local` | `ws://localhost:2536/OneBotv11` |
| 同一 Docker 网络 | `#添加连接 snowluma-docker` | `ws://snowluma:2536/OneBotv11` |
| Docker Desktop（Mac/Win） | `#添加连接 host-internal` | `ws://host.docker.internal:2536/OneBotv11` |
| Docker 跨网络（宿主机网关） | `#添加连接 ws://172.17.0.1:2536/OneBotv11` | `ws://172.17.0.1:2536/OneBotv11` |
| 完全自定义 | `#添加连接 ws://地址/OneBotv11` | 自定义 |

---

### 方案二：插件本地监听，SnowLuma WS 客户端连入

**角色分工：**
- 插件（`type: forward`）→ 在 `3002` 端口**监听**，等待连入
- SnowLuma **WS 客户端** → **主动连出**，连接到插件的 `3002` 端口

适合 SnowLuma 无法开 WS 服务端、或网络上反向更容易打通的场景。

**第一步：** 启动插件监听服务：

```
#添加连接 adapter-forward
```

日志中会打印可用地址：

```
[ws-Adapter][adapter-forward] 正向服务已启动，协议端连接地址：
  ws://172.17.0.1:3002/
```

**第二步：** 打开 SnowLuma 后台 → **WS 客户端** 页签 → 「**+ 新建WS客户端**」，地址填写日志中显示的地址。

> WS 客户端**主动连出**，不在本地开端口，与 WS 服务端完全不同。

---

## 配置文件详解

配置文件位于 `config/config.yaml`，首次运行自动生成。

```yaml
# 总开关
enable: true

# 消息格式：array（数组，推荐）或 string（CQ 码字符串）
messageFormat: array

# 上报自身消息（Bot 自己发的消息是否也触发事件）
reportSelfMessage: true

# WebSocket 鉴权 Token，为空则不鉴权
accessToken: ""

# 断线重连间隔（毫秒）
reconnectInterval: 5000

# 心跳检测间隔（毫秒）
heartbeatInterval: 10000

# 调试模式，开启后打印原始消息数据
debug: true

presets:
  # ── type: forward ──────────────────────────────────────────
  # 插件在本地监听端口，SnowLuma WS 客户端主动连过来
  - name: adapter-forward
    type: forward
    host: "0.0.0.0"   # 监听所有网卡
    port: 3002         # 避开 TRSS 核心 2536 和 SnowLuma 默认 3001
    path: "/"
    desc: "插件监听服务（对接 SnowLuma WS 客户端）"

  # ── type: reverse ──────────────────────────────────────────
  # 插件主动连出，SnowLuma WS 服务端在本地监听
  - name: snowluma-local
    type: reverse
    url: "ws://127.0.0.1:3001/"
    desc: "连接本机 SnowLuma WS 服务端"

  - name: snowluma-docker
    type: reverse
    url: "ws://snowluma:3001/"
    desc: "同一 Docker 网络，通过服务名连接"

  - name: host-internal
    type: reverse
    url: "ws://host.docker.internal:3001/"
    desc: "Docker Desktop（Mac/Win），容器内访问宿主机"

# 启动时自动激活的预设（填预设的 name）
active:
  - adapter-forward   # 默认启动监听服务，SnowLuma WS 客户端连此处即可
```

---

## 指令参考

| 指令 | 说明 |
|---|---|
| `#适配器帮助` | 显示帮助 |
| `#查看连接` | 查看所有预设及当前状态 |
| `#添加连接 <预设名>` | 启用某个已配置的预设 |
| `#添加连接 ws://地址` | 直接添加自定义连接（type: reverse） |
| `#删除连接 <名称>` | 停止并删除某个连接 |
| `#重连 <名称>` | 重启某个连接 |
| `#重载配置` | 热重载配置文件，重新初始化所有连接 |
| `#保存配置` | 将当前配置保存到文件 |
| `#网络诊断` | 检测 Docker 环境，输出推荐连接地址 |
| `#切换消息格式 数组` | 消息格式改为数组 |
| `#切换消息格式 字符串` | 消息格式改为 CQ 码字符串 |
| `#上报自身 开/关` | 切换 Bot 自身消息上报 |
| `#调试模式 开/关` | 切换调试日志 |

---

## Docker 环境网络指南

发送 `#网络诊断` 可让插件自动检测并给出推荐地址。

### 先判断你的场景

```bash
# 查看 Yunzai 容器所在网络
docker inspect <Yunzai容器名> --format '{{json .NetworkSettings.Networks}}'

# 查看 SnowLuma 容器所在网络
docker inspect <SnowLuma容器名> --format '{{json .NetworkSettings.Networks}}'
```

网络名称**相同** → 方案 A；**不同** → 方案 B。

---

### 方案 A：同一 Docker 网络

使用 SnowLuma **WS 服务端**（插件主动连入）：

```
#添加连接 snowluma-docker
```

插件通过 Docker 内部 DNS 解析 `snowluma` 主机名，直接连到 `ws://snowluma:3001/`。

---

### 方案 B：不同 Docker 网络（最常见，`ENOTFOUND` 报错时）

两容器网络隔离，主机名无法解析。用插件监听 + SnowLuma WS 客户端跨网络连入：

**第一步：** 确认插件监听服务已启动（默认已启动 `adapter-forward`）

**第二步：** 找到宿主机在 Docker 网络中的网关 IP（也可发 `#网络诊断` 自动检测）：

```bash
# 在 Yunzai 容器内执行
ip route | awk '/default/ {print $3}'
# 通常输出 172.17.0.1
```

**第三步：** 在 SnowLuma 后台 → **WS 客户端** 页签 → 新建，地址填：

```
ws://172.17.0.1:3002/
```

SnowLuma WS 客户端主动连出，穿越 Docker 网络边界，到达宿主机的 `3002` 端口，再由插件转发给 Yunzai。

---

### 方案 C：Docker Desktop（Mac / Windows）

```
#添加连接 host-internal
```

插件主动连接到 `ws://host.docker.internal:3001/`，Docker Desktop 自动将此域名解析到宿主机。需要 SnowLuma 已在 WS 服务端模式下监听 `3001`。

---

### 地址速查

**方案一（插件监听，SnowLuma WS 客户端连入）：**

| SnowLuma WS 客户端填写的地址 | 适用场景 |
|---|---|
| `ws://172.17.0.1:3002/` | Linux Docker 跨网络（最常用） |
| `ws://127.0.0.1:3002/` | 同一台机器，非 Docker |

**方案二（插件主动连出，SnowLuma WS 服务端监听）：**

| 插件连接的地址 | 适用场景 |
|---|---|
| `ws://snowluma:3001/` | 同一 Docker 网络 |
| `ws://host.docker.internal:3001/` | Docker Desktop |
| `ws://127.0.0.1:3001/` | 同一台机器，非 Docker |

---

## 常见问题

### Q：插件加载报 `载入失败`？

检查 Node.js 版本是否 ≥ 18。

### Q：`ENOTFOUND snowluma` 报错？

两容器不在同一 Docker 网络，主机名无法解析。改用方案 B：插件监听 `3002`，SnowLuma WS 客户端连 `ws://172.17.0.1:3002/`。

### Q：`EADDRINUSE` 端口被占用？

修改 `config/config.yaml` 中 `adapter-forward` 的 `port` 字段，改为空闲端口，然后发送 `#重载配置`。

### Q：SnowLuma WS 客户端配置了地址但连不上？

1. 确认插件已启动监听：日志中有 `正向服务已启动` 字样
2. 发送 `#网络诊断`，对照输出的地址列表逐一尝试
3. 检查防火墙是否放行了 `3002` 端口
4. 确认 SnowLuma 用的是 **WS 客户端**（主动连出），不是 **WS 服务端**（本地监听）

### Q：消息能收到但 Bot 没有响应？

发送 `#调试模式 开`，观察日志中是否有 `已分发事件`。有分发但没响应是 Yunzai 插件的问题，和本适配器无关。

### Q：想同时连接多个账号？

在 `config.yaml` 的 `presets` 中添加多个预设，分别填不同地址，然后在 `active` 中列出全部名称，或逐一发送 `#添加连接`。

---

> 本插件不收集任何 Token、账号、消息内容或用户信息。
