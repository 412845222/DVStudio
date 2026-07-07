<template>
	<div class="tcw-root">
		<div class="tcw-title-bar">
			<div class="tcw-title-left">
				<span class="tcw-title">{{ t('aiworkflow.templateCenter.title') }}</span>
				<span class="tcw-title-sub">{{ t('aiworkflow.templateCenter.subtitle') }}</span>
			</div>
			<div class="tcw-title-actions">
				<button class="tcw-title-btn" type="button" @click="handleMinimize">
					<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
						<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
				<button class="tcw-title-btn" type="button" @click="handleMaximize">
					<svg v-if="!isMaximized" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
						<rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" rx="1" />
					</svg>
					<svg v-else viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
						<path d="M2 2h6v6H2zm4 4h4v4H6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
				<button class="tcw-title-btn tcw-title-close" type="button" @click="handleClose">
					<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
						<path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			</div>
		</div>

		<div class="tcw-content">
			<TemplateCenterDialog
				:open="true"
				@update:open="handleClose"
				@save-template="handleSaveTemplate"
				@apply-template="handleApplyTemplate"
				@delete-template="handleDeleteTemplate"
				@upload-to-cloud="handleUploadToCloud"
				@download-from-cloud="handleDownloadFromCloud"
				@refresh-cloud="handleRefreshCloud"
			/>
		</div>

		<div v-if="toastMessage" class="tcw-toast" :class="`tcw-toast-${toastMessage.tone}`">
			{{ toastMessage.text }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import TemplateCenterDialog from '../../ui/WorkFlow/TemplateCenterDialog.vue'

const { t } = useI18n()

const isMaximized = ref(false)

const toastMessage = ref<{ text: string; tone: 'info' | 'warn' | 'error' } | null>(null)
let toastTimer: number | null = null

const pushToast = (text: string, tone: 'info' | 'warn' | 'error' = 'info') => {
	if (toastTimer !== null) {
		clearTimeout(toastTimer)
		toastTimer = null
	}
	toastMessage.value = { text, tone }
	toastTimer = window.setTimeout(() => {
		toastMessage.value = null
		toastTimer = null
	}, 3500)
}

const broadcastToMainWindow = async (event: string, data?: unknown) => {
	try {
		if (window.dweb?.aiworkflow && typeof window.dweb.aiworkflow.broadcastTemplateCenterEvent === 'function') {
			await window.dweb.aiworkflow.broadcastTemplateCenterEvent({ event, data })
		}
	} catch (err) {
		console.warn('[TemplateCenterWindow] broadcast failed:', err)
	}
}

const handleClose = async () => {
	try {
		if (window.dweb?.aiworkflow && typeof window.dweb.aiworkflow.closeTemplateCenter === 'function') {
			await window.dweb.aiworkflow.closeTemplateCenter()
			return
		}
	} catch {
	}
	try {
		window.close()
	} catch {
	}
}

const handleMinimize = () => {
	try {
		if (window.dweb?.window && typeof window.dweb.window.minimize === 'function') {
			window.dweb.window.minimize()
		}
	} catch {
	}
}

const handleMaximize = () => {
	isMaximized.value = !isMaximized.value
	try {
		if (window.dweb?.window && typeof window.dweb.window.toggleMaximize === 'function') {
			window.dweb.window.toggleMaximize()
		}
	} catch {
	}
}

const handleSaveTemplate = (payload: unknown) => {
	broadcastToMainWindow('save-template', payload)
}

const handleApplyTemplate = (payload: unknown) => {
	broadcastToMainWindow('apply-template', payload)
}

const handleDeleteTemplate = (payload: unknown) => {
	broadcastToMainWindow('delete-template', payload)
}

const handleUploadToCloud = (payload: unknown) => {
	broadcastToMainWindow('upload-to-cloud', payload)
}

const handleDownloadFromCloud = (payload: unknown) => {
	broadcastToMainWindow('download-from-cloud', payload)
}

const handleRefreshCloud = () => {
	broadcastToMainWindow('refresh-cloud')
}

onMounted(() => {
	document.title = `DVStudio · ${t('aiworkflow.templateCenter.title')}`
})

onBeforeUnmount(() => {
	if (toastTimer !== null) {
		clearTimeout(toastTimer)
		toastTimer = null
	}
})
</script>

<style scoped>
.tcw-root {
	width: 100%;
	height: 100vh;
	display: flex;
	flex-direction: column;
	background: var(--theme-bg-primary);
	overflow: hidden;
	position: relative;
	user-select: none;
}

.tcw-title-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 34px;
	padding: 0 10px 0 14px;
	background: var(--theme-bg-secondary);
	border-bottom: 1px solid var(--theme-border);
	-webkit-app-region: drag;
	flex-shrink: 0;
}

