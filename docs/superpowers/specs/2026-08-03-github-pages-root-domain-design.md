# GitHub Pages 根域迁移设计

## 目标

把教学网站的正式地址从：

```text
https://shiyupiay.github.io/ws-Adapter-plugin/
```

迁移为所有人可直接访问的组织站点：

```text
https://ws-adapter-plugin.github.io/
```

插件仓库继续保留在 `ShiYuPIay/ws-Adapter-plugin`，不转移、不删除、不重命名，也不改变现有安装命令。

## GitHub 结构

- 创建公开 GitHub 组织 `ws-Adapter-plugin`。
- 在该组织下创建公开仓库 `ws-Adapter-plugin.github.io`。
- 新仓库是教学网站唯一的正式源码仓库。
- 网站文件直接存放在新仓库根目录，通过 `main` 分支根目录发布。
- 不使用需要个人访问令牌的跨仓库自动同步。

GitHub 域名不区分大小写，公开地址统一写成小写 `https://ws-adapter-plugin.github.io/`。

## 网站迁移

从当前插件仓库的 `docs` 目录复制以下网站内容到新仓库根目录：

```text
index.html
404.html
.nojekyll
assets/
  app.js
  styles.css
  favicon.svg
```

设计规范文件不会发布到新网站仓库。网站继续使用相对资源路径，因此不需要针对根域修改 CSS、JavaScript 或图标地址。

新网站内容、交互和隐私边界保持不变：

- 四种运行环境生成正确的 SnowLuma 目标 URL；
- Token 只存在于当前页面内存，不写入 URL 或 `localStorage`；
- IP 和 Docker 服务名不持久化；
- 页面不使用后端、统计脚本或第三方 JavaScript；
- 桌面端和手机端均可完成完整教程；
- 自定义 404 页面返回根域教程首页。

## 原地址处理

新站点通过验收后，当前项目站点：

```text
https://shiyupiay.github.io/ws-Adapter-plugin/
```

改为迁移提示页。提示页必须：

- 明确说明教学网站已经迁移；
- 显示新地址；
- 提供可点击的手动跳转链接；
- 使用 `meta refresh` 和 JavaScript 自动跳转；
- 在 JavaScript 被禁用时仍能通过普通链接访问新站；
- 不删除插件仓库中的设计规范。

旧地址只负责兼容已有收藏和外部链接，不再保存正式教程内容。

## 仓库展示信息

完成公网验收后，把 `ShiYuPIay/ws-Adapter-plugin` 仓库 About 区域的 Website/Homepage 更新为：

```text
https://ws-adapter-plugin.github.io/
```

新网站页面中的插件源码、Issue 和安装地址仍指向：

```text
https://github.com/ShiYuPIay/ws-Adapter-plugin
```

## 外部操作与安全边界

- 创建 GitHub 组织和公开网站仓库属于本次已授权范围。
- 不转移插件仓库所有权。
- 不创建付费方案、团队、成员邀请或额外组织设置。
- 不保存或输出 GitHub 登录凭据、二次验证码或恢复代码。
- 如果 GitHub 要求密码确认、验证码、CAPTCHA 或二次验证，停止自动操作并等待用户在 GitHub 页面完成。
- 如果 `ws-Adapter-plugin` 在组织创建页面不可用，停止操作并报告，不擅自使用相似名称。
- 不通过 Cloudflare 配置或声明 `github.io` 域名；该地址完全由 GitHub Pages 提供。

## 实施顺序

1. 检查现有插件仓库与当前 Pages 状态。
2. 通过已登录的 GitHub 页面创建组织 `ws-Adapter-plugin`。
3. 创建公开仓库 `ws-Adapter-plugin.github.io`。
4. 在独立本地目录准备新网站仓库，将当前网站文件复制到仓库根目录。
5. 执行本地语法、资源、交互、隐私和响应式检查。
6. 提交并推送新网站仓库的 `main` 分支。
7. 启用 `main / (root)` GitHub Pages。
8. 等待 Pages 构建完成并执行公网验收。
9. 在插件仓库的新分支中把旧首页改为迁移提示页。
10. 测试旧地址的自动跳转和手动链接，然后通过 PR 合并。
11. 更新插件仓库 Website/Homepage 字段。
12. 再次验证新旧地址和仓库公开信息。

必须先完成并验证新站，才能修改旧站，避免迁移过程中出现两个地址都不可用。

## 验证

### 新网站仓库本地检查

- `node --check assets/app.js` 通过；
- HTML 中的内部锚点全部存在；
- `index.html`、`404.html`、CSS、JavaScript 和 SVG 可由本地静态服务器读取；
- 密钥模式扫描无真实 Token；
- 页面没有 `fetch`、XHR、WebSocket 或第三方脚本请求；
- 390px 和桌面视口无横向溢出；
- 环境生成器、Token 开关、随机 Token、复制反馈、进度和故障排查正常；
- 浏览器存储中不包含 Token、IP 或 Docker 服务名。

### 新网站公网检查

- `https://ws-adapter-plugin.github.io/` 返回 HTTP 200；
- CSS、JavaScript和图标返回 HTTP 200；
- 页面标题和主标题正确；
- 自定义 404 页面正常，并链接到根域首页；
- HTTPS 正常；
- GitHub Pages 的发布提交与新网站仓库 `main` 最新提交一致。

### 旧地址检查

- 旧地址显示迁移提示；
- 自动跳转到新地址；
- 手动链接可使用键盘和鼠标访问；
- 不存在循环跳转；
- 插件仓库 Website/Homepage 指向新地址。

## 完成标准

- GitHub 组织 `ws-Adapter-plugin` 和公开网站仓库存在；
- `https://ws-adapter-plugin.github.io/` 对未登录用户公开可访问；
- 新网站全部静态资源和主要交互通过公网验收；
- 原地址可靠跳转到新地址；
- 插件仓库及安装地址保持不变；
- 插件仓库 About/Website 显示新地址；
- 没有引入跨仓库密钥、付费服务或 Cloudflare 依赖。
