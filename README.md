# OpenClaw Studio

一个更好用的 OpenClaw Web 控制台，界面与交互对标 Hermes Studio，作为官方 Control UI 的独立替代方案。独立端口运行，不覆盖官方 UI。

## 特性

- **聊天 / 会话**：流式消息、多会话、工具调用、文件预览、会话搜索、模型切换
- **模型管理**：按 provider 分组、可见性、默认模型切换
- **渠道状态**：Telegram / Discord / Slack / WhatsApp 等状态卡片
- **Agents**：列表、默认 Agent 标识
- **配置**：查看 Gateway 配置
- **用量分析**：查看用量数据
- **设置**：连接凭证、主题

## 安装

> 前提：目标机器已安装 OpenClaw 且 Node.js ≥ 22（Windows / macOS / Linux 均可）。

### 从源码安装

```bash
git clone https://github.com/ltlt999/openclaw-studio.git
cd openclaw-studio
npm install
npm run build
```

## 启动

### 本机使用

```bash
node bin/cli.mjs
```

浏览器打开 `http://127.0.0.1:41739`。

### 远程访问（服务器部署）

```bash
node bin/cli.mjs --host 0.0.0.0 --port 41739 --gateway ws://127.0.0.1:18789
```

浏览器访问 `http://<服务器IP>:41739`。

后台常驻：

```bash
# Linux / macOS
nohup node bin/cli.mjs --host 0.0.0.0 --gateway ws://127.0.0.1:18789 > /tmp/openclaw-studio.log 2>&1 &

# Windows PowerShell
Start-Process node -ArgumentList "bin/cli.mjs","--host","0.0.0.0","--gateway","ws://127.0.0.1:18789" -WindowStyle Hidden
```

### 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--port <n>` | `41739` | UI 监听端口 |
| `--host <addr>` | `127.0.0.1` | 绑定地址（远程访问用 `0.0.0.0`） |
| `--gateway <ws-url>` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket 地址 |

也可用环境变量 `OPENCLAW_STUDIO_PORT` / `OPENCLAW_STUDIO_HOST` / `OPENCLAW_STUDIO_GATEWAY`。

> 部署到云服务器需在**安全组/防火墙**放行 `--port` 端口（Windows 为入站规则）。

### 鉴权

新版 OpenClaw 采用**设备认证**：CLI 自动读取同机 OpenClaw 配置与网关 token，生成设备身份并自动连接。

**首次使用**只需在服务器上批准一次设备（CLI 启动日志会给出确切提示）：

```bash
openclaw devices list            # 找到本设备的 Request ID
openclaw devices approve <RequestID>
# Docker 安装: docker exec <容器名> openclaw devices approve <RequestID>
```

批准后 CLI 会保存网关颁发的 deviceToken，之后每次启动自动连接，无需再操作。

> 架构说明：浏览器只连本 UI 的 `/ws`（同源），由 CLI 代理转发到 Gateway 并完成设备认证/鉴权注入，因此无跨域问题；token 与设备密钥只在服务器端，浏览器不接触。Gateway 地址是服务端配置项，换机器无需改前端。

## 常见问题（FAQ）

**1. 打开页面一直显示「未连接」？**
依次排查：① Gateway 是否在运行（`ss -tlnp | grep 18789` 或 `netstat -ano | grep 18789` 看 18789 是否监听）；② `--gateway` 地址是否正确（Gateway 在别的机器/端口时需指定）；③ 是否需要鉴权——去「设置」页填 token/password。

**2. Gateway 的 token / password 在哪找？**
OpenClaw 的鉴权配置在 `~/.openclaw/openclaw.json`（`gateway.auth.mode` / `token` / `password` 字段），也可通过 `openclaw config` 或启动日志查看。若 `gateway.auth.mode` 为 `none`，则无需填写。

**3. 端口被占用了怎么办？**
换一个端口：`node bin/cli.mjs --port 41800`（浏览器也访问对应端口）。

**4. 浏览器访问不了远程服务器？**
① 启动时加 `--host 0.0.0.0`；② 云服务器放行**安全组**、Linux 放行**防火墙**（ufw/firewalld）、Windows 放行**入站规则**中的 `--port` 端口。

**5. Gateway 和 UI 不在同一台机器，怎么连？**
`--gateway ws://<Gateway机器IP>:18789`，并确保那台机器的 18789 端口能被本机访问。

**6. 聊天发消息没反应？**
确认：① 顶部状态是「已连接」；② 左侧已选中一个会话；③ 按 F12 看控制台有没有报错（有报错把信息发出来）。多数情况是鉴权没配对，导致 `chat.send` 被拒绝。

**7. 怎么后台常驻 / 开机自启？**
后台常驻见上方「远程访问」的 `nohup` / `Start-Process`；开机自启可用 `pm2`（`pm2 start bin/cli.mjs --name openclaw-studio` 后 `pm2 save`）或 systemd。

**8. 和官方 Control UI 冲突吗？**
不冲突。官方 UI 仍在 `18789`，本 UI 跑在独立端口，可同时打开对照；本 UI 也不覆盖官方 UI 的静态资源。

**9. 会改动我的 OpenClaw 数据吗？**
目前除「发送消息」等主动操作外，其余页面只读；配置页目前只展示不写回。

**10. 怎么更新到最新版？**
`git pull && npm install && npm run build` 后重启即可。

## 开发

```bash
npm install
npm run dev      # 开发服务器（HMR，/ws 代理到本机 18789）
npm run build    # 构建到 dist/
npm run serve    # 本地用 CLI 启动
npm test         # 运行 RPC 层测试（mock Gateway）
```

## 技术栈

Vue 3 + TypeScript + Vite + Naive UI + Pinia，运行时为 Node.js + `ws`（WebSocket 代理）。

## 设计文档

见 [docs/superpowers/specs/](docs/superpowers/specs/)。

## License

MIT
