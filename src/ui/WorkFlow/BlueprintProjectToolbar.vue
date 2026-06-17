<template>
  <div ref="toolbarWrapRef" class="aiwf-floating-rail-wrap" data-bp-ui-overlay="true" @pointerdown.stop>
    <nav class="aiwf-floating-rail" aria-label="AI 工作流统一工具栏">
      <div
        class="aiwf-floating-rail__identity"
        :class="{ unsaved: !hasProjectName }"
        :title="statusTitle"
      >
        <span class="aiwf-floating-rail__status-dot" aria-hidden="true"></span>
        <span class="aiwf-floating-rail__status-main">{{ projectTitle }}</span>
      </div>

      <button
        class="aiwf-floating-rail__btn"
        :class="{ active: activePanel === 'project' }"
        type="button"
        title="项目"
        @click.stop="togglePanel('project')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 4.2h3.6l1.2 1.3H13v6.3H3z" />
          <path d="M4.6 8.6h6.8" />
        </svg>
        <span class="aiwf-floating-rail__label">项目</span>
        <span class="aiwf-floating-rail__caret" aria-hidden="true">▾</span>
      </button>

      <span class="aiwf-floating-rail__sep" aria-hidden="true"></span>

      <button
        class="aiwf-floating-rail__btn"
        :class="{ active: nodeLibraryOpen }"
        type="button"
        title="节点库"
        @click.stop="$emit('toggle-node-library')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3.5h4v4H3zM9 3.5h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
        </svg>
        <span class="aiwf-floating-rail__label">节点库</span>
      </button>

      <button
        class="aiwf-floating-rail__btn"
        :class="{ active: promptLibraryOpen }"
        type="button"
        title="提示词库"
        @click.stop="$emit('open-prompt-library')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3h7a1.5 1.5 0 0 1 1.5 1.5v9.2L8 11.6l-4 2.1V4.5A1.5 1.5 0 0 1 3.5 3Z" />
          <path d="M5.5 6h3.5M5.5 8h2.4" />
        </svg>
        <span class="aiwf-floating-rail__label">提示词库</span>
      </button>

      <button class="aiwf-floating-rail__btn is-primary" type="button" title="添加节点" @click.stop="$emit('quick-add', $event)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" />
        </svg>
        <span class="aiwf-floating-rail__label">添加节点</span>
      </button>

      <span class="aiwf-floating-rail__sep" aria-hidden="true"></span>

      <button
        class="aiwf-floating-rail__btn"
        :class="{ active: activePanel === 'resources' }"
        type="button"
        title="资源"
        @click.stop="togglePanel('resources')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.6 5h4l1.2 1.3h5.6v6.2H2.6z" />
          <path d="M4.6 9h2.8" />
        </svg>
        <span class="aiwf-floating-rail__label">资源</span>
        <span class="aiwf-floating-rail__caret" aria-hidden="true">▾</span>
      </button>

      <button
        class="aiwf-floating-rail__btn"
        :class="{ active: activePanel === 'tasks' }"
        type="button"
        title="任务"
        @click.stop="togglePanel('tasks')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5h9v9h-9z" />
          <path d="M5.5 6h5M5.5 8h5M5.5 10h3.2" />
        </svg>
        <span class="aiwf-floating-rail__label">任务</span>
        <span class="aiwf-floating-rail__caret" aria-hidden="true">▾</span>
      </button>

      <button class="aiwf-floating-rail__btn" type="button" title="日志" @click.stop="$emit('toggle-backend-log')">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3h10v10H3z" />
          <path d="M5 6h6M5 8.5h4M5 11h3" />
        </svg>
        <span class="aiwf-floating-rail__label">日志</span>
      </button>
    </nav>

    <Transition name="aiwf-floating-rail-popover">
      <section v-if="activePanel" class="aiwf-floating-rail-popover" :class="`is-${activePanel}`">
        <template v-if="activePanel === 'project'">
          <button class="aiwf-floating-rail-popover__item" type="button" @click="openSaveDialog">
            保存项目
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="openLoadDialog">
            加载项目
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="emitThenClose('request-new')">
            新建项目
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="emitThenClose('request-repair-assets')">
            修复项目资源
          </button>
          <div class="aiwf-floating-rail-popover__sep" aria-hidden="true"></div>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="openImportFile">
            导入 JSON
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="openImportPackageFile">
            导入项目 ZIP
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="emitThenClose('request-export')">
            导出 JSON
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="emitThenClose('request-export-package')">
            导出项目 ZIP
          </button>
          <div class="aiwf-floating-rail-popover__sep" aria-hidden="true"></div>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="emitThenClose('request-toggle-performance-priority')">
            {{ performancePriorityMode ? '性能优先：开' : '性能优先：关' }}
          </button>
          <button class="aiwf-floating-rail-popover__item" type="button" @click="emitThenClose('request-export-performance-diagnostics')">
            导出性能诊断
          </button>
        </template>

        <template v-else-if="activePanel === 'resources'">
          <div class="aiwf-floating-rail-popover__head">
            <span>当前蓝图资源</span>
            <small>{{ resources.length }}</small>
          </div>
          <div v-if="resources.length" class="aiwf-floating-rail-popover__empty">资源面板已接入，点击打开完整资源管理器。</div>
          <div v-else class="aiwf-floating-rail-popover__empty">暂无资源</div>
          <button class="aiwf-floating-rail-popover__item is-footer" type="button" @click="emitThenClose('open-resource-manager')">
            打开完整资源管理器
          </button>
        </template>

        <template v-else-if="activePanel === 'tasks'">
          <div class="aiwf-floating-rail-task-grid">
            <button type="button" @click="emitThenClose('open-meshy-task')">Meshy</button>
            <button type="button" @click="emitThenClose('open-video-task')">视频任务</button>
            <button type="button" @click="emitThenClose('open-task-placeholder')">Tripo3D</button>
            <button type="button" @click="emitThenClose('open-task-placeholder')">Hunyuan3D</button>
            <button type="button" @click="emitThenClose('open-task-placeholder')">Fal视频</button>
            <button type="button" @click="emitThenClose('open-task-placeholder')">WorldPlay</button>
          </div>
        </template>
      </section>
    </Transition>

    <input
      ref="importInputRef"
      class="aiwf-rail-hidden-input"
      type="file"
      accept="application/json,.json"
      @change="onImportChange"
    />
    <input
      ref="importPackageInputRef"
      class="aiwf-rail-hidden-input"
      type="file"
      accept="application/zip,.zip"
      @change="onImportPackageChange"
    />

    <Transition name="aiwf-rail-dialog">
      <div
        v-if="saveDialogOpen"
        class="aiwf-rail-dialog-mask"
        data-bp-ui-overlay="true"
        @pointerdown.stop
        @mousedown.stop
        @contextmenu.prevent.stop
        @click.self="saveDialogOpen = false"
      >
        <div
          class="aiwf-rail-dialog"
          data-bp-ui-overlay="true"
          @pointerdown.stop
          @mousedown.stop
          @click.stop
          @contextmenu.prevent.stop
        >
          <div class="aiwf-rail-dialog__title">保存蓝图项目</div>
          <input
            ref="saveInputRef"
            v-model="saveName"
            class="aiwf-rail-input"
            type="text"
            maxlength="120"
            placeholder="请输入项目名称"
            @keydown.enter.prevent="confirmSave"
          />
          <div class="aiwf-rail-dialog__actions">
            <button class="aiwf-rail-dialog-btn" type="button" @click="saveDialogOpen = false">
              取消
            </button>
            <button class="aiwf-rail-dialog-btn is-primary" type="button" @click="confirmSave">
              确认保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="aiwf-rail-dialog">
      <div
        v-if="loadDialogOpen"
        class="aiwf-rail-dialog-mask"
        data-bp-ui-overlay="true"
        @pointerdown.stop
        @mousedown.stop
        @contextmenu.prevent.stop
        @click.self="loadDialogOpen = false"
      >
        <div
          class="aiwf-rail-dialog aiwf-rail-dialog--wide"
          data-bp-ui-overlay="true"
          @pointerdown.stop
          @mousedown.stop
          @click.stop
          @contextmenu.prevent.stop
        >
          <div class="aiwf-rail-dialog__title">加载蓝图项目</div>
          <div class="aiwf-rail-project-list">
            <div
              v-for="(item, idx) in projects"
              :key="`${String(item.id ?? '')}-${String(item.updatedAt ?? '')}-${idx}`"
              class="aiwf-rail-project-item"
              :class="{ active: selectedProjectId === item.id }"
            >
              <button class="aiwf-rail-project-main" type="button" @click="selectedProjectId = item.id">
                <span class="aiwf-rail-project-name">{{ item.name }}</span>
                <small>{{ formatTime(item.updatedAt) }}</small>
              </button>
              <button class="aiwf-rail-project-del" type="button" @click.stop="onDeleteProject(item.id, item.name)">
                删除
              </button>
            </div>
            <div v-if="!projects.length" class="aiwf-rail-empty">暂无项目</div>
          </div>
          <div class="aiwf-rail-dialog__actions">
            <button class="aiwf-rail-dialog-btn" type="button" @click="loadDialogOpen = false">
              取消
            </button>
            <button class="aiwf-rail-dialog-btn is-primary" type="button" @click="confirmLoad">
              加载
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export type BlueprintProjectListItem = {
  id: number
  name: string
  updatedAt?: number | null
}

