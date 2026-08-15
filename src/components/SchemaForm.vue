<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NInput, NInputNumber, NSwitch, NSelect, NButton, NAlert } from 'naive-ui'
import { fieldLabel } from '../i18n/fields'

const props = defineProps<{ schema: any; value: any }>()
const emit = defineEmits<{ (e: 'save', json: string): void }>()

const data = ref<any>({})
watch(
  () => props.value,
  (v) => {
    data.value = JSON.parse(JSON.stringify(v ?? {}))
  },
  { immediate: true, deep: true },
)

function isComplex(s: any): boolean {
  if (s?.type === 'object' || s?.type === 'array') return true
  if (Array.isArray(s?.anyOf) && s.anyOf.some((x: any) => x.type === 'object' || x.type === 'array')) return true
  return false
}

function enumValues(s: any): string[] {
  if (Array.isArray(s?.enum)) return s.enum
  if (Array.isArray(s?.anyOf)) {
    for (const x of s.anyOf) if (Array.isArray(x?.enum)) return x.enum
  }
  return []
}

function isPassword(key: string): boolean {
  return /token|secret|key|password|auth/i.test(key)
}

function get(key: string): any {
  return data.value?.[key]
}
function set(key: string, v: any) {
  data.value[key] = v
}

const requiredKeys = computed(() => new Set<string>(props.schema?.required ?? []))

const fields = computed(() => {
  const propsSchema = props.schema?.properties ?? {}
  return Object.entries(propsSchema)
    .filter(([, s]) => !isComplex(s))
    .map(([key, s]: [string, any]) => {
      const ev = enumValues(s)
      return {
        key,
        label: fieldLabel(key),
        required: requiredKeys.value.has(key),
        type:
          s.type === 'boolean' ? 'boolean'
          : s.type === 'number' || s.type === 'integer' ? 'number'
          : ev.length ? 'enum'
          : 'string',
        options: ev,
        password: isPassword(key),
      }
    })
})

const complexFields = computed(() => {
  const propsSchema = props.schema?.properties ?? {}
  return Object.entries(propsSchema)
    .filter(([, s]) => isComplex(s))
    .map(([key]) => ({ key, label: fieldLabel(key) }))
})

const complexText = ref<Record<string, string>>({})
function getComplexText(key: string): string {
  if (!(key in complexText.value)) {
    const v = data.value?.[key]
    complexText.value[key] = v === undefined ? '{}' : JSON.stringify(v, null, 2)
  }
  return complexText.value[key]
}
function setComplexText(key: string, text: string) {
  complexText.value[key] = text
  try {
    data.value[key] = JSON.parse(text)
  } catch {
    // 等待保存时校验
  }
}

const invalid = ref(false)
function save() {
  for (const f of complexFields.value) {
    try {
      JSON.parse(getComplexText(f.key))
    } catch {
      invalid.value = true
      return
    }
  }
  invalid.value = false
  emit('save', JSON.stringify(data.value, null, 2))
}
</script>

<template>
  <div class="schema-form">
    <n-alert v-if="invalid" type="error" :bordered="false" style="margin-bottom: 10px">
      复杂字段 JSON 格式有误，请修正后再保存
    </n-alert>

    <div v-for="f in fields" :key="f.key" class="field">
      <label class="field-label">
        {{ f.label }}
        <span v-if="f.required" class="req">*</span>
      </label>
      <div class="field-control">
        <n-switch
          v-if="f.type === 'boolean'"
          :value="get(f.key)"
          @update:value="(v: boolean) => set(f.key, v)"
        />
        <n-select
          v-else-if="f.type === 'enum'"
          :value="get(f.key)"
          :options="f.options.map((o: string) => ({ label: o, value: o }))"
          placeholder="选择…"
          @update:value="(v: string) => set(f.key, v)"
        />
        <n-input-number
          v-else-if="f.type === 'number'"
          :value="get(f.key)"
          @update:value="(v: number | null) => set(f.key, v)"
        />
        <n-input
          v-else
          :value="get(f.key) ?? ''"
          :type="f.password ? 'password' : 'text'"
          :show-password-on="f.password ? 'click' : undefined"
          :placeholder="f.label"
          @update:value="(v: string) => set(f.key, v)"
        />
      </div>
    </div>

    <div v-for="f in complexFields" :key="f.key" class="field">
      <label class="field-label">{{ f.label }}</label>
      <div class="field-control">
        <textarea
          class="complex-textarea"
          :value="getComplexText(f.key)"
          :spellcheck="false"
          @input="(e: any) => setComplexText(f.key, e.target.value)"
        ></textarea>
      </div>
    </div>

    <div class="actions">
      <n-button type="primary" size="small" @click="save">保存渠道</n-button>
    </div>
  </div>
</template>

<style scoped>
.schema-form {
  width: 100%;
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
}
.field:last-child {
  border-bottom: none;
}
.field-label {
  flex: 0 0 40%;
  font-size: 13px;
  color: var(--text-dim);
  word-break: break-all;
  padding-top: 4px;
}
.req {
  color: #e88080;
}
.field-control {
  flex: 1;
  min-width: 0;
}
.complex-textarea {
  width: 100%;
  min-height: 80px;
  background: #14141a;
  color: #d6d6dc;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
}
.complex-textarea:focus {
  border-color: #63a4ff;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
