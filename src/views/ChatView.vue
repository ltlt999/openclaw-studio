<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { NSpin, NEmpty, NInput, NButton } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient, getConnection } from '../rpc/client'
import Markdown from '../components/Markdown.vue'
import type { Session } from '../rpc/types'

const conn = useConnectionStore()
const client = getClient()
const connection = getConnection()

const sessions = ref<Session[]>([])
const loading = ref(false)
const activeKey = ref<string | null>(null)
const messages = ref<any[]>([])
const input = ref('')
const sending = ref(false)

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
    const data = await client.chatHistory(key)
    messages.value = Array.isArray(data) ? data : data?.messages ?? []
  } catch (e) {
    console.error(e)
  }
}

async function selectSession(s: Session) {
  activeKey.value = s.key
  await loadHistory(s.key)
}

async function send() {
  const text = input.value.trim()
  if (!text || !activeKey.value || sending.value) return
  sending.value = true
  input.value = ''
  messages.value.push({ id: `local-${Date.now()}`, role: 'user', text })
  try {
    await client.sessionsSend(activeKey.value, text)
    await loadHistory(activeKey.value)
  } catch (e) {
    console.error(e)
  } finally {
    sending.value = false
  }
}

const offSessions = connection.on('sessions.changed', () => loadSessions())
const offMessage = connection.on('session.message', (p: any) => {
  if (p && (p.sessionKey === activeKey.value || p.key === activeKey.value)) {
    loadHistory(activeKey.value)
  }
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
})
</script>

<template>
  <div class="chat">
    <div class="sessions">
      <div class="sessions-head">
        <span>会话</span>
        <n-spin :show="loading" size="small" />
      </div>
      <div class="sessions-list">
        <div
          v-for="s in sessions"
          :key="s.key"
          class="session-item"
          :class="{ active: s.key === activeKey }"
          @click="selectSession(s)"
        >
          <div class="session-title">{{ s.title || s.key }}</div>
          <div class="session-sub">{{ s.channel || s.kind || '' }}</div>
        </div>
        <n-empty
          v-if="!loading && !sessions.length"
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
          <div v-for="m in messages" :key="m.id" class="msg" :class="m.role">
            <div class="msg-role">
              {{ m.role === 'user' ? '我' : m.role === 'assistant' ? '助手' : m.role || '消息' }}
            </div>
            <div class="msg-body">
              <Markdown v-if="m.text || m.content" :source="String(m.text || m.content || '')" />
              <pre v-else class="msg-raw">{{ JSON.stringify(m, null, 2) }}</pre>
            </div>
          </div>
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
  padding: 14px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
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
}

.msg-body {
  background: #1a1a20;
  border-radius: 10px;
  padding: 12px 16px;
}

.msg.user .msg-body {
  background: #20262e;
}

.msg-raw {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: var(--text-dim);
}

.input-bar {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}
</style>
