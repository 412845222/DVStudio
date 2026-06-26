<template>
	<div class="vs-cl">
		<div class="vs-cl-head">
			<div class="vs-cl-title">组件库</div>
			<button class="vs-btn" type="button" :disabled="busy" @click="syncLocalToServer">
				同步保存
			</button>
			<div class="vs-cl-meta">
				当前关键帧：{{
					selectedKeyframeCell
						? `${selectedKeyframeCell.layerId}@${selectedKeyframeCell.frameIndex}`
						: '未选择'
				}}
			</div>
		</div>

		<div v-if="!componentLibrary.length" class="vs-cl-empty">暂无已保存组件</div>

		<div v-else class="vs-cl-body">
			<div class="vs-cl-list">
				<button
					v-for="c in componentLibrary"
					:key="c.id"
					type="button"
					class="vs-cl-item"
					:class="{ active: c.id === selectedComponentId }"
					@click="selectComponent(c.id)"
				>
					<div class="vs-cl-item-row">
						<img v-if="getThumbUrl(c)" class="vs-cl-thumb" :src="String(getThumbUrl(c))" alt="" />
						<div class="vs-cl-item-text">
							<div class="vs-cl-item-name">{{ c.name }}</div>
							<div class="vs-cl-item-id">{{ c.templateId }}</div>
						</div>
					</div>
				</button>
			</div>

			<div class="vs-cl-detail">
				<div v-if="!selectedComponent" class="vs-cl-empty">请选择一个组件</div>
				<div v-else class="vs-cl-card">
					<div class="vs-cl-card-head">
						<div class="vs-cl-card-title">参数</div>
					</div>
					<div v-if="!selectedParamDefs.length" class="vs-cl-empty">该组件没有可配置参数</div>
					<div v-else class="vs-cl-fields">
						<div v-for="p in selectedParamDefs" :key="p.key" class="vs-cl-field">
							<div class="vs-cl-field-label">{{ p.key }}</div>
							<input
								v-if="p.type === 'string' || p.type === 'asset:image'"
								class="vs-cl-input"
								type="text"
								:value="String(getParamValue(selectedComponent!.id, p.key) ?? '')"
								@input="
									setParamValue(
										selectedComponent!.id,
										p.key,
										($event.target as HTMLInputElement).value
									)
								"
							/>
							<input
								v-else-if="p.type === 'number'"
								class="vs-cl-input"
								type="number"
								:value="String(getParamValue(selectedComponent!.id, p.key) ?? '')"
								@input="
									setParamValue(
										selectedComponent!.id,
										p.key,
										($event.target as HTMLInputElement).value
									)
								"
							/>
							<input
								v-else-if="p.type === 'color'"
								class="vs-cl-color"
								type="color"
								:value="String(getParamValue(selectedComponent!.id, p.key) ?? '#ffffff')"
								@input="
									setParamValue(
										selectedComponent!.id,
										p.key,
										($event.target as HTMLInputElement).value
									)
								"
							/>
							<input
								v-else-if="p.type === 'boolean'"
								class="vs-cl-checkbox"
								type="checkbox"
								:checked="!!getParamValue(selectedComponent!.id, p.key)"
								@change="
									setParamValue(
										selectedComponent!.id,
										p.key,
										($event.target as HTMLInputElement).checked
									)
								"
							/>
						</div>
					</div>

					<div class="vs-cl-actions">
						<button
							class="vs-btn"
							type="button"
							:disabled="!canAddToKeyframe"
							@click="insertSelectedComponent"
						>
							添加到当前关键帧
						</button>
						<button class="vs-btn" type="button" :disabled="busy" @click="removeSelectedComponent">
							移除该组件
						</button>
						<div v-if="addHint" class="vs-cl-hint">{{ addHint }}</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import type { JsonValue } from '../../../core/shared/json'
