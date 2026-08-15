#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import {
  loadGatewayConfig,
  isLoopbackGateway,
  candidateConfigPaths,
} from './lib/gateway-config.mjs'
import { probeGateway } from './lib/self-check.mjs'
import {
  loadOrCreateDeviceIdentity,
  loadStoredDeviceToken,
  storeDeviceToken,
  buildConnectDevice,
  isPairingRequiredError,
  defaultStateDir,
} from './lib/device-auth.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(arg('--port', process.env.OPENCLAW_STUDIO_PORT || '41739'))
const HOST = arg('--host', process.env.OPENCLAW_STUDIO_HOST || '127.0.0.1')

// ---- 读取同机 OpenClaw 配置 + 设备身份 ----
const gatewayCfg = loadGatewayConfig({ explicitPath: arg('--config') })
const deviceStateDir = defaultStateDir()
const device = loadOrCreateDeviceIdentity(deviceStateDir)
let deviceToken = loadStoredDeviceToken(deviceStateDir)

// 读取配置中的模型供应商（含真实 apiKey，供「获取模型」使用）
// 每次调用重新读取，确保 UI 保存的新密钥能立即生效
// 1) 尝试宿主机所有候选配置路径；2) 找不到时尝试从 Docker 容器读取 OpenClaw 配置
function loadProviderConfigs() {
  const candidates = candidateConfigPaths({ explicit: arg('--config') })
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (cfg?.models?.providers) return cfg.models.providers
    } catch {
      // 尝试下一个
    }
  }
  // 兜底：OpenClaw 装在 Docker 时，从容器里读取配置
  try {
    const containers = execSync('docker ps --format {{.Names}}', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split('\n')
    const oc = containers.find((c) => c.toLowerCase().includes('openclaw'))
    if (oc) {
      const raw = execSync(
        `docker exec ${oc} sh -c "cat /home/node/.openclaw/openclaw.json 2>/dev/null || cat /root/.openclaw/openclaw.json 2>/dev/null"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      )
      const cfg = JSON.parse(raw)
      if (cfg?.models?.providers) return cfg.models.providers
    }
  } catch {
    // docker 不可用或无 openclaw 容器，忽略
  }
  return null
}

function resolveGateway() {
  const explicit = arg('--gateway', process.env.OPENCLAW_STUDIO_GATEWAY)
  if (explicit) return explicit
  const port = gatewayCfg?.port || 18789
  return `ws://127.0.0.1:${port}`
}

const GATEWAY = resolveGateway()
const GATEWAY_LOOPBACK = isLoopbackGateway(GATEWAY)
const useDeviceAuth = GATEWAY_LOOPBACK // 仅同机网关自动注入设备认证
const useAutoAuth = GATEWAY_LOOPBACK && Boolean(gatewayCfg?.token || gatewayCfg?.password)

// 网关要求校验 Origin（control-ui 类客户端），代理连接时带上网关自身 Origin
function gatewayOrigin(url) {
  try {
    const u = new URL(url)
    return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`
  } catch {
    return 'http://127.0.0.1:18789'
  }
}
const GATEWAY_ORIGIN = gatewayOrigin(GATEWAY)

if (gatewayCfg) console.log(`[openclaw-studio] 已读取 OpenClaw 配置: ${gatewayCfg.path}`)
if (deviceToken) {
  console.log(`[openclaw-studio] 设备已配对（deviceToken 已保存）: ${device.deviceId.slice(0, 12)}…`)
} else if (useDeviceAuth && useAutoAuth) {
  console.log(`[openclaw-studio] 设备待配对: ${device.deviceId.slice(0, 12)}…（首次使用需批准，见下方提示）`)
} else if (gatewayCfg?.mode === 'none') {
  console.log('[openclaw-studio] gateway.auth.mode=none，无需鉴权')
} else if (gatewayCfg && !GATEWAY_LOOPBACK) {
  console.log('[openclaw-studio] 网关为远程地址，未自动注入本地配置鉴权（如需要请在 UI 设置页填写 token）')
} else if (!gatewayCfg) {
  console.log('[openclaw-studio] 未找到 OpenClaw 配置（若需鉴权请在 UI 设置页填写 token）')
}

// 构造 connect 帧需要注入的 auth 与 device 字段
// 优先用配置里的网关 token（稳定不轮换）；deviceToken 仅作兜底（无配置 token 时）
function buildConnectAuthAndDevice(challenge) {
  const auth = gatewayCfg?.token
    ? { token: gatewayCfg.token }
    : gatewayCfg?.password
      ? { password: gatewayCfg.password }
      : deviceToken
        ? { deviceToken }
        : undefined
  const signatureToken = gatewayCfg?.token || deviceToken
  const deviceField = challenge ? buildConnectDevice(device, signatureToken, challenge) : undefined
  return { auth, deviceField }
}

// ---- 启动自检：网关连通性 + 鉴权（走与真实连接一致的设备认证）----
let probeResult = null
probeGateway({
  url: GATEWAY,
  origin: GATEWAY_ORIGIN,
  enrich: (params, challenge) => {
    if (!useDeviceAuth) return params
    const { auth, deviceField } = buildConnectAuthAndDevice(challenge)
    if (auth) params.auth = auth
    if (deviceField) params.device = deviceField
    return params
  },
}).then((r) => {
  probeResult = r
  console.log(`[openclaw-studio] 网关自检: ${r.ok ? '通过' : '失败'} - ${r.message}`)
})

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

// 从供应商 API 拉取模型列表（OpenAI 兼容 / Anthropic）
async function fetchProviderModels({ baseUrl, apiKey, apiType }) {
  const type = apiType || 'openai-completions'
  let res
  if (type === 'anthropic-messages') {
    res = await fetch(`${baseUrl}/models`, {
      headers: {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    })
  } else {
    res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey || ''}` },
    })
  }
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && !apiKey) {
      throw new Error(`需要有效的 API Key（HTTP ${res.status}），请填写后重试`)
    }
    throw new Error(`供应商返回 HTTP ${res.status}`)
  }
  const data = await res.json()
  const list = data?.data || data?.models || []
  return list.map((m) => ({ id: m.id || m.model, name: m.name || m.id || m.model })).filter((m) => m.id)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch (e) { reject(new Error('JSON 解析失败')) }
    })
    req.on('error', reject)
  })
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
        probe: probeResult,
        device: {
          deviceId: device.deviceId,
          paired: Boolean(deviceToken),
        },
      }),
    )
    return
  }

  if (pathname === '/api/fetch-models' && req.method === 'POST') {
    readJsonBody(req)
      .then(async ({ baseUrl, apiKey, apiType, providerId }) => {
        let b = baseUrl
        let k = apiKey
        let t = apiType
        // 编辑供应商时：浏览器不持有真实密钥，若给了 providerId 则用配置里的密钥
        if (providerId && (!k || k === '__OPENCLAW_REDACTED__')) {
          const providers = loadProviderConfigs()
          const p = providers?.[providerId]
          if (p) {
            b = b || p.baseUrl
            k = p.apiKey
            t = t || p.api
          } else {
            console.error(
              `[openclaw-studio] 配置中未找到供应商「${providerId}」的密钥（现有供应商: ${providers ? Object.keys(providers).join(', ') : '无'}）`,
            )
          }
        }
        if (!b) throw new Error('缺少 baseUrl')
        // 无 key 也尝试拉取（部分供应商模型列表公开）；401/403 时会提示需要 key
        const models = await fetchProviderModels({ baseUrl: b, apiKey: k, apiType: t })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, models }))
      })
      .catch((e) => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e?.message || '获取失败' }))
      })
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

