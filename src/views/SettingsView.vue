<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, NButton, NForm, NFormItem, NAlert, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'

const conn = useConnectionStore()
const message = useMessage()

const token = ref(conn.token)
const password = ref(conn.password)
const saving = ref(false)

const autoStatus = ref<string>('')
const probeStatus = ref<string>('')
const deviceStatus = ref<string>('')
const gateway = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/api/status')
    const data = await res.json()
    gateway.value = data.gateway || ''
    if (data.autoAuth === 'token' || data.autoAuth === 'password') {
      autoStatus.value = `已自动读取服务器上的 OpenClaw 配置，使用 ${data.autoAuth === 'token' ? 'token' : '密码'} 鉴权，无需手动填写`
    } else if (data.autoAuth === 'none') {
      autoStatus.value = '服务器网关未启用鉴权（auth.mode=none），无需填写'
    } else {
      autoStatus.value = '未检测到可自动读取的网关鉴权；若下方填写凭证则优先使用手动凭证'
    }
    if (data.device) {
      deviceStatus.value = data.device.paired
        ? `设备已配对（${data.device.deviceId.slice(0, 12)}…），可自动获得完整权限`
        : `设备未配对（${data.device.deviceId.slice(0, 12)}…）。首次使用需在服务器上执行 openclaw devices list + approve 批准`
    }
    if (data.probe) {
      probeStatus.value = data.probe.ok
        ? `自检通过：${data.probe.message}`
        : `自检失败：${data.probe.message}`
    }
  } catch {
    autoStatus.value = ''
  }
})

function save() {
  saving.value = true
  conn.setAuth(token.value.trim(), password.value.trim())
  message.success('已保存并重连')
  setTimeout(() => {
    saving.value = false
  }, 500)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>设置</h2>
    </div>

    <n-alert v-if="gateway" type="info" :bordered="false" style="margin-bottom: 12px">
      网关地址：<code>{{ gateway }}</code>
    </n-alert>
    <n-alert
      :type="autoStatus ? 'success' : 'info'"
      :bordered="false"
      style="margin-bottom: 12px"
    >
      {{ autoStatus || '正在检测服务器上的 OpenClaw 配置…' }}
    </n-alert>
    <n-alert
      v-if="deviceStatus"
      :type="deviceStatus.startsWith('设备已配对') ? 'success' : 'warning'"
      :bordered="false"
      style="margin-bottom: 12px"
    >
      {{ deviceStatus }}
    </n-alert>
    <n-alert
      v-if="probeStatus"
      :type="probeStatus.startsWith('自检通过') ? 'success' : 'error'"
      :bordered="false"
      style="margin-bottom: 20px"
    >
      {{ probeStatus }}
    </n-alert>

    <div class="form-wrap">
      <n-form label-placement="top">
        <n-form-item label="Token（可选，覆盖自动检测）">
          <n-input
            v-model:value="token"
            type="password"
            show-password-on="click"
            placeholder="Gateway auth token"
          />
        </n-form-item>
        <n-form-item label="密码（可选，覆盖自动检测）">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="Gateway auth password"
          />
        </n-form-item>
        <n-button type="primary" :loading="saving" @click="save">保存并重连</n-button>
      </n-form>
    </div>
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
.form-wrap {
  max-width: 480px;
}
</style>
