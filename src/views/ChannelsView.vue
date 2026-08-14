<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NSpin, NEmpty, NTag, NButton, NModal, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'
import ConfigEditor from '../components/ConfigEditor.vue'

interface ChannelItem {
  id: string
  label: string
  accountCount: number
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
const hash = ref<string>('')
const saving = ref(false)

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.channelsStatus()
    const order: string[] = data?.channelOrder ?? []
    const labels: Record<string, string> = data?.channelLabels ?? {}
    const accounts: Record<string, any[]> = data?.channelAccounts ?? {}
    items.value = order.map((id: string) => ({
      id,
      label: labels[id] || id,
      accountCount: accounts[id]?.length ?? 0,
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
  try {
    const cfg = await client.configGet()
    hash.value = cfg?.hash ?? ''
    const parsed = JSON.parse(cfg?.raw || '{}')
    channelConfig.value = parsed?.channels?.[channelId] ?? {}
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
    </div>

    <n-spin :show="loading">
      <div v-if="items.length" class="cards">
        <div v-for="c in items" :key="c.id" class="card">
          <div class="card-title-row">
            <span class="card-title">{{ c.label }}</span>
            <n-tag :type="c.accountCount > 0 ? 'success' : 'default'" size="small" round>
              {{ c.accountCount > 0 ? '已配置' : '未配置' }}
            </n-tag>
          </div>
          <div class="card-sub">{{ c.id }}</div>
          <n-button size="small" type="primary" quaternary @click="openConfig(c.id)">
            配置
          </n-button>
        </div>
      </div>
      <n-empty v-else-if="!loading" description="暂无渠道数据" />
    </n-spin>

    <n-modal v-model:show="showConfig" preset="card" style="width: 560px" :title="`渠道配置：${editingChannel}`">
      <ConfigEditor :value="channelConfig" @save="saveChannel" />
    </n-modal>
  </div>
</template>

<style scoped>
.page {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}
.page-head h2 {
  margin: 0 0 16px;
  font-size: 18px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
</style>