function injectConnectAuth(frameStr, challenge) {
  if (!useDeviceAuth) return frameStr
  try {
    const frame = JSON.parse(frameStr)
    if (frame?.type === 'req' && frame?.method === 'connect') {
      frame.params = frame.params || {}
      const { auth, deviceField } = buildConnectAuthAndDevice(challenge)
      if (auth) frame.params.auth = auth
      if (deviceField) frame.params.device = deviceField
    }
    return JSON.stringify(frame)
  } catch {
    return frameStr
  }
}

wss.on('connection', (client) => {
  let upstream
  try {
    upstream = new WebSocket(GATEWAY, { origin: GATEWAY_ORIGIN })
  } catch (err) {
    console.error(`[openclaw-studio] 无法创建网关连接: ${err?.message || err}`)
    client.close(1011, 'gateway connect failed')
    return
  }

  let clientClosed = false
  let challenge = null // 每个连接捕获一次 connect.challenge

  client.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(injectConnectAuth(data.toString(), challenge))
    }
  })
  upstream.on('message', (data, isBinary) => {
    if (client.readyState !== WebSocket.OPEN) return
    const text = isBinary ? '' : data.toString()
    try {
      const frame = JSON.parse(text)
      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        challenge = { nonce: frame.payload?.nonce, ts: frame.payload?.ts }
      } else if (frame.type === 'res' && frame.id === 'connect') {
        if (frame.ok) {
          const newToken = frame.payload?.auth?.deviceToken
          if (newToken && newToken !== deviceToken) {
            deviceToken = newToken
            storeDeviceToken(deviceStateDir, newToken)
            console.log('[openclaw-studio] 已保存网关颁发的 deviceToken，设备配对成功')
          }
        } else if (isPairingRequiredError(frame.error)) {
          console.error('')
          console.error('[openclaw-studio] 设备待批准（首次使用需要批准一次）。请执行：')
          console.error('  1. openclaw devices list          （查看待配对列表，找到本设备对应的 Request ID）')
          console.error('  2. openclaw devices approve <RequestID>')
          console.error('  本设备 Device ID: ' + device.deviceId)
          console.error('  （Docker 安装把 openclaw 换成: docker exec <容器名> openclaw）')
          console.error('  批准后浏览器会自动重连。')
          console.error('')
        }
      }
    } catch {
      // ignore
    }
    if (isBinary) client.send(data, { binary: true })
    else client.send(text)
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
