<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import {
  NButton, NModal, NForm, NFormItem, NInput, NSelect, NEmpty, NTag,
  useMessage, useDialog,
} from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'

const conn = useConnectionStore()
const client = getClient()
const message = useMessage()
const dialog = useDialog()

const models = ref<any[]>([])
const currentModel = ref<string>('')
const providers = ref<Record<string, any>>({})
const loading = ref(false)
const switching = ref(false)

// 添加/编辑供应商对话框
const showAdd = ref(false)
const editingId = ref<string | null>(null)
const savingProvider = ref(false)
const fetchingModels = ref(false)
const providerForm = ref({ id: '', baseUrl: '', api: 'openai-completions', apiKey: '' })
const fetchedModels = ref<any[]>([])
const selectedModels = ref<string[]>([])
const customModels = ref<{ id: string; name: string }[]>([])

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
    const cfg = await client.configGet()
    currentModel.value = cfg?.resolved?.agents?.defaults?.model?.primary ?? ''
    providers.value = cfg?.resolved?.models?.providers ?? {}
    // 可用模型 = 各供应商实际配置的模型（与供应商卡片一致）
    models.value = Object.entries(providers.value).flatMap(([providerId, p]) =>
      (p?.models || []).map((m: any) => ({ ...m, provider: providerId })),
    )
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
  if (!providerForm.value.baseUrl) {
    message.warning('请先填写 Base URL')
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
        providerId: editingId.value || undefined,
      }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '获取失败')
    fetchedModels.value = data.models
    // 预选：已在自定义模型里存在的模型保持选中；否则新供应商全选
    const existingIds = new Set(customModels.value.map((m) => m.id))
    const matching = fetchedModels.value.filter((m: any) => existingIds.has(m.id))
    selectedModels.value = matching.length
      ? matching.map((m: any) => m.id)
      : fetchedModels.value.map((m: any) => m.id)
    message.success(`获取到 ${data.models.length} 个可用模型，可勾选需要保留的`)
  } catch (e: any) {
    message.error(e?.message || '获取失败')
  } finally {
    fetchingModels.value = false
  }
}

function addCustomModel() {
  customModels.value.push({ id: '', name: '' })
}
function removeCustomModel(i: number) {
  customModels.value.splice(i, 1)
}

function openAdd() {
  editingId.value = null
  resetForm()
  showAdd.value = true
}

async function openEdit(id: string) {
  editingId.value = id
  const p = providers.value[id] || {}
  providerForm.value = {
    id,
    baseUrl: p.baseUrl || '',
    api: p.api || 'openai-completions',
    apiKey: '', // 密钥不回显，留空表示保持不变
  }
  fetchedModels.value = []
  selectedModels.value = []
  // 已配置的模型放到「自定义模型」，可编辑/保留
  customModels.value = (p.models || []).map((m: any) => ({ id: m.id, name: m.name || m.id }))
  showAdd.value = true
}

