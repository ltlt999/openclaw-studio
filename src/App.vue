<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  darkTheme,
  zhCN,
  dateZhCN,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NTag,
} from 'naive-ui'
import { useConnectionStore } from './stores/connection'

const route = useRoute()
const router = useRouter()
const conn = useConnectionStore()

const menuOptions = [
  { label: '聊天', key: '/chat' },
  { label: '模型', key: '/models' },
  { label: '渠道', key: '/channels' },
  { label: 'Agents', key: '/agents' },
  { label: '配置', key: '/config' },
  { label: '用量', key: '/usage' },
  { label: '设置', key: '/settings' },
]

const activeKey = computed(() => route.path)
const currentTitle = computed(() => (route.meta.title as string) || '')

function onSelect(key: string) {
  router.push(key)
}

const statusMap: Record<string, { text: string; type: any }> = {
  connected: { text: '已连接', type: 'success' },
  connecting: { text: '连接中', type: 'warning' },
  disconnected: { text: '未连接', type: 'error' },
}

onMounted(() => {
  conn.init()
})
</script>

<template>
  <n-config-provider :theme="darkTheme" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-layout has-sider class="app-shell">
            <n-layout-sider bordered :width="200" :native-scrollbar="false" class="sider">
              <div class="logo">
                <span class="logo-dot"></span>
                <span class="logo-text">OpenClaw Studio</span>
              </div>
              <n-menu
                :value="activeKey"
                :options="menuOptions"
                :indent="18"
                @update:value="onSelect"
              />
            </n-layout-sider>

            <n-layout>
              <n-layout-header bordered class="header">
                <div class="header-left">
                  <span class="page-title">{{ currentTitle }}</span>
                </div>
                <div class="header-right">
                  <n-tag :type="statusMap[conn.status].type" size="small" round>
                    {{ statusMap[conn.status].text }}
                  </n-tag>
                </div>
              </n-layout-header>
              <n-layout-content class="content" :native-scrollbar="false">
                <router-view />
              </n-layout-content>
            </n-layout>
          </n-layout>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
}

.sider {
  background: #17171c;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-weight: 600;
  font-size: 15px;
}

.logo-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #63a4ff;
  box-shadow: 0 0 8px #63a4ff;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
}

.content {
  height: calc(100vh - 52px);
  overflow: hidden;
}
</style>
