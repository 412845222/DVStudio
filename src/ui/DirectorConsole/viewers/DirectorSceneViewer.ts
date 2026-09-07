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
	/** [v2.0] 摄像头轨道变更回流（添加/删除/拖拽结束） */
	onCameraTrackChange?: (tracks: WorkflowDirectorCameraTrack[]) => void
	/** [v1.0] 摄像头 Actor 缩放变更回调（scale 模式，仅视觉） */
	onCameraScaleChange?: (scale: { x: number; y: number; z: number }) => void
	/** [v1.0] 选中对象变更回调（摄像头或占位体被选中时触发） */
	onSelectionChange?: (itemId: string) => void
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
	private currentLayoutItems: WorkflowSceneLayoutItem[] = []
	private currentCamera: {
		position?: { x: number; y: number; z: number }
		target?: { x: number; y: number; z: number }
	} | null = null
	private currentModelBindings: WorkflowSceneLayoutModelBinding[] = []
	private currentTransparent = true
	private currentLightingEnabled = false

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
			},
			onCameraTrackChange: (track) => {
				// [v3.0] 摄像头拖拽结束回调：同步 currentTrack 并通知上层
				this.currentTrack = track
				this.emitCameraTrackChange()
			},
			onSelectionChange: (itemId: string) => {
				this.callbacks.onSelectionChange?.(itemId)
			},
			onCameraScaleChange: (scale) => {
				this.callbacks.onCameraScaleChange?.(scale)
			}
		})
		// [v2.0] 启用完整交互(含 TransformControls 拖拽),配合 SceneLayoutPreviewViewer
		// 内部 pickObject 的 gizmo 拾取避让,可同时支持镜头旋转/平移/缩放与占位体 XYZ 轴拖拽
		this.previewViewer.setInteractive(true)
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

	async loadScene(
		payload: DirectorConsoleScenePayload,
		opts?: { transparent?: boolean }
	): Promise<void> {
		if (!this.previewViewer) {
			this.callbacks.onError?.('Viewer not initialized')
			return
		}
		try {
			const items = (payload.layoutItems || []) as WorkflowSceneLayoutItem[]
			const cameraCfg = payload.camera || null
			const modelBindings = this.mapModelBindings(payload.modelBindings || [])
			const transparent = opts?.transparent !== false

			this.currentLayoutItems = items
			this.currentCamera = cameraCfg
			this.currentModelBindings = modelBindings
			this.currentTransparent = transparent

			this.previewViewer.setLayout(items, cameraCfg, {
				previewMode: true,
				modelBindings,
				hidePlaceholderCubes: modelBindings.length > 0,
				transparent,
				lightingPreviewEnabled: this.currentLightingEnabled
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

	/**
	 * 切换场景布局占位体的半透明/不透明显示。
	 * 复用 SceneLayoutPreviewViewer.setLayout 的增量更新路径(items 相同时仅更新 renderOptions)。
	 */
	setPlaceholderOpacity(mode: 'transparent' | 'opaque'): void {
		if (!this.previewViewer) return
		const transparent = mode === 'transparent'
		this.currentTransparent = transparent
		this.previewViewer.setLayout(this.currentLayoutItems, this.currentCamera, {
			previewMode: true,
			modelBindings: this.currentModelBindings,
			hidePlaceholderCubes: false,
			transparent,
			lightingPreviewEnabled: this.currentLightingEnabled
		})
	}

	// ===== 灯光 / 线框 工具条封装 =====

	setLightingEnabled(enabled: boolean): boolean {
		if (!this.previewViewer) return this.currentLightingEnabled
		this.currentLightingEnabled = this.previewViewer.setLightingEnabled(enabled)
		return this.currentLightingEnabled
	}

	getLightingEnabled(): boolean {
		return this.currentLightingEnabled
	}

	addDirectorLight(type: 'point' | 'directional' | 'spot' | 'hemisphere'): string | null {
		if (!this.previewViewer || !this.currentLightingEnabled) return null
		return this.previewViewer.addDirectorLight(type)
	}

	setWireframeEnabled(enabled: boolean): boolean {
		if (!this.previewViewer) return false
		return this.previewViewer.setWireframeEnabled(enabled)
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

	// ===== Camera track =====
	setCameraTrack(track: WorkflowDirectorCameraTrack | null): void {
		this.currentTrack = track
		if (!this.previewViewer) return
		if (track) {
			this.previewViewer.setCameraActor(track)
		} else {
			this.previewViewer.clearCameraActor()
		}
	}

	/**
	 * [v2.0] 在 viewport 指定屏幕坐标位置添加摄像头(拖拽放置入口)。
	 * 使用 raycaster 与地面 y=0 求交得到世界坐标,作为摄像头初始 position。
	 * 全场景唯一:已存在摄像头时拒绝添加。
	 */
	async addCameraAt(screenX: number, screenY: number): Promise<boolean> {
		if (!this.previewViewer) return false
		if (this.currentTrack) {
			this.callbacks.onError?.('Camera already exists')
			return false
		}
		const position = this.previewViewer.screenToGroundWorld(screenX, screenY)
		const target = this.previewViewer.getControlsTarget()
		const track = this.buildCameraTrack(position, target)
		this.setCameraTrack(track)
		this.emitCameraTrackChange()
		return true
	}

	/**
	 * [v2.0] 在当前镜头目标点添加摄像头(点击按钮的降级入口)。
	 * 摄像头 position 取当前摄像机位置,target 取当前 OrbitControls target,fov 取主相机 FOV,
	 * 确保添加后预览画面与当前交互视角完全一致。
	 */
	async addCameraAtCenter(): Promise<boolean> {
		if (!this.previewViewer) return false
		if (this.currentTrack) {
			this.callbacks.onError?.('Camera already exists')
			return false
		}
		const position = this.previewViewer.getCameraPosition()
		// [v1.0] 不钳制 y，保持与当前视角完全一致
		const target = this.previewViewer.getControlsTarget()
		const fov = this.previewViewer.getCameraFov()
		const track = this.buildCameraTrack(position, target, fov)
		this.setCameraTrack(track)
		this.emitCameraTrackChange()
		return true
	}

	/**
	 * [v2.0] 删除场景中的摄像头。
	 */
	async removeCamera(): Promise<boolean> {
		if (!this.currentTrack) return false
		this.setCameraTrack(null)
		this.emitCameraTrackChange()
		return true
	}

	hasCamera(): boolean {
		return this.currentTrack !== null
	}

	getCurrentCameraTrack(): WorkflowDirectorCameraTrack | null {
		return this.currentTrack
	}

	/**
	 * [v3.0] 设置右下角预览 canvas。
	 */
	setPreviewCanvas(canvas: HTMLCanvasElement): void {
		if (!this.previewViewer) return
		this.previewViewer.setPreviewCanvas(canvas)
	}

	/**
	 * [v3.0] 切换 TransformControls 模式（translate/rotate/scale）。
	 * 用于摄像头或占位体的移动/旋转切换。
	 */
	setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
		if (!this.previewViewer) return
		this.previewViewer.setTransformMode(mode)
	}

	/**
	 * [v3.0] 当前摄像头信息（供 UI 显示 fov/position/target）。
	 */
	getCurrentCameraInfo(): {
		fov: number
		position: { x: number; y: number; z: number }
		target: { x: number; y: number; z: number }
	} | null {
		if (!this.currentTrack?.keyframes?.[0]) return null
		const kf = this.currentTrack.keyframes[0]
		return {
			fov: Number(kf.fov) || 50,
			position: kf.position,
			target: kf.target
		}
	}

	/**
	 * [v1.0] 更新摄像头 keyframe 的 position（translate 模式输入框）。
	 */
	updateCameraPosition(axis: 'x' | 'y' | 'z', value: number): void {
		if (!this.currentTrack?.keyframes?.[0]) return
		const kf = this.currentTrack.keyframes[0]
		kf.position[axis] = value
		// 轻量更新 Actor 变换，不重建 mesh
		this.previewViewer?.updateCameraActorTransformFromTrack(this.currentTrack)
		this.emitCameraTrackChange()
	}

	/**
	 * [v1.0] 设置摄像头朝向（rotate 模式输入框）。
	 * yaw/pitch 为绝对角度（度），直接设置 camera 的朝向。
	 * roll 直接写入 keyframe.roll。
	 */
	updateCameraRotation(axis: 'x' | 'y' | 'z', degrees: number): void {
		if (!this.currentTrack?.keyframes?.[0]) return
		const kf = this.currentTrack.keyframes[0]
		const pos = kf.position
		const tgt = kf.target
		const dx = tgt.x - pos.x
		const dy = tgt.y - pos.y
		const dz = tgt.z - pos.z
		const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz))
		const fwdX = dx / dist
		const fwdY = dy / dist
		const fwdZ = dz / dist
		// 当前 yaw / pitch
		let yaw = Math.atan2(fwdX, fwdZ)
		let pitch = Math.atan2(fwdY, Math.sqrt(fwdX * fwdX + fwdZ * fwdZ))
		const rad = (degrees * Math.PI) / 180
		// 直接设置绝对角度
		if (axis === 'y') yaw = rad
		else if (axis === 'x') pitch = rad
		// 限制 pitch 在 ±89°
		const maxPitch = Math.PI / 2 - 0.01
		pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch))
		const cosPitch = Math.cos(pitch)
		const newFwdX = Math.sin(yaw) * cosPitch
		const newFwdY = Math.sin(pitch)
		const newFwdZ = Math.cos(yaw) * cosPitch
		kf.target = {
			x: pos.x + newFwdX * dist,
			y: pos.y + newFwdY * dist,
			z: pos.z + newFwdZ * dist
		}
		if (axis === 'z') {
			kf.roll = degrees
			console.log('[DirectorSceneViewer] updateCameraRotation z =', degrees, 'kf.roll =', kf.roll)
		}
		// 轻量更新 Actor 变换，不重建 mesh
		this.previewViewer?.updateCameraActorTransformFromTrack(this.currentTrack)
		this.emitCameraTrackChange()
	}

	/**
	 * [v1.0] 更新摄像头 FOV。
	 */
	updateCameraFov(fov: number): void {
		if (!this.currentTrack?.keyframes?.[0]) return
		this.currentTrack.keyframes[0].fov = Math.max(1, Math.min(179, fov))
		// FOV 变化需要重建视锥 mesh，使用 setCameraTrack
		this.setCameraTrack(this.currentTrack)
		this.emitCameraTrackChange()
	}

	/**
	 * [v1.0] 获取摄像头 Actor 当前缩放（scale 模式，仅视觉）。
	 */
	getCameraActorScale(): { x: number; y: number; z: number } {
		return this.previewViewer?.getCameraActorScale() ?? { x: 1, y: 1, z: 1 }
	}

	/**
	 * [v1.0] 设置摄像头 Actor 缩放（scale 模式，仅视觉，不写入 track）。
	 */
	setCameraActorScale(axis: 'x' | 'y' | 'z', value: number): void {
		this.previewViewer?.setCameraActorScale(axis, value)
	}

	private buildCameraTrack(
		position: { x: number; y: number; z: number },
		target: { x: number; y: number; z: number },
		fov?: number
	): WorkflowDirectorCameraTrack {
		const ts = Date.now()
		return {
			id: 'dc-cam-' + ts,
			name: 'Camera 01',
			duration: 5,
			keyframes: [
				{
					id: 'kf-' + ts + '-0',
					time: 0,
					position: { ...position },
					target: { ...target },
					fov: fov ?? 50,
					roll: 0,
					easing: 'linear'
				}
			]
		}
	}

	private emitCameraTrackChange(): void {
		if (!this.callbacks.onCameraTrackChange) return
		const roll = this.currentTrack?.keyframes?.[0]?.roll
		console.log('[DirectorSceneViewer] emitCameraTrackChange roll =', roll)
		this.callbacks.onCameraTrackChange(this.currentTrack ? [this.currentTrack] : [])
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
