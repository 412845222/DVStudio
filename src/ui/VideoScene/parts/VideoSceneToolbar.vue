<template>
	<div ref="rootEl" class="vs-toolbar" @pointerdown.stop>
		<button class="vs-tool-btn" type="button" :class="{ active: showSizePanel }" @click="onSize">
			尺寸
		</button>
		<button
			class="vs-tool-btn"
			type="button"
			:class="{ active: showBackgroundPanel }"
			@click="onBackground"
		>
			背景
		</button>
		<button class="vs-tool-btn" type="button" @click="addBase">添加</button>
		<button class="vs-tool-btn" type="button" @click="onImportSubtitle">导入字幕</button>
		<button class="vs-tool-btn" type="button" @click="onImportAudio">导入音频</button>
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
		<button
			class="vs-tool-btn"
			type="button"
			data-dvs="component-library-btn"
			:class="{ active: componentLibraryOpen }"
			@click="openComponentLibrary"
		>
			组件库
		</button>
		<button
			class="vs-tool-btn"
			type="button"
			:class="{ active: showExportPanel }"
			@click="onExport"
		>
			导出视频
		</button>
		<input
			ref="importSubtitleInputEl"
			class="vs-import-input"
			type="file"
			accept=".srt,text/plain"
			@change="onImportSubtitleFile"
		/>
		<input
			ref="importAudioInputEl"
			class="vs-import-input"
			type="file"
			accept="audio/*,video/mp4,.mp4"
			@change="onImportAudioFile"
		/>
		<input
			ref="importInputEl"
			class="vs-import-input"
			type="file"
			accept="application/json,.json"
			@change="onImportFile"
		/>
		<div class="vs-toolbar-spacer" />
		<button
			class="vs-tool-btn vs-icon-btn"
			type="button"
			:disabled="!canUndo"
			title="撤销 (Ctrl+Z)"
			@click="undo"
		>
			↶
		</button>
		<button
			class="vs-tool-btn vs-icon-btn"
			type="button"
			:disabled="!canRedo"
			title="重做 (Ctrl+Y)"
			@click="redo"
		>
			↷
		</button>
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
import type { SubtitleTextStyle } from '../../../core/timeline/types'

const props = defineProps<{ aiOpen?: boolean; aiMinimized?: boolean }>()
const emit = defineEmits<{ 'toggle-ai': [{ anchor: { x: number; y: number } | null }] }>()

const store = useStore<VideoSceneState>(VideoSceneKey)
const studioStore = useStore<VideoStudioState>(VideoStudioKey)

const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const aiBtnRef = ref<HTMLButtonElement | null>(null)

const importInputEl = ref<HTMLInputElement | null>(null)
const importSubtitleInputEl = ref<HTMLInputElement | null>(null)
const importAudioInputEl = ref<HTMLInputElement | null>(null)

const DEFAULT_SUBTITLE_FPS = 30

const getImportSubtitleFps = () => {
	const fps = Math.floor(Number(TimelineStore.state.fps ?? DEFAULT_SUBTITLE_FPS))
	return Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_SUBTITLE_FPS
}

const showSizePanel = computed(() => store.state.showSizePanel)
const showBackgroundPanel = computed(() => store.state.showBackgroundPanel)
const showExportPanel = computed(() => store.state.showExportPanel)

const aiOpen = computed(() => !!props.aiOpen)
const aiMinimized = computed(() => !!props.aiMinimized)

const componentLibraryOpen = computed(
	() => store.state.leftPanel.open && store.state.leftPanel.mode === 'component-library'
)

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

const onImportAudio = () => {
	importAudioInputEl.value?.click()
}

