import { computed, ref } from 'vue'

export type WorkflowAnchorMagnetPhase = 'idle' | 'armed' | 'snapped' | 'dragging' | 'release'

export type WorkflowAnchorMagnetCandidate = {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	center: { x: number; y: number }
	element?: HTMLElement | null
}

export type WorkflowAnchorMagnetTarget = WorkflowAnchorMagnetCandidate & {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	distance: number
	radiusPx: number
	screenMagnetX: number
	screenMagnetY: number
	magnetX: number
	magnetY: number
	phase: WorkflowAnchorMagnetPhase
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

const phaseForDistance = (
	distance: number,
	lockRadius: number,
	activateRadius: number
): WorkflowAnchorMagnetPhase => {
	if (distance <= lockRadius) return 'snapped'
	if (distance <= activateRadius) return 'armed'
	return 'idle'
}

export const useWorkflowAnchorMagnet = () => {
	const zoom = ref(1)
	const dragging = ref(false)
	const snappedNodeId = ref('')
	const snappedAnchorId = ref('')

	const params = {
		zoomExponent: 1,
		hitBase: 34,
		hitMin: 20,
		hitMax: 76,
		dockBase: 8,
		dockMin: 3,
		dockMax: 14,
		lockRatio: 0.5
	}

	const hitRadiusPx = computed(() => {
		const z = Math.max(0.01, Number(zoom.value) || 1)
		const scaled = params.hitBase / Math.pow(z, params.zoomExponent)
		return clamp(scaled, params.hitMin, params.hitMax)
	})

	const dockRadiusPx = computed(() => {
		const z = Math.max(0.01, Number(zoom.value) || 1)
		const scaled = params.dockBase / Math.pow(z, params.zoomExponent)
		return clamp(scaled, params.dockMin, params.dockMax)
	})

	const lockRadiusPx = computed(() => Math.max(1, dockRadiusPx.value * params.lockRatio))

	const setZoom = (value: number) => {
		zoom.value = Number.isFinite(value) ? value : 1
	}

	const setDragging = (value: boolean) => {
		dragging.value = !!value
		if (!dragging.value) {
			snappedNodeId.value = ''
			snappedAnchorId.value = ''
		}
	}

	const toCssOffset = (screenOffset: number) => {
		const z = Math.max(0.01, Number(zoom.value) || 1)
		return screenOffset / z
	}

	const resolveTarget = (args: {
		candidates: WorkflowAnchorMagnetCandidate[]
		pointer: { x: number; y: number }
		dragging?: boolean
	}): WorkflowAnchorMagnetTarget | null => {
		let best: WorkflowAnchorMagnetTarget | null = null

		const radius = hitRadiusPx.value
		const dockRadius = dockRadiusPx.value
		const lockRadius = lockRadiusPx.value
		const isDragging = args.dragging ?? dragging.value

		for (const candidate of args.candidates) {
			const dx = args.pointer.x - candidate.center.x
			const dy = args.pointer.y - candidate.center.y
			const distance = Math.hypot(dx, dy)
			if (distance > radius) continue

			const phase = phaseForDistance(distance, lockRadius, radius)
			const t = clamp((radius - distance) / Math.max(1, radius), 0, 1)
			const eased = t * t * (3 - 2 * t)
			const pull = lerp(0, dockRadius, eased)
			const inv = distance > 1e-6 ? 1 / distance : 0
			const screenMagnetX = dx * inv * pull
			const screenMagnetY = dy * inv * pull

			const next: WorkflowAnchorMagnetTarget = {
				...candidate,
				nodeId: candidate.nodeId,
				anchorId: candidate.anchorId,
				anchorIndex: candidate.anchorIndex,
				direction: candidate.direction,
				distance,
				radiusPx: radius,
				screenMagnetX,
				screenMagnetY,
				magnetX: toCssOffset(screenMagnetX),
				magnetY: toCssOffset(screenMagnetY),
				phase: isDragging ? 'dragging' : phase
			}

			if (!best || next.distance < best.distance) best = next
		}

		if (!best) {
			snappedNodeId.value = ''
			snappedAnchorId.value = ''
			return null
		}

		if (best.phase === 'snapped' || best.phase === 'dragging') {
			snappedNodeId.value = best.nodeId
			snappedAnchorId.value = best.anchorId
			return best
		}

		if (
			snappedNodeId.value &&
			snappedAnchorId.value &&
			snappedNodeId.value === best.nodeId &&
			snappedAnchorId.value === best.anchorId &&
			best.distance <= radius
		) {
			return {
				...best,
				phase: isDragging ? 'dragging' : 'armed'
			}
		}

		snappedNodeId.value = ''
		snappedAnchorId.value = ''
		return best
	}

	const phaseForAnchor = (
		nodeId: string,
		anchorId: string,
		active: WorkflowAnchorMagnetTarget | null
	): WorkflowAnchorMagnetPhase => {
		if (!active) {
			if (snappedNodeId.value === nodeId && snappedAnchorId.value === anchorId) return 'release'
			return 'idle'
		}
		if (active.nodeId === nodeId && active.anchorId === anchorId) return active.phase
		if (snappedNodeId.value === nodeId && snappedAnchorId.value === anchorId) return 'release'
		return 'idle'
	}

	return {
		setZoom,
		setDragging,
		resolveTarget,
		phaseForAnchor,
		toCssOffset,
		hitRadiusPx,
		dockRadiusPx,
		lockRadiusPx
	}
}
