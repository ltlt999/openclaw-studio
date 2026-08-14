# OpenClaw Web UI 设计文档

- 日期：2026-08-14
- 状态：待用户评审
- 目标：为 OpenClaw 构建一个更好用的 Web 控制台，界面与交互对标 Hermes Studio，作为官方 Control UI 的替代（独立端口运行，不覆盖官方 UI），并支持发布到 GitHub、一条命令安装到任何装有 OpenClaw 的机器。

## 1. 背景与目标

OpenClaw 是一个多通道 AI Agent 网关（Gateway），官方自带的 Control UI（`openclaw dashboard`，默认 `http://127.0.0.1:18789/`）把聊天、配置、会话、节点等功能堆叠在一起，操作体验不佳。

本项目的目标是构建一个**全新的 Web UI**，功能与界面参考 [Hermes Studio](https://github.com/EKKOLearnAI/hermes-studio)，覆盖 OpenClaw 原生能力中最常用的部分，作为官方 UI 的独立替代方案。

核心约束（由用户确认）：

1. 浏览器网页模式，不打包桌面 App。
2. 运行在**独立的冷门端口**（默认 41739），**不覆盖**官方 UI（官方仍在 18789 照常可用）。
3. 连接架构采用「薄 Node 静态服务器 + WebSocket 代理」（见 §3）。
4. 单用户本地使用，不做登录页 / 多账号 / 权限划分。
5. UI 中文、默认深色主题（浅色可切换）。
6. 同步到 GitHub（版本管理 + 远程仓库）。
7. 一条命令安装到任何装了 OpenClaw 的机器（发布为 npm 包 + CLI）。

## 2. 范围

### 2.1 本版本覆盖（核心聚焦版）

| 模块 | 说明 | 主要依赖的 Gateway RPC |
|------|------|------------------------|
| 聊天 / 会话 | 流式消息、多会话、工具调用展开、文件预览、Ctrl+K 搜索、模型切换、token 用量角标 | `sessions.*`、`chat.*` |
| 模型管理 | 按 provider 分组、可见性、默认模型切换 | `models.list` |
| 渠道状态 | 各渠道状态卡片、登录/登出 | `channels.status`、`channels.logout`、`web.login.start/wait` |
| Agents | 列表 / 创建 / 编辑 / 删除、文件、工作区浏览 | `agents.*` |
| 配置 | schema 驱动表单 + JSON 编辑 | `config.get/schema/schema.lookup/patch` |
| 用量分析 | token 拆解、会话数、成本估算、模型分布、趋势 | `sessions.usage`、`sessions.usage.timeseries`、`sessions.usage.logs` |
| 设置 | 连接配置（Gateway token）、主题、语言 | —（本地） |

### 2.2 本版本不覆盖（OpenClaw 协议无对应能力，需自建后端，留待后续阶段）

- 可视化工作流画布（Vue Flow）
- 看板（Kanban）
- 通用文件浏览器 / Web 终端
- 语音（TTS/STT）

若后续需要以上能力，将引入独立后端服务（参考 Hermes Studio 的 Koa BFF 架构），属于新的子项目，独立走「设计 → 计划 → 实现」流程。

## 3. 架构

```
[浏览器] ── HTTP + WebSocket(/ws) ──▶ [CLI bin/cli.mjs :41739] ── ws 双向管道 ──▶ [OpenClaw Gateway :18789]
                                      │
                                      └── 托管随包发布的 dist/ 静态 SPA（history 回退）
```

- **SPA（Vue 3）**：只连接自身 origin 的 `/ws`，由 CLI 转发到 Gateway。浏览器与 Gateway 不直接通信，因此无跨域问题。
- **CLI（`bin/cli.mjs`）**：约 60 行的 Node 脚本，仅两个职责——（1）托管随 npm 包一起发布的 `dist/` 静态文件并做 SPA history 回退；（2）将 `/ws` 升级为 WebSocket 并双向管道到 Gateway（默认 `ws://127.0.0.1:18789`，可用 `--gateway` 覆盖）。由于 CLI→Gateway 是服务端到服务端连接，握手报文不含浏览器 Origin，CORS/Origin 被彻底绕开。
- **鉴权**：CLI 保持「哑管道」，不参与鉴权；token/password 由浏览器在 `connect` 帧中携带（见 §6）。

### 3.1 为什么选这个架构

- 满足「独立端口 + 不覆盖官方 UI」：端口完全自控，官方 18789 不受影响。
- 满足「简单」：无业务后端，CLI 只是静态服务 + WebSocket 管道。
- 避免跨域：单一 origin，绕开 `gateway.controlUi.allowedOrigins` 与浏览器 Origin 校验的复杂度；且无论 Gateway 在本地还是远程、auth 如何配置，代理方案都不受影响。
- **满足「一条命令安装到任何机器」**：`dist/` 随包发布，用户无需构建；CLI 用 Node 内置模块 + `ws` 依赖，跨平台（Windows/macOS/Linux）可用。
- 与 Hermes Studio 对比：Hermes 需要完整 Koa BFF 是因为 Hermes Agent（Python）不暴露面向浏览器的控制面；OpenClaw Gateway 已通过 WebSocket 暴露完整 RPC（协议 v4），故无需自建 BFF。

## 4. 技术栈

- 前端：Vue 3 + TypeScript + Vite + Naive UI + Pinia + Vue Router + vue-i18n + markdown-it + highlight.js（与 Hermes 同栈，保证界面还原度）。
- 运行时（CLI）：Node.js（≥22，本机 24.14.1）+ `ws` 依赖（WebSocket 服务器与上游客户端）。
- 包管理器：npm。
- 测试：Vitest（单测）、可选 Playwright（E2E）。

## 5. RPC 客户端层设计（核心模块）

独立于 UI 的 `src/rpc/` 模块，将 Gateway 协议（WebSocket + JSON 帧，协议 v4）封装为类型安全的 TS 方法，供 Pinia store 与视图调用。

### 5.1 帧模型

- 请求：`{ type: "req", id, method, params, traceparent? }`
- 响应：`{ type: "res", id, ok, payload }`
- 事件：`{ type: "event", event, payload, seq, stateVersion }`
- 错误：`{ code, message, details?, retryable?, retryAfterMs? }`；权限不足时顶层 `code: "FORBIDDEN"`，`details = { code: "MISSING_SCOPE", missingScope, requiredScopes }`。

### 5.2 连接生命周期

1. 服务器下发 `connect.challenge` 事件（含 `nonce`、`ts`）。
2. 客户端发送 `connect` 请求，`params` 含 `minProtocol`/`maxProtocol`（当前 4）、`client`、`role: "operator"`、`scopes: ["operator.read","operator.write"]`、`auth: { token | password }`。
3. 服务器回复 `hello-ok`（含 `server`、`features`、`snapshot`、`auth`、`policy`）。
4. 断线重连：指数退避 1s→30s；RPC 超时 30s；握手超时 15s；静默超过 2× tick 间隔时关闭（code 4000）。

### 5.3 职责拆分

- `connection.ts`：WebSocket 生命周期、重连、状态（connecting/online/offline）、`connect` 握手。
- `protocol.ts`：帧解析/序列化、请求-响应按 `id` 匹配、事件按 `event` 名分发。
- `methods.ts`：类型化 RPC 方法封装（§2.1 中列出的方法族）。
- `types.ts`：协议与领域类型的 TypeScript 定义。

### 5.4 订阅

- `sessions.subscribe`：会话变更事件（连接期间有效）。
- `sessions.messages.subscribe` / `unsubscribe`：单会话消息事件；`includeApprovals` 需 `operator.admin`，本版本默认不开启。

## 6. 鉴权与连接配置

- 单用户本地。**Gateway 地址由 CLI 的 `--gateway` 参数决定（服务端侧），浏览器无需感知**——浏览器始终连接同源 `/ws`。
- 浏览器在 `connect` 帧携带 `auth.token` / `auth.password`。若 Gateway 开启了鉴权，首次启动弹「连接设置」输入 token/password（存 localStorage，仅本机浏览器）；若为 `none` 模式则跳过。
- CLI 保持哑管道，仅转发字节，不读取 token。
- **待实现时确认**：本机 Gateway 的实际 auth 模式（token / password / none）与 token 获取方式。

## 7. 页面与交互设计

布局：左侧导航栏 + 主内容区；深色默认，浅色可切换；整体对标 Hermes Studio 的视觉风格。

### 7.1 聊天（核心）

- 左侧会话列表：按渠道来源分组、可折叠；活动会话置顶（带状态）；Ctrl+K 全局搜索；新建会话。
- 右侧聊天面板：流式消息、markdown + 代码高亮、工具调用展开（参数/结果）、生成文件内联预览、输入框（发送 / 粘贴图片 / 附件）。
- 顶部工具栏：模型选择、思考级别开关、token 用量角标。

### 7.2 模型 / 渠道 / Agents / 配置 / 用量

- 模型：按 provider 分组，可见性开关、默认模型切换。
- 渠道：Telegram/Discord/Slack/WhatsApp 等状态卡片，已配置/未配置，登录/登出。
- Agents：列表 / 创建 / 编辑 / 删除、文件、工作区浏览。
- 配置：基于 `config.schema`（含 `uiHints`）生成表单 + JSON 编辑器，写操作走 `config.patch`。
- 用量：token 拆解、会话数、成本估算、模型分布、30 日趋势。

### 7.3 设置

- 连接设置（Gateway token/password）、主题、语言。

## 8. 错误处理

- 断线：自动重连，顶部连接状态徽标（在线/连接中/离线）。
- RPC 错误：toast + 内联提示；`FORBIDDEN`/`MISSING_SCOPE` 给出明确权限说明；`UNAVAILABLE`（`startup-sidecars`）自动重试。
- 跨域：由架构规避（§3）。

## 9. 测试策略

- **Vitest 单测**：RPC 客户端层（帧解析、请求-响应匹配、事件分发、重连逻辑），使用 mock WebSocket。
- **Mock Gateway**：实现协议 v4 的测试固件，对客户端做端到端隔离测试。
- **组件测试**：消息渲染、会话列表等关键组件。

## 10. 目录结构

```
openclaw-studio/                # 项目根 = E:\web\2026-8-14
  bin/
    cli.mjs                     # CLI 入口：静态服务 + ws 代理
  src/
    main.ts
    App.vue
    router/
    stores/                     # connection / sessions / chat / models / channels / agents / config / usage
    rpc/                        # connection.ts / protocol.ts / methods.ts / types.ts
    components/                 # chat / layout / common
    views/                      # Chat / Models / Channels / Agents / Config / Usage / Settings
    i18n/
    styles/
  tests/
    rpc/                        # RPC 客户端层单测
    components/
    mock-gateway/               # 协议 v4 测试固件
  dist/                         # 构建产物，随 npm 包发布（用户无需构建）
  package.json
  vite.config.ts
  tsconfig.json
  docs/superpowers/specs/       # 本设计文档
```

## 11. 构建、运行与分发

### 11.1 本地开发

- `npm install` 安装依赖。
- `npm run dev`：Vite dev server，`/ws` 代理到 Gateway，支持 HMR。

### 11.2 构建

- `npm run build` → 产出 `dist/`。
- `npm run serve`：本地用 `bin/cli.mjs` 启动（默认端口 41739、Gateway `ws://127.0.0.1:18789`）。

### 11.3 一条命令安装（目标场景）

发布为 npm 包后，在**任何装了 OpenClaw（即有 Node ≥22）的机器**上：

- 安装：`npm install -g openclaw-studio`
- 运行：`openclaw-studio`（默认端口 41739，自动打开/打印 URL）
- 零安装运行（可选）：`npx openclaw-studio`

CLI 参数：

- `--port <n>`：监听端口（默认 41739）。
- `--gateway <ws-url>`：Gateway WebSocket 地址（默认 `ws://127.0.0.1:18789`）。
- `--host <addr>`：绑定地址（默认 `127.0.0.1`）。

### 11.4 发布到 GitHub + npm

- `git init` → 推送到 GitHub 仓库（仓库名/账号待确认）。
- `package.json` 配置：`name`（npm 包名）、`version`、`bin`（`openclaw-studio` → `bin/cli.mjs`）、`files: ["dist", "bin"]`（只发布构建产物 + CLI，不发布 `src`）、`prepublishOnly: "npm run build"`、运行时依赖仅 `ws`。
- 发布流程：`npm publish`（或 GitHub Actions 在打 tag 时自动构建并发布）。

## 12. 非目标与未来扩展

- 非目标：桌面 App 打包、多用户/多 Profile、可视化工作流、看板、通用文件浏览器、Web 终端、语音。
- 未来扩展方向：以上非目标能力，如需引入将作为独立子项目立项。

## 13. 待实现时验证事项

1. 本机 OpenClaw Gateway 是否已运行、`ws://127.0.0.1:18789` 是否可达。
2. Gateway auth 模式（token / password / none）及 token 获取方式。
3. `models.list` / `agents.list` / `channels.status` / `sessions.usage*` 实际返回结构，用于补全 `types.ts`。
4. 端口 41739 是否被占用（如被占用则更换）。
5. npm 包名可用性（`openclaw-studio` 若被占用，改用 scoped 包名）；GitHub 仓库名与账号。
