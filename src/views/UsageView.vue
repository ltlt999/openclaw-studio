<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { NSpin, NEmpty } from 'naive-ui'
import { useConnectionStore } from '../stores/connection'
import { getClient } from '../rpc/client'
import BaseChart from '../components/BaseChart.vue'

const conn = useConnectionStore()
const client = getClient()

const loading = ref(false)
const usage = ref<any>(null)

// 数据可视化调色板（dark，dataviz 规范）
const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const BLUE = '#3987e5'
const INK_SECONDARY = '#c3c2b7'
const INK_MUTED = '#898781'
const GRIDLINE = '#2c2c2a'
const BASELINE = '#383835'
const TOOLTIP_BG = '#1e1e26'
const TOOLTIP_BORDER = '#2c2c2a'

const sessions = computed(() => usage.value?.sessions ?? [])

const totals = computed(() => {
  const s = sessions.value
  return {
    tokens: s.reduce((sum: number, x: any) => sum + (x.usage?.totalTokens || 0), 0),
    cost: s.reduce((sum: number, x: any) => sum + (x.usage?.totalCost || 0), 0),
    input: s.reduce((sum: number, x: any) => sum + (x.usage?.input || 0), 0),
    output: s.reduce((sum: number, x: any) => sum + (x.usage?.output || 0), 0),
    count: s.length,
  }
})

function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function fmtCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.001) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
}

// 按模型/渠道聚合 token，超 6 项折叠为「其他」
function aggregate(field: string) {
  const map = new Map<string, number>()
  sessions.value.forEach((s: any) => {
    const k = s[field] || 'unknown'
    map.set(k, (map.get(k) || 0) + (s.usage?.totalTokens || 0))
  })
  const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  arr.sort((a, b) => b.value - a.value)
  if (arr.length > 6) {
    const top = arr.slice(0, 5)
    const rest = arr.slice(5).reduce((s, x) => s + x.value, 0)
    top.push({ name: '其他', value: rest })
    return top
  }
  return arr
}

const bySession = computed(() => {
  return sessions.value
    .map((s: any) => ({
      name: s.model || s.channel || s.key.slice(0, 24),
      tokens: s.usage?.totalTokens || 0,
    }))
    .sort((a: any, b: any) => b.tokens - a.tokens)
    .slice(0, 8)
})

const byModel = computed(() => aggregate('model'))
const byChannel = computed(() => aggregate('channel'))

const baseTooltip = {
  backgroundColor: TOOLTIP_BG,
  borderColor: TOOLTIP_BORDER,
  textStyle: { color: '#fff' },
}

const barOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: { left: 56, right: 16, top: 16, bottom: 40 },
  tooltip: {
    ...baseTooltip,
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any) => {
      const p = Array.isArray(params) ? params[0] : params
      return `${p.name}<br/>Token 用量：<b>${fmtTokens(p.value)}</b>`
    },
  },
  xAxis: {
    type: 'category',
    data: bySession.value.map((s: any) => s.name),
    axisLabel: { color: INK_MUTED, rotate: 30, interval: 0 },
    axisLine: { lineStyle: { color: BASELINE } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: GRIDLINE } },
    axisLabel: { color: INK_MUTED },
  },
  series: [
    {
      name: 'Token 用量',
      type: 'bar',
      data: bySession.value.map((s: any) => s.tokens),
      itemStyle: { color: BLUE, borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 40,
    },
  ],
}))

function donutOption(data: { name: string; value: number }[]) {
  return {
    backgroundColor: 'transparent',
    color: CATEGORICAL,
    tooltip: { ...baseTooltip, trigger: 'item', formatter: (p: any) => `${p.name}：<b>${fmtTokens(p.value)}</b>（${p.percent}%）` },
    legend: {
      bottom: 0,
      textStyle: { color: INK_SECONDARY },
      type: 'scroll',
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '42%'],
        itemStyle: { borderRadius: 4, borderColor: '#101014', borderWidth: 2 },
        label: { color: INK_SECONDARY },
        data,
      },
    ],
  }
}

const modelOption = computed(() => donutOption(byModel.value))
const channelOption = computed(() => donutOption(byChannel.value))

