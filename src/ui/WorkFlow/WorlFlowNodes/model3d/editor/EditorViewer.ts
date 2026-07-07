import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { RenderMode, LightingPreset, EditorLoadProgress, LoadedEditorModel, OutlinerNode, TransformMode } from './types'

type Disposable = { dispose(): void }
type TextureLike = Disposable & {
	map?: TextureLike | null
	normalMap?: TextureLike | null
	roughnessMap?: TextureLike | null
	metalnessMap?: TextureLike | null
	emissiveMap?: TextureLike | null
	aoMap?: TextureLike | null
	alphaMap?: TextureLike | null
}
type MaterialLike = Disposable & TextureLike

const isDisposable = (value: unknown): value is Disposable => {
	return typeof value === 'object' && value !== null && typeof (value as { dispose?: unknown }).dispose === 'function'
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
			if (isDisposable(value)) value.dispose()
		}
		item.dispose()
	}
}

interface EditorViewerOptions {
	backgroundColor?: string
	initialRenderMode?: RenderMode
	shadowsEnabled?: boolean
	bloomEnabled?: boolean
	antialiasEnabled?: boolean
	gridVisible?: boolean
	axesVisible?: boolean
	transformVisible?: boolean
	wireframeOverlay?: boolean
	onLoadProgress?: (progress: EditorLoadProgress) => void
	onSelectionChange?: (objects: THREE.Object3D[]) => void
	onSelectionTransform?: (objects: THREE.Object3D[]) => void
}

export class EditorViewer {
	private renderer: THREE.WebGLRenderer
	private scene: THREE.Scene
	private camera: THREE.PerspectiveCamera
	private controls: OrbitControls
	private transformControls: TransformControls
	private transformHelper: THREE.Object3D
	private composer: EffectComposer
	private renderPass: RenderPass
	private bloomPass: UnrealBloomPass
	private fxaaPass: ShaderPass
	private pmremGenerator: THREE.PMREMGenerator
	private environmentTexture: THREE.Texture | null = null
	private gltfLoader: GLTFLoader
	private objLoader: OBJLoader
	private dracoLoader: DRACOLoader
	private ambientLight: THREE.HemisphereLight
	private mainLight: THREE.DirectionalLight
	private fillLight: THREE.DirectionalLight
	private rimLight: THREE.PointLight
	private gridHelper: THREE.GridHelper
	private axesHelper: THREE.AxesHelper
	private groundMesh: THREE.Mesh
	private bgMesh: THREE.Mesh | null = null
	private models: Map<string, LoadedEditorModel> = new Map()
	private currentRenderMode: RenderMode = 'pbr'
	private currentLightingPreset: LightingPreset = 'studio'
	private currentTransformMode: TransformMode = 'translate'
	private shadowsEnabled = true
	private bloomEnabled = true
	private antialiasEnabled = true
	private gridVisible = true
	private axesVisible = true
	private transformVisible = true
	private wireframeOverlayEnabled = false
	private resizeObserver: ResizeObserver | null = null
	private disposed = false
	private rafId = 0
	private burstFrames = 0
	private burstFps = 30
	private lastRenderTime = 0
	private lastMoveBurstTs = 0
	private renderSuspended = false
	private canvas: HTMLCanvasElement
	private onLoadProgress?: (progress: EditorLoadProgress) => void
	private onSelectionChange?: (objects: THREE.Object3D[]) => void
	private onSelectionTransform?: (objects: THREE.Object3D[]) => void
	private raycaster: THREE.Raycaster = new THREE.Raycaster()
	private pointer: THREE.Vector2 = new THREE.Vector2()
	private selectedObject: THREE.Object3D | null = null
	private selectedObjects: THREE.Object3D[] = []
	private handlePointerDown: (e: PointerEvent) => void
	private handlePointerUp: (e: PointerEvent) => void
	private handleWheel: (e: WheelEvent) => void
	private handleKeyDown: (e: KeyboardEvent) => void
	private handleControlsChange: () => void
	private handleControlsStart: () => void
	private handleControlsEnd: () => void
	private handleTransformDraggingChanged: (event: { value: boolean }) => void
	private handleTransformChange: () => void
	private handleTransformMouseUp: () => void
	private orbiting = false
	private transformDragging = false
	private pointerDownPos = { x: 0, y: 0 }
	private didPointerDownOnGizmo = false
	private didPointerDownOnObject = false
	private fps = 0
	private fpsFrames = 0
	private fpsLastUpdate = 0

