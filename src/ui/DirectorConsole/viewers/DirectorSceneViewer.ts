import * as THREE from 'three'
import {
	SceneLayoutPreviewViewer,
	type SceneLayoutViewState
} from '../../WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'
import type {
	WorkflowSceneLayoutItem,
	WorkflowSceneLayoutModelBinding
} from '../../../aiworkflow/types'
import type {
	WorkflowDirectorCameraTrack,
	WorkflowDirectorCameraKeyframe,
	WorkflowDirectorLightRig
} from '../../../aiworkflow/types'
import type { DirectorConsoleScenePayload } from '../../../electronBridge'

export interface DirectorSceneViewerCallbacks {
	onCameraViewChange?: (view: {
		position: { x: number; y: number; z: number }
		target: { x: number; y: number; z: number }
		fov?: number
	}) => void
	onReady?: () => void
	onError?: (msg: string) => void
}

export class DirectorSceneViewer {
	private previewViewer: SceneLayoutPreviewViewer | null = null
	private readonly canvas: HTMLCanvasElement
	private readonly callbacks: DirectorSceneViewerCallbacks
	private currentTrack: WorkflowDirectorCameraTrack | null = null
	private currentLightRig: WorkflowDirectorLightRig | null = null
	private isPlaying = false
	private playStartTime = 0
	private animationFrameId: number | null = null

	constructor(canvas: HTMLCanvasElement, callbacks: DirectorSceneViewerCallbacks = {}) {
		this.canvas = canvas
		this.callbacks = callbacks
		this.initPreviewViewer()
	}

	private initPreviewViewer() {
		this.previewViewer = new SceneLayoutPreviewViewer(this.canvas, {
			onCameraInteractionEnd: () => {
				this.notifyCameraView()
			},
			onViewStateChange: () => {
				this.notifyCameraView()
			},
			onModelLoadError: (url, itemId) => {
				this.callbacks.onError?.('Model load failed: ' + itemId + ' (' + url + ')')
			}
		})
		// Director console: read-only layout (no TransformControls drag)
		this.previewViewer.setInteractive(false)
		this.previewViewer.setRenderSuspended(false)
	}

	private notifyCameraView() {
		if (!this.previewViewer || !this.callbacks.onCameraViewChange) return
		const state = this.previewViewer.getViewState()
		if (!state) return
		this.callbacks.onCameraViewChange({
			position: state.cameraPosition,
			target: state.target
		})
	}

	async loadScene(payload: DirectorConsoleScenePayload): Promise<void> {
		if (!this.previewViewer) {
			this.callbacks.onError?.('Viewer not initialized')
			return
		}
		try {
			const items = (payload.layoutItems || []) as WorkflowSceneLayoutItem[]
			const cameraCfg = payload.camera || null
			const modelBindings = this.mapModelBindings(payload.modelBindings || [])

			this.previewViewer.setLayout(items, cameraCfg, {
				previewMode: true,
				modelBindings,
				hidePlaceholderCubes: modelBindings.length > 0,
				lightingPreviewEnabled: true
			})

			// Restore saved director data if available
			if (payload.cameraTracks) {
				const tracks = payload.cameraTracks as WorkflowDirectorCameraTrack[]
				if (tracks.length > 0) {
					const activeId = payload.activeCameraTrackId
					const track = activeId ? tracks.find((t) => t.id === activeId) : tracks[0]
					if (track) this.setCameraTrack(track)
				}
			}
			if (payload.lightRig) {
				this.applyLightRig(payload.lightRig as WorkflowDirectorLightRig)
			}

			this.callbacks.onReady?.()
		} catch (err) {
			this.callbacks.onError?.('Failed to load scene: ' + String(err))
		}
	}

	private mapModelBindings(
		bindings: DirectorConsoleScenePayload['modelBindings']
	): WorkflowSceneLayoutModelBinding[] {
		if (!bindings) return []
		return bindings.map((b) => ({
			objectId: b.objectId,
			objectName: b.objectName,
			inputAnchorId: 'in-model-' + b.objectId,
			connected: true,
			modelUrl: b.modelUrl,
			modelAssetPath: b.modelAbsolutePath,
			modelProjectRelativePath: b.modelProjectRelativePath
		}))
	}