type FloatingPanel = '' | 'project' | 'resources' | 'tasks'

const props = defineProps<{
  projects: BlueprintProjectListItem[]
  currentProjectName?: string
  performancePriorityMode?: boolean
  electronReady?: boolean
  resources?: Array<{ id: string }>
  nodeLibraryOpen?: boolean
  promptLibraryOpen?: boolean
}>()

const emit = defineEmits<{
  (e: 'quick-add', event: MouseEvent): void
  (e: 'toggle-node-library'): void
  (e: 'open-prompt-library'): void
  (e: 'toggle-backend-log'): void
  (e: 'open-resource-manager'): void
  (e: 'open-meshy-task'): void
  (e: 'open-video-task'): void
  (e: 'open-task-placeholder'): void
  (e: 'request-new'): void
  (e: 'request-save', payload?: { name?: string }): void
  (e: 'request-repair-assets'): void
  (e: 'request-toggle-performance-priority'): void
  (e: 'request-export-performance-diagnostics'): void
  (e: 'request-load-list'): void
  (e: 'request-load-project', payload: { projectId: number }): void
  (e: 'request-delete-project', payload: { projectId: number }): void
  (e: 'request-import-local', payload: { file: File }): void
  (e: 'request-export'): void
  (e: 'request-import-package', payload: { file: File }): void
  (e: 'request-export-package'): void
}>()