// 每日 Token 趋势（聚合所有会话的 timeseries 按天累加）
const trend = ref<{ day: string; tokens: number }[]>([])
async function loadTrend() {
  const s = sessions.value
  if (!s.length) {
    trend.value = []
    return
  }
  const allPoints: any[] = []
  for (const sess of s.slice(0, 20)) {
    try {
      const ts = await client.usageTimeseries(sess.key)
      allPoints.push(...(ts?.points || []))
    } catch {
      // 单会话趋势失败忽略
    }
  }
  const byDay = new Map<string, number>()
  allPoints.forEach((p: any) => {
    if (!p?.timestamp) return
    const d = new Date(p.timestamp)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    byDay.set(day, (byDay.get(day) || 0) + (p.totalTokens || 0))
  })
  trend.value = Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, tokens]) => ({ day, tokens }))
}

const lineOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: { left: 56, right: 16, top: 20, bottom: 40 },
  tooltip: {
    ...baseTooltip,
    trigger: 'axis',
    formatter: (params: any) => {
      const p = Array.isArray(params) ? params[0] : params
      return `${p.axisValue}<br/>Token 用量：<b>${fmtTokens(p.value)}</b>`
    },
  },
  xAxis: {
    type: 'category',
    data: trend.value.map((t) => t.day.slice(5)),
    axisLabel: { color: INK_MUTED, rotate: 30 },
    axisLine: { lineStyle: { color: BASELINE } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: GRIDLINE } },
    axisLabel: { color: INK_MUTED, formatter: (v: number) => fmtTokens(v) },
  },
  series: [
    {
      name: 'Token 用量',
      type: 'line',
      data: trend.value.map((t) => t.tokens),
      smooth: true,
      symbolSize: 6,
      lineStyle: { color: BLUE, width: 2 },
      itemStyle: { color: BLUE },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(57,135,229,0.25)' },
            { offset: 1, color: 'rgba(57,135,229,0)' },
          ],
        },
      },
    },
  ],
}))

async function load() {
  if (!conn.connected) return
  loading.value = true
  try {
    usage.value = await client.usage()
    await loadTrend()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
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
      <h2>用量</h2>
      <span v-if="usage" class="range">{{ usage.startDate }} ~ {{ usage.endDate }}</span>
    </div>

    <n-spin :show="loading">
      <template v-if="sessions.length">
        <!-- 统计卡片 -->
        <div class="stats">
          <div class="stat">
            <div class="stat-value">{{ fmtTokens(totals.tokens) }}</div>
            <div class="stat-label">总 Token</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ fmtCost(totals.cost) }}</div>
            <div class="stat-label">总成本</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ fmtTokens(totals.input) }}</div>
            <div class="stat-label">输入 Token</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ fmtTokens(totals.output) }}</div>
            <div class="stat-label">输出 Token</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ totals.count }}</div>
            <div class="stat-label">会话数</div>
          </div>
        </div>

        <!-- 图表 -->
        <div class="charts">
          <div v-if="trend.length" class="chart-card chart-wide">
            <div class="chart-title">Token 用量趋势（按天）</div>
            <BaseChart :option="lineOption" height="240px" />
          </div>
          <div v-else class="chart-card chart-wide">
            <div class="chart-title">Token 用量趋势（按天）</div>
            <n-empty description="暂无趋势数据（需要网关记录会话用量的时间点）" style="padding: 40px 0" />
          </div>
          <div class="chart-card chart-wide">
            <div class="chart-title">Token 用量（按会话）</div>
            <BaseChart :option="barOption" height="280px" />
          </div>
          <div class="chart-card">
            <div class="chart-title">按模型分布</div>
            <BaseChart :option="modelOption" height="280px" />
          </div>
          <div class="chart-card">
            <div class="chart-title">按渠道分布</div>
            <BaseChart :option="channelOption" height="280px" />
          </div>
        </div>
      </template>
      <n-empty v-else-if="!loading" description="暂无用量数据" style="margin-top: 60px" />
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
  align-items: baseline;
  gap: 16px;
  margin-bottom: 16px;
}
.page-head h2 {
  margin: 0;
  font-size: 18px;
}
.range {
  font-size: 13px;
  color: var(--text-dim);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.stat {
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}
.stat-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 4px;
}
.charts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.chart-card {
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}
.chart-wide {
  grid-column: 1 / -1;
}
.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 8px;
}
@media (max-width: 900px) {
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>
