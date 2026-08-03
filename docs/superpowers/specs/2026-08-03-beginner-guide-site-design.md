# ws-Adapter 零基础教学网站设计

## 背景

ws-Adapter 插件已经合并到 `main`，默认链路为 SnowLuma reverse-ws 主动连接 `ws://127.0.0.1:6099/ws`，插件再连接 TRSS-Yunzai 的 `ws://127.0.0.1:2536/OneBotv11/ws`。下一阶段是在同一 GitHub 仓库内提供不依赖服务器的零基础教学网站，并将公开网址写入仓库 About 区域的 Website/Homepage 字段。

教程必须让第一次接触终端、WebSocket、Token 和 Docker 的用户完成安装、启用、连接、QQ 实测和故障排查。用户不应因为 QQ 命令没有响应就修改插件源码。

## 目标用户

- 不理解 `0.0.0.0`、`127.0.0.1`、端口和 URL 路径区别的用户。
- 会下载软件但不熟悉 Git、npm 或终端的用户。
- 使用 Windows 原生环境、Docker 同网络、Docker 跨网络或两台设备的用户。
- 已经安装 SnowLuma 和 TRSS-Yunzai，但不知道如何把两者连接起来的用户。

## 目标

- 使用 GitHub Pages 从仓库 `main` 分支的 `/docs` 目录发布，无独立服务器和数据库。
- 默认网址为 `https://shiyupiay.github.io/ws-Adapter-plugin/`。
- 首页直接进入安装向导，不先展示大段协议说明。
- 每一步同时提供“目标、操作、填写值、成功现象、失败处理”。
- 根据运行环境自动生成 SnowLuma 目标 URL 和 Docker 操作提示。
- 根据是否启用 Token 自动生成 TRSS、ws-Adapter 和 SnowLuma 三处对应配置。
- Token 只在当前浏览器内存中处理，不上传、不写入 URL、不写入 `localStorage`。
- 提供复制按钮、步骤进度、术语解释、日志对照和“不响应”故障决策树。
- 桌面端和手机端均可阅读和操作，键盘与读屏用户可以完成向导。
- 网站上线后，把公开网址写入 GitHub 仓库 About 的 Website/Homepage 字段。

## 非目标

- 不提供在线后端、账号系统、评论、遥测、上传或远程保存配置。
- 不在线连接、扫描或控制用户的 SnowLuma、TRSS、Docker 或 QQ。
- 不把真实 Token 放入仓库、示例截图、页面源码或分析服务。
- 不在网站阶段改变插件网络协议或运行时行为。
- Cloudflare 自定义域名不阻塞首发；只有用户提供具体域名后才配置 GitHub Pages Custom domain 和 Cloudflare DNS。

## 方案选择

### 采用：单页引导向导加完整参考区

同一页面内提供固定步骤导航、环境选择器、配置生成器、现场日志对照和故障树。用户可以从头完成，也可以通过固定导航直接进入 Docker、Token 或排障区。

优点是没有多页面迷路、页面间状态丢失或链接路径错误；GitHub Pages 项目子路径部署也最简单。所有配置计算均在浏览器本地完成。

### 不采用：传统多页文档站

多页结构适合熟悉术语的开发者，但零基础用户容易跳过前置步骤，且环境选择与 Token 状态难以跨页保持。

### 不采用：只提供配置生成器

只生成 YAML 不能解释安装位置、首次启动、成功日志、QQ 验证和失败分流，无法形成完整闭环。

## 技术架构

```text
docs/
├─ index.html
├─ 404.html
├─ .nojekyll
└─ assets/
   ├─ styles.css
   ├─ app.js
   └─ favicon.svg
```

- 使用语义化 HTML、原生 CSS 和原生 JavaScript。
- 不增加 npm 运行时依赖，不需要构建命令。
- 所有资源使用相对路径，兼容 `/ws-Adapter-plugin/` 项目子路径和未来自定义域名。
- `.nojekyll` 防止 GitHub Pages 对静态资源执行不需要的 Jekyll 处理。
- `404.html` 提供返回教程首页的明确链接。

## 视觉方向

采用“工程接线手册”风格：深蓝黑背景、米白正文、青色表示可连接状态、橙色表示需要操作、红色只表示错误。页面核心记忆点是一条贯穿全站的通信线路，步骤卡像接线端子一样依次点亮。