const toolbarWrapRef = ref<HTMLElement | null>(null)
const activePanel = ref<FloatingPanel>('')

const saveDialogOpen = ref(false)
const loadDialogOpen = ref(false)
const saveName = ref('')
const selectedProjectId = ref<number | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)
const importPackageInputRef = ref<HTMLInputElement | null>(null)
const saveInputRef = ref<HTMLInputElement | null>(null)

const resources = computed(() => (Array.isArray(props.resources) ? props.resources : []))
const nodeLibraryOpen = computed(() => props.nodeLibraryOpen === true)
const promptLibraryOpen = computed(() => props.promptLibraryOpen === true)

const hasProjectName = computed(() => String(props.currentProjectName ?? '').trim().length > 0)
const projectTitle = computed(() => String(props.currentProjectName ?? '').trim() || '未保存项目')
const statusTitle = computed(() => {
  if (!hasProjectName.value) return '当前蓝图项目尚未保存'
  return `当前项目: ${projectTitle.value}`
})

const focusInputWithRetry = (targetRef: Ref<HTMLInputElement | null>) => {
  void nextTick(() => {
    let attempts = 0
    const tryFocus = () => {
      attempts += 1
      const el = targetRef.value
      if (!el) return
      el.focus()
      try {
        const len = el.value.length
        el.setSelectionRange(len, len)
      } catch {
        // ignore selection API failures
      }
      if (document.activeElement !== el && attempts < 4) {
        window.setTimeout(tryFocus, attempts === 1 ? 0 : 60)
      }
    }
    window.requestAnimationFrame(tryFocus)
  })
}

watch(
  () => props.currentProjectName,
  (next) => {
    if (typeof next === 'string' && next.trim()) saveName.value = next.trim()
  },
  { immediate: true },
)

watch(
  () => props.projects,
  (next) => {
    if (!Array.isArray(next) || !next.length) {
      selectedProjectId.value = null
      return
    }
    if (selectedProjectId.value == null || !next.some((x) => x.id === selectedProjectId.value)) {
      selectedProjectId.value = next[0].id
    }
  },
  { immediate: true },
)

watch(saveDialogOpen, (next) => {
  if (!next) return
  focusInputWithRetry(saveInputRef)
})

const togglePanel = (panel: Exclude<FloatingPanel, ''>) => {
  activePanel.value = activePanel.value === panel ? '' : panel
}

const emitThenClose = (
  eventName:
    | 'request-new'
    | 'request-repair-assets'
    | 'request-export'
    | 'request-export-package'
    | 'request-toggle-performance-priority'
    | 'request-export-performance-diagnostics'
    | 'open-resource-manager'
    | 'open-meshy-task'
    | 'open-video-task'
    | 'open-task-placeholder',
) => {
  ;(emit as any)(eventName)
  activePanel.value = ''
}

