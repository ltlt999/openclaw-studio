<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{ option: any; height?: string }>()
const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

onMounted(() => {
  if (!el.value) return
  chart = echarts.init(el.value)
  if (props.option) chart.setOption(props.option, true)
  ro = new ResizeObserver(() => chart?.resize())
  ro.observe(el.value)
})

onUnmounted(() => {
  ro?.disconnect()
  chart?.dispose()
})

watch(
  () => props.option,
  (o) => {
    if (chart && o) chart.setOption(o, true)
  },
  { deep: true },
)
</script>

<template>
  <div ref="el" class="base-chart" :style="{ height: height || '260px' }"></div>
</template>

<style scoped>
.base-chart {
  width: 100%;
}
</style>
