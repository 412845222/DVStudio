import type { Store } from 'vuex'
import type { TimelineState } from '../../../store/timeline'
import { containsFrame, getPrevNext } from '../../../store/timeline/spans'
import {
	VideoSceneStore,
	type VideoSceneNodeProps,
	type VideoSceneNodeTransform,
	type VideoSceneTreeNode,
	type VideoSceneLayer
} from '../../../store/videoscene'
import { TimelineDataManager, type FrameCellPayload } from './TimelineDataManager'
import {
	stripSubtitleTextContentFromNodeSnapshots,
	stripSubtitleTextContentFromStageLayers
} from '../../../core/subtitle/sanitizeStageSnapshot'

const clampInt = (v: unknown, min: number, max: number) => {
	const n = Math.floor(Number(v))
	if (!Number.isFinite(n)) return min
	return Math.max(min, Math.min(max, n))
}

const cellKey = (layerId: string, frameIndex: number) => `${layerId}:${frameIndex}`
const segmentKey = (layerId: string, startFrame: number, endFrame: number) =>
	`${layerId}:${startFrame}:${endFrame}`

type NodeSnapshot = { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }

// JSON-like value for deep clone (avoids any)
type JsonValue = string | number | boolean | null | undefined | JsonObject | JsonArray
interface JsonObject {
	[key: string]: JsonValue
}
type JsonArray = JsonValue[]

// SAFE-ANY: Deep clone utility for JSON-compatible values with circular reference detection
const deepCloneFallback = <T extends JsonValue>(value: T, seen = new WeakMap<object, T>()): T => {
	if (value == null) return value
	if (typeof value !== 'object') return value
	if (value instanceof Date) return new Date(value.getTime()) as unknown as T

	const obj = value as JsonObject
	const cached = seen.get(obj)
	if (cached) return cached

	if (Array.isArray(value)) {
		const out: JsonArray = []
		seen.set(obj, out as unknown as T)
		for (const item of value) out.push(deepCloneFallback(item, seen))
		return out as unknown as T
	}

	const out: JsonObject = {}
	seen.set(obj, out as unknown as T)
	for (const k of Object.keys(obj)) out[k] = deepCloneFallback(obj[k], seen)
	return out as T
}

const cloneJsonSafe = <T>(v: T): T => {
	try {
		return JSON.parse(JSON.stringify(v)) as T
	} catch {
		try {
			return globalThis.structuredClone
				? (globalThis.structuredClone(v) as T)
				: deepCloneFallback(v as JsonValue) as T
		} catch {
			return deepCloneFallback(v as JsonValue) as T
		}
	}
}

const collectUserNodeSnapshots = (
	nodes: VideoSceneTreeNode[] | undefined,
	out: Record<string, NodeSnapshot>
) => {
	if (!nodes) return
	for (const n of nodes) {
		if (n.category === 'user') {
			out[n.id] = {
				transform: n.transform ? { ...n.transform } : undefined,
				props: n.props ? cloneJsonSafe(n.props) : undefined
			}
		}
		if (n.children?.length) collectUserNodeSnapshots(n.children, out)
	}
}

const captureLayerSnapshot = (layerId: string): Record<string, NodeSnapshot> => {
	const layer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
	if (!layer) return {}
	const out: Record<string, NodeSnapshot> = {}
	collectUserNodeSnapshots(layer.nodeTree, out)
	return out
}

const parseFrameIndexFromKey = (key: string) => {
	const parts = key.split(':')
	if (parts.length !== 2) return null
	const n = Number(parts[1])
	if (!Number.isFinite(n)) return null
	return Math.floor(n)
}

export class VuexTimelineDataManager extends TimelineDataManager {
	private clipboard:
		| (FrameCellPayload & { layerId?: string; nodeTree?: VideoSceneTreeNode[] })
		| null = null

	constructor(private store: Store<TimelineState>) {
		super()
	}

	isKeyframe(layerId: string, frameIndex: number): boolean {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const spans = this.store.state.keyframeSpansByLayer?.[layerId] ?? []
		return containsFrame(spans, fi)
	}

	addKeyframe(layerId: string, frameIndex: number): void {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		this.store.dispatch('addKeyframe', { layerId, frameIndex: fi })
		// NOTE: do NOT capture full-stage snapshots here.
		// Keyframes are per-layer; capturing whole-stage can overwrite other layers.
		// Snapshot capture is handled by higher-level operations (editing at that keyframe),
		// and by timeline animation using per-layer hold-left rules.
	}