import { componentTemplateApi } from '../../../core/components'
import { nodeExistsInAnyLayer } from '../../../core/scene'
import { cloneJsonSafe } from '../../../core/shared/cloneJsonSafe'
import {
	stripSubtitleTextContentFromNodeSnapshots,
	stripSubtitleTextContentFromStageLayers
} from '../../../core/subtitle/sanitizeStageSnapshot'
import { applyTimelineAnimationAtFrame } from '../anim/timelineAnimation'
import { ComponentLibraryService } from '../../../network/ComponentLibraryService'
import {
	VideoSceneKey,
	type VideoSceneState,
	type VideoSceneLayer,
	type VideoSceneTreeNode
} from '../../../store/videoscene'
import { TimelineStore } from '../../../store/timeline'
import { containsFrame, type TimelineFrameSpan } from '../../../store/timeline/spans'
import { isObject, isRecord, isString, isNumber } from '../../../types/utils'

defineOptions({ name: 'ComponentLibraryPanel' })

defineProps<{ layerId: string | null }>()

const store = useStore<VideoSceneState>(VideoSceneKey)

type ComponentTemplate = {
	nodes?: unknown
	params?: unknown
}

type SavedComponent = {
	id: string
	createdAt: string
	templateId: string
	name: string
	template: ComponentTemplate
	savedAt: string
	thumbAssetId?: string
	thumbDataUrl?: string
	thumbUrl?: string
}

type ParamDef = { key: string; type: 'string' | 'number' | 'boolean' | 'color' | 'asset:image' }

type TimelineFrameSpanPoint = number | { start?: unknown; end?: unknown }

const COMPONENT_LIBRARY_KEY = 'dvs.componentLibrary.v1'

const componentLibrary = ref<SavedComponent[]>([])
const selectedComponentId = ref<string>('')
const componentParamValuesById = ref<Record<string, Record<string, JsonValue>>>({})
const busy = ref(false)
const componentService = new ComponentLibraryService()

const getSingleSelectedKeyframeCell = (): { layerId: string; frameIndex: number } | null => {
	const _selV = TimelineStore.state.selectionVersion
	const _kfV = TimelineStore.state.keyframeVersion
	void _selV
	void _kfV
	const entries = Object.entries(TimelineStore.state.selectedSpansByLayer).filter(
		([, spans]) => spans && spans.length
	)
	if (entries.length !== 1) return null
	const layerId = entries[0][0]
	const spans = entries[0][1] as TimelineFrameSpan[]
	if (!spans || spans.length !== 1) return null
	const s = spans[0] as TimelineFrameSpanPoint
	let frameIndex: number | null = null
	if (typeof s === 'number') {
		frameIndex = Math.floor(s)
	} else if (isObject(s)) {
		const start = s.start
		const end = s.end
		if (isNumber(start) && isNumber(end) && start === end) {
			frameIndex = Math.floor(start)
		}
	}
	if (frameIndex == null || !Number.isFinite(frameIndex)) return null
	const kfSpans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
	if (!containsFrame(kfSpans, frameIndex)) return null
	return { layerId, frameIndex }
}

const selectedKeyframeCell = computed(() => getSingleSelectedKeyframeCell())

const canAddToKeyframe = computed(() => {
	if (busy.value) return false
	if (!selectedComponent.value) return false
	return !!selectedKeyframeCell.value
})

const addHint = computed(() => {
	if (busy.value) return ''
	if (selectedKeyframeCell.value) return ''
	return '请在时间轴选择一个关键帧格子（或先创建关键帧）'
})

const isSavedComponentLike = (x: unknown): x is Record<string, unknown> => {
	return isRecord(x)
}

