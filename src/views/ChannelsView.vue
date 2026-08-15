<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NSpin, NEmpty, NTag, NButton, NModal, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'
import SchemaForm from '../components/SchemaForm.vue'
import ConfigEditor from '../components/ConfigEditor.vue'

interface ChannelItem {
  id: string
  label: string
  configured: boolean
}

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  whatsapp: 'WhatsApp',
  imessage: 'iMessage',
  signal: 'Signal',
  matrix: 'Matrix',
  msteams: 'Microsoft Teams',
  googlechat: 'Google Chat',
  feishu: '飞书',
  qqbot: 'QQBot',
  zalo: 'Zalo',
  line: 'LINE',
  irc: 'IRC',
  nostr: 'Nostr',
  twitch: 'Twitch',
  mattermost: 'Mattermost',
  nextcloud: 'Nextcloud Talk',
  sms: 'SMS',
  clickclack: 'ClickClack',
  raft: 'Raft',
  tlon: 'Tlon',
}

const conn = useConnectionStore()
const client = getClient()
const message = useMessage()

const items = ref<ChannelItem[]>([])
const loading = ref(false)

// 配置编辑
const editingChannel = ref<string | null>(null)
const showConfig = ref(false)
const channelConfig = ref<any>({})
const channelSchema = ref<any>(null)
const hash = ref<string>('')
const saving = ref(false)

function channelLabel(id: string, labels: Record<string, string>): string {
  return labels[id] || CHANNEL_LABELS[id] || id
}

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.channelsStatus()
    const labels: Record<string, string> = data?.channelLabels ?? {}
    // 已知渠道：优先 schema 枚举（含未配置的），否则用 channelOrder
    let known: string[] = data?.channelOrder ?? []
    try {
      const schema = await client.configSchema()
      const props = schema?.schema?.properties?.channels?.properties ?? {}
      const ids = Object.keys(props)
      if (ids.length) known = ids
    } catch (e) {
      console.error(e)
    }
    // 已配置的渠道
    let configured: Record<string, any> = {}
    try {
      const cfg = await client.configGet()
      const parsed = JSON.parse(cfg?.raw || '{}')
      configured = parsed?.channels ?? {}
    } catch (e) {
      console.error(e)
    }
    items.value = known.map((id: string) => ({
      id,
      label: channelLabel(id, labels),
      configured: Boolean(configured[id]),
    }))
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function openConfig(channelId: string) {
  editingChannel.value = channelId
  showConfig.value = true
  channelConfig.value = {}
  channelSchema.value = null
  try {
    const cfg = await client.configGet()
    hash.value = cfg?.hash ?? ''
    const parsed = JSON.parse(cfg?.raw || '{}')
    channelConfig.value = parsed?.channels?.[channelId] ?? {}
    // 加载该渠道的 schema 用于表单生成
    try {
      const schema = await client.configSchema()
      channelSchema.value = schema?.schema?.properties?.channels?.properties?.[channelId] ?? null
    } catch (e) {
      console.error(e)
    }
  } catch (e) {
    console.error(e)
  }
}

async function saveChannel(json: string) {
  if (!editingChannel.value) return
  saving.value = true
  try {
    if (!hash.value) throw new Error('无法获取配置版本')
    const parsed = JSON.parse(json)
    const raw = JSON.stringify({ channels: { [editingChannel.value]: parsed } })
    await client.configPatch(raw, hash.value)
    message.success(`已保存渠道配置：${editingChannel.value}`)
    showConfig.value = false
    editingChannel.value = null
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() =>
  watch(
    () => conn.status,
    (s) => {
      if (s === 'connected') load()
    },
    { immediate: true },
  ),
)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>渠道</h2>
      <span class="hint">点击任意渠道的「配置」即可添加或修改</span>
    </div>

    <n-spin :show="loading">
      <div v-if="items.length" class="cards">
        <div v-for="c in items" :key="c.id" class="card">
          <div class="card-title-row">
            <span class="card-title">{{ c.label }}</span>
            <n-tag :type="c.configured ? 'success' : 'default'" size="small" round>
              {{ c.configured ? '已配置' : '未配置' }}
            </n-tag>
          </div>
          <div class="card-sub">{{ c.id }}</div>
          <n-button size="small" type="primary" quaternary @click="openConfig(c.id)">
            {{ c.configured ? '修改' : '添加' }}
          </n-button>
        </div>
      </div>
      <n-empty v-else-if="!loading" description="暂无渠道数据" />
    </n-spin>

    <n-modal v-model:show="showConfig" preset="card" style="width: 600px" :title="`渠道配置：${editingChannel}`">
      <div v-if="editingChannel" class="channel-tip">
        填表格即可，必填项带 <span class="req">*</span>。复杂字段展开为 JSON。
      </div>
      <SchemaForm v-if="channelSchema" :schema="channelSchema" :value="channelConfig" @save="saveChannel" />
      <ConfigEditor v-else :value="channelConfig" @save="saveChannel" />
    </n-modal>
  </div>
</template>

<style scoped>
.page {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}
.page-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.page-head h2 {
  margin: 0;
  font-size: 18px;
}
.hint {
  font-size: 12px;
  color: var(--text-dim);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.card {
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-title {
  font-weight: 600;
}
.card-sub {
  font-size: 12px;
  color: var(--text-dim);
  margin: 6px 0 10px;
}
.channel-tip {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.req {
  color: #e88080;
}
</style>
