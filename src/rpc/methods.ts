import type { GatewayConnection } from './connection'

/**
 * 类型化的 RPC 方法封装。
 * 参数形状基于 OpenClaw Gateway 协议 v4，接入真实 Gateway 后按实际结构校准。
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
  sessionsResolve(key: string) {
    return this.conn.request('sessions.resolve', { key })
  }
  sessionsCreate(params?: Record<string, any>) {
    return this.conn.request('sessions.create', params || {})
  }
  sessionsSend(key: string, text: string) {
    return this.conn.request('sessions.send', { key, text })
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
  chatSend(params: Record<string, any>) {
    return this.conn.request('chat.send', params)
  }
  chatHistory(key: string, opts?: Record<string, any>) {
    return this.conn.request('chat.history', { key, ...opts })
  }

  // ---- models ----
  modelsList(view?: string) {
    return this.conn.request('models.list', view ? { view } : undefined)
  }

  // ---- channels ----
  channelsStatus() {
    return this.conn.request('channels.status')
  }
  channelsLogout(channel: string) {
    return this.conn.request('channels.logout', { channel })
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
  configPatch(patch: Record<string, any>, replacePaths?: string[]) {
    return this.conn.request('config.patch', { patch, replacePaths })
  }

  // ---- usage ----
  usage() {
    return this.conn.request('sessions.usage')
  }
  usageTimeseries(opts?: Record<string, any>) {
    return this.conn.request('sessions.usage.timeseries', opts)
  }
}
