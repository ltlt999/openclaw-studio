<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NForm, NFormItem, NAlert, useMessage } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'

const conn = useConnectionStore()
const message = useMessage()

const token = ref(conn.token)
const password = ref(conn.password)
const saving = ref(false)

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

    <n-alert type="info" :bordered="false" style="margin-bottom: 20px">
      Gateway 地址由启动命令的 <code>--gateway</code> 参数决定（服务端），浏览器无需配置。
      只有当 Gateway 开启了鉴权时才需要填写下面的凭证。
    </n-alert>

    <div class="form-wrap">
      <n-form label-placement="top">
        <n-form-item label="Token（可选）">
          <n-input v-model:value="token" type="password" show-password-on="click" placeholder="Gateway auth token" />
        </n-form-item>
        <n-form-item label="密码（可选）">
          <n-input v-model:value="password" type="password" show-password-on="click" placeholder="Gateway auth password" />
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