- 标题使用有工程铭牌感的中文黑体组合，正文优先可读性。
- 不使用紫色渐变、通用 SaaS 卡片堆叠或装饰性 3D 插画。
- 代码块模拟终端，但始终提供普通语言解释。
- 表单示意图使用 HTML/CSS 重建并加编号标注，不依赖容易过期的整屏截图。
- 动画只用于步骤完成和线路连通，支持 `prefers-reduced-motion`。

## 信息架构

### 1. 首页与总览

- 一句话说明用途：“把 SnowLuma 的 QQ 消息安全送到 TRSS-Yunzai，再把回复原路送回 QQ。”
- 显示五段通信线路：QQ、SnowLuma、ws-Adapter、TRSS、Yunzai 插件。
- 提供“从第 1 步开始”和“我的 QQ 不回复”两个入口。
- 明确预计操作时间、不会上传 Token、无需购买服务器。

### 2. 准备检查

逐项勾选：

- SnowLuma 已登录 QQ；
- TRSS-Yunzai 能正常启动；
- Node.js 版本至少为 18；
- 用户知道 TRSS-Yunzai 所在目录；
- 用户能够重启 TRSS-Yunzai。

每项附带检查方法和成功示例。未完成前仍允许阅读后续内容，但界面明确指出缺失项。

### 3. 安装插件

- Windows PowerShell 与 Linux/macOS 终端分别显示命令。
- 解释每条命令执行的目录和作用。
- 展示安装后的目录树。
- 针对“目录已存在”“找不到 git”“npm 失败”提供就地分支处理。
- 成功标准是插件目录完整且 `npm install --omit=dev` 返回成功。

### 4. 首次启动与激活

- 指导重启 TRSS-Yunzai。
- 展示 `config/config.yaml` 自动生成位置。
- 展示正确监听日志全文。
- 明确首次连接前不能依赖 QQ 的 `#重载配置` 命令，初次修改应重启 TRSS。
- `EADDRINUSE` 直接进入端口占用分支，不建议用户修改源码。

### 5. 环境选择器

用户选择一种环境：

1. SnowLuma 与 TRSS 在同一台主机；
2. 两者在同一 Docker 网络的不同容器；
3. SnowLuma 在宿主机、TRSS 在 Docker；
4. 两者位于不同主机或不同 Docker 网络。

页面按选择生成：

- 同机：`ws://127.0.0.1:6099/ws`；
- 同 Docker 网络：`ws://<用户输入的 TRSS 服务名>:6099/ws`；
- 宿主机到 Docker：`ws://127.0.0.1:6099/ws` 并提示发布 `6099:6099`；
- 跨主机：`ws://<用户输入的 TRSS 宿主机 IP>:6099/ws` 并提示开放 TCP 6099。

页面同时说明插件绑定值始终是 `0.0.0.0:6099/ws`，但 SnowLuma 目标永远不能填写 `0.0.0.0`。

### 6. Token 与配置生成器

用户选择“不启用 Token”或“启用共用 Token”。启用时可以手动输入或由 Web Crypto API 生成随机 Token。

页面同步生成三块内容：

1. TRSS `config/config/server.yaml` 中的完整 `Authorization: "Bearer ..."`；
2. ws-Adapter `config/config.yaml` 中不带 `Bearer` 的 `accessToken`；
3. SnowLuma“授权 Token”字段中不带 `Bearer` 的原始 Token。

每块都有复制按钮和“粘贴到哪里”的路径说明。Token 输入使用显示/隐藏切换，离开或刷新页面即丢失；进度保存时排除 Token。

### 7. SnowLuma reverse-ws 逐字段配置

使用与 SnowLuma 界面一致的表单示意，逐项编号：

- 启用；
- 名称；
- 目标 URL；
- 重连间隔 `5000`；
- 授权 Token；
- 消息格式“数组”；
- 角色 `Universal`；
- 初次配置关闭“上报自身消息”。

醒目标注“选择 WebSocket 反向客户端，不选择 WebSocket 服务”。目标 URL 直接引用环境选择器的结果。

### 8. 日志与通信验收

