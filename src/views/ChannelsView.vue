<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NSpin, NEmpty, NTag } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

interface ChannelItem {
  id: string
  label: string
  accountCount: number
  raw?: any
}

const conn = useConnectionStore()
const client = getClient()
const items = ref<ChannelItem[]>([])
const loading = ref(false)

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.channelsStatus()
    const order: string[] = data?.channelOrder ?? []
    const labels: Record<string, string> = data?.channelLabels ?? {}
    const accounts: Record<string, any[]> = data?.channelAccounts ?? {}
    const channels: Record<string, any> = data?.channels ?? {}
    items.value = order.map((id: string) => ({
      id,
      label: labels[id] || id,
      accountCount: accounts[id]?.length ?? 0,
      raw: channels[id],
    }))
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
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
          <div class="card-sub">
            {{ c.accountCount > 0 ? `${c.accountCount} 个账号` : c.id }}
          </div>
        </div>
      </div>
      <n-empty v-else-if="!loading" description="暂无渠道数据" />
    </n-spin>
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
  margin-top: 4px;
}
</style>
