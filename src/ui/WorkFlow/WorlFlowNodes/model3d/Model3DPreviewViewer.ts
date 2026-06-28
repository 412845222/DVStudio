import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { isObject } from '../../../../types/utils'

type Disposable = { dispose(): void }
type TextureLike = Disposable
type MaterialLike = Disposable & {
	map?: TextureLike | null
	normalMap?: TextureLike | null
	roughnessMap?: TextureLike | null
	metalnessMap?: TextureLike | null
	emissiveMap?: TextureLike | null
	aoMap?: TextureLike | null
	alphaMap?: TextureLike | null
	clone?: () => MaterialLike
}
type MeshLike = {
	geometry?: Disposable
	material?: MaterialLike | MaterialLike[]
}
type Vector3Like = {
	x: number
	y: number
	z: number
	clone(): Vector3Like
	copy(v: Vector3Like): Vector3Like
	set(x: number, y: number, z: number): Vector3Like
	add(v: Vector3Like): Vector3Like
	multiplyScalar(s: number): Vector3Like
	normalize(): Vector3Like
}
type Object3Dlike = {
	position: Vector3Like
	rotation: { x: number; y: number; z: number }
	scale: { x: number; y: number; z: number }
	parent: Object3Dlike | null
	visible: boolean
	add(...objects: Object3Dlike[]): void
	remove(...objects: Object3Dlike[]): void
	traverse(callback: (child: Object3Dlike) => void): void
}
type Box3Like = {
	isEmpty(): boolean
	getSize(v: Vector3Like): Vector3Like
	getCenter(v: Vector3Like): Vector3Like
	setFromObject(obj: Object3Dlike): Box3Like
	min: Vector3Like
	max: Vector3Like
}
type GLTFResult = {
	scene: Object3Dlike & { clone(recursive?: boolean): Object3Dlike }
}
type WebGLRendererLike = {
	outputColorSpace: unknown
	setPixelRatio(value: number): void
	setClearColor(color: string, alpha: number): void
	setSize(width: number, height: number, updateStyle: boolean): void
	render(scene: SceneLike, camera: CameraLike): void
	dispose(): void
	shadowMap: { enabled: boolean; type: unknown }
	toneMapping: unknown
	toneMappingExposure: number
}
type SceneLike = Object3Dlike & {
	background: unknown
	add(...objects: unknown[]): void
	remove(...objects: unknown[]): void
}
type CameraLike = Object3Dlike & {
	position: Vector3Like
	aspect: number
	near: number
	far: number
	fov: number
	updateProjectionMatrix(): void
}
type LightLike = Object3Dlike & {
	intensity: number
	position: Vector3Like
}
type HelperLike = Object3Dlike & { visible: boolean }
type OrbitControlsLike = {
	enableDamping: boolean
	dampingFactor: number
	minDistance: number
	maxDistance: number
	target: Vector3Like
	enabled: boolean
	autoRotate: boolean
	addEventListener(type: string, callback: (event?: unknown) => void): void
	removeEventListener(type: string, callback: (event?: unknown) => void): void
	update(): void
	dispose(): void
}
type GLTFLoaderLike = {
	load(
		url: string,
		onLoad: (gltf: GLTFResult) => void,
		onProgress?: (event: { loaded: number; total: number }) => void,
		onError?: (err: unknown) => void
	): void
}

export type Model3DPreviewOptions = {
	backgroundColor?: string
	lightIntensity?: number
	gridVisible?: boolean
	axesVisible?: boolean
	autoRotate?: boolean
}

const isDisposable = (value: unknown): value is Disposable => {
	return isObject(value) && typeof (value as { dispose?: unknown }).dispose === 'function'
}

const isDisposableTexture = (value: unknown): value is TextureLike => {
	return isDisposable(value)
}

const disposeMaterial = (material: MaterialLike | MaterialLike[]) => {
	const list = Array.isArray(material) ? material : [material]
	for (const item of list) {
		if (!item || typeof item.dispose !== 'function') continue
		const mapKeys = [
			'map',
			'normalMap',
			'roughnessMap',
			'metalnessMap',
			'emissiveMap',
			'aoMap',
			'alphaMap'
		] as const
		for (const key of mapKeys) {
			const value = item[key]
			if (isDisposableTexture(value)) value.dispose()
		}
		item.dispose()
	}
}

const isMeshLike = (obj: unknown): obj is MeshLike => {
	return isObject(obj)
}

export type Model3DViewState = {
	cameraPosition: { x: number; y: number; z: number }
	target: { x: number; y: number; z: number }
	near: number
	far: number
	minDistance: number
	maxDistance: number
}

type GridHelperLike = Object3Dlike & {
	geometry: { dispose(): void }
	material: { dispose(): void } | { dispose(): void }[]
}

