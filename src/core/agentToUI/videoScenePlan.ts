import { cloneJsonSafe } from '../shared/cloneJsonSafe'
import type { VideoSceneLayer, VideoSceneNodeTransform, VideoSceneTreeNode } from '../scene'

export type VideoSceneAnimationPreset =
	| 'fade-in'
	| 'scale-in'
	| 'slide-up'
	| 'pulse'
	| 'focus'
	| 'scan-line'
	| 'underline-draw'
	| 'number-pop'
	| 'outro'

export type VideoSceneAnimationItem = {
	preset: VideoSceneAnimationPreset
	target: string
	startFrame: number
	durationFrames: number
	easingPreset?: string
	params?: Record<string, unknown>
}

export type VideoScenePlan = {
	kind?: string
	version?: number
	goal?: string
	summary?: string
	animationPlan: VideoSceneAnimationItem[]
}

export type CompiledVideoScenePlan = {
	keyframes: Array<{ frame: number; layerSnapshot: VideoSceneLayer }>
	easingSegments: Array<{ startFrame: number; endFrame: number; easingPreset?: string }>
	appliedTargetNodeIds: string[]
	appliedPlanCount: number
	firstFrame: number
}

type TransformStatePatch = Partial<Pick<VideoSceneNodeTransform, 'x' | 'y' | 'scaleX' | 'scaleY' | 'scale' | 'opacity'>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
	const n = Math.floor(Number(value))
	if (!Number.isFinite(n)) return fallback
	return Math.max(min, Math.min(max, n))
}
const clampOpacity = (value: unknown, fallback: number) => {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	return Math.max(0, Math.min(1, n))
}
const clampScale = (value: unknown, fallback: number) => {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	return Math.max(0, Math.min(1, n))
}
const numeric = (value: unknown, fallback = 0) => {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}
const slug = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const canonicalPreset = (value: unknown): VideoSceneAnimationPreset | null => {
	switch (String(value ?? '').trim().toLowerCase()) {
		case 'fade-in':
		case 'scale-in':
		case 'slide-up':
		case 'pulse':
		case 'focus':
		case 'scan-line':
		case 'underline-draw':
		case 'number-pop':
		case 'outro':
			return String(value).trim().toLowerCase() as VideoSceneAnimationPreset
		default:
			return null
	}
}

const buildNodeIndex = (nodes: VideoSceneTreeNode[] | undefined, out: Map<string, VideoSceneTreeNode>) => {
	if (!Array.isArray(nodes)) return
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue
		out.set(String(node.id ?? ''), node)
		if (Array.isArray(node.children) && node.children.length) buildNodeIndex(node.children, out)
	}
}

const visitNodes = (nodes: VideoSceneTreeNode[] | undefined, fn: (node: VideoSceneTreeNode) => void) => {
	if (!Array.isArray(nodes)) return
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue
		fn(node)
		if (Array.isArray(node.children) && node.children.length) visitNodes(node.children, fn)
	}
}

const ensureTransform = (node: VideoSceneTreeNode): VideoSceneNodeTransform => {
	const src = (isRecord(node.transform) ? node.transform : {}) as Partial<VideoSceneNodeTransform>
	const legacyScale = clampScale(src.scale, 1)
	const transform: VideoSceneNodeTransform = {
		x: numeric(src.x, 0),
		y: numeric(src.y, 0),
		scaleX: clampScale(src.scaleX, legacyScale),
		scaleY: clampScale(src.scaleY, legacyScale),
		scale: legacyScale,
		pivotX: numeric(src.pivotX, 0.5),
		pivotY: numeric(src.pivotY, 0.5),
		width: Math.max(1, numeric(src.width, 1)),
		height: Math.max(1, numeric(src.height, 1)),
		rotation: numeric(src.rotation, 0),
		opacity: clampOpacity(src.opacity, 1),
	}
	node.transform = transform
	return transform
}

const findNodeInLayer = (layer: VideoSceneLayer, nodeId: string) => {
	const index = new Map<string, VideoSceneTreeNode>()
	buildNodeIndex(layer.nodeTree, index)
	return index.get(nodeId) ?? null
}

