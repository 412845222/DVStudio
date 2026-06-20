<template>
  <Transition name="aiwf-log-panel">
    <div v-if="open" class="aiwf-log-panel" data-bp-ui-overlay="true" @pointerdown.stop>
      <div class="aiwf-log-panel__header">
        <div class="aiwf-log-panel__title">
          <span>蓝图日志</span>
          <small>{{ filteredEntries.length }} / {{ totalEntries }}</small>
        </div>
        <div class="aiwf-log-panel__controls">
          <input
            v-model="keywordFilter"
            class="aiwf-log-panel__input"
            type="text"
            placeholder="关键字过滤…"
            @keydown.esc="keywordFilter = ''"
          />
          <div class="aiwf-log-panel__chip-group" role="group" aria-label="级别过滤">
            <button
              v-for="level in ALL_LEVELS"
              :key="level"
              type="button"
              class="aiwf-log-panel__chip"
              :class="{ active: levelFilter.includes(level) }"
              :data-level="level"
              @click="toggleLevel(level)"
            >
              {{ level }}
            </button>
          </div>
          <div class="aiwf-log-panel__chip-group" role="group" aria-label="分类过滤">
            <button
              v-for="category in ALL_CATEGORIES"
              :key="category"
              type="button"
              class="aiwf-log-panel__chip"
              :class="{ active: categoryFilter.includes(category) }"
              :data-category="category"
              @click="toggleCategory(category)"
            >
              {{ labelForCategory(category) }}
            </button>
          </div>
          <label class="aiwf-log-panel__toggle">
            <input v-model="autoScroll" type="checkbox" />
            <span>自动滚动</span>
          </label>
          <button class="aiwf-log-panel__btn" type="button" @click="onClear">清空</button>
          <button class="aiwf-log-panel__btn" type="button" @click="onExport('text')">导出 TXT</button>
          <button class="aiwf-log-panel__btn" type="button" @click="onExport('json')">导出 JSON</button>
          <button class="aiwf-log-panel__btn aiwf-log-panel__btn--close" type="button" title="关闭 (Esc)" @click="emitClose">关闭</button>
        </div>
      </div>

      <div ref="scrollContainerRef" class="aiwf-log-panel__body">
        <div v-if="filteredEntries.length === 0" class="aiwf-log-panel__empty">
          暂无日志条目。试着执行一些蓝图操作，新的日志会出现在这里。
        </div>
        <div v-else class="aiwf-log-panel__list" role="list">
          <div
            v-for="entry in filteredEntries"
            :key="entry.id"
            class="aiwf-log-panel__item"
            :class="[`is-level-${entry.level.toLowerCase()}`, { expanded: expandedIds.has(entry.id) }]"
            role="listitem"
          >
            <button
              type="button"
              class="aiwf-log-panel__item-toggle"
              :aria-expanded="expandedIds.has(entry.id)"
              :title="entry.detail !== undefined ? '点击展开详情' : ''"
              :disabled="entry.detail === undefined"
              @click="toggleExpand(entry.id)"
            >
              {{ entry.detail !== undefined ? (expandedIds.has(entry.id) ? '▾' : '▸') : '·' }}
            </button>
            <div class="aiwf-log-panel__item-meta">
              <span class="aiwf-log-panel__item-time">{{ formatTime(entry.timestamp) }}</span>
              <span class="aiwf-log-panel__item-level" :data-level="entry.level">{{ entry.level }}</span>
              <span class="aiwf-log-panel__item-category">{{ labelForCategory(entry.category) }}</span>
              <span v-if="entry.tag" class="aiwf-log-panel__item-tag">{{ entry.tag }}</span>
            </div>
            <div class="aiwf-log-panel__item-message">{{ entry.message }}</div>
            <pre v-if="expandedIds.has(entry.id) && entry.detail !== undefined" class="aiwf-log-panel__item-detail">{{ formatDetail(entry.detail) }}</pre>
          </div>
          <div ref="scrollAnchorRef" class="aiwf-log-panel__anchor" aria-hidden="true" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { blueprintLog, type BlueprintLogCategory, type BlueprintLogLevel, type BlueprintLogEntry } from '../../views/AIWorkflow/blueprint-core/blueprintLog'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const ALL_LEVELS: BlueprintLogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG']
const ALL_CATEGORIES: BlueprintLogCategory[] = ['runtime', 'request', 'operation', 'system']
const CATEGORY_LABELS: Record<BlueprintLogCategory, string> = {
  runtime: '运行',
  request: '请求',
  operation: '操作',
  system: '系统',
}

const scrollContainerRef = ref<HTMLDivElement | null>(null)
const scrollAnchorRef = ref<HTMLDivElement | null>(null)
const keywordFilter = ref('')
const levelFilter = ref<BlueprintLogLevel[]>(['INFO', 'WARN', 'ERROR', 'DEBUG'])
const categoryFilter = ref<BlueprintLogCategory[]>(['runtime', 'request', 'operation', 'system'])
const autoScroll = ref(true)
const expandedIds = ref<Set<string>>(new Set())

