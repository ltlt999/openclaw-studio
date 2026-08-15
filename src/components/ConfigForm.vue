<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { NCollapse, NCollapseItem, NInput, NInputNumber, NSwitch, NButton, NAlert, NInputGroup } from 'naive-ui'
import { fieldLabel } from '../i18n/fields'

const props = defineProps<{ value: any }>()
const emit = defineEmits<{ (e: 'save', json: string): void }>()

interface Field {
  path: string[]
  key: string
  value: any
  type: string
}

const data = ref<any>({})
const invalid = ref(false)
const saved = ref(false)

watch(
  () => props.value,
  (v) => {
    data.value = JSON.parse(JSON.stringify(v ?? {}))
  },
  { immediate: true, deep: true },
)

function flatten(obj: any, prefix: string[] = []): Field[] {
  if (obj === null || typeof obj !== 'object') {
    return [{ path: prefix, key: prefix[prefix.length - 1] || 'value', value: obj, type: obj === null ? 'null' : typeof obj }]
  }
  if (Array.isArray(obj)) {
    return [{ path: prefix, key: prefix[prefix.length - 1] || 'list', value: obj, type: 'array' }]
  }
  let out: Field[] = []
  for (const [k, v] of Object.entries(obj)) {
    out = out.concat(flatten(v, [...prefix, k]))
  }
  return out
}

const groups = computed(() => {
  const map = new Map<string, Field[]>()
  flatten(data.value).forEach((f) => {
    const top = f.path[0] || 'config'
    if (!map.has(top)) map.set(top, [])
    map.get(top)!.push(f)
  })
  return Array.from(map.entries()).map(([name, fields]) => ({ name, fields }))
})

function getValue(path: string[]) {
  return path.reduce((o: any, k) => (o == null ? undefined : o[k]), data.value)
}

function setValue(path: string[], v: any) {
  let o: any = data.value
  for (let i = 0; i < path.length - 1; i++) {
    if (o[path[i]] == null) o[path[i]] = {}
    o = o[path[i]]
  }
  o[path[path.length - 1]] = v
}

const arrayText = ref<Record<string, string>>({})
function getArrayText(path: string[]): string {
  const key = path.join('.')
  if (!(key in arrayText.value)) {
    arrayText.value[key] = JSON.stringify(getValue(path), null, 2)
  }
  return arrayText.value[key]
}
function setArrayText(path: string[], text: string) {
  arrayText.value[path.join('.')] = text
  try {
    setValue(path, JSON.parse(text))
    invalid.value = false
  } catch {
    invalid.value = true
  }
}

function formatLabel(f: Field): string {
  const segs = f.path.slice(1).map((s) => fieldLabel(s))
  return segs.join(' / ') || f.key
}

function save() {
  if (invalid.value) {
    emit('save', '')
    return
  }
  saved.value = true
  emit('save', JSON.stringify(data.value, null, 2))
}
</script>

<template>
  <div class="config-form">
    <n-alert v-if="invalid" type="error" :bordered="false" style="margin-bottom: 10px">
      数组字段 JSON 格式有误
    </n-alert>

    <n-collapse accordion :default-expanded-names="groups.length ? groups[0].name : undefined">
      <n-collapse-item v-for="g in groups" :key="g.name" :title="g.name" :name="g.name">
        <div v-for="f in g.fields" :key="f.path.join('.')" class="field">
          <label class="field-label">{{ formatLabel(f) }}</label>
          <div class="field-control">
            <n-switch
              v-if="f.type === 'boolean'"
              :value="getValue(f.path)"
              @update:value="(v: boolean) => setValue(f.path, v)"
            />
            <n-input-number
              v-else-if="f.type === 'number'"
              :value="getValue(f.path)"
              @update:value="(v: number | null) => setValue(f.path, v)"
              style="width: 200px"
            />
            <n-input
              v-else-if="f.type === 'string'"
              :value="getValue(f.path)"
              @update:value="(v: string) => setValue(f.path, v)"
            />
            <textarea
              v-else-if="f.type === 'array'"
              class="array-textarea"
              :value="getArrayText(f.path)"
              :spellcheck="false"
              @input="(e: any) => setArrayText(f.path, e.target.value)"
            ></textarea>
            <span v-else class="null-value">null</span>
          </div>
        </div>
      </n-collapse-item>
    </n-collapse>

    <div class="actions">
      <n-button type="primary" size="small" @click="save">保存配置</n-button>
    </div>
  </div>
</template>

<style scoped>
.config-form {
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
  flex: 0 0 45%;
  font-size: 13px;
  color: var(--text-dim);
  word-break: break-all;
  padding-top: 4px;
}
.field-control {
  flex: 1;
  min-width: 0;
}
.array-textarea {
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
.array-textarea:focus {
  border-color: #63a4ff;
}
.null-value {
  color: #666670;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
