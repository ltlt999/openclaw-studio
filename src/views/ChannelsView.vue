<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NSpin, NEmpty, NTag } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

const conn = useConnectionStore()
const client = getClient()
const channels = ref<any[]>([])
const loading = ref(false)

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.channelsStatus()
    const raw = Array.isArray(data) ? data : data?.channels ?? data ?? []
    channels.value = raw
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
      <div v-if="channels.length" class="cards">
        <div v-for="(c, i) in channels" :key="i" class="card">
          <div class="card-title">{{ c.name || c.channel || c.id }}</div>
          <div class="card-sub">{{ c.status || c.state || '' }}</div>
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
.card-title {
  font-weight: 600;
}
.card-sub {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 4px;
}
</style>