	removeKeyframe(layerId: string, frameIndex: number): void {
		this.store.dispatch('removeKeyframe', { layerId, frameIndex })
	}

	isEasingEnabled(layerId: string, frameIndex: number): boolean {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return false
		return this.store.state.easingSegmentKeys.includes(
			segmentKey(layerId, seg.startFrame, seg.endFrame)
		)
	}

	canEnableEasing(layerId: string, frameIndex: number): boolean {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		if (this.isKeyframe(layerId, fi)) return false
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return false
		return !this.store.state.easingSegmentKeys.includes(
			segmentKey(layerId, seg.startFrame, seg.endFrame)
		)
	}

	private getKeyframeSegmentForFrame(
		layerId: string,
		frameIndex: number
	): { startFrame: number; endFrame: number } | null {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		// 关键帧本身不属于段内
		if (this.isKeyframe(layerId, fi)) return null

		const spans = this.store.state.keyframeSpansByLayer?.[layerId] ?? []
		const { prev, next } = getPrevNext(spans, fi)
		if (prev == null || next == null) return null
		if (!(prev < fi && fi < next)) return null
		return { startFrame: prev, endFrame: next }
	}

	enableEasing(layerId: string, frameIndex: number): void {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return
		this.store.dispatch('enableEasingSegment', {
			layerId,
			startFrame: seg.startFrame,
			endFrame: seg.endFrame
		})
	}

	disableEasing(layerId: string, frameIndex: number): void {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return
		this.store.dispatch('disableEasingSegment', {
			layerId,
			startFrame: seg.startFrame,
			endFrame: seg.endFrame
		})
	}

	copyFrame(layerId: string, frameIndex: number): void {
		// Only support copying a single KEYFRAME cell for now.
		if (!this.isKeyframe(layerId, frameIndex)) {
			this.clipboard = null
			return
		}
		const layer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
		const nodeTree = layer ? (cloneJsonSafe(layer.nodeTree) as VideoSceneTreeNode[]) : []
		this.clipboard = {
			isKeyframe: true,
			easingEnabled: this.isEasingEnabled(layerId, frameIndex),
			layerId,
			nodeTree
		}
	}

	canPaste(): boolean {
		return this.clipboard != null
	}

	private buildUsedNodeIdSet(): Set<string> {
		const used = new Set<string>()
		const layers = VideoSceneStore.state.layers
		if (!layers) return used

		const walk = (nodes: VideoSceneTreeNode[] | undefined) => {
			if (!Array.isArray(nodes)) return
			for (const n of nodes) {
				const id = String(n?.id ?? '').trim()
				if (id) used.add(id)
				if (Array.isArray(n?.children) && n.children.length) walk(n.children)
			}
		}

		for (const layer of layers) {
			walk(layer.nodeTree)
		}
		return used
	}

	private safeIdPart(s: string) {
		return String(s).replace(/[^a-zA-Z0-9:_\-]/g, '_')
	}

	private allocateId(base: string, used: Set<string>) {
		let id = base
		let i = 1
		while (used.has(id)) id = `${base}__${i++}`
		used.add(id)
		return id
	}

	private remapNodeTreeForTargetLayer(nodeTree: VideoSceneTreeNode[], targetLayerId: string) {
		const used = this.buildUsedNodeIdSet()
		const idMap = new Map<string, string>()

		// SAFE-ANY: cloneNode handles dynamic VideoSceneTreeNode structure with arbitrary props
		const cloneNode = (n: VideoSceneTreeNode): VideoSceneTreeNode => {
			const oldId = String(n.id ?? '').trim()
			const base = this.safeIdPart(`${targetLayerId}:${oldId || 'node'}`)
			const nextId = this.allocateId(base, used)
			if (oldId) idMap.set(oldId, nextId)
			const cloned = cloneJsonSafe(n)
			return { ...cloned, id: nextId }
		}

		const remapRefs = (v: unknown, keyHint = ''): unknown => {
			if (v == null) return v
			if (typeof v === 'string') {
				const hit = idMap.get(v)
				return hit ?? v
			}
			if (Array.isArray(v)) {
				return v.map((it: unknown) => remapRefs(it, keyHint))
			}
			if (typeof v === 'object') {
				const out: Record<string, unknown> = {}
				for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
					if (typeof vv === 'string' && (shouldRemapKey(k) || shouldRemapKeyPlural(k))) {
						out[k] = idMap.get(vv) ?? vv
					} else if (Array.isArray(vv) && shouldRemapKeyPlural(k)) {
						out[k] = (vv as unknown[]).map((s) => (typeof s === 'string' ? (idMap.get(s) ?? s) : s))
					} else {
						out[k] = remapRefs(vv, k)
					}
				}
				return out
			}
			return v
		}

