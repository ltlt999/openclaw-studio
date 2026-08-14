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

## 一条命令安装

> 前提：目标机器已安装 OpenClaw 且 Node.js ≥ 22。

```bash
# 安装
npm install -g openclaw-studio

# 启动（默认端口 41739，连接本机 Gateway ws://127.0.0.1:18789）
openclaw-studio
```

浏览器打开 `http://127.0.0.1:41739`。

零安装直接运行：

```bash
npx openclaw-studio
```

## 服务器部署（远程访问）

部署到服务器时，需要让 UI 监听外部网卡，并指向 Gateway 地址：

```bash
openclaw-studio --host 0.0.0.0 --port 41739 --gateway ws://127.0.0.1:18789
```

然后浏览器访问 `http://<服务器IP>:41739`。

### 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--port <n>` | `41739` | UI 监听端口 |
| `--host <addr>` | `127.0.0.1` | 绑定地址（远程访问用 `0.0.0.0`） |
| `--gateway <ws-url>` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket 地址 |

也可用环境变量 `OPENCLAW_STUDIO_PORT` / `OPENCLAW_STUDIO_HOST` / `OPENCLAW_STUDIO_GATEWAY`。

### 鉴权

Gateway 默认启用共享密钥鉴权（即使 loopback）。首次打开 UI 时，在 **设置** 页填入 Gateway 的 token 或 password（存于浏览器 localStorage），保存后自动重连。

> 架构说明：浏览器只连本 UI 的 `/ws`（同源），由 CLI 代理转发到 Gateway，因此无跨域问题；Gateway 地址是服务端配置项，换机器无需改前端。

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
