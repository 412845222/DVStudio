import type { Store } from 'vuex'
import type { TimelineState } from '../../../store/timeline'
import { containsFrame, getPrevNext } from '../../../store/timeline/spans'
import { VideoSceneStore, type VideoSceneNodeProps, type VideoSceneNodeTransform, type VideoSceneTreeNode } from '../../../store/videoscene'
import { TimelineDataManager, type FrameCellPayload } from './TimelineDataManager'

const clampInt = (v: unknown, min: number, max: number) => {
	const n = Math.floor(Number(v))
	if (!Number.isFinite(n)) return min
	return Math.max(min, Math.min(max, n))
}

const cellKey = (layerId: string, frameIndex: number) => `${layerId}:${frameIndex}`
const segmentKey = (layerId: string, startFrame: number, endFrame: number) => `${layerId}:${startFrame}:${endFrame}`

type NodeSnapshot = { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }

const deepCloneFallback = <T,>(value: T, seen = new WeakMap<object, any>()): T => {
	if (value == null) return value
	if (typeof value !== 'object') return value
	if (value instanceof Date) return new Date(value.getTime()) as any

	const obj = value as unknown as object
	const cached = seen.get(obj)
	if (cached) return cached

	if (Array.isArray(value)) {
		const out: any[] = []
		seen.set(obj, out)
		for (const item of value as any[]) out.push(deepCloneFallback(item, seen))
		return out as any
	}

	const proto = Object.getPrototypeOf(obj)
	const out: any = proto === null ? Object.create(null) : {}
	seen.set(obj, out)
	for (const k of Object.keys(obj as any)) out[k] = deepCloneFallback((obj as any)[k], seen)
	return out
}

const cloneJsonSafe = <T,>(v: T): T => {
	try {
		return JSON.parse(JSON.stringify(v)) as T
	} catch {
		try {
			return (globalThis as any).structuredClone ? ((globalThis as any).structuredClone(v) as T) : deepCloneFallback(v)
		} catch {
			return deepCloneFallback(v)
		}
	}
}

const collectUserNodeSnapshots = (nodes: VideoSceneTreeNode[] | undefined, out: Record<string, NodeSnapshot>) => {
	if (!nodes) return
	for (const n of nodes) {
		if (n.category === 'user') {
			out[n.id] = {
				transform: n.transform ? { ...n.transform } : undefined,
				props: n.props ? cloneJsonSafe(n.props) : undefined,
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
	private clipboard: FrameCellPayload | null = null

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
		// 同步捕获“全画布快照”，供播放/拖拽指针时按帧完全还原
		const stageLayers = cloneJsonSafe(VideoSceneStore.state.layers)
		this.store.dispatch('setStageKeyframeSnapshotRange', { startFrame: fi, endFrame: fi, layers: stageLayers })
	}

	removeKeyframe(layerId: string, frameIndex: number): void {
		this.store.dispatch('removeKeyframe', { layerId, frameIndex })
	}

	isEasingEnabled(layerId: string, frameIndex: number): boolean {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return false
		return this.store.state.easingSegmentKeys.includes(segmentKey(layerId, seg.startFrame, seg.endFrame))
	}

	canEnableEasing(layerId: string, frameIndex: number): boolean {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		if (this.isKeyframe(layerId, fi)) return false
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return false
		return !this.store.state.easingSegmentKeys.includes(segmentKey(layerId, seg.startFrame, seg.endFrame))
	}

	private getKeyframeSegmentForFrame(layerId: string, frameIndex: number): { startFrame: number; endFrame: number } | null {
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
		this.store.dispatch('enableEasingSegment', { layerId, startFrame: seg.startFrame, endFrame: seg.endFrame })
	}

	disableEasing(layerId: string, frameIndex: number): void {
		const fi = clampInt(frameIndex, 0, this.store.state.frameCount - 1)
		const seg = this.getKeyframeSegmentForFrame(layerId, fi)
		if (!seg) return
		this.store.dispatch('disableEasingSegment', { layerId, startFrame: seg.startFrame, endFrame: seg.endFrame })
	}

	copyFrame(layerId: string, frameIndex: number): void {
		this.clipboard = {
			isKeyframe: this.isKeyframe(layerId, frameIndex),
			easingEnabled: this.isEasingEnabled(layerId, frameIndex),
		}
	}

	canPaste(): boolean {
		return this.clipboard != null
	}

	pasteFrame(layerId: string, frameIndex: number): void {
		if (!this.clipboard) return

		if (this.clipboard.isKeyframe) this.addKeyframe(layerId, frameIndex)
		else this.removeKeyframe(layerId, frameIndex)

		// 缓动占位：复制粘贴时同步开关（但不会强制校验“两个关键帧之间”）
		if (this.clipboard.easingEnabled) this.enableEasing(layerId, frameIndex)
		else this.disableEasing(layerId, frameIndex)
	}

	clearClipboard(): void {
		this.clipboard = null
	}
}