function deleteProvider(id: string) {
  dialog.warning({
    title: '删除供应商',
    content: `确定删除供应商「${id}」吗？其模型将不再可用。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const cfg = await client.configGet()
        const hash = cfg?.hash
        const parsed = JSON.parse(cfg?.raw || '{}')
        if (parsed?.models?.providers) delete parsed.models.providers[id]
        await client.configApply(JSON.stringify(parsed, null, 2), hash)
        message.success(`已删除供应商 ${id}`)
        await load()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}

async function saveProvider() {
  const id = editingId.value || providerForm.value.id
  const { baseUrl, api, apiKey } = providerForm.value
  if (!id || !baseUrl) {
    message.warning('请填写供应商 ID 和 Base URL')
    return
  }
  if (!editingId.value && !apiKey) {
    message.warning('请填写 API Key')
    return
  }
  if (!editingId.value && !/^[a-z0-9-]+$/.test(id)) {
    message.warning('供应商 ID 只能用小写字母、数字和连字符')
    return
  }
  savingProvider.value = true
  try {
    const cfg = await client.configGet()
    const hash = cfg?.hash
    if (!hash) throw new Error('无法获取配置版本')
    const models = [
      ...fetchedModels.value
        .filter((m: any) => selectedModels.value.includes(m.id))
        .map((m: any) => ({ id: m.id, name: m.name || m.id })),
      ...customModels.value
        .filter((m) => m.id.trim())
        .map((m) => ({ id: m.id.trim(), name: m.name.trim() || m.id.trim() })),
    ]
    const provider: Record<string, any> = { baseUrl, api }
    if (apiKey) provider.apiKey = apiKey // 编辑时留空则保留原密钥
    if (models.length) provider.models = models
    const raw = JSON.stringify({ models: { providers: { [id]: provider } } })
    await client.configPatch(raw, hash)
    message.success(`已保存供应商 ${id}`)
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
  customModels.value = []
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
      <n-button size="small" type="primary" @click="openAdd">添加供应商</n-button>
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
          <div class="provider-actions">
            <n-button size="tiny" type="primary" quaternary @click="openEdit(id)">编辑</n-button>
            <n-button size="tiny" type="error" quaternary @click="deleteProvider(id)">删除</n-button>
          </div>
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

    <!-- 添加/编辑供应商对话框 -->
    <n-modal v-model:show="showAdd" preset="card" style="width: 520px" :title="editingId ? `编辑供应商：${editingId}` : '添加模型供应商'">
      <n-form label-placement="top">
        <n-form-item label="供应商 ID（如 my-openai）">
          <n-input v-model:value="providerForm.id" placeholder="小写字母/数字/连字符" :disabled="editingId !== null" />
        </n-form-item>
        <n-form-item label="API 类型">
          <n-select v-model:value="providerForm.api" :options="apiOptions" />
        </n-form-item>
        <n-form-item label="Base URL（如 https://api.openai.com/v1）">
          <n-input v-model:value="providerForm.baseUrl" placeholder="https://..." />
        </n-form-item>
        <n-form-item :label="editingId ? 'API Key（留空保持不变）' : 'API Key'">
          <n-input
            v-model:value="providerForm.apiKey"
            type="password"
            show-password-on="click"
            :placeholder="editingId ? '已配置密钥，留空保持不变' : 'sk-...'"
          />
        </n-form-item>
        <n-form-item label="模型列表">
          <div class="model-list-wrap">
            <div class="model-fetch-row">
              <n-button size="small" :loading="fetchingModels" @click="fetchModels">
                获取模型
              </n-button>
              <span class="fetch-hint">从 {{ providerForm.baseUrl || '供应商地址' }}/models 拉取全部可用模型</span>
            </div>
            <div v-if="fetchedModels.length" class="model-grid">
              <div
                v-for="m in fetchedModels"
                :key="m.id"
                class="model-chip"
                :class="{ selected: selectedModels.includes(m.id) }"
                @click="toggleModel(m.id)"
              >
                <span class="model-chip-check">{{ selectedModels.includes(m.id) ? '✓' : '' }}</span>
                <div class="model-chip-body">
                  <div class="model-chip-name">{{ m.name || m.id }}</div>
                  <div class="model-chip-id">{{ m.id }}</div>
                </div>
              </div>
            </div>

            <!-- 自定义模型 -->
            <div class="custom-models">
              <div class="custom-models-head">
                <span>自定义模型</span>
                <n-button size="tiny" type="primary" quaternary @click="addCustomModel">添加</n-button>
              </div>
              <div v-for="(cm, i) in customModels" :key="i" class="custom-model-row">
                <n-input v-model:value="cm.id" size="small" placeholder="模型 ID" style="flex: 1.4" />
                <n-input v-model:value="cm.name" size="small" placeholder="名称（可选）" style="flex: 1" />
                <n-button size="tiny" type="error" quaternary @click="removeCustomModel(i)">删除</n-button>
              </div>
              <div v-if="!customModels.length" class="custom-empty">
                暂无自定义模型，点击「添加」手动增加
              </div>
            </div>
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
.provider-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.model-list-wrap {
  width: 100%;
}
.model-fetch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.fetch-hint {
  font-size: 12px;
  color: var(--text-dim);
}
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  width: 100%;
}
.model-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #17171c;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.model-chip:hover {
  border-color: #4a4a55;
}
.model-chip.selected {
  border-color: #63a4ff;
  background: #1a2333;
}
.model-chip-check {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: 1px solid #4a4a55;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
}
.model-chip.selected .model-chip-check {
  background: #63a4ff;
  border-color: #63a4ff;
}
.model-chip-body {
  min-width: 0;
}
.model-chip-name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-chip-id {
  font-size: 11px;
  color: #666670;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.custom-models {
  margin-top: 14px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.custom-models-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
}
.custom-model-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.custom-empty {
  font-size: 12px;
  color: #666670;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
</style>