.tcw-title-left {
	display: flex;
	align-items: center;
	gap: 10px;
}

.tcw-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--theme-fg-primary);
	letter-spacing: 0.02em;
}

.tcw-title-sub {
	font-size: 11px;
	color: var(--theme-fg-tertiary);
	opacity: 0.7;
}

.tcw-title-actions {
	display: flex;
	align-items: center;
	gap: 0;
	-webkit-app-region: no-drag;
}

.tcw-title-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 46px;
	height: 34px;
	padding: 0;
	border: none;
	background: transparent;
	color: var(--theme-fg-secondary);
	cursor: pointer;
	transition: background-color 0.12s ease, color 0.12s ease;
}

.tcw-title-btn:hover {
	background: var(--theme-bg-tertiary);
	color: var(--theme-fg-primary);
}

.tcw-title-close:hover {
	background: #e81123;
	color: #fff;
}

.tcw-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
	overflow: hidden;
}

.tcw-content :deep(.tc-dialog) {
	position: relative;
	top: auto;
	left: auto;
	width: 100%;
	height: 100%;
	margin: 0;
	border-radius: 0;
	box-shadow: none;
}

.tcw-content :deep(.tc-header) {
	display: none;
}

.tcw-content :deep(.tc-mask) {
	background: transparent;
	position: relative;
}

.tcw-toast {
	position: fixed;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);
	padding: 10px 18px;
	border-radius: 4px;
	font-size: 12px;
	font-weight: 500;
	letter-spacing: 0.02em;
	z-index: 9999;
	animation: tcw-toast-in 200ms ease, tcw-toast-out 200ms ease 3300ms forwards;
}

.tcw-toast-info {
	background: color-mix(in srgb, var(--theme-accent-primary) 90%, black);
	color: #fff;
	box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-accent-primary) 30%, transparent);
}

.tcw-toast-warn {
	background: color-mix(in srgb, #f59e0b 90%, black);
	color: #fff;
	box-shadow: 0 4px 12px color-mix(in srgb, #f59e0b 30%, transparent);
}

.tcw-toast-error {
	background: color-mix(in srgb, #ef4444 90%, black);
	color: #fff;
	box-shadow: 0 4px 12px color-mix(in srgb, #ef4444 30%, transparent);
}

@keyframes tcw-toast-in {
	from { opacity: 0; transform: translateX(-50%) translateY(10px); }
	to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes tcw-toast-out {
	from { opacity: 1; transform: translateX(-50%) translateY(0); }
	to { opacity: 0; transform: translateX(-50%) translateY(10px); }
}

[data-theme='light'] .tcw-title-bar {
	background: #f3f4f6;
	border-bottom-color: #e5e7eb;
}

[data-theme='light'] .tcw-title {
	color: #1f2937;
}

[data-theme='light'] .tcw-title-sub {
	color: #9ca3af;
}

[data-theme='light'] .tcw-title-btn {
	color: #6b7280;
}

[data-theme='light'] .tcw-title-btn:hover {
	background: #e5e7eb;
	color: #1f2937;
}

[data-theme='light'] .tcw-title-close:hover {
	background: #e81123;
	color: #fff;
}
</style>