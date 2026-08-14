<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NSpin, NEmpty } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

const conn = useConnectionStore()
const client = getClient()
const usageText = ref('')
const loading = ref(false)

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    const data = await client.usage()
    usageText.value = JSON.stringify(data, null, 2)
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
      <h2>用量</h2>
    </div>
    <n-spin :show="loading">
      <pre v-if="usageText" class="json">{{ usageText }}</pre>
      <n-empty v-else-if="!loading" description="暂无用量数据" />
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
.json {
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
