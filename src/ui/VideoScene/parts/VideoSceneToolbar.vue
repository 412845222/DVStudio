<template>
	<div ref="rootEl" class="vs-toolbar" @pointerdown.stop>
		<button class="vs-tool-btn" type="button" :class="{ active: showSizePanel }" @click="onSize">尺寸</button>
		<button class="vs-tool-btn" type="button" :class="{ active: showBackgroundPanel }" @click="onBackground">背景</button>
		<button class="vs-tool-btn" type="button" @click="addBase">添加</button>
		<button class="vs-tool-btn" type="button" @click="onImportSubtitle">导入字幕</button>
		<button class="vs-tool-btn" type="button" @click="onImportComponent">导入高级组件</button>
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
		<input ref="importSubtitleInputEl" class="vs-import-input" type="file" accept=".srt,text/plain" @change="onImportSubtitleFile" />
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
import { VideoStudioKey, type VideoStudioState } from '../../../store/videostudio'
import { editorPersistence } from '../../../adapters/editorPersistence'
import { componentTemplateApi } from '../../../core/components'
import { TimelineStore } from '../../../store/timeline'
import { msToFrameRangeInclusive, parseSrt } from '../../../core/subtitle/srt'
import { buildSubtitleGeneratedKeyframes } from '../../../core/subtitle/subtitleKeyframes'
import type { TimelineFrameSpan } from '../../../store/timeline/spans'

const props = defineProps<{ aiOpen?: boolean; aiMinimized?: boolean }>()
const emit = defineEmits<{ 'toggle-ai': [{ anchor: { x: number; y: number } | null }] }>()

const store = useStore<VideoSceneState>(VideoSceneKey)
const studioStore = useStore<VideoStudioState>(VideoStudioKey)

const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const aiBtnRef = ref<HTMLButtonElement | null>(null)

const importInputEl = ref<HTMLInputElement | null>(null)
const importSubtitleInputEl = ref<HTMLInputElement | null>(null)

const DEFAULT_SUBTITLE_FPS = 30

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

const onImportComponent = () => {
	importInputEl.value?.click()
}

const onImportSubtitle = () => {
	importSubtitleInputEl.value?.click()
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

const onImportSubtitleFile = async (e: Event) => {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	try {
		const prevActiveLayerId = store.state.activeLayerId
		const prevSelectedNodeIds = [...(store.state.selectedNodeIds ?? [])]
		const prevFocusedNodeId = store.state.focusedNodeId

		const text = await file.text()
		const cues = parseSrt(text)
		if (!cues.length) {
			window.alert('导入失败：未解析到有效字幕段（请确认是标准 .srt）')
			return
		}

		const spans: TimelineFrameSpan[] = []
		const cueRanges: { startFrame: number; endFrame: number }[] = []
		let maxEnd = 0
		for (const c of cues) {
			const r = msToFrameRangeInclusive(c.startMs, c.endMs, DEFAULT_SUBTITLE_FPS)
			spans.push({ start: r.startFrame, end: r.endFrame })
			cueRanges.push({ startFrame: r.startFrame, endFrame: r.endFrame })
			maxEnd = Math.max(maxEnd, r.endFrame)
		}

		const needFrameCount = Math.max(TimelineStore.state.frameCount, maxEnd + 1)
		if (needFrameCount !== TimelineStore.state.frameCount) {
			await TimelineStore.dispatch('setFrameCount', { frameCount: needFrameCount })
		}

		await TimelineStore.dispatch('addSubtitleLayer')
		const layer = TimelineStore.state.layers[TimelineStore.state.layers.length - 1]
		if (!layer) return
		await TimelineStore.dispatch('setSubtitleTrack', { layerId: layer.id, cues, cueRanges, spans, fps: DEFAULT_SUBTITLE_FPS })

		// 同步到舞台图层（保持删除同步与未来渲染入口）
		await store.dispatch('addLayer', { layerId: layer.id, name: layer.name })

		// 为字幕图层创建一个 text 节点，并绑定到时间轴字幕配置
		await store.dispatch('setActiveLayer', { layerId: layer.id })
		await store.dispatch('addRenderableNode', { layerId: layer.id, type: 'text' })
		const subtitleNodeId = store.state.selectedNodeId
		if (subtitleNodeId) {
			await TimelineStore.dispatch('setSubtitleTextNodeId', { layerId: layer.id, nodeId: subtitleNodeId })

			const stageW = Math.max(1, Number(studioStore.state.stage?.width ?? 1920))
			const stageH = Math.max(1, Number(studioStore.state.stage?.height ?? 1080))
			const boxW = Math.max(240, Math.floor(stageW * 0.9))
			const boxH = Math.max(80, Math.floor(stageH * 0.18))
			const boxY = stageH / 2 - boxH / 2 - 24

			const rawDefaultStyle = TimelineStore.state.subtitleDefaultStyleByLayer?.[layer.id]
				?? ({ fontSize: 36, fontColor: '#ffffff', fontStyle: 'normal', textAlign: 'center' } as any)
			const defaultStyle = {
				...rawDefaultStyle,
				fontSize: Math.max(6, Number((rawDefaultStyle as any).fontSize ?? 36) || 36),
			}
			// Subtitle text node should be visible by default.
			const nodeTransform = { x: 0, y: boxY, width: boxW, height: boxH, rotation: 0, opacity: 1 }

			await store.dispatch('updateNodeTransform', { layerId: layer.id, nodeId: subtitleNodeId, patch: nodeTransform })
			await store.dispatch('updateNodeProps', {
				layerId: layer.id,
				nodeId: subtitleNodeId,
				patch: {
					__dvsSubtitleTextNode: true,
					textContent: '',
					fontSize: defaultStyle.fontSize,
					fontColor: defaultStyle.fontColor,
					fontStyle: defaultStyle.fontStyle,
					textAlign: defaultStyle.textAlign,
				},
			})

			const gen = buildSubtitleGeneratedKeyframes({
				layerId: layer.id,
				nodeId: subtitleNodeId,
				cues,
				cueRanges,
				defaultStyle,
				overridesByCueIndex: TimelineStore.state.subtitleOverrideStyleByLayer?.[layer.id] ?? {},
				nodeTransform,
			})
			await TimelineStore.dispatch('setSubtitleGeneratedKeyframes', {
				layerId: layer.id,
				frames: gen.frames,
				nodeKeyframesByFrame: gen.nodeKeyframesByFrame,
			})
		}

		// 尽量不打断用户当前操作：恢复 activeLayer + selection
		if (prevActiveLayerId && prevActiveLayerId !== layer.id) await store.dispatch('setActiveLayer', { layerId: prevActiveLayerId })
		if (prevSelectedNodeIds.length) await store.dispatch('setSelectedNodes', { nodeIds: prevSelectedNodeIds })
		else await store.dispatch('setSelectedNode', { nodeId: null })
		await store.dispatch('setFocusedNode', { nodeId: prevFocusedNodeId ?? null })
	} catch (err) {
		console.error('[dvs] import srt failed', err)
		window.alert('导入失败：无法解析字幕文件')
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
