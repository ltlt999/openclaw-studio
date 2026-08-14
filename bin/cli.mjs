#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import {
  loadGatewayConfig,
  isLoopbackGateway,
  injectAuth,
} from './lib/gateway-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(arg('--port', process.env.OPENCLAW_STUDIO_PORT || '41739'))
const HOST = arg('--host', process.env.OPENCLAW_STUDIO_HOST || '127.0.0.1')

// ---- 自动读取同机 OpenClaw 配置（token/password/端口）----
const gatewayCfg = loadGatewayConfig()

function resolveGateway() {
  const explicit = arg('--gateway', process.env.OPENCLAW_STUDIO_GATEWAY)
  if (explicit) return explicit
  const port = gatewayCfg?.port || 18789
  return `ws://127.0.0.1:${port}`
}

const GATEWAY = resolveGateway()
const GATEWAY_LOOPBACK = isLoopbackGateway(GATEWAY)
const useAutoAuth = GATEWAY_LOOPBACK && Boolean(gatewayCfg?.token || gatewayCfg?.password)

if (gatewayCfg) console.log(`[openclaw-studio] 已读取 OpenClaw 配置: ${gatewayCfg.path}`)
if (useAutoAuth) {
  console.log(`[openclaw-studio] 已自动注入网关鉴权（${gatewayCfg.token ? 'token' : 'password'}）`)
} else if (gatewayCfg?.mode === 'none') {
  console.log('[openclaw-studio] gateway.auth.mode=none，无需鉴权')
} else if (gatewayCfg && !GATEWAY_LOOPBACK) {
  console.log('[openclaw-studio] 网关为远程地址，未注入本地配置鉴权（如需要请在 UI 设置页填写 token）')
} else if (!gatewayCfg) {
  console.log('[openclaw-studio] 未找到 OpenClaw 配置（若需鉴权请在 UI 设置页填写 token）')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        gateway: GATEWAY,
        autoAuth: useAutoAuth ? (gatewayCfg.token ? 'token' : 'password') : gatewayCfg?.mode === 'none' ? 'none' : null,
        configPath: gatewayCfg?.path ?? null,
      }),
    )
    return
  }

  if (pathname === '/') pathname = '/index.html'
  const filePath = path.normalize(path.join(distDir, pathname))
  if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath)
    return
  }
  const indexFile = path.join(distDir, 'index.html')
  if (fs.existsSync(indexFile)) {
    sendFile(res, indexFile)
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('dist/ 不存在，请先运行 npm run build')
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (client) => {
  let upstream
  try {
    upstream = new WebSocket(GATEWAY)
  } catch (err) {
    console.error(`[openclaw-studio] 无法创建网关连接: ${err?.message || err}`)
    client.close(1011, 'gateway connect failed')
    return
  }

  let clientClosed = false

  client.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(injectAuth(data.toString(), gatewayCfg))
  })
  upstream.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  })
  upstream.on('error', (err) => {
    console.error(`[openclaw-studio] 无法连接网关 ${GATEWAY}: ${err?.message || err}`)
    try { client.close() } catch {}
  })
  upstream.on('close', (code, reason) => {
    if (!clientClosed) {
      console.error(
        `[openclaw-studio] 网关提前关闭连接 (code=${code}${reason ? ` reason=${reason}` : ''})，可能鉴权失败或网关不可达`,
      )
    }
    try { client.close() } catch {}
  })
  client.on('error', () => {
    try { upstream.close() } catch {}
  })
  client.on('close', () => {
    clientClosed = true
    try { upstream.close() } catch {}
  })
})

server.listen(PORT, HOST, () => {
  console.log('')
  console.log('  OpenClaw Studio')
  console.log(`  界面:   http://${HOST}:${PORT}`)
  console.log(`  网关:   ${GATEWAY}`)
  console.log('')
  console.log('  按 Ctrl+C 退出')
})
