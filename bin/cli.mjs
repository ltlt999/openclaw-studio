#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(arg('--port', process.env.OPENCLAW_STUDIO_PORT || '41739'))
const HOST = arg('--host', process.env.OPENCLAW_STUDIO_HOST || '127.0.0.1')
const GATEWAY = arg('--gateway', process.env.OPENCLAW_STUDIO_GATEWAY || 'ws://127.0.0.1:18789')

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
  } catch {
    client.close(1011, 'gateway connect failed')
    return
  }

  const closeBoth = () => {
    try { client.close() } catch {}
    try { upstream.close() } catch {}
  }

  client.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data)
  })
  upstream.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  })
  upstream.on('error', closeBoth)
  upstream.on('close', closeBoth)
  client.on('error', closeBoth)
  client.on('close', () => {
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