const loadComponentLibrary = () => {
	try {
		const raw = localStorage.getItem(COMPONENT_LIBRARY_KEY)
		if (!raw) {
			componentLibrary.value = []
			selectedComponentId.value = ''
			return [] as SavedComponent[]
		}
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return [] as SavedComponent[]
		const list: SavedComponent[] = parsed
			.filter((x): x is Record<string, unknown> => isSavedComponentLike(x))
			.map((x) => ({
				id:
					isString(x.id) && x.id.trim()
						? x.id
						: `${isString(x.templateId) ? x.templateId : ''}::${isString(x.savedAt) ? x.savedAt : ''}`,
				createdAt: isString(x.createdAt)
					? x.createdAt
					: isString(x.savedAt)
						? x.savedAt
						: new Date().toISOString(),
				templateId: isString(x.templateId) ? x.templateId : '',
				name: isString(x.name) ? x.name : '',
				template: (isObject(x.template) ? x.template : {}) as ComponentTemplate,
				savedAt: isString(x.savedAt) ? x.savedAt : new Date().toISOString(),
				thumbAssetId: isString(x.thumbAssetId) ? x.thumbAssetId : undefined,
				thumbDataUrl: isString(x.thumbDataUrl) ? x.thumbDataUrl : undefined,
				thumbUrl: isString(x.thumbUrl) ? x.thumbUrl : undefined
			}))
			.filter((x) => x.id && x.templateId && x.name)
		componentLibrary.value = list
		for (const it of list) {
			if (!it.thumbAssetId) continue
			const url = it.thumbUrl || it.thumbDataUrl
			if (!url) continue
			store.commit('upsertImageAsset', { id: it.thumbAssetId, url, name: it.name })
		}
		if (!selectedComponentId.value && list.length) selectedComponentId.value = list[0].id
		return list
	} catch {
		return [] as SavedComponent[]
	}
}

const persistComponentLibrary = () => {
	try {
		localStorage.setItem(COMPONENT_LIBRARY_KEY, JSON.stringify(componentLibrary.value))
	} catch {
		// ignore
	}
}

const localSnapshot = loadComponentLibrary()

const getThumbUrl = (c: SavedComponent): string | null => {
	const id = String(c.thumbAssetId || '').trim()
	if (!id) return isString(c.thumbUrl) && c.thumbUrl.trim() ? c.thumbUrl : null
	const url = store.state.imageAssets?.[id]?.url
	if (isString(url) && url.trim()) return url
	if (isString(c.thumbUrl) && c.thumbUrl.trim()) return c.thumbUrl
	return isString(c.thumbDataUrl) && c.thumbDataUrl.trim() ? c.thumbDataUrl : null
}

const isServerComponentItem = (x: unknown): x is Record<string, unknown> => {
	return isRecord(x)
}

const applyServerList = (items: unknown[]) => {
	const list: SavedComponent[] = items
		.filter((x): x is Record<string, unknown> => isServerComponentItem(x))
		.map((x) => ({
			id: isString(x.id) ? x.id : '',
			createdAt: isString(x.createdAt) ? x.createdAt : new Date().toISOString(),
			templateId: isString(x.templateId) ? x.templateId : '',
			name: isString(x.name) ? x.name : '',
			template: (isObject(x.template) ? x.template : {}) as ComponentTemplate,
			savedAt: isString(x.savedAt) ? x.savedAt : new Date().toISOString(),
			thumbAssetId: isString(x.thumbAssetId) ? x.thumbAssetId : undefined,
			thumbUrl: isString(x.thumbUrl) ? x.thumbUrl : undefined
		}))
		.filter((x) => x.id && x.templateId && x.name)
	componentLibrary.value = list
	for (const it of list) {
		if (!it.thumbAssetId || !it.thumbUrl) continue
		store.commit('upsertImageAsset', { id: it.thumbAssetId, url: it.thumbUrl, name: it.name })
	}
	if (!selectedComponentId.value && list.length) selectedComponentId.value = list[0].id
}

const refreshFromServer = async () => {
	try {
		const res = await componentService.listComponents({ limit: 500, offset: 0 })
		if (res.items && res.items.length) {
			applyServerList(res.items)
			persistComponentLibrary()
			return
		}
		if (localSnapshot.length) {
			await componentService.importComponents(
				localSnapshot.map((x) => ({
					templateId: x.templateId,
					name: x.name,
					template: x.template,
					thumbAssetId: x.thumbAssetId,
					thumbDataUrl: x.thumbDataUrl,
					createdAt: x.createdAt
				}))
			)
			const after = await componentService.listComponents({ limit: 500, offset: 0 })
			if (after.items) {
				applyServerList(after.items)
				persistComponentLibrary()
			}
		}
	} catch {
		// ignore: fall back to local cache
	}
}

const onExternalRefresh = (): void => {
	void refreshFromServer()
}