const totalEntries = computed(() => blueprintLog.entries.value.length)

const keywordLower = computed(() => String(keywordFilter.value ?? '').trim().toLowerCase())

const filteredEntries = computed<BlueprintLogEntry[]>(() => {
  const kw = keywordLower.value
  const levels = levelFilter.value
  const cats = categoryFilter.value
  if (levels.length === 0 || cats.length === 0) return []
  const all = blueprintLog.entries.value
  if (!kw && levels.length === ALL_LEVELS.length && cats.length === ALL_CATEGORIES.length) return all
  const result: BlueprintLogEntry[] = []
  for (let i = 0; i < all.length; i += 1) {
    const entry = all[i]
    if (!levels.includes(entry.level)) continue
    if (!cats.includes(entry.category)) continue
    if (kw) {
      const haystack = [entry.message, entry.tag ?? '']
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(kw)) {
        // Also try detail if present and a string/object
        if (entry.detail == null) continue
        let text = ''
        if (typeof entry.detail === 'string') text = entry.detail.toLowerCase()
        else {
          try {
            text = JSON.stringify(entry.detail).toLowerCase()
          } catch {
            text = String(entry.detail).toLowerCase()
          }
        }
        if (!text.includes(kw)) continue
      }
    }
    result.push(entry)
  }
  return result
})

const emitClose = () => {
  emit('update:open', false)
}

const labelForCategory = (cat: BlueprintLogCategory): string => {
  return CATEGORY_LABELS[cat] ?? cat
}

const toggleLevel = (level: BlueprintLogLevel) => {
  const set = new Set(levelFilter.value)
  if (set.has(level)) set.delete(level)
  else set.add(level)
  levelFilter.value = ALL_LEVELS.filter((l) => set.has(l))
}

const toggleCategory = (category: BlueprintLogCategory) => {
  const set = new Set(categoryFilter.value)
  if (set.has(category)) set.delete(category)
  else set.add(category)
  categoryFilter.value = ALL_CATEGORIES.filter((c) => set.has(c))
}

const toggleExpand = (id: string) => {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

const onClear = () => {
  if (!window.confirm('确定要清空当前日志面板吗？此操作不会影响任何已保存的项目。')) return
  blueprintLog.clear()
  expandedIds.value = new Set()
}

const triggerDownload = (filename: string, content: string, mime: string) => {
  try {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {}
      if (a.parentNode) a.parentNode.removeChild(a)
    }, 200)
  } catch {
    // Fallback: open in new tab
    const dataUri = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`
    window.open(dataUri, '_blank', 'noopener')
  }
}

const onExport = (kind: 'text' | 'json') => {
  const ts = new Date()
  const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`
  if (kind === 'json') {
    const text = blueprintLog.exportAsJson()
    triggerDownload(`blueprint-log-${stamp}.json`, text, 'application/json')
  } else {
    const text = blueprintLog.exportAsText()
    triggerDownload(`blueprint-log-${stamp}.txt`, text, 'text/plain')
  }
}

const formatTime = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const formatDetail = (detail: unknown): string => {
  if (detail === undefined || detail === null) return ''
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail, null, 2)
  } catch {
    return String(detail)
  }
}

const performAutoScroll = () => {
  if (!autoScroll.value) return
  const container = scrollContainerRef.value
  if (!container) return
  // If user is near bottom, scroll to bottom; otherwise rely on anchor ref
  nextTick(() => {
    const anchor = scrollAnchorRef.value
    if (anchor) {
      try {
        anchor.scrollIntoView({ block: 'end', behavior: 'auto' })
        return
      } catch {}
    }
    container.scrollTop = container.scrollHeight
  })
}

watch(() => filteredEntries.value.length, () => {
  if (props.open) performAutoScroll()
})

watch(() => props.open, (nextOpen) => {
  if (nextOpen) {
    nextTick(() => performAutoScroll())
  }
})

const onKeydown = (ev: KeyboardEvent) => {
  if (!props.open) return
  if (ev.key === 'Escape') {
    emitClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.open) nextTick(() => performAutoScroll())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.aiwf-log-panel {
  position: absolute;
  left: 56px;
  right: 16px;
  bottom: 16px;
  height: 260px;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--dweb-defualt-dark) 96%, #101318 4%);
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  box-shadow: var(--vscode-shadow);
  color: var(--vscode-fg);
  font-size: 12px;
  overflow: hidden;
  backdrop-filter: blur(14px);
  z-index: 1400;
}

.aiwf-log-panel__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vscode-border);
  background: color-mix(in srgb, var(--dweb-defualt-dark) 80%, transparent);
}

.aiwf-log-panel__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 12px;
  color: var(--vscode-fg);
}

.aiwf-log-panel__title small {
  color: var(--vscode-fg-muted);
  font-weight: 500;
  font-size: 11px;
}

.aiwf-log-panel__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.aiwf-log-panel__input {
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt) 55%, transparent);
  color: var(--vscode-fg);
  font-size: 12px;
  min-width: 180px;
}

.aiwf-log-panel__input:focus {
  outline: none;
  border-color: var(--vscode-border-accent);
}

