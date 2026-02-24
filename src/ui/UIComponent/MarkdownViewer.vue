<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ markdown: string }>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const renderedHtml = computed(() => {
  try {
    return md.render(String(props.markdown || ''))
  } catch {
    return ''
  }
})
</script>

<template>
  <div class="md-viewer" v-html="renderedHtml" />
</template>

<style scoped>
.md-viewer {
  color: var(--vscode-fg);
  font-size: 12px;
  line-height: 1.65;
  word-break: break-word;
}

.md-viewer :deep(h1),
.md-viewer :deep(h2),
.md-viewer :deep(h3) {
  margin: 10px 0 6px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.md-viewer :deep(h1) {
  font-size: 16px;
}

.md-viewer :deep(h2) {
  font-size: 14px;
}

.md-viewer :deep(h3) {
  font-size: 13px;
}

.md-viewer :deep(p) {
  margin: 6px 0;
}

.md-viewer :deep(ul),
.md-viewer :deep(ol) {
  margin: 6px 0;
  padding-left: 18px;
}

.md-viewer :deep(code) {
  background: var(--dweb-defualt-dark);
  border: 1px solid var(--vscode-border);
  padding: 0 4px;
}

.md-viewer :deep(pre) {
  background: var(--dweb-defualt-dark);
  border: 1px solid var(--vscode-border);
  padding: 10px;
  overflow: auto;
}

.md-viewer :deep(a) {
  color: var(--vscode-border-accent);
}

.md-viewer :deep(blockquote) {
  margin: 6px 0;
  padding-left: 10px;
  border-left: 2px solid var(--vscode-border);
  color: var(--vscode-fg-muted);
}

.md-viewer :deep(hr) {
  border: none;
  border-top: 1px solid var(--vscode-border);
  margin: 10px 0;
}
</style>