const collectInsertedNodes = (layer: VideoSceneLayer, insertedNodeIds: string[]) => {
	const ids = new Set(insertedNodeIds.map((id) => String(id || '').trim()).filter(Boolean))
	const out: VideoSceneTreeNode[] = []
	visitNodes(layer.nodeTree, (node) => {
		if (ids.has(node.id)) out.push(node)
	})
	return out
}

const resolveTargetNodeIds = (layer: VideoSceneLayer, insertedNodeIds: string[], rootNodeId: string, target: string): string[] => {
	const targetRaw = String(target || '').trim()
	const targetSlug = slug(targetRaw)
	if (!targetSlug) return []
	if (targetSlug === 'root' || targetSlug === 'container' || targetSlug === 'panel') return [rootNodeId]
	if (targetSlug === 'all' || targetSlug === 'group') return insertedNodeIds.slice()

	const insertedNodes = collectInsertedNodes(layer, insertedNodeIds)
	const matched = new Set<string>()
	for (const node of insertedNodes) {
		const id = String(node.id || '').trim()
		if (!id) continue
		const nodeRecord = node as unknown as Record<string, unknown>
		const fields = [node.id, node.name, nodeRecord.title, nodeRecord.alias, node.props?.textContent]
		const slugs = fields.map((value) => slug(value)).filter(Boolean)
		if (slugs.includes(targetSlug)) {
			matched.add(id)
			continue
		}
		if (slugs.some((value) => value.endsWith(targetSlug) || value.includes(targetSlug))) matched.add(id)
	}

	if (matched.size) return Array.from(matched)
	const pathTail = targetRaw.split('/').map((part) => part.trim()).filter(Boolean).pop()
	if (pathTail && slug(pathTail) !== targetSlug) return resolveTargetNodeIds(layer, insertedNodeIds, rootNodeId, pathTail)
	return []
}

const computeIntroState = (
	base: VideoSceneNodeTransform,
	params: Record<string, unknown> | undefined,
	defaults: { opacity?: number; scale?: number; offsetX?: number; offsetY?: number }
) => {
	const fromOpacity = clampOpacity(params?.fromOpacity, defaults.opacity ?? 0)
	const fromScale = clampScale(params?.fromScale, defaults.scale ?? 1)
	const offsetX = numeric(params?.offsetX, defaults.offsetX ?? 0)
	const offsetY = numeric(params?.offsetY, defaults.offsetY ?? 0)
	return { x: base.x + offsetX, y: base.y + offsetY, scaleX: fromScale, scaleY: fromScale, scale: fromScale, opacity: fromOpacity }
}

const computeOutroState = (base: VideoSceneNodeTransform, params: Record<string, unknown> | undefined) => {
	const toOpacity = clampOpacity(params?.toOpacity, 0)
	const toScale = clampScale(params?.toScale, 0.96)
	const offsetX = numeric(params?.offsetX, 0)
	const offsetY = numeric(params?.offsetY, -20)
	return { x: base.x + offsetX, y: base.y + offsetY, scaleX: toScale, scaleY: toScale, scale: toScale, opacity: toOpacity }
}

const computeOvershootState = (base: VideoSceneNodeTransform, params: Record<string, unknown> | undefined, fallbackScale: number) => {
	const scale = clampScale(params?.peakScale, fallbackScale)
	return { x: base.x, y: base.y, scaleX: scale, scaleY: scale, scale: scale, opacity: clampOpacity(params?.peakOpacity, base.opacity) }
}

