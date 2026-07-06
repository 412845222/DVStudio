<template>
  <header class="dialog-title-bar" @dblclick="onDoubleClick">
    <div class="dialog-title-bar-left">
      <img class="dialog-title-bar-logo" src="/favicon.ico" alt="" aria-hidden="true" />
      <div class="dialog-title-bar-title">{{ title }}</div>
    </div>

    <div class="dialog-title-bar-right">
      <button class="theme-toggle-btn" type="button" :aria-label="t('titlebar.themeToggle')" :title="t('titlebar.themeToggle')" @click="toggleTheme">
        <span class="theme-toggle-track" />
        <span class="theme-toggle-knob" />
        <span class="theme-toggle-icons" aria-hidden="true">
          <span class="theme-icon-sun">☀️</span>
          <span class="theme-icon-moon">🌙</span>
        </span>
      </button>
      <LanguageSwitcher />
      <button class="titlebar-btn" type="button" aria-label="minimize" title="—" @click="onMinimize">—</button>
      <button class="titlebar-btn" type="button" aria-label="maximize" :title="isMaximized ? '❐' : '□'" @click="onToggleMaximize">
        {{ isMaximized ? '❐' : '□' }}
      </button>
      <button class="titlebar-btn danger" type="button" aria-label="close" title="×" @click="onClose">×</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
} from '../../electronBridge'
import { ThemeStore } from '../../store/theme'
import { useI18n } from '../../i18n'
import LanguageSwitcher from './LanguageSwitcher.vue'

defineProps<{
  title: string
}>()

const { t } = useI18n()
const isMaximized = ref(false)

let maxCheckTimer: number | null = null

const checkMaximized = async () => {
  try {
    const res = await isWindowMaximized()
    if (res.ok && res.maximized != null) {
      isMaximized.value = res.maximized
    }
  } catch {
    // ignore
  }
}

onMounted(() => {
  checkMaximized()
  maxCheckTimer = window.setInterval(() => {
    checkMaximized()
  }, 300)
})

onBeforeUnmount(() => {
  if (maxCheckTimer != null) {
    window.clearInterval(maxCheckTimer)
    maxCheckTimer = null
  }
})

async function onMinimize() {
  try {
    await minimizeWindow()
  } catch {
    // ignore
  }
}

async function onToggleMaximize() {
  try {
    await toggleMaximizeWindow()
    setTimeout(checkMaximized, 100)
  } catch {
    // ignore
  }
}

async function onDoubleClick() {
  try {
    await toggleMaximizeWindow()
    setTimeout(checkMaximized, 100)
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

function toggleTheme() {
  ThemeStore.dispatch('toggleTheme')
}
</script>

<style scoped>
.dialog-title-bar {
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

  -webkit-app-region: drag;
}

.dialog-title-bar-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-title-bar-logo {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.dialog-title-bar-title {
  min-width: 0;
  font-size: 12px;
  color: var(--theme-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog-title-bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
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
  min-width: 40px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}

.titlebar-btn:hover {
  background: var(--theme-hover-bg);
  border-color: var(--theme-hover-border);
}

.titlebar-btn.danger:hover {
  border-color: var(--theme-error);
  background: color-mix(in srgb, var(--theme-error) 20%, var(--theme-bg-tertiary));
}

.theme-toggle-btn {
  position: relative;
  width: 52px;
  height: 26px;
  border: 1px solid var(--theme-border);
  border-radius: 13px;
  background: var(--theme-bg-tertiary);
  cursor: pointer;
  overflow: hidden;
  padding: 0;
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
</style>
