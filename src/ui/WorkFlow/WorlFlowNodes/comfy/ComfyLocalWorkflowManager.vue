<template>
	<Teleport to="body">
		<div v-if="visible" class="clwm-overlay" @click.self="onClose">
			<div class="clwm-panel">
				<div class="clwm-header">
					<div class="clwm-title">{{ t('nodes.comfyui.managerTitle') }}</div>
					<button class="clwm-close-btn" type="button" @click.stop="onClose">✕</button>
				</div>

				<div class="clwm-toolbar">
					<button class="clwm-btn" type="button" :disabled="loading" @click.stop="onImportClick">
						{{ t('nodes.comfyui.importFromFile') }}
					</button>
					<button
						v-if="canSaveCurrentAsLocal"
						class="clwm-btn clwm-btn-ghost"
						type="button"
						:disabled="loading"
						@click.stop="onSaveCurrentAsLocal"
					>
						{{ t('nodes.comfyui.saveAsLocal') }}
					</button>
					<button
						class="clwm-btn clwm-btn-ghost"
						type="button"
						:disabled="loading"
						@click.stop="refresh"
					>
						{{ t('nodes.comfyui.refreshList') }}
					</button>
					<input
						ref="fileInputRef"
						type="file"
						accept=".json,application/json"
						class="clwm-file-hidden"
						@change="onFileSelected"
					/>
				</div>

				<div class="clwm-body">
					<div v-if="loading" class="clwm-empty">{{ t('nodes.comfyui.managerLoading') }}</div>
					<div v-else-if="items.length === 0" class="clwm-empty">
						{{ t('nodes.comfyui.managerEmpty') }}
					</div>
					<div v-else class="clwm-list">
						<div v-for="item in items" :key="item.id" class="clwm-item">
							<div class="clwm-item-info">
								<div class="clwm-item-name">
									<template v-if="editingId === item.id">
										<input
											class="clwm-rename-input"
											type="text"
											v-model="editingName"
											@keydown.enter.prevent="confirmRename(item)"
											@keydown.esc.prevent="cancelRename"
											@pointerdown.stop
										/>
									</template>
									<template v-else>{{ item.name }}</template>
								</div>
								<div class="clwm-item-meta">
									<span v-if="item.updatedAt">{{ formatTime(item.updatedAt) }}</span>
								</div>
							</div>
							<div class="clwm-item-actions">
								<template v-if="editingId === item.id">
									<button
										class="clmw-action-btn clmw-action-ok"
										type="button"
										@click.stop="confirmRename(item)"
									>
										✓
									</button>
									<button
										class="clmw-action-btn clmw-action-cancel"
										type="button"
										@click.stop="cancelRename"
									>
										✕
									</button>
								</template>
								<template v-else>
									<button
										class="clmw-action-btn"
										type="button"
										:title="t('nodes.comfyui.rename')"
										@click.stop="startRename(item)"
									>
										{{ t('nodes.comfyui.rename') }}
									</button>
									<button
										class="clmw-action-btn clmw-action-danger"
										type="button"
										:title="t('nodes.comfyui.delete')"
										@click.stop="onDelete(item)"
									>
										{{ t('nodes.comfyui.delete') }}
									</button>
								</template>
							</div>
						</div>
					</div>
				</div>

				<div v-if="statusMessage" class="clwm-footer" :class="statusTone">
					{{ statusMessage }}
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../../../../i18n'
import type {
	ComfyUIBridgeService,
	LocalComfyWorkflow
} from '../../../../network/ComfyUIBridgeService'

const { t } = useI18n()

type ManagerItem = {
	id: string
	name: string
	updatedAt?: number
}

const props = defineProps<{
	visible: boolean
	comfyService: ComfyUIBridgeService
	// 可选：当前 ComfyUI 节点选中的工作流数据，用于「另存为本地模板」
	currentWorkflowData?: unknown
	currentWorkflowName?: string
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'changed'): void
}>()

const items = ref<ManagerItem[]>([])
const loading = ref(false)
const statusMessage = ref('')
const statusTone = ref<'info' | 'warn' | 'error'>('info')
const fileInputRef = ref<HTMLInputElement | null>(null)
const editingId = ref<string | null>(null)
const editingName = ref('')

let statusTimer: ReturnType<typeof setTimeout> | null = null

