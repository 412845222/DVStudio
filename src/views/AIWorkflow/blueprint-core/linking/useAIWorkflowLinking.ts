import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { Store } from 'vuex'
import {
	anchorKind,
	anchorKindLabel,
	canLinkAnchors
} from '../../../../aiworkflow/domain/link/anchorKinds'
import type { WorkflowAnchorSpec, WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import type { AIWorkflowDraftRender } from '../useAIWorkflowEdgeRenderer'
import {
	useWorkflowAnchorMagnet,
	type WorkflowAnchorMagnetCandidate,
	type WorkflowAnchorMagnetTarget
} from './useWorkflowAnchorMagnet'

export type CanvasAnchorRender = {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	screenX: number
	screenY: number
	mediaType?: string
}

type LinkDraft = {
	fromNodeId: string
	fromAnchorId: string
	fromAnchorIndex: number
	startCanvas: { x: number; y: number }
	endCanvas: { x: number; y: number }
}

type DropTarget = {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	centerClient?: { x: number; y: number }
	centerCanvas?: { x: number; y: number }
	distance?: number
	phase?: 'idle' | 'armed' | 'snapped' | 'dragging' | 'release'
	screenMagnetX?: number
	screenMagnetY?: number
}

type AnchorVisualState = {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	screenX: number
	screenY: number
	mediaType?: string
	phase: 'idle' | 'armed' | 'snapped' | 'dragging' | 'release'
	magnetX: number
	magnetY: number
	compatible: boolean | null
}

type TooltipState = {
	visible: boolean
	type: string
	direction: 'in' | 'out'
	label?: string
	acceptedTypes?: string[]
	compatible?: boolean
	position: { x: number; y: number }
}

export type ScreenToWorldFn = (point: { x: number; y: number }) => { x: number; y: number }

export const useAIWorkflowLinking = (payload: {
	store: Store<WorkflowState>
	nodes: Ref<WorkflowNode[]>
	chatModelKey: Ref<string>
	nanoAnchorNodeId: string
	scheduleAsyncEdgeRender: () => void
	clientToCanvasPoint: (client: { x: number; y: number }) => { x: number; y: number } | null
	getWorkflowWorldToCanvas: () => (point: { x: number; y: number }) => { x: number; y: number }
	resolveInputAnchorCanvasPoint?: (args: {
		nodeId: string
		anchorId: string
		anchorIndex: number
	}) => { x: number; y: number } | null
	anchorWorld: (
		node: WorkflowNode,
		kind: 'in' | 'out',
		anchorIndex: number,
		anchorCount: number,
		anchor?: Pick<WorkflowAnchorSpec, 'offsetY'>
	) => { x: number; y: number }
	buildPath: (start: { x: number; y: number }, end: { x: number; y: number }) => string
	pushToast: (message: string, type?: 'info' | 'warn' | 'error') => void
	canvasAnchors?: Ref<CanvasAnchorRender[]>
	onLinkConnected?: (payload: {
		fromNodeId: string
		fromAnchorId: string
		toNodeId: string
		toAnchorId: string
	}) => void
	onLinkDropOnCanvas?: (payload: {
		fromNodeId: string
		fromAnchorId: string
		clientX: number
		clientY: number
		worldX: number
		worldY: number
	}) => void
}) => {
	const linkDraft = ref<LinkDraft | null>(null)
	const dropTarget = ref<DropTarget | null>(null)
	const tooltipState = ref<TooltipState | null>(null)
	const anchorVisualStates = ref<Map<string, AnchorVisualState>>(new Map())
	const anchorCompatibility = ref<Record<string, boolean | null>>({})
	let cleanupLink: (() => void) | null = null
	const magnet = useWorkflowAnchorMagnet()
	let sourceDragOriginClient: { x: number; y: number } | null = null
	let releaseTimers: Array<ReturnType<typeof setTimeout>> = []
	let hoverRafId: number | null = null
	let lastHoverPointer: { x: number; y: number } | null = null
	let activeScreenToWorld: ScreenToWorldFn | null = null
	const isPanning = ref(false)
	const HOVER_THROTTLE_MS = 16

	watch(
		() => payload.store.state.viewport.zoom,
		(z) => {
			magnet.setZoom(Number(z) || 1)
		},
		{ immediate: true }
	)

	const clearLinkInteraction = () => {
		if (cleanupLink) cleanupLink()
		cleanupLink = null
		magnet.setDragging(false)
		clearReleaseTimers()
		sourceDragOriginClient = null
		activeScreenToWorld = null
		linkDraft.value = null
		dropTarget.value = null
		tooltipState.value = null
		anchorCompatibility.value = {}
		anchorVisualStates.value = new Map()
	}

	function clearReleaseTimers() {
		for (const timer of releaseTimers) clearTimeout(timer)
		releaseTimers = []
	}

	const anchorKey = (nodeId: string, dir: string, anchorId: string) =>
		`${nodeId}-${dir}-${anchorId}`

	const buildAnchorCandidates = (
		directions: Array<'in' | 'out'>
	): WorkflowAnchorMagnetCandidate[] => {
		if (payload.canvasAnchors) {
			const candidates: WorkflowAnchorMagnetCandidate[] = []
			for (const a of payload.canvasAnchors.value) {
				if (!directions.includes(a.direction)) continue
				candidates.push({
					nodeId: a.nodeId,
					anchorId: a.anchorId,
					anchorIndex: a.anchorIndex,
					direction: a.direction,
					center: { x: a.screenX, y: a.screenY },
					mediaType: a.mediaType
				})
			}
			return candidates
		}

		if (typeof document === 'undefined') return []
		const result: WorkflowAnchorMagnetCandidate[] = []
		const elements = Array.from(
			document.querySelectorAll<HTMLElement>('[data-wf-node-id][data-wf-anchor-id][data-wf-dir]')
		)
		for (const el of elements) {
			const direction = String(el.dataset.wfDir ?? '') === 'out' ? 'out' : 'in'
			if (!directions.includes(direction)) continue
			const rect = el.getBoundingClientRect()
			if (rect.width <= 0 || rect.height <= 0) continue
			const nodeId = String(el.dataset.wfNodeId ?? '').trim()
			const anchorId = String(el.dataset.wfAnchorId ?? '').trim()
			if (!nodeId || !anchorId) continue
			const rawIndex = Number(el.dataset.wfAnchorIndex)
			result.push({
				nodeId,
				anchorId,
				anchorIndex: Number.isFinite(rawIndex) ? rawIndex : 0,
				direction,
				center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
			})
		}
		return result
	}

	const getPointerInMagnetSpace = (clientPoint: { x: number; y: number }) => {
		if (payload.canvasAnchors) {
			const cp = payload.clientToCanvasPoint(clientPoint)
			return cp ?? { x: 0, y: 0 }
		}
		return { x: clientPoint.x, y: clientPoint.y }
	}

	const updateAnchorVisualStates = (target: WorkflowAnchorMagnetTarget | null) => {
		if (!payload.canvasAnchors) {
			applyMagnetToDom(target)
			return
		}

		const states = new Map<string, AnchorVisualState>()
		const sourceKey = linkDraft.value
			? anchorKey(linkDraft.value.fromNodeId, 'out', linkDraft.value.fromAnchorId)
			: null
		const targetKey = target
			? anchorKey(target.nodeId, target.direction, target.anchorId)
			: null
		let compatCheck: boolean | null = null

		if (sourceKey && target && target.direction === 'in' && linkDraft.value) {
			compatCheck = canLinkAnchors(
				payload.store.state.nodesById,
				linkDraft.value.fromNodeId,
				linkDraft.value.fromAnchorId,
				target.nodeId,
				target.anchorId
			)
		}

		for (const a of payload.canvasAnchors.value) {
			const key = anchorKey(a.nodeId, a.direction, a.anchorId)
			let phase: AnchorVisualState['phase'] = 'idle'
			let mx = 0
			let my = 0
			let compat: boolean | null = null

			if (sourceKey && key === sourceKey) {
				phase = 'dragging'
			} else if (targetKey && key === targetKey) {
				phase = (target.phase === 'dragging' ? 'dragging' : target.phase) as AnchorVisualState['phase']
				if (target.direction === 'in' && linkDraft.value) {
					mx = 0
					my = 0
				} else {
					mx = target.screenMagnetX
					my = target.screenMagnetY
				}
				compat = compatCheck
			}

			states.set(key, {
				nodeId: a.nodeId,
				anchorId: a.anchorId,
				anchorIndex: a.anchorIndex,
				direction: a.direction,
				screenX: a.screenX,
				screenY: a.screenY,
				mediaType: a.mediaType,
				phase,
				magnetX: mx,
				magnetY: my,
				compatible: compat
			})
		}

		anchorVisualStates.value = states
	}

	let lastMagnetDomEl: HTMLElement | null = null
	let sourceMagnetDomEl: HTMLElement | null = null

	const clearMagnetOnElement = (el: HTMLElement | null) => {
		if (!el) return
		el.dataset.magnetPhase = 'idle'
		el.style.removeProperty('--wf-anchor-magnet-x')
		el.style.removeProperty('--wf-anchor-magnet-y')
		el.style.removeProperty('--wf-handle-magnet-x')
		el.style.removeProperty('--wf-handle-magnet-y')
	}

	const scheduleAnchorRelease = (el: HTMLElement | null) => {
		if (!el) return
		el.dataset.magnetPhase = 'release'
		el.style.setProperty('--wf-anchor-magnet-x', '0px')
		el.style.setProperty('--wf-anchor-magnet-y', '0px')
		el.style.setProperty('--wf-handle-magnet-x', '0px')
		el.style.setProperty('--wf-handle-magnet-y', '0px')
		const timer = setTimeout(() => {
			if (el.isConnected) clearMagnetOnElement(el)
			releaseTimers = releaseTimers.filter((item) => item !== timer)
		}, 160)
		releaseTimers.push(timer)
	}

	const applyMagnetToDom = (target: WorkflowAnchorMagnetTarget | null) => {
		clearReleaseTimers()
		if (!target) {
			if (lastMagnetDomEl) {
				scheduleAnchorRelease(lastMagnetDomEl)
				lastMagnetDomEl = null
			}
			return
		}
		const el = anchorElement(target.nodeId, target.anchorId, target.direction)
		if (!el) {
			if (lastMagnetDomEl) {
				scheduleAnchorRelease(lastMagnetDomEl)
				lastMagnetDomEl = null
			}
			return
		}
		if (lastMagnetDomEl && lastMagnetDomEl !== el) {
			scheduleAnchorRelease(lastMagnetDomEl)
		}
		el.dataset.magnetPhase = String(target.phase ?? 'idle')
		const suppressInputShift = Boolean(linkDraft.value) && target.direction === 'in'
		const mx = suppressInputShift ? 0 : Number(target.screenMagnetX ?? 0) || 0
		const my = suppressInputShift ? 0 : Number(target.screenMagnetY ?? 0) || 0
		el.style.setProperty('--wf-anchor-magnet-x', `${mx}px`)
		el.style.setProperty('--wf-anchor-magnet-y', `${my}px`)
		el.style.setProperty('--wf-handle-magnet-x', `${mx}px`)
		el.style.setProperty('--wf-handle-magnet-y', `${my}px`)
		lastMagnetDomEl = el
	}

	const anchorElement = (
		nodeId: string,
		anchorId: string,
		direction: 'in' | 'out'
	): HTMLElement | null => {
		if (typeof document === 'undefined') return null
		const selector = [
			`[data-wf-node-id="${String(nodeId ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
			`[data-wf-anchor-id="${String(anchorId ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
			`[data-wf-dir="${direction}"]`
		].join('')
		const el = document.querySelector(selector)
		return el instanceof HTMLElement ? el : null
	}

	const anchorCenterClient = (el: HTMLElement) => {
		const rect = el.getBoundingClientRect()
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
	}

	const getWrapRect = () => {
		const wrap = document.querySelector('.bp-wrap')
		return wrap instanceof HTMLElement ? wrap.getBoundingClientRect() : null
	}

	const canvasToClient = (canvasPt: { x: number; y: number }) => {
		const rect = getWrapRect()
		if (!rect) return { x: 0, y: 0 }
		return { x: rect.left + canvasPt.x, y: rect.top + canvasPt.y }
	}

	const toDropTarget = (target: WorkflowAnchorMagnetTarget): DropTarget => {
		if (payload.canvasAnchors) {
			const centerClient = canvasToClient(target.center)
			return {
				nodeId: target.nodeId,
				anchorId: target.anchorId,
				anchorIndex: target.anchorIndex,
				direction: target.direction,
				centerClient,
				centerCanvas: { x: target.center.x, y: target.center.y },
				distance: target.distance,
				phase: target.phase,
				screenMagnetX: target.screenMagnetX,
				screenMagnetY: target.screenMagnetY
			}
		}
		const centerCanvas = payload.clientToCanvasPoint(target.center)
		return {
			nodeId: target.nodeId,
			anchorId: target.anchorId,
			anchorIndex: target.anchorIndex,
			direction: target.direction,
			centerClient: target.center,
			centerCanvas: centerCanvas ?? undefined,
			distance: target.distance,
			phase: target.phase,
			screenMagnetX: target.screenMagnetX,
			screenMagnetY: target.screenMagnetY
		}
	}

	const applyMagnetVisual = (target: WorkflowAnchorMagnetTarget | null) => {
		if (payload.canvasAnchors) {
			updateAnchorVisualStates(target)
		} else {
			applyMagnetToDom(target)
		}
	}

	const updateTooltipState = (target: DropTarget | null) => {
		if (!target || !linkDraft.value) {
			tooltipState.value = null
			anchorCompatibility.value = {}
			return
		}
		if (payload.canvasAnchors) {
			const targetNode = payload.store.state.nodesById[target.nodeId]
			if (!targetNode) {
				tooltipState.value = null
				return
			}
			const anchors = target.direction === 'in' ? targetNode.inputs : targetNode.outputs
			const anchor = anchors.find((a) => a.id === target.anchorId)
			if (!anchor) {
				tooltipState.value = null
				return
			}
			const canvasPt = target.centerCanvas ?? { x: 0, y: 0 }
			const wrap = document.querySelector('.bp-wrap')
			const wrapRect = wrap?.getBoundingClientRect()
			const clientPos = wrapRect
				? { x: wrapRect.left + canvasPt.x, y: wrapRect.top + canvasPt.y }
				: { x: 0, y: 0 }
			const compatible = canLinkAnchors(
				payload.store.state.nodesById,
				linkDraft.value.fromNodeId,
				linkDraft.value.fromAnchorId,
				target.nodeId,
				target.anchorId
			)
			tooltipState.value = {
				visible: true,
				type: anchor.mediaType ?? 'generic',
				direction: target.direction,
				label: anchor.label,
				acceptedTypes: anchor.acceptedMediaTypes,
				compatible,
				position: clientPos
			}
			anchorCompatibility.value = {
				[`${target.nodeId}-${target.direction}-${target.anchorId}`]: compatible,
				[`${linkDraft.value.fromNodeId}-out-${linkDraft.value.fromAnchorId}`]: compatible
			}
			return
		}

		const el = anchorElement(target.nodeId, target.anchorId, target.direction)
		if (!el) {
			tooltipState.value = null
			anchorCompatibility.value = {}
			return
		}
		const rect = el.getBoundingClientRect()
		const compatible = canLinkAnchors(
			payload.store.state.nodesById,
			linkDraft.value.fromNodeId,
			linkDraft.value.fromAnchorId,
			target.nodeId,
			target.anchorId
		)
		const targetKey = `${target.nodeId}-${target.direction}-${target.anchorId}`
		const sourceKey = `${linkDraft.value.fromNodeId}-out-${linkDraft.value.fromAnchorId}`
		anchorCompatibility.value = {
			[targetKey]: compatible,
			[sourceKey]: compatible
		}
		const targetNode = payload.store.state.nodesById[target.nodeId]
		const anchors = targetNode ? (target.direction === 'in' ? targetNode.inputs : targetNode.outputs) : []
		const anchor = anchors.find((a) => a.id === target.anchorId)
		tooltipState.value = {
			visible: true,
			type: anchor?.mediaType ?? 'generic',
			direction: target.direction,
			label: anchor?.label,
			acceptedTypes: anchor?.acceptedMediaTypes,
			compatible,
			position: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
		}
	}

	const runHoverMagnet = () => {
		hoverRafId = null
		if (linkDraft.value || !lastHoverPointer) return
		const pt = getPointerInMagnetSpace(lastHoverPointer)
		const target = magnet.resolveTarget({
			candidates: buildAnchorCandidates(['in', 'out']),
			pointer: pt,
			dragging: false
		})
		applyMagnetVisual(target)
	}

	const onHoverPointerMove = (event: PointerEvent) => {
		if (linkDraft.value || isPanning.value) return
		const canvasEl = document.querySelector('.bp-wrap')
		if (!canvasEl) return
		const rect = canvasEl.getBoundingClientRect()
		const padding = 20
		if (
			event.clientX < rect.left - padding ||
			event.clientX > rect.right + padding ||
			event.clientY < rect.top - padding ||
			event.clientY > rect.bottom + padding
		) {
			return
		}
		lastHoverPointer = { x: event.clientX, y: event.clientY }
		if (hoverRafId != null) return
		hoverRafId = requestAnimationFrame(runHoverMagnet)
	}

	const onHoverPointerLeave = () => {
		lastHoverPointer = null
		if (hoverRafId != null) {
			cancelAnimationFrame(hoverRafId)
			hoverRafId = null
		}
		if (!linkDraft.value) applyMagnetVisual(null)
	}

	watch(
		() => [linkDraft.value, dropTarget.value],
		() => {
			if (dropTarget.value) {
				const center = dropTarget.value.centerClient ?? { x: 0, y: 0 }
				const fakeTarget: WorkflowAnchorMagnetTarget = {
					nodeId: dropTarget.value.nodeId,
					anchorId: dropTarget.value.anchorId,
					anchorIndex: dropTarget.value.anchorIndex,
					direction: dropTarget.value.direction,
					center,
					distance: dropTarget.value.distance ?? 0,
					radiusPx: 22,
					screenMagnetX: dropTarget.value.screenMagnetX ?? 0,
					screenMagnetY: dropTarget.value.screenMagnetY ?? 0,
					phase: (dropTarget.value.phase ?? 'idle') as 'idle' | 'armed' | 'snapped' | 'dragging'
				}
				applyMagnetVisual(fakeTarget)
			} else {
				applyMagnetVisual(null)
			}
			updateTooltipState(dropTarget.value)
			payload.scheduleAsyncEdgeRender()
		},
		{ deep: true, flush: 'post' }
	)

	const nanoHoverAnchorId = computed(() => {
		if (payload.chatModelKey.value !== 'nanobanana' && payload.chatModelKey.value !== 'seedance')
			return null
		if (!dropTarget.value) return null
		if (dropTarget.value.nodeId !== payload.nanoAnchorNodeId) return null
		return dropTarget.value.anchorId
	})

	const hoverInputAnchorId = (nodeId: string) => {
		if (!dropTarget.value) return null
		return dropTarget.value.nodeId === nodeId ? dropTarget.value.anchorId : null
	}

	const hoverOutputAnchorId = (nodeId: string) => {
		if (!linkDraft.value) return null
		return linkDraft.value.fromNodeId === nodeId ? linkDraft.value.fromAnchorId : null
	}

	const findDropTarget = (clientPoint: { x: number; y: number }) => {
		const pt = getPointerInMagnetSpace(clientPoint)
		const target = magnet.resolveTarget({
			candidates: buildAnchorCandidates(['in']),
			pointer: pt,
			dragging: false
		})
		return target ? toDropTarget(target) : null
	}

	const onStartLink = (
		startPayload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent },
		screenToWorld: ScreenToWorldFn
	) => {
		const node = payload.store.state.nodesById[startPayload.nodeId]
		if (!node) return
		const endCanvas = payload.clientToCanvasPoint({
			x: startPayload.event.clientX,
			y: startPayload.event.clientY
		})
		if (!endCanvas) return

		linkDraft.value = {
			fromNodeId: startPayload.nodeId,
			fromAnchorId: startPayload.anchorId,
			fromAnchorIndex: startPayload.anchorIndex,
			startCanvas: endCanvas,
			endCanvas
		}
		activeScreenToWorld = screenToWorld
		magnet.setDragging(true)

		if (!payload.canvasAnchors) {
			const nextSourceEl = anchorElement(startPayload.nodeId, startPayload.anchorId, 'out')
			if (lastMagnetDomEl && lastMagnetDomEl !== nextSourceEl) scheduleAnchorRelease(lastMagnetDomEl)
			lastMagnetDomEl = null
			sourceMagnetDomEl = nextSourceEl
			if (sourceMagnetDomEl) {
				sourceMagnetDomEl.dataset.magnetPhase = 'dragging'
				sourceMagnetDomEl.style.setProperty('--wf-anchor-magnet-x', '0px')
				sourceMagnetDomEl.style.setProperty('--wf-anchor-magnet-y', '0px')
				sourceMagnetDomEl.style.setProperty('--wf-handle-magnet-x', '0px')
				sourceMagnetDomEl.style.setProperty('--wf-handle-magnet-y', '0px')
				sourceDragOriginClient = anchorCenterClient(sourceMagnetDomEl)
			} else {
				sourceDragOriginClient = null
			}
		} else {
			sourceDragOriginClient = null
		}

		const sourceCenterCanvas = (() => {
			const worldToCanvas = payload.getWorkflowWorldToCanvas()
			const fromAnchor = node.outputs?.[Math.max(0, startPayload.anchorIndex)]
			return worldToCanvas(
				payload.anchorWorld(
					node,
					'out',
					Math.max(0, startPayload.anchorIndex),
					node.outputs.length,
					fromAnchor
				)
			)
		})()

		if (sourceCenterCanvas) {
			linkDraft.value.startCanvas = sourceCenterCanvas
		}

		const onMove = (event: PointerEvent) => {
			if (!linkDraft.value) return
			event.preventDefault()
			const next = payload.clientToCanvasPoint({ x: event.clientX, y: event.clientY })
			if (!next) return
			const nextTarget = findDropTarget({ x: event.clientX, y: event.clientY })
			dropTarget.value = nextTarget
			const snappedCanvas =
				nextTarget &&
				(nextTarget.phase === 'snapped' || nextTarget.distance === 0) &&
				nextTarget.centerCanvas
					? { x: nextTarget.centerCanvas.x, y: nextTarget.centerCanvas.y }
					: null
			linkDraft.value.endCanvas = snappedCanvas ?? next
		}

		const onUp = (event: PointerEvent) => {
			if (linkDraft.value && dropTarget.value && dropTarget.value.direction === 'in') {
				connectDropTarget(dropTarget.value)
			} else if (linkDraft.value && !dropTarget.value) {
				const canvasPoint = payload.clientToCanvasPoint({ x: event.clientX, y: event.clientY })
				if (canvasPoint) {
					const worldPoint = activeScreenToWorld
						? activeScreenToWorld({ x: canvasPoint.x, y: canvasPoint.y })
						: (() => {
								const zoom = Number(payload.store.state.viewport.zoom) || 1
								const panX = Number(payload.store.state.viewport.panX) || 0
								const panY = Number(payload.store.state.viewport.panY) || 0
								return {
									x: (canvasPoint.x - panX) / zoom,
									y: (canvasPoint.y - panY) / zoom
								}
							})()
					payload.onLinkDropOnCanvas?.({
						fromNodeId: linkDraft.value.fromNodeId,
						fromAnchorId: linkDraft.value.fromAnchorId,
						clientX: event.clientX,
						clientY: event.clientY,
						worldX: worldPoint.x,
						worldY: worldPoint.y
					})
				}
			}
			clearLinkInteraction()
		}

		window.addEventListener('pointermove', onMove, { passive: false })
		window.addEventListener('pointerup', onUp, { once: true })
		window.addEventListener('pointercancel', onUp, { once: true })
		cleanupLink = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onUp)
		}
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('pointermove', onHoverPointerMove, { passive: true })
		window.addEventListener('blur', onHoverPointerLeave)
	}

	const connectDropTarget = (target: DropTarget) => {
		if (!linkDraft.value) return
		if (
			!canLinkAnchors(
				payload.store.state.nodesById,
				linkDraft.value.fromNodeId,
				linkDraft.value.fromAnchorId,
				target.nodeId,
				target.anchorId
			)
		) {
			const fromNode = payload.store.state.nodesById[linkDraft.value.fromNodeId]
			const toNode = payload.store.state.nodesById[target.nodeId]
			const fromKind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
			const toKind = anchorKind(toNode, target.anchorId, 'in')
			payload.pushToast(
				`锚点类型不匹配：${anchorKindLabel(fromKind)} → ${anchorKindLabel(toKind)}。resource 输入可接收 image/video/resource。`,
				'warn'
			)
			clearLinkInteraction()
			return
		}

		const fromNodeId = linkDraft.value.fromNodeId
		const fromAnchorId = linkDraft.value.fromAnchorId
		const toNodeId = target.nodeId
		const toAnchorId = target.anchorId

		payload.store.commit('addEdge', {
			fromNodeId,
			fromAnchorId,
			toNodeId,
			toAnchorId
		})

		payload.onLinkConnected?.({
			fromNodeId,
			fromAnchorId,
			toNodeId,
			toAnchorId
		})

		clearLinkInteraction()
	}

	const onEndLink = (endPayload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
		if (!linkDraft.value) return
		if (
			!canLinkAnchors(
				payload.store.state.nodesById,
				linkDraft.value.fromNodeId,
				linkDraft.value.fromAnchorId,
				endPayload.nodeId,
				endPayload.anchorId
			)
		) {
			const fromNode = payload.store.state.nodesById[linkDraft.value.fromNodeId]
			const toNode = payload.store.state.nodesById[endPayload.nodeId]
			const fromKind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
			const toKind = anchorKind(toNode, endPayload.anchorId, 'in')
			payload.pushToast(
				`锚点类型不匹配：${anchorKindLabel(fromKind)} → ${anchorKindLabel(toKind)}。resource 输入可接收 image/video/resource。`,
				'warn'
			)
			clearLinkInteraction()
			return
		}

		const fromNodeId = linkDraft.value.fromNodeId
		const fromAnchorId = linkDraft.value.fromAnchorId
		const toNodeId = endPayload.nodeId
		const toAnchorId = endPayload.anchorId

		payload.store.commit('addEdge', {
			fromNodeId,
			fromAnchorId,
			toNodeId,
			toAnchorId
		})

		payload.onLinkConnected?.({
			fromNodeId,
			fromAnchorId,
			toNodeId,
			toAnchorId
		})

		clearLinkInteraction()
	}

	const hitTestAnchor = (
		clientX: number,
		clientY: number
	): { nodeId: string; anchorId: string; anchorIndex: number; direction: 'in' | 'out' } | null => {
		if (!payload.canvasAnchors) return null
		const cp = payload.clientToCanvasPoint({ x: clientX, y: clientY })
		if (!cp) return null
		let best: { dist: number; nodeId: string; anchorId: string; anchorIndex: number; direction: 'in' | 'out' } | null = null
		const hitRadius = magnet.hitRadiusPx.value
		for (const a of payload.canvasAnchors.value) {
			const dx = cp.x - a.screenX
			const dy = cp.y - a.screenY
			const dist = Math.hypot(dx, dy)
			if (dist > hitRadius) continue
			if (!best || dist < best.dist) {
				best = { dist, nodeId: a.nodeId, anchorId: a.anchorId, anchorIndex: a.anchorIndex, direction: a.direction }
			}
		}
		return best ? { nodeId: best.nodeId, anchorId: best.anchorId, anchorIndex: best.anchorIndex, direction: best.direction } : null
	}

	const draftRender = (
		_worldToScreen: (point: { x: number; y: number }) => { x: number; y: number }
	): AIWorkflowDraftRender => {
		if (!linkDraft.value) return null
		const fromNode = payload.store.state.nodesById[linkDraft.value.fromNodeId]
		if (!fromNode) return null
		const kind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
		const stroke =
			kind === 'flow'
				? '#d77f4f'
				: kind === 'text'
					? '#3aa8b4'
					: kind === 'video'
						? '#3aa8b4'
						: kind === 'image'
							? '#3aa8b4'
							: '#3aa8b4'
		const strokeWidth = kind === 'flow' ? 3.5 : 2.5
		const start = linkDraft.value.startCanvas
		const end = linkDraft.value.endCanvas
		return { path: payload.buildPath(start, end), stroke, strokeWidth }
	}

	onBeforeUnmount(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onHoverPointerMove)
			window.removeEventListener('blur', onHoverPointerLeave)
		}
		if (hoverRafId != null) cancelAnimationFrame(hoverRafId)
		clearLinkInteraction()
		clearReleaseTimers()
	})

	const setPanning = (panning: boolean) => {
		isPanning.value = panning
	}

	return {
		nanoHoverAnchorId,
		hoverInputAnchorId,
		hoverOutputAnchorId,
		onStartLink,
		onEndLink,
		draftRender,
		tooltipState,
		anchorCompatibility,
		isLinking: computed(() => !!linkDraft.value),
		linkingFromNodeId: computed(() => linkDraft.value?.fromNodeId ?? null),
		linkingHoverNodeId: computed(() => dropTarget.value?.nodeId ?? null),
		anchorVisualStates,
		hitTestAnchor,
		setPanning
	}
}
