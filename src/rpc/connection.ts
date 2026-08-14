import type { RpcFrame } from './types'
import { createId, buildRequest, parseFrame } from './protocol'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface ConnectionOptions {
  url?: string
  token?: string
  password?: string
  timeoutMs?: number
  handshakeTimeoutMs?: number
}

interface Pending {
  resolve: (v: any) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface Queued {
  id: string
  method: string
  params?: Record<string, any>
  pending: Pending
}

const CLIENT_ID = 'webchat-ui'
const CLIENT_VERSION = '0.1.0'
const CLIENT_MODE = 'webchat'
const PROTOCOL = 4

export function defaultWsUrl(): string {
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}/ws`
  }
  return 'ws://127.0.0.1:18789'
}

function extractError(frame: any): string {
  // 网关把错误放在 error 对象里：{ ok:false, error:{ code, message, details } }
  const e = frame?.error
  const code = typeof e?.code === 'string' ? e.code : typeof frame?.code === 'string' ? frame.code : ''
  const detailCode = typeof e?.details?.code === 'string' ? e.details.code : typeof frame?.details?.code === 'string' ? frame.details.code : ''
  const reason = typeof e?.details?.reason === 'string' ? e.details.reason : typeof frame?.details?.reason === 'string' ? frame.details.reason : ''
  const message = typeof e?.message === 'string' ? e.message : typeof frame?.message === 'string' ? frame.message : ''
  const parts = [code, detailCode, reason, message].filter(Boolean)
  return parts.join(' · ') || '连接失败'
}

export class GatewayConnection {
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private queue: Queued[] = []
  private eventListeners = new Map<string, Set<(payload: any) => void>>()
  private statusListeners = new Set<(s: ConnectionStatus) => void>()

  status: ConnectionStatus = 'disconnected'
  lastError: string | null = null
  hello: any = null

  private url: string
  private token?: string
  private password?: string
  private timeoutMs: number
  private handshakeTimeoutMs: number

  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false

  constructor(opts: ConnectionOptions = {}) {
    this.url = opts.url ?? defaultWsUrl()
    this.token = opts.token
    this.password = opts.password
    this.timeoutMs = opts.timeoutMs ?? 30000
    this.handshakeTimeoutMs = opts.handshakeTimeoutMs ?? 15000
  }

  setOptions(opts: Partial<ConnectionOptions>) {
    if (opts.url !== undefined) this.url = opts.url
    if (opts.token !== undefined) this.token = opts.token
    if (opts.password !== undefined) this.password = opts.password
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status !== s) {
      this.status = s
      this.statusListeners.forEach((cb) => cb(s))
    }
  }

  onStatus(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb)
    cb(this.status)
    return () => this.statusListeners.delete(cb)
  }

  on(event: string, cb: (payload: any) => void): () => void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set())
    this.eventListeners.get(event)!.add(cb)
    return () => this.eventListeners.get(event)?.delete(cb)
  }

  connect(): void {
    this.manualClose = false
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    this.setStatus('connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.lastError = '无法建立 WebSocket 连接'
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    // 只处理“当前”连接的帧与事件，忽略被替换掉的旧连接的迟到回调
    const isCurrent = () => this.ws === ws

    const handshakeTimer = setTimeout(() => {
      if (!isCurrent()) return
      this.lastError = '握手超时'
      try { ws.close() } catch {}
    }, this.handshakeTimeoutMs)

    let sentConnect = false
    const sendConnect = () => {
      if (!isCurrent() || sentConnect) return
      sentConnect = true
      const params: Record<string, any> = {
        minProtocol: PROTOCOL,
        maxProtocol: PROTOCOL,
        client: { id: CLIENT_ID, version: CLIENT_VERSION, platform: 'web', mode: CLIENT_MODE },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.talk', 'operator.admin'],
      }
      if (this.token) params.auth = { token: this.token }
      else if (this.password) params.auth = { password: this.password }
      ws.send(JSON.stringify(buildRequest('connect', params, 'connect')))
    }

    // 等 connect.challenge，超时 1s 后直接发 connect（兼容无需 challenge 的鉴权模式）
    const challengeTimer = setTimeout(() => {
      if (!isCurrent()) return
      sendConnect()
    }, 1000)

    ws.onmessage = (ev) => {
      if (!isCurrent()) return
      const frame = parseFrame(String(ev.data))
      if (!frame) return

      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        clearTimeout(challengeTimer)
        sendConnect()
        return
      }
      if (frame.type === 'res' && frame.id === 'connect') {
        clearTimeout(handshakeTimer)
        if (frame.ok) {
          this.reconnectAttempt = 0
          this.lastError = null
          this.hello = frame.payload
          this.setStatus('connected')
          this.flushQueue()
        } else {
          this.lastError = extractError(frame)
          this.setStatus('disconnected')
          try { ws.close() } catch {}
        }
        return
      }
      this.handleFrame(frame)
    }

    ws.onclose = () => {
      if (!isCurrent()) return
      clearTimeout(handshakeTimer)
      clearTimeout(challengeTimer)
      this.pending.forEach((p) => {
        clearTimeout(p.timer)
        p.reject(new Error('连接已断开'))
      })
      this.pending.clear()
      if (!this.manualClose && !this.lastError) {
        this.lastError = '连接被网关关闭（可能是鉴权失败或网关不可达）'
      }
      this.setStatus('disconnected')
      if (!this.manualClose) this.scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose 会随之触发
    }
  }

  disconnect(): void {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const ws = this.ws
    this.ws = null
    if (ws) {
      try { ws.onclose = null } catch {}
      try { ws.onmessage = null } catch {}
      try { ws.close() } catch {}
    }
    this.setStatus('disconnected')
  }

  private handleFrame(frame: RpcFrame) {
    if (frame.type === 'res') {
      const p = this.pending.get(frame.id)
      if (p) {
        clearTimeout(p.timer)
        this.pending.delete(frame.id)
        if (frame.ok) p.resolve(frame.payload)
        else p.reject(new Error(extractError(frame)))
      }
    } else if (frame.type === 'event') {
      this.eventListeners.get(frame.event)?.forEach((cb) => cb(frame.payload))
    }
  }

  request(method: string, params?: Record<string, any>, timeoutMs?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = createId()
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`请求超时: ${method}`))
      }, timeoutMs ?? this.timeoutMs)
      const pending: Pending = { resolve, reject, timer }

      if (this.status === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pending.set(id, pending)
        this.ws.send(JSON.stringify(buildRequest(method, params, id)))
      } else {
        this.queue.push({ id, method, params, pending })
        if (this.status === 'disconnected') this.connect()
      }
    })
  }

  private flushQueue() {
    const q = this.queue
    this.queue = []
    q.forEach((item) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pending.set(item.id, item.pending)
        this.ws.send(JSON.stringify(buildRequest(item.method, item.params, item.id)))
      }
    })
  }

  private scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer) return
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempt))
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}