const openSaveDialog = () => {
  saveName.value = String(props.currentProjectName || saveName.value || '').trim()
  saveDialogOpen.value = true
  activePanel.value = ''
  focusInputWithRetry(saveInputRef)
}

const confirmSave = () => {
  const name = String(saveName.value || '').trim()
  if (!name) return
  emit('request-save', { name })
  saveDialogOpen.value = false
}

const openLoadDialog = () => {
  emit('request-load-list')
  loadDialogOpen.value = true
  activePanel.value = ''
}

const confirmLoad = () => {
  if (selectedProjectId.value == null) return
  emit('request-load-project', { projectId: selectedProjectId.value })
  loadDialogOpen.value = false
}

const onDeleteProject = (projectId: number, projectName: string) => {
  const ok = window.confirm(`确定删除项目「${projectName || `#${projectId}`}」吗？此操作不可撤销。`)
  if (!ok) return
  emit('request-delete-project', { projectId })
}

const openImportFile = () => {
  importInputRef.value?.click()
  activePanel.value = ''
}

const openImportPackageFile = () => {
  importPackageInputRef.value?.click()
  activePanel.value = ''
}

const onImportChange = (ev: Event) => {
  const input = ev.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  emit('request-import-local', { file })
  if (input) input.value = ''
}

const onImportPackageChange = (ev: Event) => {
  const input = ev.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  emit('request-import-package', { file })
  if (input) input.value = ''
}

const formatTime = (ts?: number | null) => {
  if (!Number.isFinite(Number(ts))) return '更新时间未知'
  return new Date(Number(ts)).toLocaleString()
}

const isPointerInsideToolbar = (event: PointerEvent) => {
  const root = toolbarWrapRef.value
  if (!root) return false
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.includes(root)) return true
  const target = event.target
  return target instanceof Node && root.contains(target)
}

const onWindowPointerDown = (event: PointerEvent) => {
  if (!activePanel.value) return
  if (isPointerInsideToolbar(event)) return
  activePanel.value = ''
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true)
})

defineExpose({
  openSaveDialog,
})
</script>

<style scoped>
.aiwf-floating-rail-wrap {
  position: absolute;
  left: 56px;
  top: 14px;
  z-index: 1300;
  display: inline-flex;
  align-items: center;
  pointer-events: auto;
}

.aiwf-floating-rail {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 4px 6px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt-dark) 92%, transparent);
  box-shadow: var(--vscode-shadow);
  backdrop-filter: blur(14px);
  max-width: calc(100vw - 80px);
  flex-wrap: nowrap;
  overflow: hidden;
}

.aiwf-floating-rail__identity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  min-width: 0;
  max-width: 220px;
  color: var(--vscode-fg);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}

.aiwf-floating-rail__status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 0;
  background: #6ee7b7;
  box-shadow: 0 0 0 3px color-mix(in srgb, #6ee7b7 18%, transparent);
}

.aiwf-floating-rail__identity.unsaved .aiwf-floating-rail__status-dot {
  background: #f6c177;
  box-shadow: 0 0 0 3px color-mix(in srgb, #f6c177 18%, transparent);
}

.aiwf-floating-rail__status-main {
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aiwf-floating-rail__sep {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--vscode-border) 80%, transparent);
}

.aiwf-floating-rail__btn {
  position: relative;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 0;
  outline: none;
  background: transparent;
  color: var(--vscode-fg-muted);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  flex: 0 0 auto;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease;
}

.aiwf-floating-rail__btn:hover,
.aiwf-floating-rail__btn:focus-visible,
.aiwf-floating-rail__btn.active {
  border-color: var(--vscode-border);
  background: var(--vscode-hover-bg);
  color: var(--vscode-fg);
}

