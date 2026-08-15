<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { NEmpty, NInput, NButton, NTag, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient, getConnection } from '../rpc/client'
import { generateUUID } from '../lib/uuid'
import Markdown from '../components/Markdown.vue'
import type { Session, ChatEntry } from '../rpc/types'

const conn = useConnectionStore()
const client = getClient()
const connection = getConnection()
const message = useMessage()

const sessions = ref<Session[]>([])
const loading = ref(false)
const activeKey = ref<string | null>(null)
const activeSessionId = ref<string | undefined>(undefined)
const entries = ref<ChatEntry[]>([])
const input = ref('')
const sending = ref(false)
const filter = ref('')

function sessionTitle(s: Session): string {
  return s.derivedTitle || s.displayName || s.label || s.key
}

const filteredSessions = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return sessions.value
  return sessions.value.filter((s) => {
    const hay = `${sessionTitle(s)} ${s.key} ${s.channel || ''}`.toLowerCase()
    return hay.includes(q)
  })
})

const activeSession = computed(() => sessions.value.find((s) => s.key === activeKey.value))
const isRunning = computed(() => activeSession.value?.status === 'running')

async function loadSessions() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.sessionsList()
    sessions.value = Array.isArray(data) ? data : data?.sessions ?? []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadHistory(key: string) {
  try {
    const data = await client.chatHistory({ sessionKey: key, limit: 200 })
    entries.value = Array.isArray(data) ? data : data?.entries ?? data?.messages ?? []
    if (data && !Array.isArray(data)) activeSessionId.value = data.sessionId ?? activeSessionId.value
  } catch (e: any) {
    console.error(e)
    if (e?.message) message.error(e.message)
  }
}

async function selectSession(s: Session) {
  activeKey.value = s.key
  activeSessionId.value = s.sessionId
  entries.value = []
  await loadHistory(s.key)
}

async function send() {
  const text = input.value.trim()
  if (!text || !activeKey.value || sending.value) return
  sending.value = true
  input.value = ''
  entries.value.push({ id: `local-${Date.now()}`, role: 'user', text })
  try {
    await client.chatSend({
      sessionKey: activeKey.value,
      ...(activeSessionId.value ? { sessionId: activeSessionId.value } : {}),
      message: text,
      deliver: false,
      idempotencyKey: generateUUID(),
    })
    await loadHistory(activeKey.value)
  } catch (e: any) {
    console.error(e)
    if (e?.message) message.error(e.message)
  } finally {
    sending.value = false
  }
}

function roleLabel(m: any): string {
  if (m.role === 'user') return '我'
  if (m.role === 'assistant') return '助手'
  return m.role || '消息'
}

