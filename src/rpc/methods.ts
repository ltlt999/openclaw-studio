import type { GatewayConnection } from './connection'

export interface ChatSendParams {
  sessionKey: string
  sessionId?: string
  message: string
  agentId?: string
  replyToId?: string
  expectedLeafEntryId?: string | null
  expectedRunId?: string
  queueMode?: string
  deliver?: boolean
  idempotencyKey?: string
  attachments?: any[]
}

export interface ChatHistoryParams {
  sessionKey: string
  agentId?: string
  limit?: number
  sessionId?: string
  maxChars?: number
}

/**
 * 类型化的 RPC 方法封装。
 * 方法名与参数形状对齐 OpenClaw Gateway 协议 v4（已对照官方 control-ui 源码与 schema）。
 */
export class GatewayClient {
  constructor(private conn: GatewayConnection) {}

  // ---- sessions ----
  sessionsList() {
    return this.conn.request('sessions.list')
  }
  sessionsSubscribe() {
    return this.conn.request('sessions.subscribe')
  }
  sessionsDescribe(key: string) {
    return this.conn.request('sessions.describe', { key })
  }
  sessionsCreate(params?: Record<string, any>) {
    return this.conn.request('sessions.create', params)
  }
  sessionsPatch(params: Record<string, any>) {
    return this.conn.request('sessions.patch', params)
  }
  sessionsDelete(params: Record<string, any>) {
    return this.conn.request('sessions.delete', params)
  }
  sessionsResolve(key: string) {
    return this.conn.request('sessions.resolve', { key })
  }
  sessionsCreate(params?: Record<string, any>) {
    return this.conn.request('sessions.create', params || {})
  }
  sessionsDelete(key: string) {
    return this.conn.request('sessions.delete', { key })
  }
  sessionsReset(key: string) {
    return this.conn.request('sessions.reset', { key })
  }
  sessionsAbort(params: Record<string, any>) {
    return this.conn.request('sessions.abort', params)
  }
  sessionsMessagesSubscribe(key: string, opts?: Record<string, any>) {
    return this.conn.request('sessions.messages.subscribe', { key, ...opts })
  }
  sessionsMessagesUnsubscribe(key: string) {
    return this.conn.request('sessions.messages.unsubscribe', { key })
  }

  // ---- chat ----
  chatSend(params: ChatSendParams) {
    return this.conn.request('chat.send', params as Record<string, any>)
  }
  chatHistory(params: ChatHistoryParams) {
    return this.conn.request('chat.history', params as Record<string, any>)
  }
  chatMessageGet(params: { sessionKey: string; messageId: string; agentId?: string }) {
    return this.conn.request('chat.message.get', params)
  }
  chatInject(params: Record<string, any>) {
    return this.conn.request('chat.inject', params)
  }

  // ---- models ----
  modelsList(view?: string) {
    return this.conn.request('models.list', view ? { view } : undefined)
  }

  // ---- channels ----
  channelsStatus() {
    return this.conn.request('channels.status')
  }
  channelsLogout(channel: string, accountId?: string) {
    return this.conn.request('channels.logout', { channel, accountId })
  }

  // ---- agents ----
  agentsList() {
    return this.conn.request('agents.list')
  }
  agentsCreate(params: Record<string, any>) {
    return this.conn.request('agents.create', params)
  }
  agentsUpdate(params: Record<string, any>) {
    return this.conn.request('agents.update', params)
  }
  agentsDelete(id: string) {
    return this.conn.request('agents.delete', { id })
  }

  // ---- config ----
  configGet() {
    return this.conn.request('config.get')
  }
  configSchema() {
    return this.conn.request('config.schema')
  }
  configPatch(raw: string, baseHash: string) {
    return this.conn.request('config.patch', { raw, baseHash })
  }
  configApply(raw: string, baseHash: string) {
    return this.conn.request('config.apply', { raw, baseHash })
  }

  // ---- usage ----
  usage() {
    return this.conn.request('sessions.usage')
  }
  usageTimeseries(key: string) {
    return this.conn.request('sessions.usage.timeseries', { key })
  }
  usageTimeseries(opts?: Record<string, any>) {
    return this.conn.request('sessions.usage.timeseries', opts)
  }
}