.aiwf-floating-rail__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aiwf-floating-rail__btn.is-primary {
  border-color: color-mix(in srgb, #4cb1ff 64%, transparent);
  background: color-mix(in srgb, #4cb1ff 18%, transparent);
  color: #4cb1ff;
}

.aiwf-floating-rail__btn svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.aiwf-floating-rail__btn svg path,
.aiwf-floating-rail__btn svg circle {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.aiwf-floating-rail__label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.aiwf-floating-rail__caret {
  font-size: 9px;
  line-height: 1;
  opacity: 0.7;
}

.aiwf-floating-rail-popover {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 12;
  margin-top: 6px;
  min-width: 198px;
  max-width: 320px;
  max-height: min(440px, calc(100vh - 88px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt-dark) 96%, transparent);
  box-shadow: var(--vscode-shadow);
  color: var(--vscode-fg);
  backdrop-filter: blur(14px);
  will-change: transform, opacity;
}

.aiwf-floating-rail-popover.is-resources {
  width: 302px;
}

.aiwf-floating-rail-popover.is-tasks {
  width: 260px;
  padding: 6px;
}

.aiwf-floating-rail-popover__head {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 6px 10px;
  border-bottom: 1px solid var(--vscode-border);
  margin-bottom: 4px;
  color: var(--vscode-fg-muted);
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}

.aiwf-floating-rail-popover__head small {
  font-size: 11px;
  font-weight: 600;
}

.aiwf-floating-rail-popover__item {
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--vscode-fg);
  text-align: left;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.aiwf-floating-rail-popover__item:hover,
.aiwf-floating-rail-popover__item:focus-visible {
  border-color: var(--vscode-border);
  background: var(--vscode-hover-bg);
  outline: none;
}

.aiwf-floating-rail-popover__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aiwf-floating-rail-popover__sep {
  height: 1px;
  margin: 4px 6px;
  background: color-mix(in srgb, var(--vscode-border) 80%, transparent);
}

.aiwf-floating-rail-popover__item.is-footer {
  margin-top: 4px;
  border-top: 1px solid var(--vscode-border);
  border-radius: 0;
  padding-top: 6px;
}

.aiwf-floating-rail-popover__empty {
  padding: 16px 12px;
  color: var(--vscode-fg-muted);
  text-align: center;
  font-size: 12px;
}

.aiwf-floating-rail-task-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.aiwf-floating-rail-task-grid button {
  height: 30px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--vscode-fg);
  font-size: 12px;
  cursor: pointer;
}

.aiwf-floating-rail-task-grid button:hover,
.aiwf-floating-rail-task-grid button:focus-visible {
  border-color: var(--vscode-border);
  background: var(--vscode-hover-bg);
  outline: none;
}

.aiwf-floating-rail-popover-enter-active,
.aiwf-floating-rail-popover-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.aiwf-floating-rail-popover-enter-from,
.aiwf-floating-rail-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.aiwf-rail-hidden-input {
  display: none;
}

.aiwf-rail-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 9200;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
}

.aiwf-rail-dialog {
  width: min(440px, calc(100vw - 32px));
  border: 1px solid var(--vscode-border);
  background: color-mix(in srgb, var(--dweb-defualt-dark) 96%, #101318 4%);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.46);
  border-radius: 0;
  padding: 14px;
  color: var(--vscode-fg);
}

.aiwf-rail-dialog--wide {
  width: min(560px, calc(100vw - 32px));
}

.aiwf-rail-dialog__title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
}

.aiwf-rail-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt) 55%, transparent);
  color: var(--vscode-fg);
  padding: 8px;
  font-size: 12px;
}

.aiwf-rail-input:focus {
  outline: none;
  border-color: var(--vscode-border-accent);
}

.aiwf-rail-dialog__actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.aiwf-rail-dialog-btn {
  padding: 6px 12px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt) 64%, transparent);
  color: var(--vscode-fg);
  font-size: 12px;
  cursor: pointer;
}

.aiwf-rail-dialog-btn:hover,
.aiwf-rail-dialog-btn:focus-visible {
  border-color: var(--vscode-border-accent);
  background: var(--vscode-hover-bg);
  outline: none;
}

.aiwf-rail-dialog-btn.is-primary {
  border-color: color-mix(in srgb, #4cb1ff 72%, var(--vscode-border));
}

.aiwf-rail-project-list {
  max-height: 340px;
  overflow: auto;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  padding: 6px;
  display: grid;
  gap: 6px;
}

.aiwf-rail-project-item {
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt) 48%, transparent);
  color: var(--vscode-fg);
  padding: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.aiwf-rail-project-main {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 2px;
}

.aiwf-rail-project-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aiwf-rail-project-del {
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: transparent;
  color: var(--vscode-fg-muted);
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.aiwf-rail-project-item small {
  color: var(--vscode-fg-muted);
}

.aiwf-rail-project-main:hover {
  color: var(--vscode-fg);
}

.aiwf-rail-project-del:hover {
  border-color: var(--vscode-border-accent);
  color: var(--vscode-fg);
  background: var(--vscode-hover-bg);
}

.aiwf-rail-project-item.active {
  border-color: var(--vscode-border-accent);
}

.aiwf-rail-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  padding: 8px;
}

.aiwf-rail-dialog-enter-active,
.aiwf-rail-dialog-leave-active {
  transition: all 0.2s ease;
}

.aiwf-rail-dialog-enter-from,
.aiwf-rail-dialog-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

@media (max-width: 920px) {
  .aiwf-floating-rail__identity {
    max-width: 150px;
  }
}
</style>