// 格式化消息时间：今天显示时分，昨天显示「昨天」，更早显示日期
function formatTime(ts: number | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`
  return `${d.getMonth() + 1}-${d.getDate()} ${hm}`
}

// 提取消息显示文本：兼容字符串与块数组（助手流式 content）
function messageText(m: any): string {
  if (typeof m.text === 'string') return m.text
  const c = m.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((b: any) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text ?? '' : ''))
      .filter((s: string) => s)
      .join('\n')
  }
  return ''
}

// 提取工具调用块
function messageTools(m: any): any[] {
  const c = m.content
  if (!Array.isArray(c)) return []
  return c.filter((b: any) => b && typeof b === 'object' && (b.type === 'tool_call' || b.type === 'toolCall' || b.name))
}

// 判断是否为工具结果类消息（默认折叠）
function isToolMessage(m: any): boolean {
  if (m.role === 'toolResult' || m.role === 'tool_result' || m.role === 'tool') return true
  const c = m.content
  if (!Array.isArray(c)) return false
  return c.some(
    (b: any) => b && typeof b === 'object' && (b.type === 'tool_result' || b.type === 'toolResult'),
  )
}

// 工具结果消息的简短摘要（工具名或结果开头）
function toolSummary(m: any): string {
  const c = m.content
  if (Array.isArray(c)) {
    for (const b of c) {
      if (b && typeof b === 'object' && (b.type === 'tool_result' || b.type === 'toolResult')) {
        const name = b.name || b.toolName || b.tool_name || b.id
        if (name) return `工具：${name}`
        const text = b.content || b.output || b.result
        if (typeof text === 'string') return text.slice(0, 80)
        if (Array.isArray(text)) return String(text[0]?.text || '').slice(0, 80) || ''
      }
    }
  }
  return '工具结果'
}

function msgKey(m: any): string {
  return m.id || m.messageId || `${m.role}-${m.timestamp || ''}`
}

const expandedTools = ref<Set<string>>(new Set())
function toggleTool(key: string) {
  const s = new Set(expandedTools.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedTools.value = s
}

// 实时刷新：会话变更 → 刷新列表；消息事件 → 防抖刷新当前转录
let reloadTimer: ReturnType<typeof setTimeout> | null = null
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    if (activeKey.value) loadHistory(activeKey.value)
  }, 400)
}

const offSessions = connection.on('sessions.changed', () => loadSessions())
const offMessage = connection.on('session.message', (p: any) => {
  const k = p?.sessionKey ?? p?.key
  if (k && k === activeKey.value) scheduleReload()
})

let stopWatch: (() => void) | null = null
onMounted(() => {
  stopWatch = watch(
    () => conn.status,
    (s) => {
      if (s === 'connected') loadSessions()
    },
    { immediate: true },
  )
})
onUnmounted(() => {
  stopWatch?.()
  offSessions()
  offMessage()
  if (reloadTimer) clearTimeout(reloadTimer)
})
</script>

<template>
  <div class="chat">
    <div class="sessions">
      <div class="sessions-head">
        <span>会话</span>
        <span v-if="loading" class="head-spinner"></span>
      </div>
      <div class="sessions-search">
        <n-input v-model:value="filter" size="small" placeholder="搜索会话…" clearable />
      </div>
      <div class="sessions-list">
        <div
          v-for="s in filteredSessions"
          :key="s.key"
          class="session-item"
          :class="{ active: s.key === activeKey }"
          @click="selectSession(s)"
        >
          <div class="session-title-row">
            <span class="session-title">{{ sessionTitle(s) }}</span>
            <span v-if="s.status === 'running'" class="running-dot"></span>
          </div>
          <div class="session-sub">
            <span v-if="s.channel" class="session-channel">{{ s.channel }}</span>
            <span v-else>{{ s.kind }}</span>
            <span v-if="s.unread" class="unread-dot"></span>
          </div>
        </div>
        <n-empty
          v-if="!loading && !filteredSessions.length"
          description="暂无会话"
          style="margin-top: 40px"
        />
      </div>
    </div>

    <div class="main">
      <div v-if="!activeKey" class="placeholder">
        <n-empty description="选择一个会话开始" />
      </div>
      <template v-else>
        <div class="messages">
          <div v-for="m in entries" :key="msgKey(m)" class="msg" :class="m.role">
            <div class="msg-role">
              <span>{{ roleLabel(m) }}</span>
              <span v-if="m.timestamp" class="msg-time">{{ formatTime(m.timestamp) }}</span>
            </div>

            <!-- 工具类消息：默认折叠，点击展开 -->
            <div v-if="isToolMessage(m)" class="tool-msg" :class="{ expanded: expandedTools.has(msgKey(m)) }">
              <div class="tool-header" @click="toggleTool(msgKey(m))">
                <span class="tool-chevron">{{ expandedTools.has(msgKey(m)) ? '▾' : '▸' }}</span>
                <span class="tool-title">工具结果</span>
                <span class="tool-summary">{{ toolSummary(m) }}</span>
              </div>
              <div v-if="expandedTools.has(msgKey(m))" class="tool-body">
                <Markdown v-if="messageText(m)" :source="messageText(m)" />
                <pre v-else class="msg-raw">{{ JSON.stringify(m, null, 2) }}</pre>
              </div>
            </div>

            <!-- 普通消息 -->
            <div v-else class="msg-body">
              <Markdown v-if="messageText(m)" :source="messageText(m)" />
              <div v-for="(t, ti) in messageTools(m)" :key="ti" class="tool-call">
                <span class="tool-name">工具调用: {{ t.name || t.id || 'tool' }}</span>
                <pre v-if="t.input || t.arguments" class="tool-args">{{
                  typeof (t.input || t.arguments) === 'string' ? (t.input || t.arguments) : JSON.stringify(t.input || t.arguments, null, 2)
                }}</pre>
              </div>
              <pre v-if="!messageText(m) && !messageTools(m).length" class="msg-raw">{{ JSON.stringify(m, null, 2) }}</pre>
            </div>
          </div>
          <div v-if="isRunning" class="typing">正在输入…</div>
        </div>
        <div class="input-bar">
          <n-input
            v-model:value="input"
            placeholder="输入消息，回车发送…"
            @keyup.enter="send"
            :disabled="sending"
          />
          <n-button type="primary" :loading="sending" @click="send">发送</n-button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  height: 100%;
}

.sessions {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sessions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  font-weight: 600;
}

.head-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: #63a4ff;
  border-radius: 50%;
  animation: head-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes head-spin {
  to {
    transform: rotate(360deg);
  }
}

.sessions-search {
  padding: 0 12px 10px;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px 6px;
}

.session-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
}

.session-item:hover {
  background: #1f1f26;
}

.session-item.active {
  background: #26262f;
}

.session-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-title {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-sub {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.running-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #63a4ff;
  animation: pulse 1.2s infinite;
  flex-shrink: 0;
}

.unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e88080;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.msg {
  max-width: 720px;
  margin: 0 auto 16px;
}

.msg-role {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.msg-time {
  font-size: 11px;
  color: #666670;
}

.msg-body {
  background: #1a1a20;
  border-radius: 10px;
  padding: 12px 16px;
}

.msg.user .msg-body {
  background: #20262e;
}

.msg.toolResult .msg-body,
.msg.tool .msg-body {
  background: #1a1d1a;
}

.tool-call {
  margin-top: 8px;
  border: 1px solid #33333c;
  border-radius: 8px;
  padding: 8px 10px;
  background: #17171c;
}

.tool-msg {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #17171c;
  overflow: hidden;
}

.tool-msg.expanded {
  border-color: #3a3a44;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.tool-header:hover {
  background: #1e1e26;
}

.tool-chevron {
  color: #666670;
  font-size: 12px;
}

.tool-title {
  font-size: 12px;
  font-weight: 600;
  color: #7aa2f7;
}

.tool-summary {
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.tool-body {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}

.tool-body .msg-raw {
  margin: 0;
}

.tool-name {
  font-size: 12px;
  color: #7aa2f7;
  font-weight: 600;
}

.tool-args {
  margin: 6px 0 0;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-dim);
}

.msg-raw {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: var(--text-dim);
}

.typing {
  max-width: 720px;
  margin: 0 auto 16px;
  color: var(--text-dim);
  font-size: 13px;
}

.input-bar {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}
</style>