function setStatus(msg: string, tone: 'info' | 'warn' | 'error' = 'info') {
	statusMessage.value = msg
	statusTone.value = tone
	if (statusTimer) clearTimeout(statusTimer)
	statusTimer = setTimeout(() => {
		statusMessage.value = ''
	}, 3500)
}

function formatTime(ts: number): string {
	const d = new Date(ts)
	const pad = (n: number) => (n < 10 ? '0' + n : String(n))
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const canSaveCurrentAsLocal = computed(
	() => props.currentWorkflowData != null && typeof props.currentWorkflowData === 'object'
)

async function refresh() {
	loading.value = true
	try {
		const res = await props.comfyService.listLocalWorkflows()
		if (res.ok) {
			items.value = (res.items || []).map((w: LocalComfyWorkflow) => ({
				id: w.id,
				name: w.name || t('nodes.comfyui.unnamedWorkflow'),
				updatedAt: Number(w.updatedAt) || undefined
			}))
		} else {
			setStatus(res.error || t('nodes.comfyui.managerLoadFailed'), 'error')
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		setStatus(msg, 'error')
	} finally {
		loading.value = false
	}
}

function onClose() {
	emit('close')
}

function onImportClick() {
	fileInputRef.value?.click()
}

async function onFileSelected(e: Event) {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	try {
		const text = await file.text()
		const data = JSON.parse(text)
		if (!data || typeof data !== 'object') {
			setStatus(t('nodes.comfyui.importInvalidJson'), 'error')
			return
		}
		const name = file.name.replace(/\.json$/i, '')
		const res = await props.comfyService.saveLocalWorkflow({ name, data })
		if (res.ok) {
			setStatus(t('nodes.comfyui.localImportSuccess', { name }), 'info')
			await refresh()
			emit('changed')
		} else {
			setStatus(res.error || t('nodes.comfyui.localImportFailed'), 'error')
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		setStatus(t('nodes.comfyui.localImportFailed') + ': ' + msg, 'error')
	} finally {
		input.value = ''
	}
}

async function onSaveCurrentAsLocal() {
	const data = props.currentWorkflowData
	if (!data) return
	const defaultName = props.currentWorkflowName || t('nodes.comfyui.unnamedWorkflow')
	const name = window.prompt(t('nodes.comfyui.inputTemplateName'), defaultName)
	if (!name || !name.trim()) return
	try {
		const res = await props.comfyService.saveLocalWorkflow({ name: name.trim(), data })
		if (res.ok) {
			setStatus(t('nodes.comfyui.saveAsLocalSuccess', { name }), 'info')
			await refresh()
			emit('changed')
		} else {
			setStatus(res.error || t('nodes.comfyui.saveAsLocalFailed'), 'error')
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		setStatus(msg, 'error')
	}
}

function startRename(item: ManagerItem) {
	editingId.value = item.id
	editingName.value = item.name
}

function cancelRename() {
	editingId.value = null
	editingName.value = ''
}

async function confirmRename(item: ManagerItem) {
	const newName = editingName.value.trim()
	if (!newName || newName === item.name) {
		cancelRename()
		return
	}
	try {
		const getRes = await props.comfyService.getLocalWorkflow(item.id)
		if (!getRes.ok) {
			setStatus(getRes.error || t('nodes.comfyui.renameFailed'), 'error')
			cancelRename()
			return
		}
		const res = await props.comfyService.saveLocalWorkflow({
			id: item.id,
			name: newName,
			data: getRes.workflow.data
		})
		if (res.ok) {
			setStatus(t('nodes.comfyui.renameSuccess'), 'info')
			await refresh()
			emit('changed')
		} else {
			setStatus(res.error || t('nodes.comfyui.renameFailed'), 'error')
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		setStatus(msg, 'error')
	} finally {
		cancelRename()
	}
}

async function onDelete(item: ManagerItem) {
	if (!window.confirm(t('nodes.comfyui.confirmDelete', { name: item.name }))) return
	try {
		const res = await props.comfyService.deleteLocalWorkflow(item.id)
		if (res.ok) {
			setStatus(t('nodes.comfyui.deleteSuccess'), 'info')
			await refresh()
			emit('changed')
		} else {
			setStatus(res.error || t('nodes.comfyui.deleteFailed'), 'error')
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		setStatus(msg, 'error')
	}
}

watch(
	() => props.visible,
	(v) => {
		if (v) refresh()
		else {
			cancelRename()
			statusMessage.value = ''
		}
	}
)

onMounted(() => {
	if (props.visible) refresh()
})

onBeforeUnmount(() => {
	if (statusTimer) clearTimeout(statusTimer)
})
</script>

<style scoped>
.clwm-overlay {
	position: fixed;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.55);
	backdrop-filter: blur(2px);
}

.clwm-panel {
	width: min(640px, 92vw);
	max-height: 80vh;
	display: flex;
	flex-direction: column;
	background: var(--dweb-defualt-dark, #1a1a1a);
	border: 1px solid var(--vscode-border, #3c3c3c);
	border-left: 3px solid var(--vscode-border-accent, #4caf50);
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.clwm-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	border-bottom: 1px solid var(--vscode-border, #3c3c3c);
	flex-shrink: 0;
}

.clwm-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--vscode-foreground, #d4d4d4);
	letter-spacing: 0.5px;
}

.clwm-close-btn {
	width: 22px;
	height: 22px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: 1px solid var(--vscode-border, #3c3c3c);
	background: transparent;
	color: var(--vscode-foreground, #d4d4d4);
	cursor: pointer;
	font-size: 12px;
	line-height: 1;
}

.clwm-close-btn:hover {
	background: rgba(255, 80, 80, 0.15);
	color: #f48771;
	border-color: #f48771;
}

.clwm-toolbar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 14px;
	border-bottom: 1px solid var(--vscode-border, #3c3c3c);
	flex-shrink: 0;
	flex-wrap: wrap;
}

.clwm-btn {
	padding: 5px 10px;
	border: 1px solid var(--vscode-border, #3c3c3c);
	background: var(--dweb-defualt-dark, #1a1a1a);
	color: var(--vscode-foreground, #d4d4d4);
	font-size: 12px;
	cursor: pointer;
	border-radius: 0;
}

.clwm-btn:hover:not(:disabled) {
	border-color: var(--vscode-border-accent, #4caf50);
	color: var(--vscode-border-accent, #4caf50);
}

.clwm-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.clwm-btn-ghost {
	background: transparent;
}

.clwm-file-hidden {
	display: none;
}

.clwm-body {
	flex: 1;
	overflow-y: auto;
	padding: 8px 14px;
	min-height: 200px;
}

.clwm-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 180px;
	color: var(--vscode-fg-muted, #888);
	font-size: 12px;
	opacity: 0.85;
}

.clwm-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.clwm-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 8px 10px;
	border: 1px solid var(--vscode-border, #3c3c3c);
	background: rgba(255, 255, 255, 0.02);
}

.clwm-item:hover {
	border-color: var(--vscode-border-accent, #4caf50);
}

.clwm-item-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.clwm-item-name {
	font-size: 12px;
	color: var(--vscode-foreground, #d4d4d4);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.clwm-item-meta {
	font-size: 10px;
	color: var(--vscode-fg-muted, #888);
}

.clwm-rename-input {
	width: 100%;
	box-sizing: border-box;
	padding: 3px 6px;
	border: 1px solid var(--vscode-border-accent, #4caf50);
	background: var(--dweb-defualt-dark, #1a1a1a);
	color: var(--vscode-foreground, #d4d4d4);
	font-size: 12px;
	outline: none;
	border-radius: 0;
}

.clwm-item-actions {
	display: flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
}

.clmw-action-btn {
	padding: 3px 8px;
	border: 1px solid var(--vscode-border, #3c3c3c);
	background: transparent;
	color: var(--vscode-foreground, #d4d4d4);
	font-size: 11px;
	cursor: pointer;
	border-radius: 0;
	white-space: nowrap;
}

.clmw-action-btn:hover {
	border-color: var(--vscode-border-accent, #4caf50);
	color: var(--vscode-border-accent, #4caf50);
}

.clmw-action-ok {
	border-color: #4caf50;
	color: #4caf50;
}

.clmw-action-cancel {
	border-color: #888;
	color: #888;
}

.clmw-action-danger:hover {
	border-color: #f48771;
	color: #f48771;
}

.clwm-footer {
	padding: 8px 14px;
	border-top: 1px solid var(--vscode-border, #3c3c3c);
	font-size: 11px;
	flex-shrink: 0;
}

.clwm-footer.info {
	color: var(--vscode-border-accent, #4caf50);
}

.clwm-footer.warn {
	color: #ffc107;
}

.clwm-footer.error {
	color: #f48771;
}
</style>