const applyPatchToNode = (node: VideoSceneTreeNode, patch: Partial<VideoSceneNodeTransform>) => {
	const transform = ensureTransform(node)
	if (patch.x !== undefined) transform.x = patch.x
	if (patch.y !== undefined) transform.y = patch.y
	if (patch.scaleX !== undefined) transform.scaleX = clampScale(patch.scaleX, transform.scaleX)
	if (patch.scaleY !== undefined) transform.scaleY = clampScale(patch.scaleY, transform.scaleY)
	if (patch.scale !== undefined) transform.scale = clampScale(patch.scale, transform.scale ?? 1)
	if (patch.opacity !== undefined) transform.opacity = clampOpacity(patch.opacity, transform.opacity)
	if (patch.rotation !== undefined) transform.rotation = numeric(patch.rotation, transform.rotation)
	if (patch.width !== undefined) transform.width = Math.max(1, numeric(patch.width, transform.width))
	if (patch.height !== undefined) transform.height = Math.max(1, numeric(patch.height, transform.height))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const lerpTransformState = (
	from: TransformStatePatch,
	to: TransformStatePatch,
	t: number,
	fallback: VideoSceneNodeTransform
): TransformStatePatch => {
	const out: TransformStatePatch = {}
	const keys: Array<keyof TransformStatePatch> = ['x', 'y', 'scaleX', 'scaleY', 'scale', 'opacity']
	for (const key of keys) {
		const a = typeof from[key] === 'number' ? Number(from[key]) : Number(fallback[key])
		const b = typeof to[key] === 'number' ? Number(to[key]) : Number(fallback[key])
		if (!Number.isFinite(a) || !Number.isFinite(b)) continue
		out[key] = lerp(a, b, t)
	}
	return out
}

const keyframesForItem = (item: VideoSceneAnimationItem) => {
	const start = Math.max(0, item.startFrame)
	const end = start + Math.max(1, item.durationFrames)
	const mid = start + Math.max(1, Math.floor((end - start) / 2))
	if (item.preset === 'pulse' || item.preset === 'number-pop') return [start, mid, end]
	return [start, end]
}

const stateForFrame = (item: VideoSceneAnimationItem, base: VideoSceneNodeTransform, frame: number) => {
	const frames = keyframesForItem(item)
	const start = frames[0]
	const end = frames[frames.length - 1]
	const duration = Math.max(1, end - start)
	const progress = Math.max(0, Math.min(1, (frame - start) / duration))
	const params = item.params
	const introDefault =
		item.preset === 'slide-up'
			? { opacity: 0, scale: 1, offsetY: 32 }
			: item.preset === 'scale-in'
			? { opacity: 0, scale: 0.92, offsetY: 0 }
			: item.preset === 'focus'
			? { opacity: 0, scale: 0.96, offsetY: 12 }
			: item.preset === 'scan-line'
			? { opacity: 0, scale: 1, offsetY: 18 }
			: item.preset === 'underline-draw'
			? { opacity: 0, scale: 0.2, offsetY: 0 }
			: { opacity: 0, scale: 1, offsetY: 0 }
	const introState = computeIntroState(base, params, introDefault)
	const outroState = computeOutroState(base, params)
	const overshootState = computeOvershootState(base, params, item.preset === 'number-pop' ? 1.08 : 1.05)

	switch (item.preset) {
		case 'fade-in':
		case 'scale-in':
		case 'slide-up':
		case 'focus':
		case 'scan-line':
		case 'underline-draw':
			if (frame <= start) return introState
			if (frame >= end) return base
			return lerpTransformState(introState, base, progress, base)
		case 'outro':
			if (frame <= start) return base
			if (frame >= end) return outroState
			return lerpTransformState(base, outroState, progress, base)
		case 'pulse':
			if (frame <= start || frame >= end) return base
			if (frame === frames[1]) return overshootState
			if (progress <= 0.5) return lerpTransformState(base, overshootState, progress / 0.5, base)
			return lerpTransformState(overshootState, base, (progress - 0.5) / 0.5, base)
		case 'number-pop':
			const numberIntro = computeIntroState(base, params, { opacity: 0, scale: 0.6, offsetY: 0 })
			if (frame <= start) return numberIntro
			if (frame >= end) return base
			if (frame === frames[1]) return overshootState
			if (progress <= 0.5) return lerpTransformState(numberIntro, overshootState, progress / 0.5, base)
			return lerpTransformState(overshootState, base, (progress - 0.5) / 0.5, base)
		default:
			return base
	}
}

const resolveSegmentEasingPreset = (
	applicablePlans: Array<{ item: VideoSceneAnimationItem; targetNodeIds: string[] }>,
	startFrame: number,
	endFrame: number
) => {
	for (let i = applicablePlans.length - 1; i >= 0; i -= 1) {
		const entry = applicablePlans[i]
		const localFrames = keyframesForItem(entry.item)
		for (let j = 0; j < localFrames.length - 1; j += 1) {
			const localStart = localFrames[j]
			const localEnd = localFrames[j + 1]
			if (startFrame >= localStart && endFrame <= localEnd) {
				return entry.item.easingPreset
			}
		}
	}
	return undefined
}

export const normalizeVideoScenePlan = (raw: unknown): VideoScenePlan | null => {
	if (!isRecord(raw)) return null
	const planRaw = Array.isArray(raw.animationPlan) ? raw.animationPlan : []
	const animationPlan: VideoSceneAnimationItem[] = []
	for (const item of planRaw) {
		if (!isRecord(item)) continue
		const preset = canonicalPreset(item.preset)
		const target = String(item.target ?? '').trim()
		if (!preset || !target) continue
		animationPlan.push({
			preset,
			target,
			startFrame: clampInt(item.startFrame, 0, 0, 999999),
			durationFrames: clampInt(item.durationFrames, 12, 1, 999999),
			easingPreset: typeof item.easingPreset === 'string' ? item.easingPreset.trim() : undefined,
			params: isRecord(item.params) ? item.params : undefined,
		})
	}
	return {
		kind: typeof raw.kind === 'string' ? raw.kind : undefined,
		version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : undefined,
		goal: typeof raw.goal === 'string' ? raw.goal : undefined,
		summary: typeof raw.summary === 'string' ? raw.summary : undefined,
		animationPlan,
	}
}

export const compileVideoScenePlan = (args: {
	layer: VideoSceneLayer
	insertedNodeIds: string[]
	rootNodeId: string
	plan: VideoScenePlan
}): CompiledVideoScenePlan | null => {
	const insertedNodeIds = Array.from(new Set(args.insertedNodeIds.map((id) => String(id || '').trim()).filter(Boolean)))
	if (!insertedNodeIds.length) return null
	const baseLayer = cloneJsonSafe(args.layer) as VideoSceneLayer
	const rootNodeId = String(args.rootNodeId || insertedNodeIds[0] || '').trim()
	if (!rootNodeId) return null

	const applicablePlans = args.plan.animationPlan
		.map((item) => ({ item, targetNodeIds: resolveTargetNodeIds(baseLayer, insertedNodeIds, rootNodeId, item.target) }))
		.filter((entry) => entry.targetNodeIds.length > 0)
	if (!applicablePlans.length) return null

	const relevantFrames = new Set<number>([0])
	for (const entry of applicablePlans) {
		for (const frame of keyframesForItem(entry.item)) relevantFrames.add(frame)
	}

	const frameList = Array.from(relevantFrames).sort((a, b) => a - b)
	const keyframes: Array<{ frame: number; layerSnapshot: VideoSceneLayer }> = []
	for (const frame of frameList) {
		const snap = cloneJsonSafe(baseLayer) as VideoSceneLayer
		for (const entry of applicablePlans) {
			for (const nodeId of entry.targetNodeIds) {
				const node = findNodeInLayer(snap, nodeId)
				if (!node) continue
				const baseNode = findNodeInLayer(baseLayer, nodeId)
				if (!baseNode) continue
				applyPatchToNode(node, stateForFrame(entry.item, ensureTransform(baseNode), frame))
			}
		}
		keyframes.push({ frame, layerSnapshot: snap })
	}

	const easingSegments: Array<{ startFrame: number; endFrame: number; easingPreset?: string }> = []
	for (let i = 0; i < frameList.length - 1; i += 1) {
		const startFrame = frameList[i]
		const endFrame = frameList[i + 1]
		if (startFrame >= endFrame) continue
		easingSegments.push({
			startFrame,
			endFrame,
			easingPreset: resolveSegmentEasingPreset(applicablePlans, startFrame, endFrame),
		})
	}

	return {
		keyframes,
		easingSegments: easingSegments.filter((seg, index, arr) => arr.findIndex((it) => it.startFrame === seg.startFrame && it.endFrame === seg.endFrame) === index),
		appliedTargetNodeIds: Array.from(new Set(applicablePlans.flatMap((entry) => entry.targetNodeIds))),
		appliedPlanCount: applicablePlans.length,
		firstFrame: applicablePlans.reduce((min, entry) => Math.min(min, entry.item.startFrame), frameList[0] ?? 0),
	}
}