	constructor(canvas: HTMLCanvasElement, options?: EditorViewerOptions) {
		this.canvas = canvas
		this.onLoadProgress = options?.onLoadProgress
		this.onSelectionChange = options?.onSelectionChange
		this.onSelectionTransform = options?.onSelectionTransform
		this.currentRenderMode = options?.initialRenderMode || 'pbr'
		this.shadowsEnabled = options?.shadowsEnabled !== false
		this.bloomEnabled = options?.bloomEnabled !== false
		this.antialiasEnabled = options?.antialiasEnabled !== false
		this.gridVisible = options?.gridVisible !== false
		this.axesVisible = options?.axesVisible !== false
		this.transformVisible = options?.transformVisible !== false
		this.wireframeOverlayEnabled = options?.wireframeOverlay === true

		this.scene = new THREE.Scene()

		this.createGradientBackground()

		this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000)
		this.camera.position.set(5, 4, 5)

		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
			preserveDrawingBuffer: true,
			powerPreference: 'high-performance'
		})
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping
		this.renderer.toneMappingExposure = 1.2
		this.renderer.shadowMap.enabled = this.shadowsEnabled
		this.renderer.shadowMap.type = THREE.PCFShadowMap
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
		this.renderer.setClearColor(0x0a0f14, 1)

		this.pmremGenerator = new THREE.PMREMGenerator(this.renderer)
		this.pmremGenerator.compileEquirectangularShader()
		this.setupEnvironment()

		this.controls = new OrbitControls(this.camera, canvas)
		this.controls.enableDamping = true
		this.controls.dampingFactor = 0.08
		this.controls.minDistance = 0.2
		this.controls.maxDistance = 200
		this.controls.target.set(0, 1, 0)
		this.controls.enabled = true

		this.handleControlsChange = () => {
			if (!this.orbiting) {
				this.requestRenderBurst(2, 30, true)
				return
			}
			const now = performance.now()
			if (now - this.lastMoveBurstTs < 33) return
			this.lastMoveBurstTs = now
			this.requestRenderBurst(2, 60, true)
		}
		this.handleControlsStart = () => {
			this.orbiting = true
			this.lastMoveBurstTs = 0
			this.requestRenderBurst(30, 60, true)
		}
		this.handleControlsEnd = () => {
			this.orbiting = false
			this.requestRenderBurst(20, 60, true)
		}
		this.controls.addEventListener('change', this.handleControlsChange)
		this.controls.addEventListener('start', this.handleControlsStart)
		this.controls.addEventListener('end', this.handleControlsEnd)

		this.transformControls = new TransformControls(this.camera, canvas)
		this.transformControls.enabled = this.transformVisible
		this.transformControls.setSize(0.8)
		this.transformControls.setSpace('world')
		this.transformControls.showX = true
		this.transformControls.showY = true
		this.transformControls.showZ = true
		this.transformHelper = typeof (this.transformControls as unknown as { getHelper?: () => THREE.Object3D }).getHelper === 'function'
			? (this.transformControls as unknown as { getHelper: () => THREE.Object3D }).getHelper()
			: this.transformControls as unknown as THREE.Object3D
		this.transformHelper.visible = false

		this.handleTransformDraggingChanged = (event: { value: boolean }) => {
			this.transformDragging = event.value
			this.controls.enabled = !event.value
			if (event.value) {
				this.requestRenderBurst(120, 60, true)
			} else {
				this.requestRenderBurst(30, 60, true)
				this.onSelectionTransform?.(this.selectedObjects)
			}
		}
		this.handleTransformChange = () => {
			this.requestRenderBurst(2, 60, false)
		}
		this.handleTransformMouseUp = () => {
			if (this.transformDragging) {
				this.onSelectionTransform?.(this.selectedObjects)
			}
		}
		this.transformControls.addEventListener('dragging-changed', this.handleTransformDraggingChanged)
		this.transformControls.addEventListener('objectChange', this.handleTransformChange)
		this.transformControls.addEventListener('change', this.handleTransformChange)
		this.transformControls.addEventListener('mouseUp', this.handleTransformMouseUp)
		this.scene.add(this.transformHelper)

		this.composer = new EffectComposer(this.renderer)
		this.renderPass = new RenderPass(this.scene, this.camera)
		this.composer.addPass(this.renderPass)

		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(canvas.clientWidth || 800, canvas.clientHeight || 600),
			0.08,
			0.6,
			0.92
		)
		this.bloomPass.enabled = this.bloomEnabled
		this.composer.addPass(this.bloomPass)

		this.fxaaPass = new ShaderPass(FXAAShader)
		const pixelRatio = this.renderer.getPixelRatio()
		this.fxaaPass.uniforms['resolution'].value.set(
			1 / ((canvas.clientWidth || 800) * pixelRatio),
			1 / ((canvas.clientHeight || 600) * pixelRatio)
		)
		this.fxaaPass.enabled = this.antialiasEnabled
		this.composer.addPass(this.fxaaPass)

		this.ambientLight = new THREE.HemisphereLight('#ffffff', '#445566', 0.6)
		this.scene.add(this.ambientLight)

		this.mainLight = new THREE.DirectionalLight('#ffffff', 2.0)
		this.mainLight.position.set(8, 12, 8)
		this.mainLight.castShadow = true
		this.mainLight.shadow.mapSize.width = 2048
		this.mainLight.shadow.mapSize.height = 2048
		this.mainLight.shadow.camera.near = 0.5
		this.mainLight.shadow.camera.far = 50
		this.mainLight.shadow.camera.left = -15
		this.mainLight.shadow.camera.right = 15
		this.mainLight.shadow.camera.top = 15
		this.mainLight.shadow.camera.bottom = -15
		this.mainLight.shadow.bias = -0.0001
		this.scene.add(this.mainLight)
		this.scene.add(this.mainLight.target)

		this.fillLight = new THREE.DirectionalLight('#aaccff', 0.5)
		this.fillLight.position.set(-6, 4, -4)
		this.scene.add(this.fillLight)

		this.rimLight = new THREE.PointLight('#88ccff', 0.8, 30)
		this.rimLight.position.set(-5, 6, -8)
		this.scene.add(this.rimLight)

		this.axesHelper = new THREE.AxesHelper(2)
		const axesMat = this.axesHelper.material as THREE.Material | THREE.Material[]
		if (Array.isArray(axesMat)) {
			axesMat.forEach(m => { m.depthWrite = false })
		} else {
			axesMat.depthWrite = false
		}
		this.axesHelper.visible = this.axesVisible
		this.scene.add(this.axesHelper)

		this.gridHelper = new THREE.GridHelper(20, 40, 0x3a4048, 0x323840)
		const gridMat = this.gridHelper.material as THREE.Material
		if (Array.isArray(gridMat)) {
			gridMat.forEach(m => {
				m.opacity = 0.35
				m.transparent = true
				m.depthWrite = false
			})
		} else {
			gridMat.opacity = 0.35
			gridMat.transparent = true
			gridMat.depthWrite = false
		}
		this.gridHelper.position.y = 0
		this.gridHelper.visible = this.gridVisible
		this.scene.add(this.gridHelper)

		const groundGeo = new THREE.PlaneGeometry(500, 500)
		const groundMat = new THREE.ShadowMaterial({ opacity: 0.1, depthWrite: false })
		this.groundMesh = new THREE.Mesh(groundGeo, groundMat)
		this.groundMesh.rotation.x = -Math.PI / 2
		this.groundMesh.position.y = -0.001
		this.groundMesh.receiveShadow = true
		this.scene.add(this.groundMesh)

		this.dracoLoader = new DRACOLoader()
		this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
		this.gltfLoader = new GLTFLoader()
		this.gltfLoader.setDRACOLoader(this.dracoLoader)
		this.objLoader = OBJLoader ? new OBJLoader() : ({} as OBJLoader)

		this.handlePointerDown = (e: PointerEvent) => {
			if (e.button !== 0) return
			if (this.transformDragging) return
			this.pointerDownPos = { x: e.clientX, y: e.clientY }
			this.didPointerDownOnGizmo = false
			this.didPointerDownOnObject = false

			const rect = this.canvas.getBoundingClientRect()
			this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
			this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
			this.raycaster.setFromCamera(this.pointer, this.camera)

			if (this.transformHelper.visible && this.transformControls.object) {
				const gizmoIntersects = this.raycaster.intersectObject(this.transformHelper, true)
				if (gizmoIntersects.length > 0) {
					this.didPointerDownOnGizmo = true
					return
				}
			}

			const allMeshes: THREE.Object3D[] = []
			this.models.forEach((model) => {
				model.group.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						allMeshes.push(child)
					}
				})
			})

			const intersects = this.raycaster.intersectObjects(allMeshes, false)
			if (intersects.length > 0) {
				this.didPointerDownOnObject = true
			}
		}

		this.handlePointerUp = (e: PointerEvent) => {
			if (e.button !== 0) return
			if (this.transformDragging) return

			const dx = e.clientX - this.pointerDownPos.x
			const dy = e.clientY - this.pointerDownPos.y
			const dist = Math.sqrt(dx * dx + dy * dy)
			if (dist > 5) return

			if (this.didPointerDownOnGizmo) return

			const rect = this.canvas.getBoundingClientRect()
			this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
			this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
			this.raycaster.setFromCamera(this.pointer, this.camera)

			if (this.transformHelper.visible && this.transformControls.object) {
				const gizmoIntersects = this.raycaster.intersectObject(this.transformHelper, true)
				if (gizmoIntersects.length > 0) {
					return
				}
			}

			const allMeshes: THREE.Object3D[] = []
			this.models.forEach((model) => {
				model.group.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						allMeshes.push(child)
					}
				})
			})

			const intersects = this.raycaster.intersectObjects(allMeshes, false)

			if (intersects.length > 0) {
				const hitObj = intersects[0].object
				const rootGroup = this.findRootGroup(hitObj)
				if (rootGroup) {
					this.selectObject(rootGroup)
				} else {
					this.selectObject(hitObj)
				}
			} else {
				if (this.selectedObject && !this.didPointerDownOnObject) {
					this.clearSelection()
				}
			}
		}

		this.handleWheel = () => {
			this.requestRenderBurst(10, 60, true)
		}
		this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)

		canvas.addEventListener('pointerdown', this.handlePointerDown)
		canvas.addEventListener('pointerup', this.handlePointerUp)
		canvas.addEventListener('wheel', this.handleWheel, { passive: true })
		window.addEventListener('keydown', this.handleKeyDown)

		this.resizeObserver = new ResizeObserver(() => this.resize())
		this.resizeObserver.observe(canvas)

		this.resize()
		this.applyLightingPreset('studio')
		this.requestRenderBurst(30, 60, true)

		requestAnimationFrame(() => {
			if (!this.disposed) {
				this.resize()
				this.requestRenderBurst(30, 60, true)
			}
		})
		setTimeout(() => {
			if (!this.disposed) {
				this.resize()
				this.requestRenderBurst(60, 60, true)
				this.camera.lookAt(this.controls.target)
			}
		}, 100)
	}

	private createGradientBackground(isDark = true) {
		if (this.bgMesh) {
			this.scene.remove(this.bgMesh)
			this.bgMesh.geometry.dispose()
			;(this.bgMesh.material as THREE.Material).dispose()
		}

		const bgColor = new THREE.Color(0x21262b)

		const bgGeometry = new THREE.SphereGeometry(800, 32, 32)
		const bgMaterial = new THREE.ShaderMaterial({
			uniforms: {
				bgColor: { value: bgColor }
			},
			vertexShader: `
				varying vec3 vWorldDir;
				void main() {
					vec4 worldPosition = modelMatrix * vec4(position, 1.0);
					vWorldDir = normalize(worldPosition.xyz - cameraPosition);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform vec3 bgColor;
				varying vec3 vWorldDir;
				void main() {
					gl_FragColor = vec4(bgColor, 1.0);
				}
			`,
			side: THREE.BackSide,
			depthWrite: false,
			depthTest: false
		})
		this.bgMesh = new THREE.Mesh(bgGeometry, bgMaterial)
		this.bgMesh.renderOrder = -1
		this.scene.add(this.bgMesh)
	}

	private updateBackgroundUniforms() {
	}

	private onKeyDown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
		switch (e.key.toLowerCase()) {
			case 'w':
				this.setTransformMode('translate')
				break
			case 'e':
				this.setTransformMode('rotate')
				break
			case 'r':
				if (!e.ctrlKey && !e.metaKey) {
					this.setTransformMode('scale')
				}
				break
			case 'escape':
				this.clearSelection()
				break
		}
	}

	private setupEnvironment() {
		const env = new RoomEnvironment()
		this.environmentTexture = this.pmremGenerator.fromScene(env).texture
		env.dispose()
		this.scene.environment = this.environmentTexture
	}

	private requestRenderBurst(frames = 1, fps = 30, replace = false) {
		if (this.disposed || this.renderSuspended) return
		const f = Math.max(1, Math.floor(frames))
		if (replace) {
			this.burstFrames = f
		} else {
			this.burstFrames = Math.max(this.burstFrames, f)
		}
		this.burstFps = Math.max(10, Math.min(60, fps))
		if (!this.rafId) {
			this.rafId = requestAnimationFrame(() => this.renderFrame())
		}
	}

	private renderFrame() {
		this.rafId = 0
		if (this.disposed || this.renderSuspended) return
		try {
			const now = performance.now()
			const minInterval = 1000 / this.burstFps
			if (this.lastRenderTime > 0 && now - this.lastRenderTime < minInterval) {
				this.rafId = requestAnimationFrame(() => this.renderFrame())
				return
			}
			this.lastRenderTime = now
			if (!this.fpsLastUpdate) this.fpsLastUpdate = now
			this.fpsFrames++
			if (now - this.fpsLastUpdate >= 500) {
				this.fps = Math.min(144, Math.round((this.fpsFrames * 1000) / (now - this.fpsLastUpdate)))
				this.fpsFrames = 0
				this.fpsLastUpdate = now
			}
			this.controls.update()
			this.updateBackgroundUniforms()
			this.composer.render()
			if (this.burstFrames > 0) this.burstFrames--
			const needsContinousRender = this.burstFrames > 0 || this.orbiting || this.transformDragging
			if (needsContinousRender) {
				this.rafId = requestAnimationFrame(() => this.renderFrame())
			}
		} catch (e) {
			console.error('[EditorViewer] Render error:', e)
			if (this.burstFrames > 0) this.burstFrames--
			this.rafId = requestAnimationFrame(() => this.renderFrame())
		}
	}

	private resize() {
		const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1))
		const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1))
		this.renderer.setSize(width, height, false)
		this.composer.setSize(width, height)
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		const pixelRatio = this.renderer.getPixelRatio()
		this.fxaaPass.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio))
		this.mainLight.shadow.camera.updateProjectionMatrix()
		this.requestRenderBurst(2, 30)
	}

	private findRootGroup(obj: THREE.Object3D): THREE.Object3D | null {
		let current: THREE.Object3D | null = obj
		while (current) {
			let isRoot = false
			this.models.forEach((m) => {
				if (m.group === current) isRoot = true
			})
			if (isRoot) return current
			current = current.parent
		}
		return null
	}

	selectObject(obj: THREE.Object3D | null) {
		if (obj) {
			const rootGroup = this.findRootGroup(obj)
			if (rootGroup && rootGroup !== obj) {
				obj = rootGroup
			}
		}
		const changed = this.selectedObject !== obj
		this.selectedObject = obj
		this.selectedObjects = obj ? [obj] : []
		if (obj && this.transformVisible) {
			obj.updateMatrixWorld(true)
			if (obj.scale.x === 0) obj.scale.x = 1
			if (obj.scale.y === 0) obj.scale.y = 1
			if (obj.scale.z === 0) obj.scale.z = 1
			this.transformControls.attach(obj)
			this.transformHelper.visible = true
			this.transformControls.enabled = true
		} else {
			this.transformControls.detach()
			this.transformHelper.visible = false
		}
		if (changed) {
			this.onSelectionChange?.(this.selectedObjects)
		}
		this.requestRenderBurst(60, 60, true)
	}

	clearSelection() {
		this.selectedObject = null
		this.selectedObjects = []
		this.transformControls.detach()
		this.transformHelper.visible = false
		this.onSelectionChange?.([])
		this.requestRenderBurst(10, 30)
	}

	getSelectedObjects(): THREE.Object3D[] {
		return [...this.selectedObjects]
	}

	setTransformMode(mode: TransformMode) {
		this.currentTransformMode = mode
		this.transformControls.setMode(mode)
		this.requestRenderBurst(10, 60)
	}

	getTransformMode(): TransformMode {
		return this.currentTransformMode
	}

	setAxesVisible(visible: boolean) {
		this.axesVisible = visible
		this.axesHelper.visible = visible
		this.requestRenderBurst(2, 30)
	}

	setTransformVisible(visible: boolean) {
		this.transformVisible = visible
		this.transformControls.enabled = visible
		if (!visible) {
			this.transformControls.detach()
			this.transformHelper.visible = false
		} else if (this.selectedObject) {
			this.selectedObject.updateMatrixWorld(true)
			this.transformControls.attach(this.selectedObject)
			this.transformHelper.visible = true
		}
		this.requestRenderBurst(30, 60)
	}

	buildOutlinerTree(): OutlinerNode[] {
		const nodes: OutlinerNode[] = []
		this.models.forEach((model, id) => {
			const modelNode: OutlinerNode = {
				id: `model-${id}`,
				name: model.name || `Model ${id}`,
				type: 'model',
				visible: model.group.visible,
				locked: false,
				children: [],
				object3D: model.group
			}
			model.group.traverse((child) => {
				if (child === model.group) return
				if (child instanceof THREE.Mesh) {
					modelNode.children.push({
						id: `mesh-${child.uuid}`,
						name: child.name || 'Mesh',
						type: 'mesh',
						visible: child.visible,
						locked: false,
						children: [],
						object3D: child
					})
				} else if (child instanceof THREE.Light) {
					modelNode.children.push({
						id: `light-${child.uuid}`,
						name: child.name || 'Light',
						type: 'light',
						visible: child.visible,
						locked: false,
						children: [],
						object3D: child
					})
				}
			})
			nodes.push(modelNode)
		})
		return nodes
	}

	setRenderMode(mode: RenderMode) {
		if (this.currentRenderMode === mode) return
		this.disposeCurrentRenderModeMaterials()
		this.currentRenderMode = mode
		this.applyRenderMode()
		this.requestRenderBurst(10, 60, true)
	}

	private disposeCurrentRenderModeMaterials() {
		if (this.currentRenderMode === 'pbr') return
		this.models.forEach((model) => {
			model.group.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					const originalMat = model.originalMaterials.get(child)
					if (originalMat && child.material !== originalMat) {
						disposeMaterial(child.material as MaterialLike | MaterialLike[])
					}
				}
			})
		})
	}

	private applyRenderMode() {
		this.models.forEach((model) => {
			model.group.traverse((child) => {
				if (!(child instanceof THREE.Mesh)) return
				const originalMat = model.originalMaterials.get(child)
				if (!originalMat) return
				switch (this.currentRenderMode) {
					case 'pbr':
						child.material = originalMat
						child.material.needsUpdate = true
						break
					case 'solid-white': {
						const clayMat = new THREE.ShaderMaterial({
							uniforms: {
								baseColor: { value: new THREE.Color(0xb0b5ba) }
							},
							vertexShader: `
								varying vec3 vNormalW;
								void main() {
									vec4 worldPos = modelMatrix * vec4(position, 1.0);
				    				vNormalW = normalize(mat3(modelMatrix) * normal);
				    				gl_Position = projectionMatrix * viewMatrix * worldPos;
								}
							`,
							fragmentShader: `
								uniform vec3 baseColor;
								varying vec3 vNormalW;
								void main() {
									vec3 N = normalize(vNormalW);
									if (!gl_FrontFacing) N = -N;
									vec3 L = normalize(vec3(0.5, 0.9, 0.6));
									float ndl = max(dot(N, L), 0.0);
									float wrap = (dot(N, L) + 0.4) / 1.4;
									float light = 0.35 + wrap * 0.65;
									gl_FragColor = vec4(baseColor * light, 1.0);
								}
							`,
							side: THREE.DoubleSide
						})
						child.material = clayMat
						break
					}
					case 'normal': {
						const normalMat = new THREE.MeshNormalMaterial({
							side: THREE.DoubleSide
						})
						child.material = normalMat
						break
					}
					case 'unlit': {
						const unlitMat = new THREE.MeshBasicMaterial({
							color: 0xffffff
						})
						if (Array.isArray(originalMat)) {
							const maps = originalMat
								.map((m) => (m as THREE.MeshStandardMaterial).map)
								.filter(Boolean) as THREE.Texture[]
							if (maps.length > 0) unlitMat.map = maps[0]
						} else if ((originalMat as THREE.MeshStandardMaterial).map) {
							unlitMat.map = (originalMat as THREE.MeshStandardMaterial).map
						}
						child.material = unlitMat
						break
					}
					case 'matcap': {
						const matcapMat = new THREE.MeshPhongMaterial({
							color: 0xffffff,
							shininess: 80,
							specular: new THREE.Color(0x666666),
							side: THREE.DoubleSide
						})
						child.material = matcapMat
						break
					}
					default:
						child.material = originalMat
						child.material.needsUpdate = true
				}
			})
		})
	}

	setWireframeOverlay(enabled: boolean) {
		this.wireframeOverlayEnabled = enabled
		this.models.forEach((model) => {
			model.wireframeHelpers.forEach((wireframe) => {
				wireframe.visible = enabled
			})
		})
		this.requestRenderBurst(10, 60, true)
	}

	getWireframeOverlay(): boolean {
		return this.wireframeOverlayEnabled
	}

	setLightingPreset(preset: LightingPreset) {
		this.currentLightingPreset = preset
		this.applyLightingPreset(preset)
		this.requestRenderBurst(4, 30)
	}

	private applyLightingPreset(preset: LightingPreset) {
		this.mainLight.color.setHex(0xffffff)
		this.fillLight.color.setHex(0xaaccff)
		this.rimLight.color.setHex(0x88ccff)

		switch (preset) {
			case 'studio':
				this.ambientLight.intensity = 0.6
				this.mainLight.intensity = 2.0
				this.mainLight.position.set(8, 12, 8)
				this.fillLight.intensity = 0.5
				this.rimLight.intensity = 0.8
				this.scene.environment = this.environmentTexture
				this.renderer.toneMappingExposure = 1.2
				break
			case 'outdoor':
				this.ambientLight.intensity = 0.4
				this.mainLight.intensity = 3.0
				this.mainLight.position.set(10, 15, 5)
				this.mainLight.color.setHex(0xfff5e6)
				this.fillLight.intensity = 0.3
				this.fillLight.color.setHex(0x88bbff)
				this.rimLight.intensity = 0.3
				this.renderer.toneMappingExposure = 1.4
				break
			case 'dark':
				this.ambientLight.intensity = 0.15
				this.mainLight.intensity = 0.8
				this.mainLight.position.set(5, 8, 5)
				this.fillLight.intensity = 0.1
				this.rimLight.intensity = 1.5
				this.rimLight.color.setHex(0x4488ff)
				this.renderer.toneMappingExposure = 0.9
				break
			case 'no-light':
				this.ambientLight.intensity = 1.0
				this.mainLight.intensity = 0
				this.fillLight.intensity = 0
				this.rimLight.intensity = 0
				this.scene.environment = null
				this.renderer.toneMappingExposure = 1.0
				break
			default:
				break
		}
		if (preset !== 'no-light' && !this.scene.environment) {
			this.scene.environment = this.environmentTexture
		}
	}

	setShadowsEnabled(enabled: boolean) {
		this.shadowsEnabled = enabled
		this.renderer.shadowMap.enabled = enabled
		this.mainLight.castShadow = enabled
		this.models.forEach((m) => {
			m.group.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.castShadow = enabled
					child.receiveShadow = enabled
				}
			})
		})
		this.requestRenderBurst(4, 30)
	}

	setBloomEnabled(enabled: boolean) {
		this.bloomEnabled = enabled
		this.bloomPass.enabled = enabled
		this.requestRenderBurst(2, 30)
	}

	setTheme(isDark: boolean) {
		this.createGradientBackground(isDark)
		if (isDark) {
			this.renderer.setClearColor(0x0a0f14, 1)
		} else {
			this.renderer.setClearColor(0xe8eef5, 1)
		}
		this.requestRenderBurst(10, 60, true)
	}

	setAntialiasEnabled(enabled: boolean) {
		this.antialiasEnabled = enabled
		this.fxaaPass.enabled = enabled
		this.requestRenderBurst(2, 30)
	}

	setGridVisible(visible: boolean) {
		this.gridVisible = visible
		this.gridHelper.visible = visible
		this.requestRenderBurst(2, 30)
	}

	setNodeVisibility(nodeId: string, visible: boolean) {
		const parts = nodeId.split('-')
		const type = parts[0]
		const uuid = parts.slice(1).join('-')
		this.models.forEach((model) => {
			model.group.traverse((child) => {
				if (child.uuid === uuid || (type === 'model' && model.id === parts.slice(1).join('-'))) {
					child.visible = visible
				}
			})
		})
		this.requestRenderBurst(2, 30)
	}

	setRenderSuspended(suspended: boolean) {
		this.renderSuspended = suspended === true
		if (this.renderSuspended) {
			if (this.rafId) cancelAnimationFrame(this.rafId)
			this.rafId = 0
			this.burstFrames = 0
			this.lastMoveBurstTs = 0
			return
		}
		this.requestRenderBurst(2, 30)
	}

	async loadModel(url: string, modelId?: string, name?: string): Promise<LoadedEditorModel> {
		const id = modelId || `model-${Date.now()}`
		const modelName = name || `Model ${this.models.size + 1}`

		this.reportProgress({ stage: 'loading', progress: 0, message: 'Loading model...' })

		const group = await this.loadModelFile(url, (loaded, total) => {
			const ratio = total > 0 ? loaded / total : 0
			this.reportProgress({
				stage: 'loading',
				progress: ratio * 0.7,
				message: `Loading... ${Math.round(ratio * 100)}%`
			})
		})

		this.reportProgress({ stage: 'processing', progress: 0.75, message: 'Processing geometry...' })

		const model: LoadedEditorModel = {
			id,
			name: modelName,
			url,
			group,
			originalMaterials: new Map(),
			wireframeHelpers: new Map()
		}

		group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = this.shadowsEnabled
				child.receiveShadow = this.shadowsEnabled
				model.originalMaterials.set(child, child.material)
				if (child.geometry && !child.geometry.attributes.normal) {
					child.geometry.computeVertexNormals()
				}
				const wireGeo = new THREE.WireframeGeometry(child.geometry)
				const lineMat = new THREE.LineBasicMaterial({
					color: 0x1c2228,
					transparent: true,
					opacity: 0.85,
					depthTest: true,
					depthWrite: false,
					polygonOffset: true,
					polygonOffsetFactor: -4,
					polygonOffsetUnits: -4
				})
				const wireframe = new THREE.LineSegments(wireGeo, lineMat)
				wireframe.renderOrder = 999
				wireframe.scale.setScalar(1.0005)
				wireframe.visible = this.wireframeOverlayEnabled
				child.add(wireframe)
				model.wireframeHelpers.set(child, wireframe)
			}
		})

		this.models.set(id, model)
		this.scene.add(group)
		group.updateMatrixWorld(true)

		this.reportProgress({ stage: 'building', progress: 0.9, message: 'Framing camera...' })
		this.frameAllModels()

		if (this.currentRenderMode !== 'pbr') {
			this.applyRenderMode()
		}

		this.reportProgress({ stage: 'complete', progress: 1, message: 'Ready' })
		this.requestRenderBurst(20, 40)

		return model
	}

	private loadModelFile(url: string, onProgress?: (loaded: number, total: number) => void): Promise<THREE.Group> {
		return new Promise((resolve, reject) => {
			const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || ''
			if (ext === 'obj' && this.objLoader.load) {
				this.objLoader.load(
					url,
					(obj) => resolve(obj as unknown as THREE.Group),
					(e) => onProgress?.(e.loaded, e.total),
					(err) => reject(err)
				)
			} else {
				this.gltfLoader.load(
					url,
					(gltf) => resolve(gltf.scene),
					(e) => onProgress?.(e.loaded, e.total),
					(err) => reject(err)
				)
			}
		})
	}

	unloadModel(id: string) {
		const model = this.models.get(id)
		if (!model) return
		if (this.selectedObject) {
			let isSelectedOrChild = this.selectedObject === model.group
			if (!isSelectedOrChild) {
				this.selectedObject.traverseAncestors?.((a) => {
					if (a === model.group) isSelectedOrChild = true
				})
			}
			if (isSelectedOrChild) {
				this.clearSelection()
			}
		}
		model.wireframeHelpers.forEach((wireframe, mesh) => {
			mesh.remove(wireframe)
			wireframe.geometry.dispose()
			;(wireframe.material as THREE.Material).dispose()
		})
		model.wireframeHelpers.clear()
		this.scene.remove(model.group)
		model.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry?.dispose()
				const mat = child.material
				const originalMat = model.originalMaterials.get(child)
				if (mat !== originalMat) {
					disposeMaterial(mat as MaterialLike | MaterialLike[])
				}
			}
		})
		this.models.delete(id)
		if (this.currentRenderMode !== 'pbr') this.applyRenderMode()
		this.requestRenderBurst(4, 30)
	}

	private frameAllModels() {
		if (this.models.size === 0) return
		const box = new THREE.Box3()
		this.models.forEach((m) => {
			box.expandByObject(m.group)
		})
		if (box.isEmpty()) return
		this.applyCameraFrame(box)
	}

	private applyCameraFrame(box: THREE.Box3) {
		const size = new THREE.Vector3()
		const center = new THREE.Vector3()
		box.getSize(size)
		box.getCenter(center)
		const maxDim = Math.max(size.x, size.y, size.z, 0.5)
		const horizontalRadius = Math.max(size.x, size.z) * 0.5
		this.controls.target.copy(center)
		const fov = (this.camera.fov * Math.PI) / 180
		const distance = (maxDim * 1.5) / (2 * Math.tan(fov / 2))
		const camDist = Math.max(distance, maxDim * 2.2, horizontalRadius * 2.8)
		this.camera.near = Math.max(0.001, camDist / 1000)
		this.camera.far = Math.max(camDist * 20, maxDim * 100, 1000)
		this.controls.minDistance = Math.max(0.05, maxDim * 0.2)
		this.controls.maxDistance = Math.max(camDist * 8, maxDim * 30)
		const dir = new THREE.Vector3(1.2, 0.9, 1.2).normalize()
		this.camera.position.copy(center).add(dir.multiplyScalar(camDist))
		this.camera.updateProjectionMatrix()
		this.controls.update()
		const gridSize = Math.max(10, Math.ceil(maxDim * 3))
		this.gridHelper.geometry.dispose()
		const oldGridMat = this.gridHelper.material
		disposeMaterial(oldGridMat as MaterialLike | MaterialLike[])
		this.scene.remove(this.gridHelper)
		this.gridHelper = new THREE.GridHelper(gridSize, Math.min(40, gridSize), 0x3a4048, 0x323840)
		const gridMat = this.gridHelper.material as THREE.Material
		if (Array.isArray(gridMat)) {
			gridMat.forEach(m => {
				m.opacity = 0.35
				m.transparent = true
				m.depthWrite = false
			})
		} else {
			gridMat.opacity = 0.35
			gridMat.transparent = true
			gridMat.depthWrite = false
		}
		this.gridHelper.position.y = box.min.y
		this.groundMesh.position.y = box.min.y - 0.001
		this.groundMesh.geometry.dispose()
		this.groundMesh.geometry = new THREE.PlaneGeometry(gridSize, gridSize)
		this.gridHelper.visible = this.gridVisible
		this.scene.add(this.gridHelper)
		this.axesHelper.scale.setScalar(Math.max(1, maxDim * 0.3))
		this.axesHelper.position.y = box.min.y
		this.mainLight.shadow.camera.left = -maxDim * 2
		this.mainLight.shadow.camera.right = maxDim * 2
		this.mainLight.shadow.camera.top = maxDim * 2
		this.mainLight.shadow.camera.bottom = -maxDim * 2
		this.mainLight.shadow.camera.far = maxDim * 8
		this.mainLight.shadow.camera.updateProjectionMatrix()
	}

	frameModel(id?: string) {
		if (id && this.models.has(id)) {
			const model = this.models.get(id)!
			const box = new THREE.Box3().setFromObject(model.group)
			if (box.isEmpty()) return
			this.applyCameraFrame(box)
			this.requestRenderBurst(10, 30)
		} else {
			this.frameAllModels()
		}
	}

	resetCamera() {
		this.frameAllModels()
	}

	getScreenshot(): string {
		try {
			this.controls.update()
			this.composer.render()
			return this.canvas.toDataURL('image/png')
		} catch {
			return ''
		}
	}

	getModelCount(): number {
		return this.models.size
	}

	getFPS(): number {
		return this.fps
	}

	getVertexCount(): number {
		let count = 0
		this.models.forEach((m) => {
			m.group.traverse((child) => {
				if (child instanceof THREE.Mesh && child.geometry) {
					const pos = child.geometry.attributes.position
					if (pos) count += pos.count
				}
			})
		})
		return count
	}

	getTriangleCount(): number {
		let count = 0
		this.models.forEach((m) => {
			m.group.traverse((child) => {
				if (child instanceof THREE.Mesh && child.geometry) {
					const geo = child.geometry
					if (geo.index) count += geo.index.count / 3
					else if (geo.attributes.position) count += geo.attributes.position.count / 3
				}
			})
		})
		return Math.floor(count)
	}

	private reportProgress(progress: EditorLoadProgress) {
		this.onLoadProgress?.(progress)
	}

	dispose() {
		if (this.disposed) return
		this.disposed = true
		this.renderSuspended = true
		if (this.rafId) cancelAnimationFrame(this.rafId)
		window.removeEventListener('keydown', this.handleKeyDown)
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
		this.canvas.removeEventListener('pointerup', this.handlePointerUp)
		this.canvas.removeEventListener('wheel', this.handleWheel)
		this.resizeObserver?.disconnect()
		this.controls.removeEventListener('change', this.handleControlsChange)
		this.controls.removeEventListener('start', this.handleControlsStart)
		this.controls.removeEventListener('end', this.handleControlsEnd)
		this.transformControls.removeEventListener('dragging-changed', this.handleTransformDraggingChanged)
		this.transformControls.removeEventListener('objectChange', this.handleTransformChange)
		this.transformControls.removeEventListener('change', this.handleTransformChange)
		this.transformControls.removeEventListener('mouseUp', this.handleTransformMouseUp)
		this.transformControls.detach()
		this.scene.remove(this.transformHelper)
		this.transformControls.dispose()
		this.disposeCurrentRenderModeMaterials()
		this.models.forEach((model) => {
			model.wireframeHelpers.forEach((wireframe, mesh) => {
				mesh.remove(wireframe)
				wireframe.geometry.dispose()
				;(wireframe.material as THREE.Material).dispose()
			})
			model.wireframeHelpers.clear()
			this.scene.remove(model.group)
			model.group.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose()
					const mat = model.originalMaterials.get(child)
					if (mat) disposeMaterial(mat as MaterialLike | MaterialLike[])
				}
			})
		})
		this.models.clear()
		if (this.bgMesh) {
			this.scene.remove(this.bgMesh)
			this.bgMesh.geometry.dispose()
			;(this.bgMesh.material as THREE.Material).dispose()
		}
		this.dracoLoader.dispose()
		if (this.environmentTexture) this.environmentTexture.dispose()
		this.pmremGenerator.dispose()
		this.bloomPass.dispose()
		this.fxaaPass.dispose()
		this.composer.dispose()
		this.controls.dispose()
		this.renderer.dispose()
	}
}
