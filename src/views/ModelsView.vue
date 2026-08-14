<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NButton, NEmpty, NTag, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

const conn = useConnectionStore()
const client = getClient()
const message = useMessage()

const models = ref<any[]>([])
const currentModel = ref<string>('')
const loading = ref(false)
const switching = ref(false)

function fullName(m: any): string {
  return m?.provider && m?.id ? `${m.provider}/${m.id}` : m?.id || m?.name || ''
}

function isCurrent(m: any): boolean {
  return fullName(m) === currentModel.value || m?.id === currentModel.value
}

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.modelsList()
    models.value = Array.isArray(data) ? data : data?.models ?? []
    try {
      const cfg = await client.configGet()
      currentModel.value = cfg?.resolved?.agents?.defaults?.model?.primary ?? ''
    } catch (e) {
      console.error(e)
    }
  } catch (e: any) {
    if (e?.message) message.error(e.message)
  } finally {
    loading.value = false
  }
}

async function setDefault(modelId: string) {
  if (switching.value) return
  switching.value = true
  try {
    const cfg = await client.configGet()
    const hash = cfg?.hash
    if (!hash) throw new Error('无法获取配置版本')
    const patch = JSON.stringify({ agents: { defaults: { model: { primary: modelId } } } })
    await client.configPatch(patch, hash)
    currentModel.value = modelId
    message.success(`已切换默认模型：${modelId}`)
  } catch (e: any) {
    message.error(e?.message || '切换失败')
  } finally {
    switching.value = false
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
      <h2>模型</h2>
      <span v-if="currentModel" class="current">
        当前默认：<b>{{ currentModel }}</b>
      </span>
    </div>

    <div v-if="models.length" class="cards">
      <div
        v-for="(m, i) in models"
        :key="i"
        class="card"
        :class="{ active: isCurrent(m) }"
      >
        <div class="card-top">
          <span class="card-title">{{ m.name || m.id }}</span>
          <n-tag v-if="isCurrent(m)" type="success" size="small" round>当前</n-tag>
        </div>
        <div class="card-sub">{{ m.provider }} · {{ m.id }}</div>
        <n-button
          v-if="!isCurrent(m)"
          size="small"
          type="primary"
          quaternary
          :loading="switching"
          @click="setDefault(fullName(m))"
        >
          设为默认
        </n-button>
      </div>
    </div>
    <n-empty v-else-if="!loading" description="暂无模型数据" />
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
  gap: 16px;
  margin-bottom: 16px;
}
.page-head h2 {
  margin: 0;
  font-size: 18px;
}
.current {
  font-size: 13px;
  color: var(--text-dim);
}
.current b {
  color: #63a4ff;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.card {
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  transition: border-color 0.2s;
}
.card.active {
  border-color: #63a4ff;
}
.card-top {
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
