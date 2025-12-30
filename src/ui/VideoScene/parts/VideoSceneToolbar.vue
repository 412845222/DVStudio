<template>
	<div ref="rootEl" class="vs-toolbar" @pointerdown.stop>
		<button class="vs-tool-btn" type="button" :class="{ active: showSizePanel }" @click="onSize">尺寸</button>
		<button class="vs-tool-btn" type="button" :class="{ active: showBackgroundPanel }" @click="onBackground">背景</button>
		<button class="vs-tool-btn" type="button" @click="addBase">添加</button>
		<button class="vs-tool-btn" type="button" @click="onImport">导入</button>
		<button
			ref="aiBtnRef"
			class="vs-tool-btn"
			type="button"
			:class="{ active: aiOpen && !aiMinimized }"
			:title="aiMinimized ? 'AI助手（已最小化）' : 'AI助手'"
			@click="toggleAi"
		>
			AI助手
		</button>
		<input ref="importInputEl" class="vs-import-input" type="file" accept="application/json,.json" @change="onImportFile" />
		<div class="vs-toolbar-spacer" />
		<button class="vs-tool-btn vs-icon-btn" type="button" :disabled="!canUndo" title="撤销 (Ctrl+Z)" @click="undo">↶</button>
		<button class="vs-tool-btn vs-icon-btn" type="button" :disabled="!canRedo" title="重做 (Ctrl+Y)" @click="redo">↷</button>
		<span class="vs-save-time">最后保存：{{ lastSavedText }}</span>
		<button class="vs-tool-btn" type="button" title="保存 (Ctrl+S)" @click="save">保存</button>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState } from '../../../store/videoscene'
import { editorPersistence } from '../../../adapters/editorPersistence'
import { componentTemplateApi } from '../../../core/components'

const props = defineProps<{ aiOpen?: boolean; aiMinimized?: boolean }>()
const emit = defineEmits<{ 'toggle-ai': [{ anchor: { x: number; y: number } | null }] }>()

const store = useStore<VideoSceneState>(VideoSceneKey)

const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const aiBtnRef = ref<HTMLButtonElement | null>(null)

const importInputEl = ref<HTMLInputElement | null>(null)

const showSizePanel = computed(() => store.state.showSizePanel)
const showBackgroundPanel = computed(() => store.state.showBackgroundPanel)

const aiOpen = computed(() => !!props.aiOpen)
const aiMinimized = computed(() => !!props.aiMinimized)

const canUndo = computed(() => editorPersistence.canUndo.value)
const canRedo = computed(() => editorPersistence.canRedo.value)

const lastSavedText = computed(() => {
	const ts = editorPersistence.lastSavedAt.value
	if (!ts) return '未保存'
	try {
		return new Date(ts).toLocaleTimeString()
	} catch {
		return String(ts)
	}
})

const addBase = () => {
	store.dispatch('addBaseNode')
}

const onSize = () => {
	store.dispatch('toggleSizePanel')
}

const onBackground = () => {
	store.dispatch('toggleBackgroundPanel')
}

const onImport = () => {
	importInputEl.value?.click()
}

const toggleAi = () => {
	const rect = aiBtnRef.value?.getBoundingClientRect()
	if (!rect) {
		emit('toggle-ai', { anchor: null })
		return
	}
	// viewport coordinates (fixed-position dialog)
	emit('toggle-ai', { anchor: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })
}

const onImportFile = async (e: Event) => {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	try {
		const text = await file.text()
		const parsed: unknown = JSON.parse(text)
		const instantiated = componentTemplateApi.instantiateTemplate(parsed)
		store.dispatch('addNodeTree', { node: instantiated.root })
	} catch (err) {
		console.error('[dvs] import failed', err)
		window.alert('导入失败：文件格式不正确或不是高级组件模板（ComponentTemplate）')
	}
}

const save = () => {
	void editorPersistence.save()
}

const undo = () => {
	editorPersistence.undo()
}

const redo = () => {
	editorPersistence.redo()
}

</script>

<style scoped>
.vs-toolbar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 40px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 12px;
	border-top: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	z-index: 3;
}

.vs-toolbar-spacer {
	flex: 1;
	min-width: 0;
}

.vs-icon-btn {
	width: 34px;
	padding: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.vs-save-time {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	white-space: nowrap;
}

.vs-tool-btn {
	height: 28px;
	padding: 0 10px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
}

.vs-tool-btn:hover {
	border-color: var(--vscode-border-accent);
}

.vs-tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.vs-import-input {
	display: none;
}

.vs-tool-btn.active {
	border-color: var(--vscode-border-accent);
}

</style>