.aiwf-log-panel__chip-group {
  display: inline-flex;
  gap: 4px;
}

.aiwf-log-panel__chip {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: transparent;
  color: var(--vscode-fg-muted);
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
}

.aiwf-log-panel__chip:hover,
.aiwf-log-panel__chip:focus-visible {
  outline: none;
  border-color: var(--vscode-border-accent);
  background: var(--vscode-hover-bg);
  color: var(--vscode-fg);
}

.aiwf-log-panel__chip.active {
  background: color-mix(in srgb, #4cb1ff 18%, transparent);
  border-color: color-mix(in srgb, #4cb1ff 64%, transparent);
  color: var(--vscode-fg);
}

.aiwf-log-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--vscode-fg-muted);
  font-size: 12px;
  user-select: none;
}

.aiwf-log-panel__toggle input {
  accent-color: #4cb1ff;
}

.aiwf-log-panel__btn {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: transparent;
  color: var(--vscode-fg);
  font-size: 11px;
  cursor: pointer;
}

.aiwf-log-panel__btn:hover,
.aiwf-log-panel__btn:focus-visible {
  outline: none;
  border-color: var(--vscode-border-accent);
  background: var(--vscode-hover-bg);
}

.aiwf-log-panel__btn--close {
  margin-left: auto;
}

.aiwf-log-panel__body {
  flex: 1 1 auto;
  overflow: auto;
  background: color-mix(in srgb, #0b0d10 70%, transparent);
}

.aiwf-log-panel__list {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.aiwf-log-panel__empty {
  padding: 30px 16px;
  color: var(--vscode-fg-muted);
  font-size: 12px;
  text-align: center;
}

.aiwf-log-panel__item {
  display: grid;
  grid-template-columns: 22px max-content 1fr;
  column-gap: 6px;
  align-items: start;
  padding: 4px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-border) 40%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.aiwf-log-panel__item:hover {
  background: color-mix(in srgb, var(--vscode-hover-bg) 70%, transparent);
}

.aiwf-log-panel__item-toggle {
  width: 18px;
  height: 18px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--vscode-fg-muted);
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.aiwf-log-panel__item-toggle:hover:not(:disabled) {
  border-color: var(--vscode-border);
  background: var(--vscode-hover-bg);
  color: var(--vscode-fg);
}

.aiwf-log-panel__item-toggle:disabled {
  cursor: default;
  color: color-mix(in srgb, var(--vscode-fg-muted) 60%, transparent);
}

.aiwf-log-panel__item-meta {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: var(--vscode-fg-muted);
}

.aiwf-log-panel__item-time {
  color: var(--vscode-fg-muted);
  white-space: nowrap;
}

.aiwf-log-panel__item-level {
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  font-weight: 700;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  color: var(--vscode-fg);
  font-size: 10px;
  white-space: nowrap;
}

.aiwf-log-panel__item-level[data-level='INFO'] {
  border-color: color-mix(in srgb, #4cb1ff 60%, var(--vscode-border));
  color: #4cb1ff;
}

.aiwf-log-panel__item-level[data-level='WARN'] {
  border-color: color-mix(in srgb, #e6a23c 60%, var(--vscode-border));
  color: #e6a23c;
}

.aiwf-log-panel__item-level[data-level='ERROR'] {
  border-color: color-mix(in srgb, #f56c6c 60%, var(--vscode-border));
  color: #f56c6c;
}

.aiwf-log-panel__item-level[data-level='DEBUG'] {
  border-color: color-mix(in srgb, #909399 60%, var(--vscode-border));
  color: #b1b3b8;
}

.aiwf-log-panel__item-category,
.aiwf-log-panel__item-tag {
  color: var(--vscode-fg-muted);
  font-weight: 600;
  white-space: nowrap;
}

.aiwf-log-panel__item-tag::before {
  content: '#';
  margin-right: 2px;
  color: color-mix(in srgb, var(--vscode-fg-muted) 60%, transparent);
}

.aiwf-log-panel__item-message {
  grid-column: 3 / 4;
  color: var(--vscode-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

.aiwf-log-panel__item-detail {
  grid-column: 2 / 4;
  margin-top: 4px;
  padding: 6px 8px;
  background: color-mix(in srgb, #000 40%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-border) 40%, transparent);
  color: var(--vscode-fg);
  white-space: pre;
  overflow: auto;
  font-size: 11px;
  max-height: 200px;
}

.aiwf-log-panel__anchor {
  height: 1px;
}

/* Animations */
.aiwf-log-panel-enter-active,
.aiwf-log-panel-leave-active {
  transition:
    transform 160ms ease,
    opacity 160ms ease;
}

.aiwf-log-panel-enter-from,
.aiwf-log-panel-leave-to {
  transform: translateY(12px);
  opacity: 0;
}

@media (max-width: 920px) {
  .aiwf-log-panel {
    left: 16px;
    right: 16px;
    bottom: 12px;
    height: 220px;
  }
  .aiwf-log-panel__input {
    min-width: 120px;
    flex: 1 1 auto;
  }
}
</style>