export class Model3DPreviewViewer {
	private readonly renderer: WebGLRendererLike
	private readonly scene: SceneLike
	private readonly camera: CameraLike
	private readonly controls: OrbitControlsLike
	private readonly ambientLight: LightLike
	private readonly directionalLight: LightLike
	private grid: GridHelperLike
	private axes: GridHelperLike
	private readonly loader: GLTFLoaderLike
	private readonly resizeObserver: ResizeObserver | null
	private currentObject: Object3Dlike | null = null
	private disposed = false
	private raf = 0
	private burstFrames = 0
	private burstFps = 24
	private lastRenderTs = 0
	private interactiveActive = false
	private orbiting = false
	private renderSuspended = false
	private lastMoveBurstTs = 0
	private readonly handlePointerDown: (event: PointerEvent) => void
	private readonly handlePointerMove: (event: PointerEvent) => void
	private readonly handleWheel: (event: WheelEvent) => void

	constructor(
		private readonly canvas: HTMLCanvasElement,
		options?: Model3DPreviewOptions
	) {
		this.scene = new THREE.Scene() as unknown as SceneLike
		this.scene.background = new THREE.Color('#0f1720')
		this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000) as unknown as CameraLike
		this.camera.position.set(3.5, 2.2, 3.5)
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true
		}) as unknown as WebGLRendererLike
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio || 1, 2)))
		this.renderer.setClearColor('#0f1720', 1)

		this.controls = new OrbitControls(
			this.camera as unknown as { position: Vector3Like },
			canvas
		) as unknown as OrbitControlsLike
		this.controls.enableDamping = true
		this.controls.dampingFactor = 0.08
		this.controls.minDistance = 0.4
		this.controls.maxDistance = 50
		this.controls.target.set(0, 0.8, 0)
		this.controls.enabled = false
		this.controls.addEventListener('change', this.handleControlsChange)
		this.controls.addEventListener('start', this.handleControlsStart)
		this.controls.addEventListener('end', this.handleControlsEnd)

		this.handlePointerDown = () => {
			if (!this.interactiveActive) return
			this.requestRenderBurst(4, 24, true)
		}
		this.handlePointerMove = () => {
			if (!this.interactiveActive || !this.orbiting) return
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
			if (now - this.lastMoveBurstTs < 36) return
			this.lastMoveBurstTs = now
			this.requestRenderBurst(2, 20, true)
		}
		this.handleWheel = () => {
			if (!this.interactiveActive) return
			this.requestRenderBurst(4, 24, true)
		}
		canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: true })
		canvas.addEventListener('pointermove', this.handlePointerMove, { passive: true })
		canvas.addEventListener('wheel', this.handleWheel, { passive: true })

		this.ambientLight = new THREE.HemisphereLight(
			'#dbeafe',
			'#233146',
			1.15
		) as unknown as LightLike
		this.directionalLight = new THREE.DirectionalLight('#ffffff', 2) as unknown as LightLike
		this.directionalLight.position.set(4, 8, 5)
		this.scene.add(this.ambientLight)
		this.scene.add(this.directionalLight)

		this.grid = new THREE.GridHelper(8, 16, '#64748b', '#334155')
		this.grid.position.y = 0
		this.axes = new THREE.AxesHelper(1.5)
		this.scene.add(this.grid as unknown as Object3Dlike)
		this.scene.add(this.axes as unknown as Object3Dlike)

		this.setOptions(options)
		this.resize()
		this.requestRenderBurst(2, 24)

		this.loader = new GLTFLoader() as unknown as GLTFLoaderLike
		this.resizeObserver =
			typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null
		this.resizeObserver?.observe(this.canvas)
	}

	private handleControlsChange = () => {
		if (!this.interactiveActive) return
		if (!this.orbiting) {
			this.requestRenderBurst(2, 20, true)
			return
		}
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
		if (now - this.lastMoveBurstTs < 36) return
		this.lastMoveBurstTs = now
		this.requestRenderBurst(2, 20, true)
	}

	private handleControlsStart = () => {
		if (!this.controls.enabled) return
		this.orbiting = true
		this.lastMoveBurstTs = 0
		this.requestRenderBurst(14, 24, true)
	}

	private handleControlsEnd = () => {
		this.orbiting = false
		this.requestRenderBurst(8, 20, true)
	}

	private requestRenderBurst(frames = 1, fps = 24, replacePending = false) {
		if (this.disposed || this.renderSuspended || this.raf) return
		const nextFrames = Math.max(1, Math.floor(Number(frames) || 1))
		const nextFps = Math.max(8, Math.min(60, Math.floor(Number(fps) || 24)))
		if (replacePending) {
			this.burstFrames = nextFrames
		} else {
			this.burstFrames = Math.max(this.burstFrames, nextFrames)
		}
		this.burstFps = nextFps
		this.raf = window.requestAnimationFrame(() => this.renderFrame())
	}

	private renderFrame() {
		this.raf = 0
		if (this.disposed || this.renderSuspended) return
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
		const minInterval = 1000 / Math.max(8, this.burstFps || 24)
		if (this.lastRenderTs > 0 && now - this.lastRenderTs < minInterval) {
			this.raf = window.requestAnimationFrame(() => this.renderFrame())
			return
		}
		this.lastRenderTs = now
		this.controls.update()
		this.renderer.render(this.scene, this.camera)
		if (this.burstFrames > 0) this.burstFrames -= 1
		if (this.burstFrames > 0) {
			this.raf = window.requestAnimationFrame(() => this.renderFrame())
		}
	}

	setRenderSuspended(suspended: boolean) {
		this.renderSuspended = suspended === true
		if (this.renderSuspended) {
			if (this.raf) cancelAnimationFrame(this.raf)
			this.raf = 0
			this.burstFrames = 0
			this.lastMoveBurstTs = 0
			return
		}
		this.requestRenderBurst(2, 24)
	}

	setInteractive(active: boolean) {
		this.interactiveActive = active === true
		this.controls.enabled = this.interactiveActive
		if (!this.interactiveActive) this.orbiting = false
		this.requestRenderBurst(
			this.controls.autoRotate === true && this.interactiveActive ? 28 : 2,
			24,
			true
		)
	}

	setOptions(options?: Model3DPreviewOptions) {
		if (!options) return
		if (options.backgroundColor) this.renderer.setClearColor(options.backgroundColor, 1)
		if (options.lightIntensity != null) {
			const next = Math.max(0, Math.min(10, Number(options.lightIntensity) || 0))
			this.ambientLight.intensity = 0.8 * next
			this.directionalLight.intensity = 1.35 * next
		}
		if (typeof options.gridVisible === 'boolean') this.grid.visible = options.gridVisible
		if (typeof options.axesVisible === 'boolean') this.axes.visible = options.axesVisible
		if (typeof options.autoRotate === 'boolean') this.controls.autoRotate = options.autoRotate
		this.requestRenderBurst(
			this.controls.autoRotate === true && this.interactiveActive ? 24 : 2,
			24,
			true
		)
	}

	async loadModel(
		url: string,
		onProgress?: (payload: { loaded: number; total: number; ratio: number }) => void,
		cachedView?: Model3DViewState | null
	) {
		const source = String(url || '').trim()
		if (!source) {
			this.clearModel()
			return
		}
		const gltf = await new Promise<GLTFResult>((resolve, reject) => {
			this.loader.load(
				source,
				(value: GLTFResult) => resolve(value),
				(event: { loaded: number; total: number }) => {
					if (!onProgress) return
					const loaded = Number(event.loaded ?? 0)
					const total = Number(event.total ?? 0)
					const ratio = total > 0 ? loaded / total : 0
					onProgress({
						loaded,
						total,
						ratio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0
					})
				},
				(err: unknown) => reject(err)
			)
		})
		this.setObject(gltf.scene, cachedView)
	}

	getViewState(): Model3DViewState | null {
		if (!this.currentObject) return null
		return {
			cameraPosition: {
				x: this.camera.position.x,
				y: this.camera.position.y,
				z: this.camera.position.z
			},
			target: {
				x: this.controls.target.x,
				y: this.controls.target.y,
				z: this.controls.target.z
			},
			near: this.camera.near,
			far: this.camera.far,
			minDistance: this.controls.minDistance,
			maxDistance: this.controls.maxDistance
		}
	}

	private applyViewState(view: Model3DViewState) {
		this.camera.position.set(view.cameraPosition.x, view.cameraPosition.y, view.cameraPosition.z)
		this.controls.target.set(view.target.x, view.target.y, view.target.z)
		this.camera.near = view.near
		this.camera.far = view.far
		this.controls.minDistance = view.minDistance
		this.controls.maxDistance = view.maxDistance
		this.camera.updateProjectionMatrix()
		this.controls.update()
	}

	restoreView(view: Model3DViewState) {
		this.applyViewState(view)
		this.requestRenderBurst(6, 28)
	}

	captureSnapshotDataUrl() {
		try {
			return this.canvas.toDataURL('image/png')
		} catch {
			return ''
		}
	}

	clearModel() {
		if (!this.currentObject) return
		this.scene.remove(this.currentObject)
		this.currentObject.traverse((child) => {
			if (isMeshLike(child)) {
				if (child.geometry && isDisposable(child.geometry)) child.geometry.dispose()
				if (child.material) disposeMaterial(child.material)
			}
		})
		this.currentObject = null
		this.updateEnvironmentScale(3)
		this.controls.target.set(0, 0.8, 0)
		this.camera.position.set(3.5, 2.2, 3.5)
		this.camera.near = 0.01
		this.camera.far = 1000
		this.controls.minDistance = 0.4
		this.controls.maxDistance = 50
		this.camera.updateProjectionMatrix()
		this.controls.update()
		this.requestRenderBurst(4, 24)
	}

	private setObject(object: Object3Dlike, cachedView?: Model3DViewState | null) {
		this.clearModel()
		this.currentObject = object
		this.scene.add(object)
		this.frameObject(object, cachedView)
		this.requestRenderBurst(10, 24)
	}

	private updateEnvironmentScale(targetSize: number) {
		const gridSize = Math.max(2, Math.ceil(targetSize * 2.5))
		const gridDivisions = gridSize <= 10 ? 16 : gridSize <= 50 ? 20 : 30
		const axesSize = Math.max(1, targetSize * 0.6)
		const disposeHelper = (helper: GridHelperLike | null) => {
			if (!helper) return
			this.scene.remove(helper)
			if (helper.geometry) helper.geometry.dispose()
			const mat = helper.material
			if (Array.isArray(mat)) {
				mat.forEach((m) => m?.dispose?.())
			} else if (mat && typeof mat.dispose === 'function') {
				mat.dispose()
			}
		}
		disposeHelper(this.grid)
		disposeHelper(this.axes)
		this.grid = new THREE.GridHelper(gridSize, gridDivisions, '#64748b', '#334155') as unknown as GridHelperLike
		this.grid.position.y = 0
		this.axes = new THREE.AxesHelper(axesSize) as unknown as GridHelperLike
		this.scene.add(this.grid)
		this.scene.add(this.axes)
	}

	private frameObject(object: Object3Dlike, cachedView?: Model3DViewState | null) {
		object.position.y = 0
		const box = new THREE.Box3().setFromObject(object as any)
		if (box.isEmpty()) return

		const bottomOffset = -box.min.y
		object.position.y = bottomOffset

		box.setFromObject(object as any)
		const sizeVec = new THREE.Vector3()
		const centerVec = new THREE.Vector3()
		box.getSize(sizeVec)
		box.getCenter(centerVec)

		const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 0.2)
		const horizontalRadius = Math.max(sizeVec.x, sizeVec.z) * 0.5

		this.updateEnvironmentScale(Math.max(maxDim, horizontalRadius * 2))

		if (cachedView) {
			this.camera.position.set(
				cachedView.cameraPosition.x,
				cachedView.cameraPosition.y,
				cachedView.cameraPosition.z
			)
			this.controls.target.set(cachedView.target.x, cachedView.target.y, cachedView.target.z)
			this.camera.near = cachedView.near
			this.camera.far = cachedView.far
			this.controls.minDistance = cachedView.minDistance
			this.controls.maxDistance = cachedView.maxDistance
		} else {
			this.controls.target.copy(centerVec as unknown as Vector3Like)

			const fovRad = (this.camera.fov * Math.PI) / 180
			const distance = (maxDim * 1.5) / (2 * Math.tan(fovRad / 2))
			const camDist = Math.max(distance, maxDim * 2.2, horizontalRadius * 2.8)

			this.camera.near = Math.max(0.001, camDist / 1000)
			this.camera.far = Math.max(camDist * 20, maxDim * 50)
			this.controls.minDistance = Math.max(0.05, maxDim * 0.2)
			this.controls.maxDistance = Math.max(camDist * 8, maxDim * 30)

			const dir = new THREE.Vector3(1.2, 0.9, 1.2).normalize()
			this.camera.position
				.copy(this.controls.target)
				.add((dir as unknown as Vector3Like).multiplyScalar(camDist))
		}

		this.camera.updateProjectionMatrix()
		this.controls.update()
		this.requestRenderBurst(16, 30)
	}

	private resize() {
		const width = Math.max(
			1,
			Math.floor(this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1)
		)
		const height = Math.max(
			1,
			Math.floor(this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1)
		)
		this.renderer.setSize(width, height, false)
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		this.requestRenderBurst(2, 20)
	}

	dispose() {
		if (this.disposed) return
		this.disposed = true
		if (this.raf) cancelAnimationFrame(this.raf)
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
		this.canvas.removeEventListener('pointermove', this.handlePointerMove)
		this.canvas.removeEventListener('wheel', this.handleWheel)
		this.burstFrames = 0
		this.resizeObserver?.disconnect()
		this.clearModel()
		this.controls.removeEventListener('change', this.handleControlsChange)
		this.controls.removeEventListener('start', this.handleControlsStart)
		this.controls.removeEventListener('end', this.handleControlsEnd)
		this.controls.dispose()
		this.renderer.dispose()
	}
}