	// ===== Camera track (P1 stubs) =====
	setCameraTrack(track: WorkflowDirectorCameraTrack | null): void {
		this.currentTrack = track
		// P1: implement timeline playback
	}

	addKeyframeFromCurrentView(time: number): WorkflowDirectorCameraKeyframe {
		const state = this.previewViewer?.getViewState()
		const position = state?.cameraPosition || { x: 0, y: 0, z: 5 }
		const target = state?.target || { x: 0, y: 0, z: 0 }
		return {
			id: 'kf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
			time,
			position: { ...position },
			target: { ...target },
			fov: 50,
			roll: 0,
			easing: 'ease-in-out'
		}
	}

	play(opts?: { fromTime?: number }): void {
		if (!this.currentTrack || this.isPlaying) return
		this.isPlaying = true
		this.playStartTime = performance.now()
		const fromTime = opts?.fromTime ?? 0
		const duration = this.currentTrack.duration || 10
		const tick = () => {
			if (!this.isPlaying) return
			const elapsed = (performance.now() - this.playStartTime) / 1000
			const t = fromTime + elapsed
			if (t >= duration) {
				if (this.currentTrack?.loop) {
					this.playStartTime = performance.now()
				} else {
					this.pause()
					return
				}
			}
			this.seek(t)
			this.animationFrameId = requestAnimationFrame(tick)
		}
		this.animationFrameId = requestAnimationFrame(tick)
	}

	pause(): void {
		this.isPlaying = false
		if (this.animationFrameId != null) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
	}

	seek(time: number): void {
		if (!this.currentTrack || !this.previewViewer) return
		const kfs = this.currentTrack.keyframes || []
		if (kfs.length === 0) return
		// Find surrounding keyframes
		let prev = kfs[0]
		let next = kfs[kfs.length - 1]
		for (let i = 0; i < kfs.length; i++) {
			if (kfs[i].time <= time) prev = kfs[i]
			if (kfs[i].time >= time) {
				next = kfs[i]
				break
			}
		}
		// Linear interpolation (P1: add easing)
		const range = next.time - prev.time
		const t = range > 0 ? (time - prev.time) / range : 0
		const position = {
			x: prev.position.x + (next.position.x - prev.position.x) * t,
			y: prev.position.y + (next.position.y - prev.position.y) * t,
			z: prev.position.z + (next.position.z - prev.position.z) * t
		}
		const target = {
			x: prev.target.x + (next.target.x - prev.target.x) * t,
			y: prev.target.y + (next.target.y - prev.target.y) * t,
			z: prev.target.z + (next.target.z - prev.target.z) * t
		}
		// Apply camera via setLayout's camera config
		this.previewViewer.setLayout([], { position, target }, { previewMode: true })
	}

	// ===== Light rig (P2 stubs) =====
	applyLightRig(rig: WorkflowDirectorLightRig): void {
		this.currentLightRig = rig
		// P2: implement light application via SceneLayoutPreviewViewer lightingControls
	}

	getLightRig(): WorkflowDirectorLightRig {
		return this.currentLightRig || { preset: 'custom', exposure: 1, lights: [] }
	}

	// ===== General =====
	resetCamera(): void {
		if (!this.previewViewer) return
		this.previewViewer.setLayout([], null, { previewMode: true })
	}

	setRenderSuspended(suspended: boolean): void {
		this.previewViewer?.setRenderSuspended(suspended)
	}

	getViewState(): SceneLayoutViewState | null {
		return this.previewViewer?.getViewState() ?? null
	}

	restoreView(state: SceneLayoutViewState): void {
		if (!this.previewViewer) return
		this.previewViewer.setLayout([], null, { previewMode: true }, state)
	}

	async awaitPendingBindingSync(): Promise<void> {
		await this.previewViewer?.awaitPendingBindingSync?.()
	}

	dispose(): void {
		this.pause()
		this.previewViewer?.dispose()
		this.previewViewer = null
	}
}
