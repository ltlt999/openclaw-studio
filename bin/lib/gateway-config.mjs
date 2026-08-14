// OpenClaw 配置读取与鉴权注入（纯逻辑，便于测试）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export function parseGatewayConfig(cfg) {
  const g = cfg?.gateway
  if (!g) return null
  const auth = g.auth && typeof g.auth === 'object' ? g.auth : {}
  return {
    token: typeof auth.token === 'string' && auth.token.trim() ? auth.token.trim() : undefined,
    password:
      typeof auth.password === 'string' && auth.password.trim() ? auth.password.trim() : undefined,
    mode: typeof auth.mode === 'string' ? auth.mode : undefined,
    port: Number(g.port) || undefined,
  }
}

export function isLoopbackGateway(url) {
  try {
    const host = new URL(url).hostname
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '0.0.0.0'
    )
  } catch {
    return false
  }
}

export function injectAuth(frameStr, auth) {
  if (!auth?.token && !auth?.password) return frameStr
  try {
    const frame = JSON.parse(frameStr)
    if (frame?.type === 'req' && frame?.method === 'connect') {
      frame.params = frame.params || {}
      frame.params.auth = { token: auth.token, password: auth.password }
    }
    return JSON.stringify(frame)
  } catch {
    return frameStr
  }
}

export function candidateConfigPaths() {
  const home = process.env.OPENCLAW_HOME?.trim() || os.homedir()
  const stateOverride = process.env.OPENCLAW_STATE_DIR?.trim()
  return [
    stateOverride ? path.join(stateOverride, 'openclaw.json') : null,
    path.join(home, '.openclaw', 'openclaw.json'),
    path.join(home, '.clawdbot', 'clawdbot.json'),
    path.join(process.cwd(), 'openclaw.json'),
  ].filter(Boolean)
}

export function loadGatewayConfig() {
  for (const p of candidateConfigPaths()) {
    try {
      if (!fs.existsSync(p)) continue
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
      const cfg = parseGatewayConfig(parsed)
      if (cfg) return { ...cfg, path: p }
    } catch (e) {
      console.warn(`[openclaw-studio] 解析配置文件失败 ${p}: ${e.message}`)
    }
  }
  return null
}