const onExport = () => {
	store.dispatch('toggleExportPanel')
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

const openComponentLibrary = () => {
	store.dispatch('openLeftPanel', { mode: 'component-library', layerId: store.state.activeLayerId })
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
		const importFps = getImportSubtitleFps()
		let maxEnd = 0
		for (const c of cues) {
			const r = msToFrameRangeInclusive(c.startMs, c.endMs, importFps)
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
		await TimelineStore.dispatch('setSubtitleTrack', {
			layerId: layer.id,
			cues,
			cueRanges,
			spans,
			fps: importFps
		})

		// 同步到舞台图层（保持删除同步与未来渲染入口）
		await store.dispatch('addLayer', { layerId: layer.id, name: layer.name })

		// 为字幕图层创建一个 text 节点，并绑定到时间轴字幕配置
		await store.dispatch('setActiveLayer', { layerId: layer.id })
		await store.dispatch('addRenderableNode', { layerId: layer.id, type: 'text' })
		const subtitleNodeId = store.state.selectedNodeId
		if (subtitleNodeId) {
			await TimelineStore.dispatch('setSubtitleTextNodeId', {
				layerId: layer.id,
				nodeId: subtitleNodeId
			})

			const stageW = Math.max(1, Number(studioStore.state.stage?.width ?? 1920))
			const stageH = Math.max(1, Number(studioStore.state.stage?.height ?? 1080))
			const boxW = Math.max(240, Math.floor(stageW * 0.9))
			const boxH = Math.max(80, Math.floor(stageH * 0.18))
			const boxY = stageH / 2 - boxH / 2 - 24

			const rawDefaultStyle: SubtitleTextStyle = TimelineStore.state.subtitleDefaultStyleByLayer?.[
				layer.id
			] ?? { fontSize: 36, fontColor: '#ffffff', fontStyle: 'normal', textAlign: 'center' }
			const defaultStyle: SubtitleTextStyle = {
				...rawDefaultStyle,
				fontSize: Math.max(6, Number(rawDefaultStyle.fontSize ?? 36) || 36)
			}
			// Subtitle text node should be visible by default.
			const nodeTransform = {
				x: 0,
				y: boxY,
				scaleX: 1,
				scaleY: 1,
				scale: 1,
				pivotX: 0.5,
				pivotY: 0.5,
				width: boxW,
				height: boxH,
				rotation: 0,
				opacity: 1
			}

			await store.dispatch('updateNodeTransform', {
				layerId: layer.id,
				nodeId: subtitleNodeId,
				patch: nodeTransform
			})
			await store.dispatch('updateNodeProps', {
				layerId: layer.id,
				nodeId: subtitleNodeId,
				patch: {
					__dvsSubtitleTextNode: true,
					textContent: '',
					fontSize: defaultStyle.fontSize,
					fontColor: defaultStyle.fontColor,
					fontStyle: defaultStyle.fontStyle,
					textAlign: defaultStyle.textAlign
				}
			})

			const gen = buildSubtitleGeneratedKeyframes({
				layerId: layer.id,
				nodeId: subtitleNodeId,
				cues,
				cueRanges,
				defaultStyle,
				overridesByCueIndex: TimelineStore.state.subtitleOverrideStyleByLayer?.[layer.id] ?? {},
				nodeTransform
			})
			await TimelineStore.dispatch('setSubtitleGeneratedKeyframes', {
				layerId: layer.id,
				frames: gen.frames,
				nodeKeyframesByFrame: gen.nodeKeyframesByFrame
			})
		}

		// 尽量不打断用户当前操作：恢复 activeLayer + selection
		if (prevActiveLayerId && prevActiveLayerId !== layer.id)
			await store.dispatch('setActiveLayer', { layerId: prevActiveLayerId })
		if (prevSelectedNodeIds.length)
			await store.dispatch('setSelectedNodes', { nodeIds: prevSelectedNodeIds })
		else await store.dispatch('setSelectedNode', { nodeId: null })
		await store.dispatch('setFocusedNode', { nodeId: prevFocusedNodeId ?? null })
	} catch (err) {
		console.error('[dvs] import srt failed', err)
		window.alert('导入失败：无法解析字幕文件')
	}
}

const computeAudioPeaks = (audioBuffer: AudioBuffer, pointsPerSecond: number) => {
	const durationSec = Math.max(0, Number(audioBuffer.duration) || 0)
	const pps = Math.max(1, Math.floor(Number(pointsPerSecond) || 1))
	const pointCount = Math.max(1, Math.ceil(durationSec * pps))
	const channels = Math.max(1, audioBuffer.numberOfChannels)
	const channelData: Float32Array[] = []
	for (let ch = 0; ch < channels; ch++) {
		channelData.push(audioBuffer.getChannelData(ch))
	}

	const totalSamples = audioBuffer.length
	const samplesPerPoint = Math.max(1, Math.floor(totalSamples / pointCount))
	const peaks = new Array<number>(pointCount).fill(0)

	let maxPeak = 0
	for (let p = 0; p < pointCount; p++) {
		const start = p * samplesPerPoint
		const end = Math.min(totalSamples, start + samplesPerPoint)
		let peak = 0
		for (let i = start; i < end; i++) {
			let v = 0
			for (let ch = 0; ch < channels; ch++) v += Math.abs(channelData[ch][i] || 0)
			v /= channels
			if (v > peak) peak = v
		}
		peaks[p] = peak
		if (peak > maxPeak) maxPeak = peak
	}

	if (maxPeak > 0) {
		for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / maxPeak
	}
	return { durationSec, peaks }
}

const onImportAudioFile = async (e: Event) => {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	try {
		const arrayBuffer = await file.arrayBuffer()
		const AudioContextCtor: typeof AudioContext | undefined =
			window.AudioContext ||
			(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
		if (!AudioContextCtor) {
			window.alert('导入失败：当前浏览器不支持 WebAudio（无法解析音频波形）')
			return
		}
		const ac: AudioContext = new AudioContextCtor()
		let audioBuffer: AudioBuffer
		try {
			audioBuffer = await ac.decodeAudioData(arrayBuffer.slice(0))
		} finally {
			try {
				await ac.close()
			} catch {
				// ignore
			}
		}

		const durationSec = Math.max(0, Number(audioBuffer.duration) || 0)
		if (!(durationSec > 0)) {
			window.alert('导入失败：音频时长无效')
			return
		}

		// 让波形与时间刻度同尺度：默认“每帧一个采样点”
		const fps = Math.max(1, Math.floor(Number(TimelineStore.state.fps) || 60))
		// 控制峰值数组规模，避免超长音频导致内存飙升（一般 60fps 下约可覆盖 2~3 小时）
		const maxPoints = 600000
		let pointsPerSecond = fps
		if (Math.ceil(durationSec * pointsPerSecond) > maxPoints) {
			pointsPerSecond = Math.max(10, Math.floor(maxPoints / durationSec))
		}

		const { peaks } = computeAudioPeaks(audioBuffer, pointsPerSecond)
		const objectUrl = URL.createObjectURL(file)

		const needFrames = Math.ceil(durationSec * fps) + 1
		if (needFrames > TimelineStore.state.frameCount) {
			await TimelineStore.dispatch('setFrameCount', { frameCount: needFrames })
		}

		const baseName = String(file.name || '').replace(/\.[^./\\]+$/, '')
		await TimelineStore.dispatch('addAudioLayer', { name: baseName || undefined })
		const layer = TimelineStore.state.layers[TimelineStore.state.layers.length - 1]
		if (!layer) return
		await TimelineStore.dispatch('setAudioTrack', {
			layerId: layer.id,
			track: {
				objectUrl,
				fileName: file.name,
				durationSec,
				pointsPerSecond,
				peaks
			}
		})
	} catch (err) {
		console.error('[dvs] import audio failed', err)
		window.alert('导入失败：无法解析音频（支持常见音频文件，以及 .mp4 的音轨）')
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
