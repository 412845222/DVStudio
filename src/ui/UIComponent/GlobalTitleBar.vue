<template>
  <header class="global-title-bar" :aria-label="t('titlebar.windowTitle')" @dblclick="onDoubleClick">
    <div class="global-title-bar-left">
      <img class="global-title-bar-logo" src="/favicon.ico" alt="" aria-hidden="true" />
      <div class="global-title-bar-title">{{ appName }}</div>
    </div>

    <div class="backend-status-wrap" :title="t('titlebar.backendStatus')">
      <span class="backend-status-dot" :class="backendStatusClass" aria-hidden="true" />
    </div>

    <div class="platform-status-wrap" :title="platformStatusTooltip">
      <span class="platform-status-dot" :class="platformStatusClass" aria-hidden="true" />
      <span class="platform-status-text">{{ platformStatusText }}</span>
    </div>

    <div class="global-title-bar-right" :aria-label="t('titlebar.windowControls')">
      <GlobalTaskButton />
      <LanguageSwitcher />
      <button class="theme-toggle-btn" type="button" :aria-label="t('titlebar.themeToggle')" :title="t('titlebar.themeToggle')" @click="toggleTheme">
        <span class="theme-toggle-track" />
        <span class="theme-toggle-knob" />
        <span class="theme-toggle-icons" aria-hidden="true">
          <span class="theme-icon-sun">☀️</span>
          <span class="theme-icon-moon">🌙</span>
        </span>
      </button>
      <button class="titlebar-btn" type="button" :aria-label="t('titlebar.forceReload')" :title="t('titlebar.forceReload')" @click="onReload">
        ↻
      </button>
      <button class="titlebar-btn" type="button" :aria-label="t('titlebar.devTools')" :title="t('titlebar.devTools')" @click="onOpenDevTools">
        🛠
      </button>
      <button class="titlebar-btn" type="button" :aria-label="t('titlebar.about')" :title="t('titlebar.about')" @click="onOpenAbout">
        ℹ
      </button>
      <button class="titlebar-btn" type="button" :aria-label="t('titlebar.minimize')" @click="onMinimize">—</button>
      <button class="titlebar-btn" type="button" :aria-label="t('titlebar.maximize')" @click="onToggleMaximize">□</button>
      <button class="titlebar-btn danger" type="button" :aria-label="t('titlebar.close')" @click="onClose">×</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
	getBackendRuntimeState,
	onBackendRuntimeStateChanged,
	minimizeWindow,
	toggleMaximizeWindow,
	closeWindow,
	reloadWindow,
	openDevTools,
} from '../../electronBridge'
import { usePlatform } from '../../platformBridge'
import type { BackendRuntimeState } from '../../electronBridge/types'
import { ThemeStore } from '../../store/theme'
import { getAppName } from '../../network/appInfo'
import { openAboutDialog } from './aboutDialogStore'
import { useI18n } from '../../i18n'
import LanguageSwitcher from './LanguageSwitcher.vue'
import GlobalTaskButton from './GlobalTaskButton.vue'

const { t } = useI18n()

const appName = getAppName()

const backendRuntime = ref<BackendRuntimeState | null>(null)

let offRuntimeListener: (() => void) | null = null

const backendStatusClass = computed(() => {
  const st = backendRuntime.value
  if (!st) return 'bad'
  return st.running && st.healthy ? 'good' : 'bad'
})

onMounted(async () => {
  const st = await getBackendRuntimeState()
  if (st) backendRuntime.value = st
  offRuntimeListener = onBackendRuntimeStateChanged((next) => {
    backendRuntime.value = next
  })
})

onBeforeUnmount(() => {
  offRuntimeListener?.()
  offRuntimeListener = null
})

async function onMinimize() {
  try {
    await minimizeWindow()
  } catch {
    // ignore
  }
}

async function onReload() {
  try {
    await reloadWindow()
  } catch {
    // ignore
  }
}

async function onOpenDevTools() {
  try {
    await openDevTools()
  } catch {
    // ignore
  }
}

async function onToggleMaximize() {
  try {
    await toggleMaximizeWindow()
  } catch {
    // ignore
  }
}

async function onDoubleClick() {
  try {
    await toggleMaximizeWindow()
  } catch {
    // ignore
  }
}

async function onClose() {
  try {
    await closeWindow()
  } catch {
    // ignore
  }
}

const { status: platformStatus, isSteam, isRealPlatform, user, displayName } = usePlatform()

