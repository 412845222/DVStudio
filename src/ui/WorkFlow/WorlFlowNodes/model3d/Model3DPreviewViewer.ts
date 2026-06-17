import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type Model3DPreviewOptions = {
	backgroundColor?: string
	lightIntensity?: number
	gridVisible?: boolean
	axesVisible?: boolean
	autoRotate?: boolean
}

const disposeMaterial = (material: any) => {
	const list = Array.isArray(material) ? material : [material]
	for (const item of list) {
		const mapKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const
		for (const key of mapKeys) {
			const value = (item as any)[key]
			if (value && typeof value.dispose === 'function') value.dispose()
		}
		item.dispose()
	}
}

export class Model3DPreviewViewer {
	private readonly renderer: any
	private readonly scene: any
	private readonly camera: any
	private readonly controls: any
	private readonly ambientLight: any
	private readonly directionalLight: any
	private readonly grid: any
	private readonly axes: any
	private readonly loader = new GLTFLoader()
	private readonly resizeObserver: ResizeObserver | null
	private currentObject: any = null
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

	constructor(private readonly canvas: HTMLCanvasElement, options?: Model3DPreviewOptions) {
		this.scene = new THREE.Scene()
		this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000)
		this.camera.position.set(3.5, 2.2, 3.5)
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio || 1, 2)))
		this.renderer.setClearColor('#0f1720', 1)

		this.controls = new OrbitControls(this.camera, canvas)
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

		this.ambientLight = new THREE.HemisphereLight('#dbeafe', '#233146', 1.15)
		this.directionalLight = new THREE.DirectionalLight('#ffffff', 2)
		this.directionalLight.position.set(4, 8, 5)
		this.scene.add(this.ambientLight)
		this.scene.add(this.directionalLight)

		this.grid = new THREE.GridHelper(8, 16, '#64748b', '#334155')
		this.grid.position.y = 0
		this.axes = new THREE.AxesHelper(1.5)
		this.scene.add(this.grid)
		this.scene.add(this.axes)

		this.setOptions(options)
		this.resize()
		this.requestRenderBurst(2, 24)

		this.resizeObserver = typeof ResizeObserver !== 'undefined'
			? new ResizeObserver(() => this.resize())
			: null
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
		this.requestRenderBurst(this.controls.autoRotate === true && this.interactiveActive ? 28 : 2, 24, true)
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
		this.requestRenderBurst(this.controls.autoRotate === true && this.interactiveActive ? 24 : 2, 24, true)
	}

	async loadModel(url: string, onProgress?: (payload: { loaded: number; total: number; ratio: number }) => void) {
		const source = String(url || '').trim()
		if (!source) {
			this.clearModel()
			return
		}
		const gltf = await new Promise<unknown>((resolve, reject) => {
			this.loader.load(
				source,
				(value: unknown) => resolve(value),
				(event: ProgressEvent<EventTarget>) => {
					if (!onProgress) return
					const loaded = Number(event.loaded ?? 0)
					const total = Number(event.total ?? 0)
					const ratio = total > 0 ? loaded / total : 0
					onProgress({
						loaded,
						total,
						ratio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0,
					})
				},
				(err: unknown) => reject(err)
			)
		})
		this.setObject((gltf as any).scene)
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
		this.currentObject.traverse((child: any) => {
			const mesh = child as any
			if (mesh.geometry) mesh.geometry.dispose()
			if (mesh.material) disposeMaterial(mesh.material)
		})
		this.currentObject = null
		this.controls.target.set(0, 0.8, 0)
		this.camera.position.set(3.5, 2.2, 3.5)
		this.controls.update()
		this.requestRenderBurst(4, 24)
	}

	private setObject(object: any) {
		this.clearModel()
		this.currentObject = object
		this.scene.add(object)
		this.frameObject(object)
		this.requestRenderBurst(10, 24)
	}

	private frameObject(object: any) {
		const box = new THREE.Box3().setFromObject(object)
		if (box.isEmpty()) return
		const size = box.getSize(new THREE.Vector3())
		const center = box.getCenter(new THREE.Vector3())
		const radius = Math.max(size.x, size.y, size.z, 0.2)
		this.controls.target.copy(center)
		this.camera.near = Math.max(0.01, radius / 100)
		this.camera.far = Math.max(100, radius * 30)
		this.camera.position.set(center.x + radius * 1.8, center.y + radius * 1.2, center.z + radius * 1.8)
		this.camera.updateProjectionMatrix()
		this.controls.update()
		this.requestRenderBurst(8, 24)
	}

	private resize() {
		const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1))
		const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1))
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