<template>
	<div class="tcw-root">
		<div class="tcw-content">
			<TemplateCenterDialog
				:open="dialogOpen"
				@update:open="handleClose"
				@save-template="handleSaveTemplate"
				@apply-template-confirm="handleApplyTemplateConfirm"
				@delete-template="handleDeleteTemplate"
				@upload-template="handleUploadToCloud"
				@download-template="handleDownloadFromCloud"
				@preview-template="handlePreviewTemplate"
			/>
		</div>

		<div v-if="toastMessage" class="tcw-toast" :class="`tcw-toast-${toastMessage.tone}`">
			{{ toastMessage.text }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw } from 'vue'
import { useI18n } from '../../i18n'
import TemplateCenterDialog from '../../ui/WorkFlow/TemplateCenterDialog.vue'

const { t } = useI18n()

const dialogOpen = ref(false)

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
	console.log('[TemplateCenterWindow] broadcastToMainWindow, event:', event, 'has dweb.aiworkflow:', !!window.dweb?.aiworkflow, 'has broadcast:', typeof window.dweb?.aiworkflow?.broadcastTemplateCenterEvent)
	try {
		if (window.dweb?.aiworkflow && typeof window.dweb.aiworkflow.broadcastTemplateCenterEvent === 'function') {
			const result = await window.dweb.aiworkflow.broadcastTemplateCenterEvent({ event, data })
			console.log('[TemplateCenterWindow] broadcast result:', result)
		} else {
			console.error('[TemplateCenterWindow] broadcastTemplateCenterEvent not available on window.dweb.aiworkflow')
		}
	} catch (err) {
		console.error('[TemplateCenterWindow] broadcast failed:', err)
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

const handleSaveTemplate = async (payload: unknown) => {
	await broadcastToMainWindow('save-template', payload)
	handleClose()
}

const handleApplyTemplateConfirm = async (payload: unknown) => {
	console.log('[TemplateCenterWindow] handleApplyTemplateConfirm received, payload type:', typeof payload)
	if (!payload || typeof payload !== 'object') {
		console.error('[TemplateCenterWindow] handleApplyTemplateConfirm: invalid payload')
		return
	}
	const p = payload as Record<string, unknown>
	const template = p.template as Record<string, unknown> | undefined
	if (!template || typeof template !== 'object') {
		console.error('[TemplateCenterWindow] handleApplyTemplateConfirm: missing template in payload')
		return
	}
	const plainTemplate = {
		id: String(template.id || ''),
		name: String(template.name || ''),
		description: String(template.description || ''),
		category: template.category as string,
		source: template.source as string,
		thumbnail: template.thumbnail as string | undefined,
		coverPath: template.coverPath as string | undefined,
		packagePath: template.packagePath as string | undefined,
		filePath: template.filePath as string | undefined,
		createdAt: template.createdAt as number | undefined,
		updatedAt: template.updatedAt as number | undefined,
		author: template.author as string | undefined,
		version: template.version as string | undefined,
		tags: Array.isArray(template.tags) ? [...template.tags] as string[] : undefined,
		nodeCount: template.nodeCount as number | undefined,
		resourceCount: template.resourceCount as number | undefined,
		steamFileId: template.steamFileId as string | undefined,
		cloudSyncStatus: template.cloudSyncStatus as string | undefined,
		lastSyncAt: template.lastSyncAt as number | undefined,
		workshopItemId: template.workshopItemId as string | undefined,
		subscribed: template.subscribed as boolean | undefined,
	}
	console.log('[TemplateCenterWindow] safe plain template:', { id: plainTemplate.id, name: plainTemplate.name, source: plainTemplate.source, packagePath: plainTemplate.packagePath })
	const safePayload = {
		template: plainTemplate,
		target: p.target as string,
		newProjectName: p.newProjectName as string | undefined,
		newProjectPath: p.newProjectPath as string | undefined,
	}
	console.log('[TemplateCenterWindow] broadcasting apply-template-confirm with safe payload:', { target: safePayload.target, templateId: safePayload.template.id })
	await broadcastToMainWindow('apply-template-confirm', safePayload)
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

const handlePreviewTemplate = async (_payload: unknown) => {
	pushToast(t('aiworkflow.templateCenter.featureComingSoon'), 'info')
}

onMounted(() => {
	document.title = `DVStudio · ${t('aiworkflow.templateCenter.title')}`
	requestAnimationFrame(() => {
		dialogOpen.value = true
	})
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
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--theme-bg-primary);
	overflow: hidden;
	position: relative;
}

.tcw-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
	overflow: hidden;
	position: relative;
}

.tcw-content :deep(.tc-mask) {
	position: relative !important;
	top: auto !important;
	left: auto !important;
	right: auto !important;
	bottom: auto !important;
	inset: auto !important;
	width: 100% !important;
	height: 100% !important;
	display: flex !important;
	align-items: stretch !important;
	justify-content: stretch !important;
	padding: 0 !important;
	margin: 0 !important;
	background: transparent !important;
	backdrop-filter: none !important;
	z-index: 1 !important;
	box-sizing: border-box !important;
}

.tcw-content :deep(.tc-dialog) {
	position: relative !important;
	top: auto !important;
	left: auto !important;
	width: 100% !important;
	height: 100% !important;
	max-width: none !important;
	max-height: none !important;
	margin: 0 !important;
	padding: 0 !important;
	border-radius: 0 !important;
	box-shadow: none !important;
	border: none !important;
	display: flex !important;
	flex-direction: column !important;
	overflow: hidden !important;
}

.tcw-content :deep(.tc-header) {
	display: none !important;
}

.tcw-content :deep(.tc-bg-layer),
.tcw-content :deep(.tc-scanline),
.tcw-content :deep(.tc-particles),
.tcw-content :deep(.tc-corner) {
	display: none !important;
}

.tcw-content :deep(.tc-tabs) {
	padding-left: 0 !important;
	padding-right: 0 !important;
	flex-shrink: 0;
}

.tcw-content :deep(.tc-quota-bar-wrap) {
	padding-left: 0 !important;
	padding-right: 0 !important;
	flex-shrink: 0;
}

.tcw-content :deep(.tc-toolbar) {
	padding-left: 0 !important;
	padding-right: 0 !important;
	flex-shrink: 0;
}

.tcw-content :deep(.tc-content) {
	padding: 0 !important;
	flex: 1 !important;
	overflow-y: auto !important;
	min-height: 0 !important;
}

.tcw-content :deep(.tc-grid) {
	padding: 8px !important;
	min-height: 0 !important;
}

.tcw-content :deep(.tc-loading),
.tcw-content :deep(.tc-empty) {
	padding: 16px !important;
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
</style>
