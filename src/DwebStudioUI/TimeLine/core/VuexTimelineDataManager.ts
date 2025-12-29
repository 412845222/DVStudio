import type { Store } from 'vuex'
import type { TimelineState } from '../../../store/timeline'
import { TimelineDataManager, type FrameCellPayload } from './TimelineDataManager'

const clampInt = (v: unknown, min: number, max: number) => {
	const n = Math.floor(Number(v))
	if (!Number.isFinite(n)) return min
	return Math.max(min, Math.min(max, n))
}

const cellKey = (layerId: string, frameIndex: number) => `${layerId}:${frameIndex}`
const segmentKey = (layerId: string, startFrame: number, endFrame: number) => `${layerId}:${startFrame}:${endFrame}`

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
		return this.store.state.keyframeKeys.includes(cellKey(layerId, fi))
	}

	addKeyframe(layerId: string, frameIndex: number): void {
		this.store.dispatch('addKeyframe', { layerId, frameIndex })
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

		// 取该层所有关键帧索引
		const indices: number[] = []
		for (const k of this.store.state.keyframeKeys) {
			if (!k.startsWith(layerId + ':')) continue
			const n = parseFrameIndexFromKey(k)
			if (n == null) continue
			indices.push(n)
		}
		if (indices.length < 2) return null
		indices.sort((a, b) => a - b)

		// lowerBound: first >= fi
		let lo = 0
		let hi = indices.length
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			if (indices[mid] < fi) lo = mid + 1
			else hi = mid
		}
		const endFrame = indices[lo]
		const startFrame = lo > 0 ? indices[lo - 1] : undefined
		if (startFrame == null || endFrame == null) return null
		if (!(startFrame < fi && fi < endFrame)) return null
		return { startFrame, endFrame }
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
