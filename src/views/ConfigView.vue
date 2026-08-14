<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { NSpin, NButton, NAlert, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'
import ConfigEditor from '../components/ConfigEditor.vue'
import ConfigForm from '../components/ConfigForm.vue'

const conn = useConnectionStore()
const client = getClient()
const message = useMessage()

const raw = ref<string>('')
const hash = ref<string>('')
const loading = ref(false)
const saving = ref(false)
const error = ref<string>('')
const mode = ref<'form' | 'json'>('form')

const parsed = computed(() => {
  try {
    return JSON.parse(raw.value || '{}')
  } catch {
    return {}
  }
})

async function load() {
  if (!conn.connected) return
  loading.value = true
  error.value = ''
  try {
    const cfg = await client.configGet()
    raw.value = cfg?.raw ?? JSON.stringify(cfg?.config ?? {}, null, 2)
    hash.value = cfg?.hash ?? ''
  } catch (e: any) {
    error.value = e?.message || '加载配置失败'
  } finally {
    loading.value = false
  }
}

async function save(json: string) {
  if (!json) return
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    if (!hash.value) throw new Error('无法获取配置版本')
    await client.configApply(json, hash.value)
    message.success('配置已保存')
    await load()
  } catch (e: any) {
    error.value = e?.message || '保存失败'
    message.error(error.value)
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
      <h2>配置</h2>
      <div class="mode-switch">
        <n-button
          size="small"
          :type="mode === 'form' ? 'primary' : 'default'"
          @click="mode = 'form'"
        >表单模式</n-button>
        <n-button
          size="small"
          :type="mode === 'json' ? 'primary' : 'default'"
          @click="mode = 'json'"
        >JSON 模式</n-button>
      </div>
      <span v-if="mode === 'form'" class="hint">图形化编辑常用配置；复杂字段会以 JSON 显示</span>
      <span v-else class="hint">JSON 编辑，保存时打码密钥会被保留</span>
      <div class="spacer"></div>
      <n-button size="small" :loading="loading" @click="load">刷新</n-button>
    </div>

    <n-alert v-if="error" type="error" :bordered="false" style="margin-bottom: 12px">
      {{ error }}
    </n-alert>

    <n-spin :show="loading">
      <ConfigForm v-if="mode === 'form' && raw" :value="parsed" @save="save" />
      <ConfigEditor v-else-if="raw" :value="raw" @save="save" />
    </n-spin>
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
  align-items: center;
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
.mode-switch {
  display: flex;
  gap: 6px;
}
.spacer {
  flex: 1;
}
</style>
