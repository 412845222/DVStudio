<template>
	<header class="dc-title-bar" @dblclick="onDoubleClick">
		<div class="dc-title-bar-corner dc-title-bar-corner-tl" />
		<div class="dc-title-bar-corner dc-title-bar-corner-br" />
		<div class="dc-title-bar-left">
			<img class="dc-title-bar-logo" src="/favicon.ico" alt="" aria-hidden="true" />
			<div class="dc-title-bar-title">{{ title }}</div>
		</div>
		<div class="dc-title-bar-right">
			<button
				class="dc-title-bar-btn"
				type="button"
				aria-label="minimize"
				title="—"
				@click="onMinimize"
			>
				—
			</button>
			<button
				class="dc-title-bar-btn"
				type="button"
				:aria-label="isMaximized ? 'restore' : 'maximize'"
				:title="isMaximized ? '❐' : '□'"
				@click="onToggleMaximize"
			>
				{{ isMaximized ? '❐' : '□' }}
			</button>
			<button
				class="dc-title-bar-btn danger"
				type="button"
				aria-label="close"
				title="×"
				@click="onClose"
			>
				×
			</button>
		</div>
	</header>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
	minimizeWindow,
	toggleMaximizeWindow,
	closeWindow,
	isWindowMaximized
} from '../../electronBridge'

defineProps<{
	title: string
}>()

const isMaximized = ref(false)
let maxCheckTimer: number | null = null

const checkMaximized = async () => {
	try {
		const res = await isWindowMaximized()
		if (res.ok && res.maximized != null) {
			isMaximized.value = res.maximized
		}
	} catch {
		/* ignore */
	}
}

onMounted(() => {
	checkMaximized()
	maxCheckTimer = window.setInterval(checkMaximized, 300)
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
		/* ignore */
	}
}

async function onToggleMaximize() {
	try {
		await toggleMaximizeWindow()
		setTimeout(checkMaximized, 100)
	} catch {
		/* ignore */
	}
}

async function onDoubleClick() {
	try {
		await toggleMaximizeWindow()
		setTimeout(checkMaximized, 100)
	} catch {
		/* ignore */
	}
}

async function onClose() {
	try {
		await closeWindow()
	} catch {
		/* ignore */
	}
}
</script>

<style scoped>
.dc-title-bar {
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 8px 0 12px;
	background: var(--dc-titlebar-bg, #0a0f18);
	border-bottom: 1px solid var(--dc-border, #1f3a2e);
	-webkit-app-region: drag;
	user-select: none;
	position: relative;
	flex-shrink: 0;
}
.dc-title-bar-corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: var(--dc-accent, #00ff88);
	pointer-events: none;
}
.dc-title-bar-corner-tl {
	top: 0;
	left: 0;
	border-top: 2px solid var(--dc-accent, #00ff88);
	border-left: 2px solid var(--dc-accent, #00ff88);
}
.dc-title-bar-corner-br {
	bottom: 0;
	right: 0;
	border-bottom: 2px solid var(--dc-accent, #00ff88);
	border-right: 2px solid var(--dc-accent, #00ff88);
}
.dc-title-bar-left {
	display: flex;
	align-items: center;
	gap: 8px;
}
.dc-title-bar-logo {
	width: 16px;
	height: 16px;
	pointer-events: none;
}
.dc-title-bar-title {
	font-size: 12px;
	color: var(--dc-text, #c8d4e0);
	letter-spacing: 0.5px;
}
.dc-title-bar-right {
	display: flex;
	align-items: center;
	gap: 2px;
	-webkit-app-region: no-drag;
}
.dc-title-bar-btn {
	width: 28px;
	height: 24px;
	border: none;
	background: transparent;
	color: var(--dc-text, #c8d4e0);
	font-size: 12px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 0.15s;
}
.dc-title-bar-btn:hover {
	background: var(--dc-btn-hover, rgba(0, 255, 136, 0.1));
}
.dc-title-bar-btn.danger:hover {
	background: rgba(255, 68, 68, 0.2);
	color: #ff4444;
}
</style>