const platformStatusClass = computed(() => {
  const s = platformStatus.value
  if (!s) return 'mock'
  if (s.available && s.initialized && s.loggedIn) return 'good'
  if (s.available && !s.loggedIn) return 'warn'
  return 'mock'
})

const platformStatusText = computed(() => {
  const s = platformStatus.value
  if (!s) return t('titlebar.platformDevMode')
  if (isSteam.value && user.value?.displayName) {
    return t('titlebar.platformSteam', { name: user.value.displayName })
  }
  if (isRealPlatform.value) {
    return displayName.value
  }
  return t('titlebar.platformDevMode')
})

const platformStatusTooltip = computed(() => {
  const s = platformStatus.value
  if (!s) return t('titlebar.platformMock')
  if (isSteam.value) {
    const userName = user.value?.displayName || t('common.unknown')
    return `${t('titlebar.platformSteamConnected')}\n${t('titlebar.platformSteamUser', { name: userName })}`
  }
  if (isRealPlatform.value) {
    return t('titlebar.platformMode', { name: displayName.value })
  }
  return t('titlebar.platformNoSdk')
})

function toggleTheme() {
  ThemeStore.dispatch('toggleTheme')
}

function onOpenAbout() {
  openAboutDialog()
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
  background: var(--theme-titlebar-bg);
  backdrop-filter: blur(14px) saturate(1.25);
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  border-bottom: 1px solid var(--theme-titlebar-border);
  box-shadow: var(--theme-shadow);

  user-select: none;
  -webkit-user-select: none;

  /* Electron frameless window drag region */
  -webkit-app-region: drag;
}

/* Theme Toggle Button */
.theme-toggle-btn {
  position: relative;
  width: 52px;
  height: 26px;
  border: 1px solid var(--theme-border);
  border-radius: 13px;
  background: var(--theme-bg-tertiary);
  cursor: pointer;
  overflow: hidden;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.theme-toggle-btn:hover {
  border-color: var(--theme-accent);
}

.theme-toggle-btn:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--theme-accent-muted);
}

.theme-toggle-track {
  position: absolute;
  inset: 2px;
  border-radius: 11px;
  background: var(--theme-bg-secondary);
}

.theme-toggle-knob {
  position: absolute;
  top: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--theme-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

[data-theme="dark"] .theme-toggle-knob {
  left: 3px;
}

[data-theme="light"] .theme-toggle-knob {
  left: 27px;
}

.theme-toggle-icons {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
}

.theme-icon-sun,
.theme-icon-moon {
  font-size: 11px;
  line-height: 1;
}

[data-theme="dark"] .theme-icon-sun {
  opacity: 0.35;
}

[data-theme="dark"] .theme-icon-moon {
  opacity: 1;
}

[data-theme="light"] .theme-icon-sun {
  opacity: 1;
}

[data-theme="light"] .theme-icon-moon {
  opacity: 0.35;
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
  border: 1px solid var(--theme-border);
  box-sizing: border-box;
}

.backend-status-dot.good {
  background: var(--theme-success);
  box-shadow: 0 0 6px color-mix(in srgb, var(--theme-success) 68%, transparent);
}

.backend-status-dot.bad {
  background: var(--theme-error);
  box-shadow: 0 0 6px color-mix(in srgb, var(--theme-error) 68%, transparent);
}

.global-title-bar-logo {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.global-title-bar-title {
  min-width: 0;
  font-size: 12px;
  color: var(--theme-text-primary);
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
  border: 1px solid var(--theme-border);
  border-radius: 0;
  background: var(--theme-bg-tertiary);
  color: var(--theme-text-primary);
  height: 26px;
  width: 40px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.titlebar-btn:hover {
  background: var(--theme-hover-bg);
  border-color: var(--theme-hover-border);
}

.titlebar-btn.danger:hover {
  border-color: var(--theme-error);
}

.platform-status-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.platform-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  box-sizing: border-box;
}

.platform-status-dot.good {
  background: var(--theme-accent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--theme-accent) 68%, transparent);
}

.platform-status-dot.warn {
  background: var(--theme-warning, #f0ad4e);
  box-shadow: 0 0 6px color-mix(in srgb, var(--theme-warning, #f0ad4e) 68%, transparent);
}

.platform-status-dot.mock {
  background: var(--theme-text-secondary);
  opacity: 0.5;
}

.platform-status-text {
  font-size: 12px;
  color: var(--theme-text-secondary);
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