onMounted(() => {
	void refreshFromServer()
	window.addEventListener('dvs:componentLibrary/refresh', onExternalRefresh as (e: Event) => void)
})

onBeforeUnmount(() => {
	window.removeEventListener(
		'dvs:componentLibrary/refresh',
		onExternalRefresh as (e: Event) => void
	)
})

const syncLocalToServer = async () => {
	if (busy.value) return
	busy.value = true
	try {
		const list = loadComponentLibrary()
		if (!list.length) {
			busy.value = false
			window.alert('本地暂无可同步组件')
			return
		}
		await componentService.importComponents(
			list.map((x) => ({
				templateId: x.templateId,
				name: x.name,
				template: x.template,
				thumbAssetId: x.thumbAssetId,
				thumbDataUrl: x.thumbDataUrl,
				createdAt: x.createdAt
			}))
		)
		await refreshFromServer()
		window.alert('同步完成')
	} catch {
		window.alert('同步失败：后端不可用或出错')
	} finally {
		busy.value = false
	}
}

watch(
	() => componentLibrary.value,
	() => {
		persistComponentLibrary()
	},
	{ deep: true }
)

const selectComponent = (componentId: string) => {
	selectedComponentId.value = componentId
}

const selectedComponent = computed(() => {
	const id = String(selectedComponentId.value || '').trim()
	if (!id) return null
	return componentLibrary.value.find((c) => c.id === id) || null
})

const extractParamKeysFromNodes = (template: ComponentTemplate): string[] => {
	try {
		const nodes = Array.isArray(template?.nodes) ? template.nodes : []
		const str = JSON.stringify(nodes)
		const re = /\{\{\s*([^}]+?)\s*\}\}/g
		const out: string[] = []
		let m: RegExpExecArray | null
		while ((m = re.exec(str))) {
			const key = String(m[1] || '').trim()
			if (key) out.push(key)
		}
		return out
	} catch {
		return []
	}
}

const normalizeParamKey = (k: unknown) =>
	String(k ?? '')
		.trim()
		.replace(/\s+/g, '')

const buildDefaultTemplateParams = (
	template: ComponentTemplate,
	opts: { title?: string; subtitle?: string; body?: string; text?: string }
): Record<string, JsonValue> => {
	const params: Record<string, JsonValue> = {}
	const list = Array.isArray(template?.params) ? template.params : []
	const title = String(opts.title ?? '').trim()
	const subtitle = String(opts.subtitle ?? '').trim()
	const body = String(opts.body ?? '').trim()
	const text = String(opts.text ?? '').trim()
	for (const it of list) {
		if (!isObject(it)) continue
		const keyRaw = isString(it.key) ? it.key : ''
		const key = keyRaw.trim()
		if (!key) continue
		const nk = normalizeParamKey(key).toLowerCase()
		if (params[key] !== undefined) continue

		if (nk === 'title' || nk.endsWith('.title') || nk.includes('title'))
			params[key] = title || subtitle || 'Title'
		else if (nk === 'subtitle' || nk.includes('sub')) params[key] = subtitle || ''
		else if (
			nk === 'body' ||
			nk === 'text' ||
			nk === 'content' ||
			nk.includes('desc') ||
			nk.includes('summary')
		)
			params[key] = body || text || ''
		else if (it.default !== undefined) params[key] = it.default as JsonValue
	}
	return params
}

const isValidParamType = (t: string): t is ParamDef['type'] => {
	return new Set<ParamDef['type']>(['string', 'number', 'boolean', 'color', 'asset:image']).has(
		t as ParamDef['type']
	)
}

const deriveParamDefs = (template: ComponentTemplate): ParamDef[] => {
	const keys = new Set<string>()
	const list = Array.isArray(template?.params) ? template.params : []
	for (const p of list) {
		if (!isObject(p)) continue
		const k = isString(p.key) ? p.key.trim() : ''
		if (k) keys.add(k)
	}
	for (const k of extractParamKeysFromNodes(template)) keys.add(k)

	const paramTypeByKey = new Map<string, ParamDef['type']>()
	for (const p of list) {
		if (!isObject(p)) continue
		const k = isString(p.key) ? p.key.trim() : ''
		if (!k) continue
		const t = isString(p.type) ? p.type.trim() : ''
		if (isValidParamType(t)) paramTypeByKey.set(k, t)
	}

	return Array.from(keys)
		.map((k) => {
			const type = paramTypeByKey.get(k) || 'string'
			return { key: k, type }
		})
		.sort((a, b) => a.key.localeCompare(b.key))
}

