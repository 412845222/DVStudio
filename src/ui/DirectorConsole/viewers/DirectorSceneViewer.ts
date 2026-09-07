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
	WorkflowDirectorCharacterKeyframe,
	WorkflowDirectorLightRig,
	WorkflowDirectorCharacter
} from '../../../aiworkflow/types'
import type { DirectorConsoleScenePayload } from '../../../electronBridge'
import type { DirectorConsoleSnapshot } from '../../../composables/useDirectorConsoleHistory'

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
	/** [v1.0] 角色列表变更回调（增删改 / 层级变化 / 拖拽结束） */
	onCharactersChange?: (characters: WorkflowDirectorCharacter[]) => void
	/** [P1] 播放期间帧变化回调 */
	onFrameChange?: (frame: number) => void
	/** [P1] 播放/暂停状态变化回调 */
	onPlayingChange?: (playing: boolean) => void
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
	private characters: WorkflowDirectorCharacter[] = []
	private currentWhiteMode = false
	private cameraParentId: string | null = null
	/** [P1] 时间轴帧率 */
	private fps = 30
	/** [P1] 时间轴总帧数 */
	private totalFrames = 150
	/** [P1] 当前帧 */
	private currentFrame = 0
	/** [P1] 角色关键帧缓存：characterId -> keyframes */
	private characterKeyframes: Record<string, WorkflowDirectorCharacterKeyframe[]> = {}

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
			},
			onCharacterTransformChange: (characterId) => {
				this.syncCharacterTransformFromViewer(characterId)
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
		console.log('[DirectorSceneViewer:loadScene] start', {
			layoutItemsCount: Array.isArray(payload?.layoutItems) ? payload.layoutItems.length : 0,
			charactersCount: Array.isArray(payload?.characters) ? payload.characters.length : 0,
			cameraTracksCount: Array.isArray(payload?.cameraTracks) ? payload.cameraTracks.length : 0,
			hasLightRig: !!payload?.lightRig
		})
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
			// [v1.0] 白模模式：从持久化数据恢复
			if (payload.cameraParentId !== undefined) {
				this.cameraParentId = payload.cameraParentId as string | null
			}
			// [P1] 时间轴设置恢复
			if (typeof payload.fps === 'number') this.fps = Math.max(1, payload.fps)
			if (typeof payload.totalFrames === 'number')
				this.totalFrames = Math.max(1, payload.totalFrames)

			this.previewViewer.setLayout(items, cameraCfg, {
				previewMode: true,
				modelBindings,
				hidePlaceholderCubes: modelBindings.length > 0,
				transparent,
				lightingPreviewEnabled: this.currentLightingEnabled,
				whiteMode: this.currentWhiteMode
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

			// [v1.0] 加载角色
			if (Array.isArray(payload.characters)) {
				// 先清空旧角色，避免 reopen/loadScene 叠加多余角色
				this.previewViewer?.clearCharacters()
				this.characters = (payload.characters as WorkflowDirectorCharacter[]).map((c) => ({
					...c,
					position: {
						x: Number(c.position?.x) || 0,
						y: Number(c.position?.y) || 0,
						z: Number(c.position?.z) || 0
					},
					rotation: c.rotation ? { ...c.rotation } : {},
					scale: c.scale ? { ...c.scale } : undefined,
					keyframes: Array.isArray(c.keyframes) ? [...c.keyframes] : undefined
				}))
				this.characterKeyframes = {}
				for (const c of this.characters) {
					this.previewViewer?.addCharacter(c)
					if (Array.isArray(c.keyframes) && c.keyframes.length > 0) {
						this.characterKeyframes[c.id] = [...c.keyframes].sort((a, b) => a.frame - b.frame)
					}
				}
			}

			// [v1.0] 摄像头父级恢复：必须在角色加载之后、摄像头 setCameraTrack 之后
			if (this.cameraParentId) {
				this.previewViewer?.setCameraParent(this.cameraParentId)
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
			lightingPreviewEnabled: this.currentLightingEnabled,
			whiteMode: this.currentWhiteMode
		})
	}

	/**
	 * 白模模式：所有占位立方体统一为白色，避免与角色颜色撞色。
	 */
	setWhiteMode(enabled: boolean): boolean {
		if (!this.previewViewer) return this.currentWhiteMode
		this.currentWhiteMode = this.previewViewer.setWhiteMode(enabled)
		return this.currentWhiteMode
	}

	getWhiteMode(): boolean {
		return this.currentWhiteMode
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
			// setCameraActor 内部会 clearCameraActor，导致摄像头脱离父级角色；
			// 这里恢复父级挂载关系，保持场景层级一致。
			if (this.cameraParentId) {
				this.previewViewer.setCameraParent(this.cameraParentId)
			}
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
		// 清除摄像头父级关系，避免后续新建摄像头时被默认挂到旧角色下
		this.cameraParentId = null
		this.setCameraTrack(null)
		this.emitCameraTrackChange()
		return true
	}

	/**
	 * [v1.0] 按当前编辑器视角摆放摄像头：position/target/fov 与主相机一致，roll 归零。
	 * 注意：重建 Actor 后必须恢复摄像头的父级挂载关系，否则摄像头会从父级角色上脱落。
	 */
	alignCameraToView(): void {
		if (!this.previewViewer || !this.currentTrack?.keyframes?.[0]) return
		const position = this.previewViewer.getCameraPosition()
		const target = this.previewViewer.getControlsTarget()
		const fov = this.previewViewer.getCameraFov()
		const kf = this.currentTrack.keyframes[0]
		kf.position = { ...position }
		kf.target = { ...target }
		kf.fov = fov
		kf.roll = 0
		// 重建 Actor 以应用新的 fov 与变换
		this.setCameraTrack(this.currentTrack)
		// 恢复摄像头父级挂载关系（setCameraTrack 内部会 clearCameraActor 导致脱离父级）
		if (this.cameraParentId) {
			this.previewViewer?.setCameraParent(this.cameraParentId)
		}
		this.emitCameraTrackChange()
	}

	// ===== [v1.0] 角色管理 =====

	getCharacters(): WorkflowDirectorCharacter[] {
		return this.characters
	}

	/**
	 * 添加角色。position 缺省时使用当前相机 target。
	 */
	addCharacter(color: string, position?: { x: number; y: number; z: number }): string {
		const id = 'char-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
		const pos = position ?? this.previewViewer?.getControlsTarget() ?? { x: 0, y: 0, z: 0 }
		const character: WorkflowDirectorCharacter = {
			id,
			name: '角色' + (this.characters.length + 1),
			color,
			position: { x: pos.x, y: pos.y, z: pos.z },
			rotation: {},
			scale: { x: 1, y: 1, z: 1 }
		}
		this.characters.push(character)
		this.previewViewer?.addCharacter(character)
		this.emitCharactersChange()
		return id
	}

	removeCharacter(id: string): void {
		const idx = this.characters.findIndex((c) => c.id === id)
		if (idx < 0) return
		// [v1.0] 删除角色前，若摄像头挂在该角色下，先解挂到场景根，避免被级联销毁
		if (this.cameraParentId === id) {
			this.cameraParentId = null
			this.previewViewer?.setCameraParent(null)
			this.emitCameraTrackChange()
		}
		// 级联删除：移除该角色及其所有后代；若摄像头挂在后代角色下也需先解挂
		const descendants = this.collectDescendantIds(id)
		for (const descId of [id, ...descendants]) {
			if (descId !== id && this.cameraParentId === descId) {
				this.cameraParentId = null
				this.previewViewer?.setCameraParent(null)
				this.emitCameraTrackChange()
			}
		}
		this.previewViewer?.removeCharacter(id)
		const removeSet = new Set<string>([id, ...descendants])
		this.characters = this.characters.filter((c) => !removeSet.has(c.id))
		this.emitCharactersChange()
	}

	setCharacterParent(childId: string, parentId: string | null): void {
		const child = this.characters.find((c) => c.id === childId)
		if (!child) return
		// 防止循环引用
		if (parentId && this.isDescendant(parentId, childId)) return
		this.previewViewer?.setCharacterParent(childId, parentId)
		child.parentId = parentId ?? undefined
		this.emitCharactersChange()
	}

	/**
	 * 重设摄像头父级。parentId 为角色 ID 时挂到该角色 Group 下；为 null 时挂回场景根。
	 * 摄像头会跟随父级角色移动，用于"摄像机跟随角色"场景。
	 */
	setCameraParent(parentId: string | null): void {
		this.cameraParentId = parentId
		this.previewViewer?.setCameraParent(parentId)
		this.emitCameraTrackChange()
	}

	getCameraParentId(): string | null {
		return this.cameraParentId
	}

	/** [v4.2] 弹簧臂开关：摄像头挂在角色子级时避免穿墙 */
	setSpringArmEnabled(enabled: boolean): void {
		this.previewViewer?.setSpringArmEnabled(enabled)
	}

	isSpringArmEnabled(): boolean {
		return this.previewViewer?.isSpringArmEnabled() ?? true
	}

	/**
	 * [v4.2] 更新指定角色的单个变换分量（位置/旋转/缩放），同步到 3D 视图与数据层。
	 * 供右侧边栏变换输入框调用。
	 */
	updateCharacterTransform(
		characterId: string,
		kind: 'position' | 'rotation' | 'scale',
		axis: 'x' | 'y' | 'z',
		value: number
	): void {
		const character = this.characters.find((c) => c.id === characterId)
		if (!character || !this.previewViewer) return
		if (kind === 'position') {
			character.position = { ...character.position, [axis]: value }
			this.previewViewer.updateCharacterTransform(
				characterId,
				character.position,
				character.rotation,
				character.scale
			)
		} else if (kind === 'rotation') {
			character.rotation = { ...(character.rotation ?? {}), [axis]: value }
			this.previewViewer.updateCharacterTransform(
				characterId,
				character.position,
				character.rotation,
				character.scale
			)
		} else if (kind === 'scale') {
			const v = Math.max(0.01, value)
			character.scale = { ...(character.scale ?? { x: 1, y: 1, z: 1 }), [axis]: v }
			this.previewViewer.updateCharacterTransform(
				characterId,
				character.position,
				character.rotation,
				character.scale
			)
		}
		this.emitCharactersChange()
	}

	/**
	 * 从 3D 查看器同步角色的局部变换到数据层（gizmo 拖拽结束后调用）。
	 */
	private syncCharacterTransformFromViewer(characterId: string): void {
		const character = this.characters.find((c) => c.id === characterId)
		if (!character || !this.previewViewer) return
		const transform = this.previewViewer.getCharacterTransform(characterId)
		if (!transform) return
		character.position = { ...transform.position }
		character.rotation = { ...transform.rotation }
		character.scale = { ...transform.scale }
		this.emitCharactersChange()
	}

	selectObject(id: string): void {
		if (id === SceneLayoutPreviewViewer.CAMERA_SELECTION_ID) {
			this.previewViewer?.selectCameraActor()
		} else {
			this.previewViewer?.setSelectedItem(id)
		}
	}

	private collectDescendantIds(parentId: string): string[] {
		const result: string[] = []
		const stack = [parentId]
		while (stack.length > 0) {
			const current = stack.pop()!
			for (const c of this.characters) {
				if (c.parentId === current) {
					result.push(c.id)
					stack.push(c.id)
				}
			}
		}
		return result
	}

	private isDescendant(candidateId: string, ancestorId: string): boolean {
		if (candidateId === ancestorId) return true
		const candidate = this.characters.find((c) => c.id === candidateId)
		if (!candidate?.parentId) return false
		return this.isDescendant(candidate.parentId, ancestorId)
	}

	private emitCharactersChange(): void {
		this.callbacks.onCharactersChange?.(this.characters)
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
	 * [v5.0] 捕获当前预览画面为 PNG Blob（用于视频导出）。
	 */
	capturePreviewFrame(): Promise<Blob | null> {
		if (!this.previewViewer) return Promise.resolve(null)
		return this.previewViewer.capturePreviewFrame()
	}

	/**
	 * [v5.0] 获取预览画布实际渲染尺寸。
	 */
	getPreviewSize(): { width: number; height: number } {
		if (!this.previewViewer) return { width: 240, height: 160 }
		return this.previewViewer.getPreviewSize()
	}

	/**
	 * [v3.0] 调整预览画布分辨率（放大/缩小时调用）。
	 */
	setPreviewSize(width: number, height: number): void {
		if (!this.previewViewer) return
		this.previewViewer.setPreviewSize(width, height)
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
		// 移动 position 时，target 同步移动相同 delta，保持朝向不变
		const delta = value - kf.position[axis]
		kf.position[axis] = value
		kf.target[axis] += delta
		// 轻量更新 Actor 变换，不重建 mesh；位置更新不重新 lookAt，避免朝向被锁定
		this.previewViewer?.updateCameraActorTransformFromTrack(this.currentTrack, false)
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

	play(opts?: { fromFrame?: number }): void {
		if (this.isPlaying) return
		this.isPlaying = true
		this.playStartTime = performance.now()
		const fromFrame = opts?.fromFrame ?? this.currentFrame
		this.currentFrame = fromFrame
		const fps = this.fps
		const total = this.totalFrames
		const loop = this.currentTrack?.loop === true
		this.callbacks.onPlayingChange?.(true)
		const tick = () => {
			if (!this.isPlaying) return
			const elapsedMs = performance.now() - this.playStartTime
			const elapsedFrames = Math.floor((elapsedMs * fps) / 1000)
			let next = fromFrame + elapsedFrames
			if (next >= total) {
				if (loop) {
					this.playStartTime = performance.now()
					next = next % total
				} else {
					this.currentFrame = total - 1
					this.seek(this.frameToTime(this.currentFrame))
					this.pause()
					return
				}
			}
			this.currentFrame = next
			this.seek(this.frameToTime(next))
			this.callbacks.onFrameChange?.(next)
			this.animationFrameId = requestAnimationFrame(tick)
		}
		this.animationFrameId = requestAnimationFrame(tick)
	}

	pause(): void {
		if (!this.isPlaying) return
		this.isPlaying = false
		if (this.animationFrameId != null) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
		this.callbacks.onPlayingChange?.(false)
	}

	stop(): void {
		this.pause()
		this.currentFrame = 0
		this.seek(0)
		this.callbacks.onFrameChange?.(0)
	}

	/** [P1] 帧跳转：设置当前帧并 seek 到对应时间 */
	setCurrentFrame(frame: number): void {
		this.currentFrame = Math.max(0, Math.min(this.totalFrames - 1, Math.floor(frame)))
		const time = this.frameToTime(this.currentFrame)
		this.seek(time)
		this.callbacks.onFrameChange?.(this.currentFrame)
	}

	getCurrentFrame(): number {
		return this.currentFrame
	}

	getIsPlaying(): boolean {
		return this.isPlaying
	}

	seek(time: number): void {
		if (!this.previewViewer) return
		// 先更新角色（摄像头可能挂在角色下，必须先移动父级，再换算摄像头局部坐标）
		// 按层级排序：父级必须在子级之前更新，否则子级的局部坐标换算会基于父级旧位置
		const sorted = [...this.characters].sort((a, b) => {
			const da = this.getCharacterDepth(a.id)
			const db = this.getCharacterDepth(b.id)
			return da - db
		})
		for (const c of sorted) {
			const ch = this.interpolateCharacter(c.id, time)
			if (ch) {
				this.previewViewer.updateCharacterTransform(c.id, ch.position, ch.rotation, ch.scale)
			}
		}
		// 刷新所有角色 matrixWorld，确保父级移动后子级（含摄像头）的世界→局部换算正确
		this.previewViewer.updateCharacterWorldMatrices()
		// 再更新摄像头：此时父级角色 matrixWorld 已是最新，世界→局部换算才正确
		const cam = this.interpolateCamera(time)
		if (cam) {
			this.previewViewer.updateCameraActorTransform(cam.position, cam.target, cam.fov, cam.roll)
		}
	}

	/** 计算角色在层级树中的深度（根角色深度为 0），用于 seek 时按父→子顺序更新 */
	private getCharacterDepth(characterId: string): number {
		let depth = 0
		let current = this.characters.find((c) => c.id === characterId)
		const visited = new Set<string>()
		while (current?.parentId && !visited.has(current.id)) {
			visited.add(current.id)
			depth++
			current = this.characters.find((c) => c.id === current!.parentId)
		}
		return depth
	}

	private interpolateCamera(time: number): {
		position: { x: number; y: number; z: number }
		target: { x: number; y: number; z: number }
		fov: number
		roll: number
	} | null {
		const track = this.currentTrack
		if (!track) return null
		const kfs = track.keyframes || []
		if (kfs.length === 0) return null
		if (kfs.length === 1) {
			const k = kfs[0]
			return {
				position: { ...k.position },
				target: { ...k.target },
				fov: k.fov ?? 50,
				roll: k.roll ?? 0
			}
		}
		const sorted = [...kfs].sort((a, b) => a.time - b.time)
		let prev = sorted[0]
		let next = sorted[sorted.length - 1]
		for (let i = 0; i < sorted.length; i++) {
			if (sorted[i].time <= time) prev = sorted[i]
			if (sorted[i].time >= time) {
				next = sorted[i]
				break
			}
		}
		const range = next.time - prev.time
		const t = range > 0 ? (time - prev.time) / range : 0
		const eased = applyEasing(t, next.easing ?? 'linear')
		return {
			position: lerpVec(prev.position, next.position, eased),
			target: lerpVec(prev.target, next.target, eased),
			fov: lerpNum(prev.fov ?? 50, next.fov ?? 50, eased),
			roll: lerpNum(prev.roll ?? 0, next.roll ?? 0, eased)
		}
	}

	private interpolateCharacter(
		characterId: string,
		time: number
	): {
		position: { x: number; y: number; z: number }
		rotation: { yaw: number; pitch: number; roll: number }
		scale: { x: number; y: number; z: number }
	} | null {
		const kfs = this.characterKeyframes[characterId]
		if (!kfs || kfs.length === 0) return null
		if (kfs.length === 1) {
			const k = kfs[0]
			return {
				position: { ...k.position },
				rotation: {
					yaw: k.rotation?.yaw ?? 0,
					pitch: k.rotation?.pitch ?? 0,
					roll: k.rotation?.roll ?? 0
				},
				scale: {
					x: k.scale?.x ?? 1,
					y: k.scale?.y ?? 1,
					z: k.scale?.z ?? 1
				}
			}
		}
		// frame -> time 转换后插值
		const sorted = [...kfs].sort((a, b) => a.frame - b.frame)
		const sortedT = sorted.map((k) => ({ k, t: this.frameToTime(k.frame) }))
		let prev = sortedT[0]
		let next = sortedT[sortedT.length - 1]
		for (let i = 0; i < sortedT.length; i++) {
			if (sortedT[i].t <= time) prev = sortedT[i]
			if (sortedT[i].t >= time) {
				next = sortedT[i]
				break
			}
		}
		const range = next.t - prev.t
		const t = range > 0 ? (time - prev.t) / range : 0
		const eased = applyEasing(t, (next.k.easing ?? prev.k.easing ?? 'linear') as string)
		const pk = prev.k
		const nk = next.k
		return {
			position: lerpVec(pk.position, nk.position, eased),
			rotation: {
				yaw: lerpNum(pk.rotation?.yaw ?? 0, nk.rotation?.yaw ?? 0, eased),
				pitch: lerpNum(pk.rotation?.pitch ?? 0, nk.rotation?.pitch ?? 0, eased),
				roll: lerpNum(pk.rotation?.roll ?? 0, nk.rotation?.roll ?? 0, eased)
			},
			scale: {
				x: lerpNum(pk.scale?.x ?? 1, nk.scale?.x ?? 1, eased),
				y: lerpNum(pk.scale?.y ?? 1, nk.scale?.y ?? 1, eased),
				z: lerpNum(pk.scale?.z ?? 1, nk.scale?.z ?? 1, eased)
			}
		}
	}

	// ===== [P1] 时间轴设置 =====
	getFps(): number {
		return this.fps
	}
	setFps(fps: number): void {
		this.fps = Math.max(1, Math.min(240, Math.floor(fps)))
	}
	getTotalFrames(): number {
		return this.totalFrames
	}
	setTotalFrames(n: number): void {
		this.totalFrames = Math.max(1, Math.floor(n))
		if (this.currentFrame >= this.totalFrames) {
			this.currentFrame = this.totalFrames - 1
		}
	}
	private frameToTime(frame: number): number {
		return frame / this.fps
	}
	private timeToFrame(time: number): number {
		return Math.round(time * this.fps)
	}

	// ===== [P1] 关键帧 CRUD =====

	/** 添加摄像头关键帧：记录当前摄像头 Actor 的世界变换到指定帧 */
	addCameraKeyframe(frame: number): WorkflowDirectorCameraKeyframe | null {
		if (!this.currentTrack || !this.previewViewer) return null
		const time = this.frameToTime(frame)
		const actorTransform = this.previewViewer.getCameraActorTransform()
		const position = actorTransform?.position ?? { x: 0, y: 0, z: 5 }
		const target = actorTransform?.target ?? { x: 0, y: 0, z: 0 }
		const kf: WorkflowDirectorCameraKeyframe = {
			id: 'kf-cam-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
			time,
			frame,
			position: { ...position },
			target: { ...target },
			fov: this.currentTrack.keyframes?.[0]?.fov ?? 50,
			roll: this.currentTrack.keyframes?.[0]?.roll ?? 0,
			easing: 'ease-in-out'
		}
		// 如果已有同帧关键帧则替换
		const existing = [...(this.currentTrack.keyframes || [])]
		const filtered = existing.filter((k) => {
			const kFrame = k.frame ?? this.timeToFrame(k.time)
			return kFrame !== frame
		})
		filtered.push(kf)
		filtered.sort((a, b) => {
			const fa = a.frame ?? this.timeToFrame(a.time)
			const fb = b.frame ?? this.timeToFrame(b.time)
			return fa - fb
		})
		this.currentTrack.keyframes = filtered
		this.emitCameraTrackChange()
		return kf
	}

	/**
	 * 获取指定角色的所有后代角色 ID（递归遍历 parentId 链）。
	 * 用于添加关键帧时级联到子级对象。
	 */
	private getDescendantCharacterIds(characterId: string): string[] {
		const result: string[] = []
		const stack = [characterId]
		while (stack.length > 0) {
			const pid = stack.pop()!
			for (const c of this.characters) {
				if (c.parentId === pid) {
					result.push(c.id)
					stack.push(c.id)
				}
			}
		}
		return result
	}

	/** 为单个角色在指定帧添加关键帧（内部方法，不级联） */
	private addCharacterKeyframeAt(
		characterId: string,
		frame: number
	): WorkflowDirectorCharacterKeyframe | null {
		const ch = this.characters.find((c) => c.id === characterId)
		if (!ch || !this.previewViewer) return null
		const transform = this.previewViewer.getCharacterTransform(characterId)
		if (!transform) return null
		const kf: WorkflowDirectorCharacterKeyframe = {
			id: 'kf-char-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
			frame,
			position: { ...transform.position },
			rotation: { ...transform.rotation },
			scale: { ...transform.scale },
			easing: 'ease-in-out'
		}
		const list = [...(this.characterKeyframes[characterId] || [])].filter((k) => k.frame !== frame)
		list.push(kf)
		list.sort((a, b) => a.frame - b.frame)
		this.characterKeyframes[characterId] = list
		ch.keyframes = list
		return kf
	}

	/**
	 * 添加角色关键帧：记录当前角色 Group 的变换到指定帧。
	 * 同时级联为所有子级角色和挂在其下的摄像头添加关键帧，
	 * 确保播放时父子变换同步，避免子级摄像头抖动。
	 */
	addCharacterKeyframe(
		characterId: string,
		frame: number
	): WorkflowDirectorCharacterKeyframe | null {
		const kf = this.addCharacterKeyframeAt(characterId, frame)
		if (!kf) return null
		// 级联：为所有后代角色添加关键帧
		const descendants = this.getDescendantCharacterIds(characterId)
		for (const descId of descendants) {
			this.addCharacterKeyframeAt(descId, frame)
		}
		// 级联：若摄像头挂在该角色或其后代下，也为摄像头添加关键帧
		const allIds = [characterId, ...descendants]
		if (this.cameraParentId && allIds.includes(this.cameraParentId)) {
			this.addCameraKeyframe(frame)
		}
		this.emitCharactersChange()
		return kf
	}

	removeKeyframe(target: { type: 'camera' | 'character'; id?: string; keyframeId: string }): void {
		if (target.type === 'camera') {
			if (!this.currentTrack) return
			this.currentTrack.keyframes = (this.currentTrack.keyframes || []).filter(
				(k) => k.id !== target.keyframeId
			)
			this.emitCameraTrackChange()
		} else if (target.id) {
			const list = (this.characterKeyframes[target.id] || []).filter(
				(k) => k.id !== target.keyframeId
			)
			this.characterKeyframes[target.id] = list
			const ch = this.characters.find((c) => c.id === target.id)
			if (ch) {
				ch.keyframes = list
				this.emitCharactersChange()
			}
		}
	}

	getCameraKeyframes(): WorkflowDirectorCameraKeyframe[] {
		return this.currentTrack?.keyframes ?? []
	}

	getCharacterKeyframes(characterId: string): WorkflowDirectorCharacterKeyframe[] {
		return this.characterKeyframes[characterId] ?? []
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

	/** 捕获当前导演控制台状态快照（撤销/重做用） */
	captureState(): DirectorConsoleSnapshot {
		const snapshot: DirectorConsoleSnapshot = {
			cameraTracks: this.currentTrack ? [this.cloneTrack(this.currentTrack)] : undefined,
			activeCameraTrackId: this.currentTrack?.id,
			lightRig: this.currentLightRig
				? {
						preset: this.currentLightRig.preset,
						exposure: this.currentLightRig.exposure,
						lights: this.currentLightRig.lights.map((l) => ({ ...l }))
					}
				: undefined,
			characters: this.characters.map((c) => ({
				...c,
				position: { ...c.position },
				rotation: c.rotation ? { ...c.rotation } : undefined,
				scale: c.scale ? { ...c.scale } : undefined,
				keyframes: c.keyframes
					? c.keyframes.map((k) => ({ ...k, position: { ...k.position } }))
					: undefined
			})),
			cameraParentId: this.cameraParentId,
			fps: this.fps,
			totalFrames: this.totalFrames
		}
		return snapshot
	}

	/** 应用快照到当前状态（撤销/重做用） */
	applyState(snap: DirectorConsoleSnapshot): void {
		if (snap.cameraTracks !== undefined) {
			const track = snap.cameraTracks.length > 0 ? this.cloneTrack(snap.cameraTracks[0]) : null
			this.setCameraTrack(track)
		}
		if (snap.lightRig !== undefined) {
			this.applyLightRig(snap.lightRig)
		}
		if (Array.isArray(snap.characters)) {
			this.characters = snap.characters.map((c) => ({
				...c,
				position: { ...c.position },
				rotation: c.rotation ? { ...c.rotation } : undefined,
				scale: c.scale ? { ...c.scale } : undefined,
				keyframes: c.keyframes
					? c.keyframes.map((k) => ({ ...k, position: { ...k.position } }))
					: undefined
			}))
			this.characterKeyframes = {}
			for (const c of this.characters) {
				if (Array.isArray(c.keyframes) && c.keyframes.length > 0) {
					this.characterKeyframes[c.id] = [...c.keyframes].sort((a, b) => a.frame - b.frame)
				}
			}
			this.refreshCharacterMeshes()
			this.callbacks.onCharactersChange?.(this.characters)
		}
		if (snap.cameraParentId !== undefined) {
			this.cameraParentId = snap.cameraParentId
			this.previewViewer?.setCameraParent(snap.cameraParentId)
		}
		if (typeof snap.fps === 'number') this.fps = snap.fps
		if (typeof snap.totalFrames === 'number') this.totalFrames = snap.totalFrames
	}

	/** 深拷贝轨道 */
	private cloneTrack(track: WorkflowDirectorCameraTrack): WorkflowDirectorCameraTrack {
		return {
			...track,
			keyframes: track.keyframes
				? track.keyframes.map((k) => ({
						...k,
						position: { ...k.position },
						target: { ...k.target }
					}))
				: []
		}
	}

	/** 刷新角色 mesh（撤销/重做后重建） */
	private refreshCharacterMeshes(): void {
		if (!this.previewViewer) return
		for (const c of this.characters) {
			this.previewViewer.updateCharacterTransform(c.id, c.position, c.rotation, c.scale)
		}
	}

	/** 获取当前摄像头轨道（供 UI 同步用） */
	getCameraTrack(): WorkflowDirectorCameraTrack | null {
		return this.currentTrack ? this.cloneTrack(this.currentTrack) : null
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

// ===== [P1] 插值辅助函数 =====

function applyEasing(t: number, easing: string): number {
	switch (easing) {
		case 'ease-in':
			return t * t
		case 'ease-out':
			return 1 - (1 - t) * (1 - t)
		case 'ease-in-out':
			return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
		default:
			return t
	}
}

function lerpVec(
	a: { x: number; y: number; z: number },
	b: { x: number; y: number; z: number },
	t: number
): { x: number; y: number; z: number } {
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		z: a.z + (b.z - a.z) * t
	}
}

function lerpNum(a: number, b: number, t: number): number {
	return a + (b - a) * t
}