		const shouldRemapKey = (k: string) =>
			/(^|_)(id|nodeId|maskId|clipId)$/.test(k) ||
			/(Id|NodeId|MaskId|ClipId|TargetId|ParentId)$/.test(k)
		const shouldRemapKeyPlural = (k: string) => /(Ids|NodeIds)$/.test(k)

		const cloned = (Array.isArray(nodeTree) ? nodeTree : []).map(cloneNode)
		// Second pass: remap likely id references inside props/transform blobs.
		const walkPatch = (nodes: VideoSceneTreeNode[]) => {
			for (const n of nodes) {
				if (n && typeof n === 'object') {
					if (n.props && typeof n.props === 'object') n.props = remapRefs(n.props) as VideoSceneNodeProps
					if (n.transform && typeof n.transform === 'object') n.transform = remapRefs(n.transform) as VideoSceneNodeTransform
					if (Array.isArray(n.children) && n.children.length) walkPatch(n.children)
				}
			}
		}
		walkPatch(cloned)
		return cloned
	}

	pasteFrame(layerId: string, frameIndex: number): void {
		if (!this.clipboard) return
		// Only support pasting a copied KEYFRAME for now.
		if (!this.clipboard.isKeyframe) return
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const sourceLayerId = String(this.clipboard.layerId ?? '').trim()
		const srcTree: VideoSceneTreeNode[] = Array.isArray(this.clipboard.nodeTree)
			? this.clipboard.nodeTree
			: []
		if (!srcTree.length) return

		// Cross-layer paste: overwrite target layer content.
		// To avoid global nodeId collisions across layers, remap ids when sourceLayerId != target layerId.
		const targetTree =
			sourceLayerId && sourceLayerId !== layerId
				? this.remapNodeTreeForTargetLayer(cloneJsonSafe(srcTree), layerId)
				: cloneJsonSafe(srcTree)

		// Apply to stage ONLY if the playhead is at this frame.
		// Otherwise, we only update the keyframe snapshot and let the timeline renderer drive the stage.
		const playhead = Math.floor(Number(this.store.state.currentFrame ?? 0))
		if (playhead === fi) {
			const existing = VideoSceneStore.state.layers.find((l) => l.id === layerId)
			const nextLayer = existing
				? cloneJsonSafe(existing)
				: ({ id: layerId, name: layerId } as VideoSceneLayer)
			nextLayer.nodeTree = targetTree
			VideoSceneStore.dispatch('applyStageSnapshot', { layers: [nextLayer] })
		}

		// Ensure the target frame is a keyframe and persist stage snapshot so it holds to the right.
		this.store.dispatch('addKeyframe', { layerId, frameIndex: fi })
		// Persist per-layer stage snapshot so it holds to the right.
		const isSubtitle = (this.store.state.layerKindById?.[layerId] ?? 'normal') === 'subtitle'
		const baseLayer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
		const snapLayer = baseLayer
			? cloneJsonSafe(baseLayer)
			: ({ id: layerId, name: layerId } as VideoSceneLayer)
		snapLayer.nodeTree = targetTree
		const layersForSnapshot = isSubtitle
			? stripSubtitleTextContentFromStageLayers([snapLayer], layerId)
			: [snapLayer]
		this.store.dispatch('setStageKeyframeSnapshotRange', {
			startFrame: fi,
			endFrame: fi,
			layers: layersForSnapshot
		})
		if (isSubtitle) {
			const nodesById = stripSubtitleTextContentFromNodeSnapshots(captureLayerSnapshot(layerId))
			this.store.dispatch('setNodeKeyframeSnapshotRange', {
				layerId,
				startFrame: fi,
				endFrame: fi,
				nodesById
			})
		}
	}

	clearClipboard(): void {
		this.clipboard = null
	}
}