const selectedParamDefs = computed(() => {
	const c = selectedComponent.value
	if (!c) return [] as ParamDef[]
	return deriveParamDefs(c.template)
})

const ensureParamBag = (componentId: string) => {
	if (componentParamValuesById.value[componentId]) return
	const c = componentLibrary.value.find((x) => x.id === componentId)
	const defaults = c
		? buildDefaultTemplateParams(c.template, { title: c.name, subtitle: '', body: '', text: '' })
		: {}
	componentParamValuesById.value = { ...componentParamValuesById.value, [componentId]: defaults }
}

const getParamValue = (componentId: string, key: string): JsonValue | undefined => {
	ensureParamBag(componentId)
	return componentParamValuesById.value?.[componentId]?.[key]
}

const setParamValue = (componentId: string, key: string, value: JsonValue) => {
	ensureParamBag(componentId)
	const bag = { ...(componentParamValuesById.value[componentId] || {}) }
	bag[key] = value
	componentParamValuesById.value = { ...componentParamValuesById.value, [componentId]: bag }
}

const safeIdPart = (s: string) => String(s).replace(/[^a-zA-Z0-9:_-]/g, '_')

type NodeSnapshotTransform = {
	x?: number
	y?: number
	scaleX?: number
	scaleY?: number
	scale?: number
	pivotX?: number
	pivotY?: number
	width?: number
	height?: number
	rotation?: number
	opacity?: number
}

type NodeSnapshot = { transform?: NodeSnapshotTransform; props?: Record<string, JsonValue> }

const isVideoSceneTreeNodeLike = (
	n: unknown
): n is {
	id?: unknown
	category?: unknown
	transform?: unknown
	props?: unknown
	children?: unknown
} => {
	return isObject(n)
}

const collectUserNodeSnapshots = (
	nodes: unknown[] | undefined,
	out: Record<string, NodeSnapshot>
) => {
	if (!nodes) return
	for (const n of nodes) {
		if (!isVideoSceneTreeNodeLike(n)) continue
		if (n.category === 'user') {
			const nodeId = String(n.id ?? '')
			const transform = isObject(n.transform)
				? { ...(n.transform as NodeSnapshotTransform) }
				: undefined
			const props = isObject(n.props)
				? cloneJsonSafe(n.props as Record<string, JsonValue>)
				: undefined
			out[nodeId] = { transform, props }
		}
		const children = Array.isArray(n.children) ? n.children : undefined
		if (children && children.length) collectUserNodeSnapshots(children, out)
	}
}

const captureLayerSnapshot = (layerId: string): Record<string, NodeSnapshot> => {
	const layer = store.state.layers.find((l) => l.id === layerId)
	if (!layer) return {}
	const out: Record<string, NodeSnapshot> = {}
	collectUserNodeSnapshots(layer.nodeTree as unknown[], out)
	return out
}

const ensureVideoSceneLayerExists = async (layerId: string) => {
	const id = String(layerId || '').trim()
	if (!id) return
	if (store.state.layers.some((l) => l.id === id)) return
	const name = TimelineStore.state.layers.find((l) => l.id === id)?.name || id
	await store.dispatch('addLayer', { layerId: id, name })
	await TimelineStore.dispatch('ensureStageSnapshotsContainLayer', { layerId: id, name })
}

const instantiateIntoLayerWithParams = async (
	layerId: string,
	template: ComponentTemplate,
	params: Record<string, JsonValue>
): Promise<string> => {
	const instantiated = componentTemplateApi.instantiateTemplate(template as unknown, params ?? {}, {
		getNodeId: ({ templateId, localId }) => {
			const base = safeIdPart(`${templateId}:${localId}`)
			let id = base
			let i = 1
			while (nodeExistsInAnyLayer(store.state.layers, id)) id = `${base}__${i++}`
			return id
		}
	})
	await store.dispatch('addNodeTree', { node: instantiated.root as VideoSceneTreeNode, layerId })
	return instantiated.root?.id as string
}

