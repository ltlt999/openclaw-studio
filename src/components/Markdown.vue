<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const props = defineProps<{ source: string }>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        /* ignore */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

const html = computed(() => md.render(props.source || ''))
</script>

<template>
  <div class="markdown-body" v-html="html"></div>
</template>

<style scoped>
.markdown-body {
  line-height: 1.6;
  word-break: break-word;
}
.markdown-body :deep(pre) {
  background: #1a1a20;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}
.markdown-body :deep(code) {
  font-family: 'SF Mono', Consolas, 'Courier New', monospace;
  font-size: 0.9em;
}
.markdown-body :deep(p) {
  margin: 0.5em 0;
}
.markdown-body :deep(a) {
  color: #63a4ff;
}
</style>
