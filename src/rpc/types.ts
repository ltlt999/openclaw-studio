// Gateway 协议（v4）类型定义

export interface RpcRequest {
  type: 'req'
  id: string
  method: string
  params?: Record<string, any>
  traceparent?: string
}

export interface RpcResponse {
  type: 'res'
  id: string
  ok: boolean
  payload?: any
  code?: string
  message?: string
  details?: any
  retryable?: boolean
  retryAfterMs?: number
}

export interface RpcEvent {
  type: 'event'
  event: string
  payload?: any
  seq?: number
  stateVersion?: string
}

export type RpcFrame = RpcRequest | RpcResponse | RpcEvent

export interface HelloOk {
  type: 'hello-ok'
  protocol: number
  server?: { version?: string; connId?: string }
  features?: { methods?: string[]; events?: string[] }
  snapshot?: any
  auth?: { role?: string; scopes?: string[]; deviceToken?: string }
  policy?: {
    maxPayload?: number
    maxBufferedBytes?: number
    tickIntervalMs?: number
    attachments?: { maxBytes?: number; maxImageBytes?: number }
  }
}

export interface ConnectParams {
  minProtocol: number
  maxProtocol: number
  client: { id: string; version: string; platform: string; mode: string }
  role: string
  scopes: string[]
  auth?: { token?: string; password?: string }
  locale?: string
  userAgent?: string
  device?: Record<string, any>
}

// 会话 / 消息（字段在接入真实 Gateway 后补全，先放宽）
export interface Session {
  key: string
  title?: string
  channel?: string
  kind?: string
  status?: string
  updatedAtMs?: number
  [key: string]: any
}

export interface ChatMessage {
  id: string
  role?: 'user' | 'assistant' | 'system' | string
  text?: string
  [key: string]: any
}