const setOpacityKeyframes = async (
	layerId: string,
	nodeId: string,
	frames: Array<{ frame: number; opacity: number }>
) => {
	for (const it of frames) {
		await TimelineStore.dispatch('addKeyframeRange', {
			layerId,
			startFrame: it.frame,
			endFrame: it.frame
		})
		await TimelineStore.dispatch('setNodeKeyframeSnapshotRange', {
			layerId,
			startFrame: it.frame,
			endFrame: it.frame,
			nodesById: {
				[nodeId]: { transform: { opacity: it.opacity } }
			}
		})
	}
}

const insertSelectedComponent = async () => {
	const selected = selectedKeyframeCell.value
	if (!selected) return
	const layerId = selected.layerId
	const frameIndex = selected.frameIndex
	const c = selectedComponent.value
	if (!c) return
	const playheadFrame = Math.floor(Number(TimelineStore.state.currentFrame ?? 0))
	busy.value = true
	try {
		await ensureVideoSceneLayerExists(layerId)
		await store.dispatch('setActiveLayer', { layerId })
		ensureParamBag(c.id)
		const rawParams = componentParamValuesById.value[c.id] || {}
		const defs = deriveParamDefs(c.template)
		const params: Record<string, JsonValue> = {}
		for (const d of defs) {
			const v = rawParams[d.key]
			if (d.type === 'number') {
				const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
				params[d.key] = Number.isFinite(n) ? n : 0
			} else if (d.type === 'boolean') {
				params[d.key] = !!v
			} else {
				params[d.key] = v
			}
		}

		await TimelineStore.dispatch('addKeyframeRange', {
			layerId,
			startFrame: frameIndex,
			endFrame: frameIndex
		})
		const rootId = await instantiateIntoLayerWithParams(layerId, c.template, params)
		if (rootId) {
			await store.dispatch('updateNodeProps', {
				layerId,
				nodeId: rootId,
				patch: {
					__dvsComponentRoot: true,
					__dvsComponentLibraryId: c.id,
					__dvsComponentTemplateId: c.templateId,
					__dvsComponentName: c.name,
					__dvsComponentParams: cloneJsonSafe(params)
				}
			})
		}
		await setOpacityKeyframes(layerId, rootId, [{ frame: frameIndex, opacity: 1 }])

		const kind = TimelineStore.state.layerKindById?.[layerId] ?? 'normal'
		const isSubtitle = kind === 'subtitle'
		const baseLayer = store.state.layers.find((l) => l.id === layerId)
		const snapLayer: VideoSceneLayer = baseLayer
			? (cloneJsonSafe(baseLayer) as VideoSceneLayer)
			: ({ id: layerId, name: layerId, nodeTree: [] } as VideoSceneLayer)
		const layersForSnapshot: VideoSceneLayer[] = isSubtitle
			? stripSubtitleTextContentFromStageLayers([snapLayer], layerId)
			: [snapLayer]
		await TimelineStore.dispatch('setStageKeyframeSnapshotRange', {
			startFrame: frameIndex,
			endFrame: frameIndex,
			layers: layersForSnapshot
		})

		if (kind === 'subtitle' || kind === 'progress') {
			const snapshot = captureLayerSnapshot(layerId)
			const nodesById =
				kind === 'subtitle' ? stripSubtitleTextContentFromNodeSnapshots(snapshot) : snapshot
			await TimelineStore.dispatch('setNodeKeyframeSnapshotRange', {
				layerId,
				startFrame: frameIndex,
				endFrame: frameIndex,
				nodesById
			})
		}

		if (playheadFrame !== frameIndex) applyTimelineAnimationAtFrame(playheadFrame)
	} finally {
		busy.value = false
	}
}

