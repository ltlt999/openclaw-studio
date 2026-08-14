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

// 会话行（对应 gateway-protocol SessionRowSchema）
export interface Session {
  key: string
  sessionId?: string
  kind?: 'direct' | 'group' | 'global' | 'unknown'
  label?: string
  displayName?: string
  derivedTitle?: string
  lastMessagePreview?: string
  channel?: string
  agentId?: string
  accountId?: string
  isMain?: boolean
  isBackground?: boolean
  updatedAt?: number | null
  archived?: boolean
  pinned?: boolean
  unread?: boolean
  lastActivityAt?: number
  lastInteractionAt?: number
  status?: 'running' | 'done' | 'failed' | 'killed' | 'timeout'
  activeLeafEntryId?: string | null
  parentSessionKey?: string
  childSessions?: string[]
  [key: string]: any
}

// 聊天转录条目（字段在接入真实 Gateway 后校准）
export interface ChatEntry {
  id?: string
  messageId?: string
  role?: string
  text?: string
  content?: string
  [key: string]: any
}

export interface ChatHistoryResult {
  sessionId?: string
  entries?: ChatEntry[]
  messages?: ChatEntry[]
  [key: string]: any
}

// 会话列表返回：可能是数组，也可能是 { sessions: [...] }
export type SessionsListResult = Session[] | { sessions?: Session[]; [key: string]: any }
