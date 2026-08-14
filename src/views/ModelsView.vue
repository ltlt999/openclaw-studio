<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import {
  NButton, NModal, NForm, NFormItem, NInput, NSelect, NEmpty, NTag,
  useMessage, NCheckbox,
} from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

const conn = useConnectionStore()
const client = getClient()
const message = useMessage()

const models = ref<any[]>([])
const currentModel = ref<string>('')
const providers = ref<Record<string, any>>({})
const loading = ref(false)
const switching = ref(false)

// 添加供应商对话框
const showAdd = ref(false)
const savingProvider = ref(false)
const fetchingModels = ref(false)
const providerForm = ref({ id: '', baseUrl: '', api: 'openai-completions', apiKey: '' })
const fetchedModels = ref<any[]>([])
const selectedModels = ref<string[]>([])

const apiOptions = [
  { label: 'OpenAI 兼容', value: 'openai-completions' },
  { label: 'Anthropic', value: 'anthropic-messages' },
]

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
      providers.value = cfg?.resolved?.models?.providers ?? {}
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

async function fetchModels() {
  if (!providerForm.value.baseUrl || !providerForm.value.apiKey) {
    message.warning('请先填写 Base URL 和 API Key')
    return
  }
  fetchingModels.value = true
  try {
    const res = await fetch('/api/fetch-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: providerForm.value.baseUrl,
        apiKey: providerForm.value.apiKey,
        apiType: providerForm.value.api,
      }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '获取失败')
    fetchedModels.value = data.models
    selectedModels.value = data.models.map((m: any) => m.id)
    message.success(`获取到 ${data.models.length} 个模型`)
  } catch (e: any) {
    message.error(e?.message || '获取模型失败')
  } finally {
    fetchingModels.value = false
  }
}

async function saveProvider() {
  const { id, baseUrl, api, apiKey } = providerForm.value
  if (!id || !baseUrl || !apiKey) {
    message.warning('请填写供应商 ID、Base URL 和 API Key')
    return
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    message.warning('供应商 ID 只能用小写字母、数字和连字符')
    return
  }
  savingProvider.value = true
  try {
    const cfg = await client.configGet()
    const hash = cfg?.hash
    if (!hash) throw new Error('无法获取配置版本')
    const models = fetchedModels.value
      .filter((m: any) => selectedModels.value.includes(m.id))
      .map((m: any) => ({ id: m.id, name: m.name || m.id }))
    const provider: Record<string, any> = { baseUrl, api, apiKey }
    if (models.length) provider.models = models
    const raw = JSON.stringify({ models: { providers: { [id]: provider } } })
    await client.configPatch(raw, hash)
    message.success(`已添加供应商 ${id}`)
    showAdd.value = false
    resetForm()
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    savingProvider.value = false
  }
}

function resetForm() {
  providerForm.value = { id: '', baseUrl: '', api: 'openai-completions', apiKey: '' }
  fetchedModels.value = []
  selectedModels.value = []
}

function toggleModel(id: string) {
  if (selectedModels.value.includes(id)) {
    selectedModels.value = selectedModels.value.filter((m) => m !== id)
  } else {
    selectedModels.value = [...selectedModels.value, id]
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
      <div class="spacer"></div>
      <n-button size="small" type="primary" @click="showAdd = true">添加供应商</n-button>
    </div>

    <!-- 已配置的供应商 -->
    <div v-if="Object.keys(providers).length" class="providers">
      <div class="section-title">已配置的供应商</div>
      <div class="cards">
        <div v-for="(p, id) in providers" :key="id" class="provider-card">
          <div class="card-top">
            <span class="card-title">{{ id }}</span>
            <n-tag size="small" round>{{ p.api }}</n-tag>
          </div>
          <div class="card-sub">{{ p.baseUrl }}</div>
          <div class="card-sub">{{ (p.models || []).length }} 个模型</div>
        </div>
      </div>
    </div>

    <!-- 可用模型 -->
    <div class="section-title" style="margin-top: 20px">可用模型</div>
    <div v-if="models.length" class="cards">
      <div v-for="(m, i) in models" :key="i" class="card" :class="{ active: isCurrent(m) }">
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

    <!-- 添加供应商对话框 -->
    <n-modal v-model:show="showAdd" preset="card" title="添加模型供应商" style="width: 520px">
      <n-form label-placement="top">
        <n-form-item label="供应商 ID（如 my-openai）">
          <n-input v-model:value="providerForm.id" placeholder="小写字母/数字/连字符" />
        </n-form-item>
        <n-form-item label="API 类型">
          <n-select v-model:value="providerForm.api" :options="apiOptions" />
        </n-form-item>
        <n-form-item label="Base URL（如 https://api.openai.com/v1）">
          <n-input v-model:value="providerForm.baseUrl" placeholder="https://..." />
        </n-form-item>
        <n-form-item label="API Key">
          <n-input v-model:value="providerForm.apiKey" type="password" show-password-on="click" placeholder="sk-..." />
        </n-form-item>
        <n-form-item label="模型列表">
          <n-button size="small" :loading="fetchingModels" @click="fetchModels">
            获取模型
          </n-button>
          <div v-if="fetchedModels.length" class="model-pick">
            <label v-for="m in fetchedModels" :key="m.id" class="model-option">
              <n-checkbox :checked="selectedModels.includes(m.id)" @update:checked="() => toggleModel(m.id)" />
              <span>{{ m.name || m.id }}</span>
              <span class="model-id">{{ m.id }}</span>
            </label>
          </div>
        </n-form-item>
        <div class="modal-actions">
          <n-button @click="showAdd = false">取消</n-button>
          <n-button type="primary" :loading="savingProvider" @click="saveProvider">保存供应商</n-button>
        </div>
      </n-form>
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
  align-items: center;
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
.spacer {
  flex: 1;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.card,
.provider-card {
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
  word-break: break-all;
}
.model-pick {
  margin-top: 10px;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
}
.model-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
}
.model-id {
  font-size: 11px;
  color: #666670;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
</style>