const removeSelectedComponent = async () => {
	const c = selectedComponent.value
	if (!c) return
	const id = c.id
	if (!id) return
	busy.value = true
	try {
		await componentService.deleteComponent(id)
	} catch {
		busy.value = false
		window.alert('移除失败：后端不可用或出错')
		return
	}
	componentLibrary.value = componentLibrary.value.filter((x) => x.id !== id)
	const nextParams = { ...componentParamValuesById.value }
	delete nextParams[id]
	componentParamValuesById.value = nextParams
	if (selectedComponentId.value === id)
		selectedComponentId.value = componentLibrary.value[0]?.id || ''
	busy.value = false
}
</script>

<style scoped>
.vs-cl {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
	min-height: 0;
	padding: 10px;
}

.vs-cl-head {
	display: flex;
	align-items: baseline;
	gap: 10px;
}

.vs-cl-title {
	font-size: 13px;
	color: var(--vscode-fg);
}

.vs-cl-meta {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-cl-empty {
	padding: 10px;
	border: 1px dashed var(--vscode-border);
	color: var(--vscode-fg-muted);
	background: var(--dweb-defualt);
}

.vs-cl-body {
	flex: 1 1 auto;
	display: grid;
	grid-template-columns: 220px 1fr;
	gap: 10px;
	min-height: 0;
}

.vs-cl-list {
	overflow: auto;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
}

.vs-cl-item {
	display: block;
	width: 100%;
	text-align: left;
	padding: 8px 10px;
	border: none;
	background: transparent;
	color: var(--vscode-fg);
	cursor: pointer;
	border-bottom: 1px solid var(--vscode-border);
}

.vs-cl-item-row {
	display: grid;
	grid-template-columns: 64px 1fr;
	gap: 10px;
	align-items: center;
}

.vs-cl-thumb {
	width: 64px;
	height: 40px;
	object-fit: cover;
	border-radius: 4px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
}

.vs-cl-item-text {
	min-width: 0;
}

.vs-cl-item.active {
	outline: 1px solid var(--vscode-border-accent);
	outline-offset: -1px;
}

.vs-cl-item-name {
	font-size: 12px;
}

.vs-cl-item-id {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	margin-top: 2px;
	word-break: break-all;
}

.vs-cl-detail {
	min-width: 0;
	min-height: 0;
}

.vs-cl-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	padding: 10px;
	min-height: 0;
}

.vs-cl-card-head {
	display: flex;
	align-items: center;
}

.vs-cl-card-title {
	font-size: 12px;
	color: var(--vscode-fg);
}

.vs-cl-fields {
	display: grid;
	grid-template-columns: 1fr;
	gap: 8px;
	overflow: auto;
	min-height: 0;
}

.vs-cl-field {
	display: grid;
	grid-template-columns: 140px 1fr;
	gap: 8px;
	align-items: center;
}

.vs-cl-field-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	word-break: break-all;
}

.vs-cl-input {
	flex: 1 1 0;
	min-width: 0;
	max-width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	outline: none;
	height: 28px;
	line-height: 16px;
	transition: border-color 120ms ease;
}

.vs-cl-input:hover {
	border-color: var(--vscode-hover-border);
}

.vs-cl-input:focus {
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-cl-input:disabled {
	background: var(--vscode-disabled-bg);
	color: var(--vscode-disabled-fg);
}

.vs-cl-color {
	flex: 0 0 auto;
	width: 28px;
	height: 28px;
	padding: 0;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: transparent;
	box-sizing: border-box;
}

.vs-cl-color:focus {
	border-color: var(--dweb-green-main);
	box-shadow: var(--dweb-shadow);
}

.vs-cl-checkbox {
	width: 18px;
	height: 18px;
	accent-color: var(--dweb-green-main);
}

.vs-cl-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.vs-btn {
	padding: 6px 10px;
	border-radius: 0;
	border: 1px solid var(--vscode-border-accent);
	background: transparent;
	color: var(--vscode-fg);
	cursor: pointer;
}

.vs-btn:hover {
	background: var(--vscode-hover-bg);
}

.vs-btn:disabled {
	background: var(--vscode-disabled-bg);
	color: var(--vscode-disabled-fg);
	border-color: var(--vscode-border);
	cursor: not-allowed;
}

.vs-cl-hint {
	width: 100%;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}
</style>
