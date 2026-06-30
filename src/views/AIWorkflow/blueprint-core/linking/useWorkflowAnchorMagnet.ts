import { computed, ref } from 'vue'

export type WorkflowAnchorMagnetPhase = 'idle' | 'armed' | 'snapped' | 'dragging' | 'release'

export type WorkflowAnchorMagnetCandidate = {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	center: { x: number; y: number }
	mediaType?: string
}

export type WorkflowAnchorMagnetTarget = WorkflowAnchorMagnetCandidate & {
	distance: number
	radiusPx: number
	screenMagnetX: number
	screenMagnetY: number
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

	const HIT_RADIUS_PX = 22
	const DOCK_RADIUS_PX = 8
	const LOCK_RADIUS_PX = 5

	const hitRadiusPx = computed(() => HIT_RADIUS_PX)
	const dockRadiusPx = computed(() => DOCK_RADIUS_PX)
	const lockRadiusPx = computed(() => LOCK_RADIUS_PX)

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
				distance,
				radiusPx: radius,
				screenMagnetX,
				screenMagnetY,
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
		hitRadiusPx,
		dockRadiusPx,
		lockRadiusPx
	}
}
