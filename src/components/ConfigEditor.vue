<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NAlert } from 'naive-ui'

const props = defineProps<{
  value: any
  readonly?: boolean
}>()

const emit = defineEmits<{ (e: 'save', json: string): void }>()

const text = ref('')
const invalid = ref(false)
const saved = ref(false)

watch(
  () => props.value,
  (v) => {
    text.value = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  },
  { immediate: true },
)

function format() {
  try {
    text.value = JSON.stringify(JSON.parse(text.value), null, 2)
    invalid.value = false
  } catch {
    invalid.value = true
  }
}

function save() {
  try {
    JSON.parse(text.value)
    invalid.value = false
    saved.value = true
    emit('save', text.value)
  } catch {
    invalid.value = true
  }
}
</script>

<template>
  <div class="config-editor">
    <n-alert v-if="invalid" type="error" :bordered="false" style="margin-bottom: 10px">
      JSON 格式有误，请修正后再保存
    </n-alert>
    <n-alert v-if="saved" type="success" :bordered="false" style="margin-bottom: 10px">
      已保存
    </n-alert>
    <textarea
      v-model="text"
      class="json-textarea"
      :readonly="readonly"
      :spellcheck="false"
    ></textarea>
    <div v-if="!readonly" class="actions">
      <n-button size="small" @click="format">格式化</n-button>
      <n-button size="small" type="primary" @click="save">保存</n-button>
    </div>
  </div>
</template>

<style scoped>
.config-editor {
  width: 100%;
}
.json-textarea {
  width: 100%;
  min-height: 320px;
  background: #14141a;
  color: #d6d6dc;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  font-family: 'SF Mono', Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  white-space: pre;
}
.json-textarea:focus {
  border-color: #63a4ff;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
</style>
