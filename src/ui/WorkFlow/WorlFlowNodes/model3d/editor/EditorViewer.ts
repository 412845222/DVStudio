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

interface EditorViewerOptions {
	backgroundColor?: string
	initialRenderMode?: RenderMode
	shadowsEnabled?: boolean
	bloomEnabled?: boolean
	antialiasEnabled?: boolean
	gridVisible?: boolean
	axesVisible?: boolean
	transformVisible?: boolean
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
	private resizeObserver: ResizeObserver | null = null
	private disposed = false
	private rafId = 0
	private burstFrames = 0
	private burstFps = 30
	private lastRenderTime = 0
	private canvas: HTMLCanvasElement
	private onLoadProgress?: (progress: EditorLoadProgress) => void
	private onSelectionChange?: (objects: THREE.Object3D[]) => void
	private onSelectionTransform?: (objects: THREE.Object3D[]) => void
	private raycaster: THREE.Raycaster = new THREE.Raycaster()
	private pointer: THREE.Vector2 = new THREE.Vector2()
	private selectedObjects: THREE.Object3D[] = []
	private originalMaterialsBackup: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]> = new WeakMap()
	private handleClick: (e: MouseEvent) => void
	private handlePointerDown: () => void
	private handlePointerMove: () => void
	private handleWheel: () => void
	private handleKeyDown: (e: KeyboardEvent) => void
	private orbiting = false
	private transforming = false
	private fps = 0
	private fpsFrameCount = 0
	private fpsLastTime = 0

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
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
		this.renderer.setClearColor(0x0a0f14, 1)

		this.pmremGenerator = new THREE.PMREMGenerator(this.renderer)
		this.pmremGenerator.compileEquirectangularShader()
		this.setupEnvironment()

		this.controls = new OrbitControls(this.camera, canvas)
		this.controls.enableDamping = true
		this.controls.dampingFactor = 0.06
		this.controls.minDistance = 0.2
		this.controls.maxDistance = 200
		this.controls.target.set(0, 1, 0)
		this.controls.addEventListener('start', () => this.handleOrbitStart())
		this.controls.addEventListener('end', () => this.handleOrbitEnd())
		this.controls.addEventListener('change', () => this.requestRenderBurst(2, 30))

		this.transformControls = new TransformControls(this.camera, canvas)
		this.transformControls.enabled = this.transformVisible
		this.transformControls.visible = this.transformVisible
		this.transformControls.addEventListener('dragging-changed', (event: { value: boolean }) => {
			this.controls.enabled = !event.value
			this.transforming = event.value
			if (event.value) {
				this.requestRenderBurst(30, 60, true)
			} else {
				this.requestRenderBurst(10, 30)
				this.onSelectionTransform?.(this.selectedObjects)
			}
		})
		this.transformControls.addEventListener('objectChange', () => {
			this.requestRenderBurst(1, 60, true)
		})
		this.scene.add(this.transformControls)

		this.composer = new EffectComposer(this.renderer)
		this.renderPass = new RenderPass(this.scene, this.camera)
		this.composer.addPass(this.renderPass)

		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
			0.15,
			0.6,
			0.85
		)
		this.bloomPass.enabled = this.bloomEnabled
		this.composer.addPass(this.bloomPass)

		this.fxaaPass = new ShaderPass(FXAAShader)
		this.fxaaPass.uniforms['resolution'].value.set(
			1 / (canvas.clientWidth * this.renderer.getPixelRatio()),
			1 / (canvas.clientHeight * this.renderer.getPixelRatio())
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
		this.axesHelper.visible = this.axesVisible
		this.scene.add(this.axesHelper)

		this.gridHelper = new THREE.GridHelper(20, 40, 0x1f9d84, 0x1a2535)
		const gridMat = this.gridHelper.material as THREE.Material
		if (Array.isArray(gridMat)) {
			gridMat.forEach(m => {
				m.opacity = 0.35
				m.transparent = true
			})
		} else {
			gridMat.opacity = 0.35
			gridMat.transparent = true
		}
		this.gridHelper.position.y = 0
		this.gridHelper.visible = this.gridVisible
		this.scene.add(this.gridHelper)

		const groundGeo = new THREE.PlaneGeometry(50, 50)
		const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 })
		const ground = new THREE.Mesh(groundGeo, groundMat)
		ground.rotation.x = -Math.PI / 2
		ground.position.y = -0.001
		ground.receiveShadow = true
		this.scene.add(ground)

		this.dracoLoader = new DRACOLoader()
		this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
		this.gltfLoader = new GLTFLoader()
		this.gltfLoader.setDRACOLoader(this.dracoLoader)
		this.objLoader = OBJLoader ? new OBJLoader() : ({} as OBJLoader)

		this.handleClick = (e: MouseEvent) => this.onCanvasClick(e)
		this.handlePointerDown = () => this.requestRenderBurst(6, 30, true)
		this.handlePointerMove = () => {
			if (this.orbiting || this.transforming) {
				const now = performance.now()
				if (now - this.lastRenderTime > 33) this.requestRenderBurst(2, 30, true)
			}
		}
		this.handleWheel = () => this.requestRenderBurst(6, 30, true)
		this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)

		canvas.addEventListener('click', this.handleClick)
		canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: true })
		canvas.addEventListener('pointermove', this.handlePointerMove, { passive: true })
		canvas.addEventListener('wheel', this.handleWheel, { passive: true })
		window.addEventListener('keydown', this.handleKeyDown)

		this.resizeObserver = new ResizeObserver(() => this.resize())
		this.resizeObserver.observe(canvas)

		this.resize()
		this.applyLightingPreset('studio')
		this.applyTransformModeColors()
		this.requestRenderBurst(4, 30)
	}

	private createGradientBackground() {
		if (this.bgMesh) {
			this.scene.remove(this.bgMesh)
			this.bgMesh.geometry.dispose()
			;(this.bgMesh.material as THREE.Material).dispose()
		}

		const bgGeometry = new THREE.SphereGeometry(100, 32, 32)
		const bgMaterial = new THREE.ShaderMaterial({
			uniforms: {
				topColor: { value: new THREE.Color(0x0f1a22) },
				midColor: { value: new THREE.Color(0x0a0f14) },
				bottomColor: { value: new THREE.Color(0x080c10) },
				accentColor1: { value: new THREE.Color(0x1f9d84) },
				accentColor2: { value: new THREE.Color(0x3aa8b4) },
				offset: { value: 10 },
				exponent: { value: 0.6 }
			},
			vertexShader: `
				varying vec3 vWorldPosition;
				void main() {
					vec4 worldPosition = modelMatrix * vec4(position, 1.0);
					vWorldPosition = worldPosition.xyz;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform vec3 topColor;
				uniform vec3 midColor;
				uniform vec3 bottomColor;
				uniform vec3 accentColor1;
				uniform vec3 accentColor2;
				uniform float offset;
				uniform float exponent;
				varying vec3 vWorldPosition;
				void main() {
					float h = normalize(vWorldPosition + offset).y;
					float t = max(pow(max(h, 0.0), exponent), 0.0);
					vec3 baseGrad = mix(bottomColor, midColor, smoothstep(-0.2, 0.3, h));
					baseGrad = mix(baseGrad, topColor, smoothstep(0.2, 0.8, h));
					float glow1 = smoothstep(0.0, 0.5, 1.0 - length(vWorldPosition.xz - vec2(-20.0, 10.0)) / 60.0) * 0.12;
					float glow2 = smoothstep(0.0, 0.5, 1.0 - length(vWorldPosition.xz - vec2(25.0, -15.0)) / 50.0) * 0.08;
					baseGrad += accentColor1 * glow1 * max(h + 0.1, 0.0);
					baseGrad += accentColor2 * glow2 * max(-h + 0.3, 0.0);
					gl_FragColor = vec4(baseGrad, 1.0);
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

	private applyTransformModeColors() {
		if (!this.transformControls) return
		const modeColors: Record<TransformMode, { x: number; y: number; z: number }> = {
			translate: { x: 0xff4444, y: 0x44ff44, z: 0x4488ff },
			rotate: { x: 0xff4444, y: 0x44ff44, z: 0x4488ff },
			scale: { x: 0xffaa44, y: 0xffaa44, z: 0xffaa44 }
		}
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
		}
	}

	private setupEnvironment() {
		const env = new RoomEnvironment()
		this.environmentTexture = this.pmremGenerator.fromScene(env).texture
		env.dispose()
		this.scene.environment = this.environmentTexture
	}

	private handleOrbitStart() {
		this.orbiting = true
		this.requestRenderBurst(20, 40, true)
	}

	private handleOrbitEnd() {
		this.orbiting = false
		this.requestRenderBurst(10, 30, true)
	}

	private requestRenderBurst(frames = 1, fps = 30, replace = false) {
		if (this.disposed) return
		const f = Math.max(1, Math.floor(frames))
		if (replace) this.burstFrames = f
		else this.burstFrames = Math.max(this.burstFrames, f)
		this.burstFps = Math.max(10, Math.min(60, fps))
		if (!this.rafId) {
			this.rafId = requestAnimationFrame(() => this.renderFrame())
		}
	}

	private renderFrame() {
		this.rafId = 0
		if (this.disposed) return
		const now = performance.now()
		if (!this.fpsLastTime) this.fpsLastTime = now
		this.fpsFrameCount++
		if (now - this.fpsLastTime >= 1000) {
			this.fps = Math.round((this.fpsFrameCount * 1000) / (now - this.fpsLastTime))
			this.fpsFrameCount = 0
			this.fpsLastTime = now
		}
		const minInterval = 1000 / this.burstFps
		if (this.lastRenderTime > 0 && now - this.lastRenderTime < minInterval) {
			this.rafId = requestAnimationFrame(() => this.renderFrame())
			return
		}
		this.lastRenderTime = now
		this.controls.update()
		this.composer.render()
		if (this.burstFrames > 0) this.burstFrames--
		if (this.burstFrames > 0 || this.transforming) {
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

	private onCanvasClick(event: MouseEvent) {
		if (this.transforming) return
		const rect = this.canvas.getBoundingClientRect()
		this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
		this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
		this.raycaster.setFromCamera(this.pointer, this.camera)
		const meshes: THREE.Mesh[] = []
		this.models.forEach((model) => {
			model.group.traverse((child) => {
				if (child instanceof THREE.Mesh) meshes.push(child)
			})
		})
		const intersects = this.raycaster.intersectObjects(meshes, false)
		if (intersects.length > 0) {
			const obj = intersects[0].object
			this.selectObject(obj)
		} else {
			this.clearSelection()
		}
	}

	selectObject(obj: THREE.Object3D | null) {
		this.selectedObjects = obj ? [obj] : []
		if (obj && this.transformVisible) {
			this.transformControls.attach(obj)
		} else {
			this.transformControls.detach()
		}
		this.onSelectionChange?.(this.selectedObjects)
		this.requestRenderBurst(4, 30)
	}

	clearSelection() {
		this.selectedObjects = []
		this.transformControls.detach()
		this.onSelectionChange?.([])
		this.requestRenderBurst(2, 30)
	}

	getSelectedObjects(): THREE.Object3D[] {
		return [...this.selectedObjects]
	}

	setTransformMode(mode: TransformMode) {
		this.currentTransformMode = mode
		this.transformControls.setMode(mode)
		this.applyTransformModeColors()
		this.requestRenderBurst(2, 30)
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
		this.transformControls.visible = visible
		this.transformControls.enabled = visible
		if (!visible) {
			this.transformControls.detach()
		} else if (this.selectedObjects.length > 0) {
			this.transformControls.attach(this.selectedObjects[0])
		}
		this.requestRenderBurst(2, 30)
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
		this.currentRenderMode = mode
		this.applyRenderMode()
		this.requestRenderBurst(4, 30)
	}

	private applyRenderMode() {
		this.models.forEach((model) => {
			model.group.traverse((child) => {
				if (!(child instanceof THREE.Mesh)) return
				let originalMat = this.originalMaterialsBackup.get(child)
				if (!originalMat) {
					originalMat = child.material
					this.originalMaterialsBackup.set(child, originalMat)
				}
				switch (this.currentRenderMode) {
					case 'pbr':
						child.material = Array.isArray(originalMat)
							? originalMat.map((m) => m.clone())
							: (originalMat as THREE.Material).clone()
						(child.material as THREE.Material).needsUpdate = true
						break
					case 'wireframe': {
						const wireMat = new THREE.MeshBasicMaterial({
							color: 0x27b99c,
							wireframe: true,
							transparent: true,
							opacity: 0.9,
							depthTest: true,
							depthWrite: true,
							polygonOffset: true,
							polygonOffsetFactor: 1,
							polygonOffsetUnits: 1
						})
						wireMat.needsUpdate = true
						child.material = wireMat
						break
					}
					case 'solid-white': {
						const whiteMat = new THREE.MeshStandardMaterial({
							color: 0xe8edf5,
							roughness: 0.7,
							metalness: 0.05
						})
						whiteMat.needsUpdate = true
						child.material = whiteMat
						break
					}
					case 'normal': {
						const normalMat = new THREE.MeshNormalMaterial()
						normalMat.needsUpdate = true
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
						unlitMat.needsUpdate = true
						child.material = unlitMat
						break
					}
					case 'matcap': {
						const matcapMat = new THREE.MeshPhongMaterial({
							color: 0xffffff,
							shininess: 80,
							specular: 0x666666
						})
						matcapMat.needsUpdate = true
						child.material = matcapMat
						break
					}
					default:
						child.material = Array.isArray(originalMat)
							? originalMat.map((m) => m.clone())
							: (originalMat as THREE.Material).clone()
						(child.material as THREE.Material).needsUpdate = true
				}
			})
		})
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
			originalMaterials: new Map()
		}

		group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = this.shadowsEnabled
				child.receiveShadow = this.shadowsEnabled
				model.originalMaterials.set(child, child.material)
				if (child.geometry && !child.geometry.attributes.normal) {
					child.geometry.computeVertexNormals()
				}
			}
		})

		this.models.set(id, model)
		this.scene.add(group)

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
		this.scene.remove(model.group)
		model.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry?.dispose()
				const mat = child.material
				if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
				else mat?.dispose()
			}
		})
		this.models.delete(id)
		this.originalMaterialsBackup = new WeakMap()
		if (this.selectedObjects.length > 0) {
			this.clearSelection()
		}
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
		const size = new THREE.Vector3()
		const center = new THREE.Vector3()
		box.getSize(size)
		box.getCenter(center)
		const maxDim = Math.max(size.x, size.y, size.z, 0.5)
		this.controls.target.copy(center)
		const fov = (this.camera.fov * Math.PI) / 180
		const distance = (maxDim * 1.8) / (2 * Math.tan(fov / 2))
		this.camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance))
		this.camera.near = Math.max(0.01, distance / 500)
		this.camera.far = Math.max(distance * 20, maxDim * 50)
		this.camera.updateProjectionMatrix()
		this.controls.update()
		const gridSize = Math.max(10, Math.ceil(maxDim * 3))
		this.gridHelper.geometry.dispose()
		;(this.gridHelper.material as THREE.Material).dispose()
		this.scene.remove(this.gridHelper)
		this.gridHelper = new THREE.GridHelper(gridSize, Math.min(40, gridSize), 0x1f9d84, 0x1a2535)
		const gridMat = this.gridHelper.material as THREE.Material
		if (Array.isArray(gridMat)) {
			gridMat.forEach(m => {
				m.opacity = 0.35
				m.transparent = true
			})
		} else {
			gridMat.opacity = 0.35
			gridMat.transparent = true
		}
		this.gridHelper.position.y = box.min.y
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
			const size = new THREE.Vector3()
			const center = new THREE.Vector3()
			box.getSize(size)
			box.getCenter(center)
			const maxDim = Math.max(size.x, size.y, size.z, 0.5)
			this.controls.target.copy(center)
			const fov = (this.camera.fov * Math.PI) / 180
			const distance = (maxDim * 1.8) / (2 * Math.tan(fov / 2))
			this.camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance))
			this.camera.updateProjectionMatrix()
			this.controls.update()
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
			this.renderer.render(this.scene, this.camera)
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
		if (this.rafId) cancelAnimationFrame(this.rafId)
		window.removeEventListener('keydown', this.handleKeyDown)
		this.canvas.removeEventListener('click', this.handleClick)
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
		this.canvas.removeEventListener('pointermove', this.handlePointerMove)
		this.canvas.removeEventListener('wheel', this.handleWheel)
		this.resizeObserver?.disconnect()
		this.transformControls.detach()
		this.transformControls.dispose()
		this.models.forEach((_, id) => this.unloadModel(id))
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
