import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/chat' },
    { path: '/chat', name: 'chat', component: () => import('../views/ChatView.vue'), meta: { title: '聊天' } },
    { path: '/models', name: 'models', component: () => import('../views/ModelsView.vue'), meta: { title: '模型' } },
    { path: '/channels', name: 'channels', component: () => import('../views/ChannelsView.vue'), meta: { title: '渠道' } },
    { path: '/agents', name: 'agents', component: () => import('../views/AgentsView.vue'), meta: { title: 'Agents' } },
    { path: '/config', name: 'config', component: () => import('../views/ConfigView.vue'), meta: { title: '配置' } },
    { path: '/usage', name: 'usage', component: () => import('../views/UsageView.vue'), meta: { title: '用量' } },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } },
  ],
})

export { router }
