# OpenClaw Studio

一个更好用的 OpenClaw Web 控制台，界面与交互对标 Hermes Studio，作为官方 Control UI 的独立替代方案。

## 特性

- **聊天 / 会话**：流式消息、多会话、工具调用展开、文件预览、Ctrl+K 搜索、模型切换、token 用量角标
- **模型管理**：按 provider 分组、可见性、默认模型切换
- **渠道状态**：Telegram / Discord / Slack / WhatsApp 等状态卡片
- **Agents**：列表 / 创建 / 编辑 / 删除
- **配置**：schema 驱动表单 + JSON 编辑
- **用量分析**：token 拆解、成本估算、模型分布、趋势

## 快速开始

```bash
# 安装
npm install -g openclaw-studio

# 启动（默认端口 41739，连接本机 Gateway ws://127.0.0.1:18789）
openclaw-studio

# 自定义端口 / 远程 Gateway
openclaw-studio --port 51739 --gateway ws://192.168.1.10:18789
```

然后浏览器打开 `http://127.0.0.1:41739`。

> 需要本机已运行 OpenClaw Gateway，且 Node.js ≥ 22。

## 技术栈

Vue 3 + TypeScript + Vite + Naive UI + Pinia，运行时为 Node.js + `ws`（WebSocket 代理）。

## 开发

```bash
npm install
npm run dev      # 开发服务器（HMR）
npm run build    # 构建到 dist/
npm run serve    # 本地用 CLI 启动
```

## 设计文档

见 [docs/superpowers/specs/](docs/superpowers/specs/)。

## License

MIT