展示必须依次出现的日志：

1. 网关已启动；
2. SnowLuma 请求已验证；
3. 正在连接 TRSS；
4. 桥接成功；
5. 已识别账号 `self_id`。

随后让用户在 QQ 发送 `#适配器帮助`。收到回复才标记完整闭环成功，再介绍 `#查看连接` 和主人命令 `#重载配置`。

### 9. QQ 不响应故障决策树

用户先选择自己看到的最后一个成功信号，页面只展开下一项：

- 没有网关启动日志；
- `EADDRINUSE`；
- SnowLuma 一直重连；
- 路径错误；
- `401/403`；
- `502/504`；
- 桥接成功但没有 `self_id`；
- 已识别账号但 QQ 不回复。

每个叶节点包含：原因、只需执行的命令、预期输出、修复动作和返回验收步骤。页面固定显示“不要修改插件源码”。

### 10. Docker 专区与术语表

- 使用通信图解释容器名、宿主机 IP 和端口发布。
- 提供 Compose `ports: - "6099:6099"` 示例。
- 解释 `ws://`、监听、目标 URL、端口、路径、Token、reverse-ws、lifecycle 和 `echo`。
- 术语解释使用口语和示例，不使用术语循环定义。

## 客户端状态与隐私

JavaScript 状态包含环境类型、服务名或宿主机 IP、Token 是否启用、当前 Token、步骤完成情况和当前故障分支。

- `localStorage` 只保存步骤完成情况、环境类型和非敏感界面偏好。
- Token、生成的带 Token YAML、用户输入 IP 和容器服务名不持久化。
- 页面不加载分析脚本、广告、评论组件或第三方 JavaScript。
- 复制操作必须由用户点击触发，并显示成功或失败反馈。

## 无障碍与响应式

- 使用顺序正确的标题、`nav`、`main`、`section`、`form` 和 `button`。
- 所有输入有可见 `label`，错误信息通过 `aria-live` 宣告。
- 颜色不是唯一状态信号，成功和错误同时使用文字与图标。
- 键盘焦点清晰，所有交互可使用 Tab、空格和 Enter。
- 360px 宽度不出现横向页面滚动；代码块允许局部横向滚动。
- 关闭动画偏好下禁用非必要过渡。

## GitHub Pages 与仓库 Website

1. 网站代码合并到 `main/docs`。
2. 通过 GitHub Pages API 或 Settings → Pages，将发布源设置为 `main` 和 `/docs`。
3. 等待 Pages 构建完成，验证 `https://shiyupiay.github.io/ws-Adapter-plugin/` 返回 200。
4. 检查子路径下 CSS、JavaScript、SVG、锚点和 404 页面。
5. 将上述公开网址写入仓库 About 的 Website/Homepage 字段，效果与用户提供的 SnowLuma 仓库截图一致。
6. 用户提供 Cloudflare 具体域名后，先在 GitHub Pages 添加 Custom domain，再在 Cloudflare DNS 创建指向 `shiyupiay.github.io` 的 CNAME，验证 DNS 后启用 HTTPS。

## 验证

- `node --check docs/assets/app.js`。
- 使用本地静态服务器从 `/docs` 根目录访问，确保不依赖仓库根路径。
- 浏览器自动化完成四种环境选择、Token 开关、随机 Token、复制反馈、步骤进度和故障树。
- 在桌面宽度和 390px 手机宽度截图检查布局。
- 检查所有内部锚点、外部链接、资源请求和 404 返回页面。
- 扫描源码和浏览器存储，确认没有测试 Token、真实 Token或遥测请求。
- GitHub Pages 部署后再次运行公开 URL 冒烟测试。

## 完成标准

- 零基础用户只按页面顺序即可完成安装、激活、配置、连接和 QQ 验收。
- 四种运行环境都生成唯一且可复制的目标 URL。
- Token 三处配置同步且不会被网站持久化。
- QQ 不响应时有明确单路径排查，不要求修改源码。
- 网站在桌面和手机上可用，键盘操作完整，资源无 404。
- GitHub Pages 默认网址公开可访问。
- GitHub 仓库 Website/Homepage 指向已验证的网站。
- Cloudflare 自定义域名保持为后续可选步骤，直到用户提供具体域名。
