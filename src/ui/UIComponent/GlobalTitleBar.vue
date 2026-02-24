<template>
  <header class="global-title-bar" aria-label="窗口标题栏">
    <div class="global-title-bar-left">
      <img class="global-title-bar-logo" src="/favicon.ico" alt="" aria-hidden="true" />
      <div class="global-title-bar-title">Dweb Video Studio</div>
    </div>

    <div class="backend-status-wrap" title="后端状态">
      <span class="backend-status-dot" :class="backendStatusClass" aria-hidden="true" />
      <span class="backend-status-text">{{ backendStatusText }}</span>
      <button class="titlebar-btn status-jump" type="button" @click="goWelcome">环境检查</button>
    </div>

    <div class="global-title-bar-right" aria-label="窗口控制">
      <button class="titlebar-btn" type="button" aria-label="强制刷新" title="强制刷新" @click="onReload">
        ↻
      </button>
      <button class="titlebar-btn" type="button" aria-label="打开开发者工具" title="开发者工具" @click="onOpenDevTools">
        🛠
      </button>
      <button class="titlebar-btn" type="button" aria-label="最小化" @click="onMinimize">—</button>
      <button class="titlebar-btn" type="button" aria-label="最大化/还原" @click="onToggleMaximize">□</button>
      <button class="titlebar-btn danger" type="button" aria-label="关闭" @click="onClose">×</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getBackendRuntimeState, onBackendRuntimeStateChanged } from '../../electronBridge'

const w = window as any
const router = useRouter()

const backendRuntime = ref<{
  running: boolean
  healthy: boolean
  baseUrl: string
  port: number
  lastError: string
  setupRunning: boolean
  updatedAt: number
} | null>(null)

let offRuntimeListener: (() => void) | null = null

const backendStatusClass = computed(() => {
  const st = backendRuntime.value
  if (!st) return 'bad'
  return st.running && st.healthy ? 'good' : 'bad'
})

const backendStatusText = computed(() => {
  const st = backendRuntime.value
  if (!st) return '后端状态未知'
  if (st.setupRunning) return '环境流程执行中'
  if (st.running && st.healthy) return `后端通畅 :${st.port || '-'}`
  if (st.running && !st.healthy) return '后端异常，请重启'
  return '后端未启动'
})

onMounted(async () => {
  const st = await getBackendRuntimeState()
  if (st) backendRuntime.value = st as any
  offRuntimeListener = onBackendRuntimeStateChanged((next) => {
    backendRuntime.value = next as any
  })
})

onBeforeUnmount(() => {
  offRuntimeListener?.()
  offRuntimeListener = null
})

async function onMinimize() {
  try {
    await w?.dweb?.window?.minimize?.()
  } catch {
    // ignore
  }
}

async function onReload() {
  try {
    await w?.dweb?.window?.reload?.()
  } catch {
    // ignore
  }
}

async function onOpenDevTools() {
  try {
    await w?.dweb?.window?.openDevTools?.()
  } catch {
    // ignore
  }
}

async function onToggleMaximize() {
  try {
    await w?.dweb?.window?.toggleMaximize?.()
  } catch {
    // ignore
  }
}

async function onClose() {
  try {
    await w?.dweb?.window?.close?.()
  } catch {
    // ignore
  }
}

function goWelcome() {
  void router.push({ name: 'Welcome' })
}
</script>

<style scoped>
.global-title-bar {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: color-mix(in srgb, var(--dweb-defualt-dark) 70%, transparent);
  backdrop-filter: blur(14px) saturate(1.25);
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  border-bottom: 1px solid var(--vscode-border);
  box-shadow: var(--vscode-shadow);

  user-select: none;
  -webkit-user-select: none;

  /* Electron frameless window drag region */
  -webkit-app-region: drag;
}

.global-title-bar-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.backend-status-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.backend-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid var(--vscode-border);
  box-sizing: border-box;
}

.backend-status-dot.good {
  background: var(--vscode-success);
  box-shadow: 0 0 6px color-mix(in srgb, var(--vscode-success) 68%, transparent);
}

.backend-status-dot.bad {
  background: var(--vscode-error);
  box-shadow: 0 0 6px color-mix(in srgb, var(--vscode-error) 68%, transparent);
}

.backend-status-text {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  white-space: nowrap;
}

.global-title-bar-logo {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.global-title-bar-title {
  min-width: 0;
  font-size: 12px;
  color: var(--vscode-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.global-title-bar-right {
  display: flex;
  align-items: stretch;
  gap: 6px;

  /* Buttons must be clickable */
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt) 70%, transparent);
  color: var(--vscode-fg);
  height: 26px;
  width: 40px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.titlebar-btn.status-jump {
  width: auto;
  min-width: 72px;
  padding: 0 10px;
  font-size: 12px;
}

.titlebar-btn:hover {
  background: color-mix(in srgb, var(--vscode-hover-bg) 75%, transparent);
  border-color: var(--vscode-hover-border);
}

.titlebar-btn.danger:hover {
  border-color: var(--vscode-error);
  box-shadow: var(--dweb-shadow-red);
}
</style>
