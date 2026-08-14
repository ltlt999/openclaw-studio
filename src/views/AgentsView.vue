<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NSpin, NEmpty, NTag } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

const conn = useConnectionStore()
const client = getClient()
const agents = ref<any[]>([])
const defaultId = ref<string | null>(null)
const loading = ref(false)

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.agentsList()
    agents.value = data?.agents ?? (Array.isArray(data) ? data : [])
    defaultId.value = data?.defaultId ?? null
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
      <h2>Agents</h2>
    </div>
    <n-spin :show="loading">
      <div v-if="agents.length" class="cards">
        <div v-for="(a, i) in agents" :key="i" class="card">
          <div class="card-title-row">
            <span class="card-title">
              {{ a.emoji ? a.emoji + ' ' : '' }}{{ a.name || a.id || a.agentId }}
            </span>
            <n-tag v-if="a.id === defaultId || a.agentId === defaultId" type="info" size="small" round>
              默认
            </n-tag>
          </div>
          <div class="card-sub">{{ a.model || a.workspace || '' }}</div>
        </div>
      </div>
      <n-empty v-else-if="!loading" description="暂无 Agent" />
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
