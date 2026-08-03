/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js'
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type {
	RenderMode,
	LightingPreset,
	EditorLoadProgress,
	LoadedEditorModel,
	OutlinerNode,
	TransformMode,
	ManualLightingParams
} from './types'
import { fetchAsArrayBuffer } from '../../../../../electronBridge'

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
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { dispose?: unknown }).dispose === 'function'
	)
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

const MODEL_EXT_WHITELIST = Object.freeze([
	'glb',
	'gltf',
	'fbx',
	'obj',
	'stl',
	'usdz', // ===== 新增：project_memory 明确要求 usdz 在白名单中 =====
	'dae',
	'3ds',
	'ply',
	'x3d',
	'x',
	'json'
])

const IMAGE_EXT_BLACKLIST = Object.freeze([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'tiff',
	'tif',
	'svg',
	'ico',
	'heic',
	'heif'
])

const IMAGE_MAGIC_NUMBERS: ReadonlyArray<{ pattern: number[]; mask?: number[]; name: string }> = [
	{ pattern: [0x89, 0x50, 0x4e, 0x47], name: 'PNG' },
	{ pattern: [0xff, 0xd8, 0xff], name: 'JPEG' },
	{ pattern: [0x47, 0x49, 0x46, 0x38], name: 'GIF' },
	{ pattern: [0x52, 0x49, 0x46, 0x46], name: 'WEBP/RIFF' },
	{ pattern: [0x42, 0x4d], name: 'BMP' }
]

const MODEL_MAGIC_HINTS: ReadonlyArray<{ pattern: number[]; mask?: number[]; name: string }> = [
	{ pattern: [0x67, 0x6c, 0x54, 0x46], name: 'glTF binary (GLB)' },
	{ pattern: [0x7b], name: 'JSON (glTF text)' }
]

const extractUrlExt = (url: string): string => {
	if (!url) return ''
	try {
		const text = String(url).trim()
		// 1. dweb://project-assets?projectId=xxx&path=assets/xxx.glb 场景：从 path 参数提取扩展名（优先）
		const low = text.toLowerCase()
		if (low.startsWith('dweb://') || low.startsWith('dweb:')) {
			try {
				const qStart = text.indexOf('?')
				const queryStr = qStart >= 0 ? text.slice(qStart + 1) : ''
				const params = new URLSearchParams(queryStr)
				const p = decodeURIComponent(
					params.get('path') || params.get('relativePath') || params.get('assetPath') || ''
				)
				if (p) {
					const clean = p.split('?')[0].split('#')[0]
					const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
					const namePart = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean
					const d = namePart.lastIndexOf('.')
					if (d >= 0) return namePart.slice(d + 1).toLowerCase()
				}
			} catch {
				/* ignore */
			}
		}
		// 2. 标准 URL 或 本地绝对路径 (Windows G:\... 或 Unix /...)：文件名部分提取扩展名
		const withoutQuery = text.split('?')[0].split('#')[0]
		const lastSlash = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'))
		const namePart = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
		const lastDot = namePart.lastIndexOf('.')
		if (lastDot < 0) return ''
		return namePart.slice(lastDot + 1).toLowerCase()
	} catch {
		return ''
	}
}

// 判断 URL 是否需要走 Electron 主进程 fetchAsArrayBuffer 代理加载（规避 CORS 和自定义协议处理）
const isDwebOrRemoteHttpUrl = (input: string): boolean => {
	if (!input) return false
	const t = String(input).trim()
	if (!t) return false
	const low = t.toLowerCase()
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) return true
	// ===== 本地绝对路径被 normalizeCandidate 转成 file:/// 后，也统一走主进程代理（部分 Electron 安全策略下 Three.js 原生 FileLoader.load 会被拦截） =====
	if (low.startsWith('file://')) return true
	return low.startsWith('http://') || low.startsWith('https://')
}

const isImageContentType = (ct: string): boolean => {
	if (!ct) return false
	const low = ct.toLowerCase()
	return /^image\//.test(low)
}

const detectMagicFromBytes = (
	bytes: Uint8Array
): { kind: 'image' | 'model' | 'unknown'; name: string } => {
	if (!bytes || bytes.length === 0) return { kind: 'unknown', name: 'empty' }
	for (const item of IMAGE_MAGIC_NUMBERS) {
		if (bytes.length < item.pattern.length) continue
		let match = true
		for (let i = 0; i < item.pattern.length; i++) {
			if (bytes[i] !== item.pattern[i]) {
				match = false
				break
			}
		}
		if (match) return { kind: 'image', name: item.name }
	}
	for (const item of MODEL_MAGIC_HINTS) {
		if (bytes.length < item.pattern.length) continue
		let match = true
		for (let i = 0; i < item.pattern.length; i++) {
			if (bytes[i] !== item.pattern[i]) {
				match = false
				break
			}
		}
		if (match) return { kind: 'model', name: item.name }
	}
	return { kind: 'unknown', name: 'bytes' }
}

const validateModelUrlBeforeLoad = (url: string): { ok: true } | { ok: false; reason: string } => {
	if (!url) return { ok: false, reason: 'empty-url' }
	const ext = extractUrlExt(url)
	if (ext && IMAGE_EXT_BLACKLIST.includes(ext)) {
		return { ok: false, reason: `invalid-url-extension:${ext}` }
	}
	if (ext && MODEL_EXT_WHITELIST.includes(ext)) return { ok: true }
	if (!ext) return { ok: true }
	return { ok: true }
}

interface EditorViewerOptions {
	backgroundColor?: string
	initialRenderMode?: RenderMode
	shadowsEnabled?: boolean
	bloomEnabled?: boolean
	bloomStrength?: number
	bloomRadius?: number
	bloomThreshold?: number
	antialiasEnabled?: boolean
	gridVisible?: boolean
	axesVisible?: boolean
	transformVisible?: boolean
	wireframeOverlay?: boolean
	onLoadProgress?: (progress: EditorLoadProgress) => void
	onSelectionChange?: (objects: any[]) => void
	onSelectionTransform?: (objects: any[]) => void
}

export class EditorViewer {
	private renderer: any
	private scene: any
	private camera: any
	private controls: any
	private transformControls: any
	private transformHelper: any
	private composer: any
	private renderPass: any
	private ssaoPass: any = null
	private bloomPass: any
	private gammaCorrectionPass: any
	private colorCorrectionPass: any
	private fxaaPass: any
	private groundPlane: any
	private pmremGenerator: any
	private environmentTexture: any | null = null
	private gltfLoader: any
	private objLoader: any
	private dracoLoader: any
	private ambientLight: any
	private mainLight: any
	private fillLight: any
	private rimLight: any
	private gridHelper: any
	private axesHelper: any
	private groundMesh: any
	private bgMesh: any | null = null
	private models: Map<string, LoadedEditorModel> = new Map()
	private currentRenderMode: RenderMode = 'pbr'
	private currentLightingPreset: LightingPreset = 'studio'
	private currentTransformMode: TransformMode = 'translate'
	private manualLightingParams: ManualLightingParams = {}
	private mainLightRadius = 12
	private shadowsEnabled = true
	private bloomEnabled = false
	private bloomStrength = 1.0
	private bloomRadius = 0.7
	private bloomThreshold = 0.5
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
	private onSelectionChange?: (objects: any[]) => void
	private onSelectionTransform?: (objects: any[]) => void
	private raycaster: any = new THREE.Raycaster()
	private pointer: any = new THREE.Vector2()
	private selectedObject: any | null = null
	private selectedObjects: any[] = []
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
		this.bloomEnabled = options?.bloomEnabled === true
		if (options?.bloomStrength !== undefined) this.bloomStrength = options.bloomStrength
		if (options?.bloomRadius !== undefined) this.bloomRadius = options.bloomRadius
		if (options?.bloomThreshold !== undefined) this.bloomThreshold = options.bloomThreshold
		this.antialiasEnabled = options?.antialiasEnabled !== false
		this.gridVisible = options?.gridVisible !== false
		this.axesVisible = options?.axesVisible !== false
		this.transformVisible = options?.transformVisible !== false
		this.wireframeOverlayEnabled = options?.wireframeOverlay === true

		this.scene = new THREE.Scene()

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
		this.renderer.toneMappingExposure = 1.0
		this.renderer.shadowMap.enabled = this.shadowsEnabled
		this.renderer.shadowMap.type = THREE.PCFShadowMap
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
		this.renderer.setClearColor(0x484848, 1)
		this.scene.background = new THREE.Color(0x484848)

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
		this.transformHelper =
			typeof (this.transformControls as unknown as { getHelper?: () => any }).getHelper ===
			'function'
				? (this.transformControls as unknown as { getHelper: () => any }).getHelper()
				: (this.transformControls as unknown as any)
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

		const renderTargetParams = {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			type: THREE.HalfFloatType
		}
		const initialWidth = canvas.clientWidth || 800
		const initialHeight = canvas.clientHeight || 600
		this.composer = new EffectComposer(
			this.renderer,
			new THREE.WebGLRenderTarget(initialWidth, initialHeight, renderTargetParams)
		)

		this.renderPass = new RenderPass(this.scene, this.camera)
		this.renderPass.clear = true
		this.renderPass.clearColor = new THREE.Color(0x484848)
		this.renderPass.clearAlpha = 1
		this.composer.addPass(this.renderPass)
		this.createGradientBackground()

		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(initialWidth, initialHeight),
			this.bloomStrength,
			this.bloomRadius,
			this.bloomThreshold
		)
		this.bloomPass.enabled = this.bloomEnabled
		this.composer.addPass(this.bloomPass)

		this.colorCorrectionPass = new ShaderPass(ColorCorrectionShader)
		this.colorCorrectionPass.uniforms['powRGB'].value = new THREE.Vector3(1.1, 1.1, 1.12)
		this.colorCorrectionPass.uniforms['mulRGB'].value = new THREE.Vector3(1.0, 1.0, 1.02)
		this.composer.addPass(this.colorCorrectionPass)

		this.fxaaPass = new ShaderPass(FXAAShader)
		const pixelRatio = this.renderer.getPixelRatio()
		this.fxaaPass.uniforms['resolution'].value.set(
			1 / (initialWidth * pixelRatio),
			1 / (initialHeight * pixelRatio)
		)
		this.fxaaPass.enabled = this.antialiasEnabled
		this.composer.addPass(this.fxaaPass)

		const outputPass = new OutputPass()
		this.composer.addPass(outputPass)

		this.ambientLight = new THREE.HemisphereLight('#ffffff', '#556677', 0.8)
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
		this.mainLight.shadow.bias = -0.0002
		this.mainLight.shadow.radius = 4
		this.scene.add(this.mainLight)
		this.scene.add(this.mainLight.target)

		this.fillLight = new THREE.DirectionalLight('#aaccff', 0.5)
		this.fillLight.position.set(-6, 4, -4)
		this.scene.add(this.fillLight)

		this.rimLight = new THREE.PointLight('#88ccff', 0.8, 30)
		this.rimLight.position.set(-5, 6, -8)
		this.scene.add(this.rimLight)

		this.axesHelper = new THREE.AxesHelper(2)
		const axesMat = this.axesHelper.material as any
		if (Array.isArray(axesMat)) {
			axesMat.forEach((m: any) => {
				m.depthWrite = false
			})
		} else {
			axesMat.depthWrite = false
		}
		this.axesHelper.visible = this.axesVisible
		this.scene.add(this.axesHelper)

		this.gridHelper = new THREE.GridHelper(20, 40, 0x3a4048, 0x323840)
		const gridMat = this.gridHelper.material as any
		if (Array.isArray(gridMat)) {
			gridMat.forEach((m: any) => {
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
		this.objLoader = OBJLoader ? new OBJLoader() : ({} as any)

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

			const allMeshes: any[] = []
			this.models.forEach((model: any) => {
				model.group.traverse((child: any) => {
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

			const allMeshes: any[] = []
			this.models.forEach((model: any) => {
				model.group.traverse((child: any) => {
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

		canvas.addEventListener('pointerdown', this.handlePointerDown, true)
		canvas.addEventListener('pointerup', this.handlePointerUp, true)
		canvas.addEventListener('wheel', this.handleWheel, { passive: true, capture: true })
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

	private createGradientBackground() {
		if (this.bgMesh) {
			this.scene.remove(this.bgMesh)
			this.bgMesh.geometry.dispose()
			;(this.bgMesh.material as any).dispose()
			this.bgMesh = null
		}
		const bgColor = 0x484848
		this.scene.background = new THREE.Color(bgColor)
		this.renderer.setClearColor(bgColor, 1)

		const bgGeo = new THREE.SphereGeometry(500, 32, 32)
		const bgMat = new THREE.MeshBasicMaterial({
			color: bgColor,
			side: THREE.BackSide,
			depthWrite: false
		})
		this.bgMesh = new THREE.Mesh(bgGeo, bgMat)
		this.bgMesh.renderOrder = -1000
		this.scene.add(this.bgMesh)
	}

	private updateBackgroundUniforms() {}

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
		this.environmentTexture = this.pmremGenerator.fromScene(env, 0.04).texture
		env.dispose()
		this.scene.environment = this.environmentTexture
		if ('environmentIntensity' in this.scene) {
			;(this.scene as any).environmentIntensity = 0.5
		}
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
		const width = Math.max(
			1,
			Math.floor(this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1)
		)
		const height = Math.max(
			1,
			Math.floor(this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1)
		)
		this.renderer.setSize(width, height, false)
		this.composer.setSize(width, height)
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		const pixelRatio = this.renderer.getPixelRatio()
		this.fxaaPass.uniforms['resolution'].value.set(
			1 / (width * pixelRatio),
			1 / (height * pixelRatio)
		)
		if (this.bloomPass) {
			this.bloomPass.resolution.set(width, height)
		}
		if (this.ssaoPass) {
			this.ssaoPass.setSize(width, height)
		}
		this.mainLight.shadow.camera.updateProjectionMatrix()
		this.requestRenderBurst(2, 30)
	}

	private findRootGroup(obj: any): any | null {
		let current: any | null = obj
		while (current) {
			let isRoot = false
			this.models.forEach((m: any) => {
				if (m.group === current) isRoot = true
			})
			if (isRoot) return current
			current = current.parent
		}
		return null
	}

	selectObject(obj: any | null) {
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

	getSelectedObjects(): any[] {
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
		this.models.forEach((model: any, id: any) => {
			const modelNode: OutlinerNode = {
				id: `model-${id}`,
				name: model.name || `Model ${id}`,
				type: 'model',
				visible: model.group.visible,
				locked: false,
				children: [],
				object3D: model.group,
				objectUuid: model.group.uuid
			}
			model.group.traverse((child: any) => {
				if (child === model.group) return
				if (child instanceof THREE.Mesh) {
					modelNode.children.push({
						id: `mesh-${child.uuid}`,
						name: child.name || child.userData?.name || 'Mesh',
						type: 'mesh',
						visible: child.visible,
						locked: false,
						children: [],
						object3D: child,
						objectUuid: child.uuid
					})
				} else if (child instanceof THREE.Light) {
					modelNode.children.push({
						id: `light-${child.uuid}`,
						name: child.name || 'Light',
						type: 'light',
						visible: child.visible,
						locked: false,
						children: [],
						object3D: child,
						objectUuid: child.uuid
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
		this.models.forEach((model: any) => {
			model.group.traverse((child: any) => {
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
		this.models.forEach((model: any) => {
			model.group.traverse((child: any) => {
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
						const originalColor = (originalMat as any).color
						const hasVertexColors = (originalMat as any).vertexColors
						const unlitMat = new THREE.MeshBasicMaterial({
							color: originalColor ? originalColor.clone() : 0xffffff,
							vertexColors: hasVertexColors === true,
							side: THREE.DoubleSide
						})
						if (Array.isArray(originalMat)) {
							const maps = originalMat.map((m: any) => (m as any).map).filter(Boolean) as any[]
							if (maps.length > 0) unlitMat.map = maps[0]
						} else if ((originalMat as any).map) {
							unlitMat.map = (originalMat as any).map
						}
						if ((originalMat as any).alphaMap) {
							unlitMat.alphaMap = (originalMat as any).alphaMap
							unlitMat.transparent = true
						}
						unlitMat.needsUpdate = true
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
		this.models.forEach((model: any) => {
			model.wireframeHelpers.forEach((wireframe: any) => {
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
		this.manualLightingParams = {}
		this.mainLight.color.setHex(0xffffff)
		this.fillLight.color.setHex(0xaaccff)
		this.rimLight.color.setHex(0x88ccff)

		switch (preset) {
			case 'studio':
				this.ambientLight.intensity = 0.5
				this.mainLight.intensity = 1.2
				this.setMainLightDirection(45, 55)
				this.fillLight.intensity = 0.4
				this.rimLight.intensity = 0.5
				this.scene.environment = this.environmentTexture
				if ('environmentIntensity' in this.scene) {
					;(this.scene as any).environmentIntensity = 0.5
				}
				this.renderer.toneMappingExposure = 1.0
				break
			case 'soft-studio':
				this.ambientLight.intensity = 0.6
				this.mainLight.intensity = 1.0
				this.setMainLightDirection(60, 45)
				this.mainLight.color.setHex(0xffffff)
				this.mainLight.shadow.bias = -0.0002
				this.fillLight.intensity = 0.5
				this.fillLight.color.setHex(0xaabbdd)
				this.rimLight.intensity = 0.4
				this.rimLight.color.setHex(0x7799bb)
				this.scene.environment = this.environmentTexture
				if ('environmentIntensity' in this.scene) {
					;(this.scene as any).environmentIntensity = 0.5
				}
				this.renderer.toneMappingExposure = 1.0
				break
			case 'outdoor':
				this.ambientLight.intensity = 0.6
				this.mainLight.intensity = 1.5
				this.setMainLightDirection(135, 65)
				this.mainLight.color.setHex(0xfff5e6)
				this.fillLight.intensity = 0.3
				this.fillLight.color.setHex(0x88bbff)
				this.rimLight.intensity = 0.3
				if ('environmentIntensity' in this.scene) {
					;(this.scene as any).environmentIntensity = 0.6
				}
				this.renderer.toneMappingExposure = 1.0
				break
			case 'dark':
				this.ambientLight.intensity = 0.3
				this.mainLight.intensity = 0.8
				this.setMainLightDirection(45, 40)
				this.fillLight.intensity = 0.2
				this.rimLight.intensity = 0.8
				this.rimLight.color.setHex(0x4488ff)
				this.renderer.toneMappingExposure = 0.9
				break
			case 'no-light':
				this.ambientLight.intensity = 1.0
				this.mainLight.intensity = 0.3
				this.setMainLightDirection(45, 60)
				this.fillLight.intensity = 0.2
				this.rimLight.intensity = 0.2
				this.scene.environment = this.environmentTexture
				if ('environmentIntensity' in this.scene) {
					;(this.scene as any).environmentIntensity = 0.5
				}
				this.renderer.toneMappingExposure = 1.1
				break
			default:
				break
		}
		if (preset !== 'no-light' && !this.scene.environment) {
			this.scene.environment = this.environmentTexture
		}
	}

	setMainLightDirection(azimuthDeg: number, elevationDeg: number) {
		const azimuth = (azimuthDeg * Math.PI) / 180
		const elevation = (elevationDeg * Math.PI) / 180
		const radius = this.mainLightRadius
		const x = radius * Math.sin(azimuth) * Math.cos(elevation)
		const y = radius * Math.sin(elevation)
		const z = radius * Math.cos(azimuth) * Math.cos(elevation)
		this.mainLight.position.set(x, y, z)
		this.mainLight.target.position.set(0, 0, 0)
	}

	setManualLighting(params: ManualLightingParams) {
		this.currentLightingPreset = 'custom'
		this.manualLightingParams = { ...this.manualLightingParams, ...params }

		if (params.ambientIntensity !== undefined) {
			this.ambientLight.intensity = params.ambientIntensity
		}
		if (params.mainLightIntensity !== undefined) {
			this.mainLight.intensity = params.mainLightIntensity
		}
		if (params.fillLightIntensity !== undefined) {
			this.fillLight.intensity = params.fillLightIntensity
		}
		if (params.rimLightIntensity !== undefined) {
			this.rimLight.intensity = params.rimLightIntensity
		}
		if (params.exposure !== undefined) {
			this.renderer.toneMappingExposure = params.exposure
		}
		if (params.lightAzimuth !== undefined || params.lightElevation !== undefined) {
			const currentAzimuth = params.lightAzimuth ?? this.manualLightingParams.lightAzimuth ?? 45
			const currentElevation =
				params.lightElevation ?? this.manualLightingParams.lightElevation ?? 55
			this.setMainLightDirection(currentAzimuth, currentElevation)
		}

		this.requestRenderBurst(4, 30)
	}

	getManualLightingParams(): ManualLightingParams {
		return { ...this.manualLightingParams }
	}

	getCurrentLightingValues() {
		const pos = this.mainLight.position
		const radius = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z) || 1
		const elevation = Math.asin(Math.max(-1, Math.min(1, pos.y / radius))) * (180 / Math.PI)
		const azimuth = Math.atan2(pos.x, pos.z) * (180 / Math.PI)
		return {
			ambientIntensity: this.ambientLight.intensity,
			mainLightIntensity: this.mainLight.intensity,
			fillLightIntensity: this.fillLight.intensity,
			rimLightIntensity: this.rimLight.intensity,
			exposure: this.renderer.toneMappingExposure,
			lightAzimuth: azimuth,
			lightElevation: elevation
		}
	}

	setShadowsEnabled(enabled: boolean) {
		this.shadowsEnabled = enabled
		this.renderer.shadowMap.enabled = enabled
		this.mainLight.castShadow = enabled
		this.models.forEach((m: any) => {
			m.group.traverse((child: any) => {
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

	getBloomParams() {
		return {
			strength: this.bloomStrength,
			radius: this.bloomRadius,
			threshold: this.bloomThreshold,
			enabled: this.bloomEnabled
		}
	}

	setBloomStrength(strength: number) {
		this.bloomStrength = strength
		if (this.bloomPass) {
			this.bloomPass.strength = strength
		}
		this.requestRenderBurst(2, 30)
	}

	setBloomRadius(radius: number) {
		this.bloomRadius = radius
		if (this.bloomPass) {
			this.bloomPass.radius = radius
		}
		this.requestRenderBurst(2, 30)
	}

	setBloomThreshold(threshold: number) {
		this.bloomThreshold = threshold
		if (this.bloomPass) {
			this.bloomPass.threshold = threshold
		}
		this.requestRenderBurst(2, 30)
	}

	setTheme(_isDark: boolean) {
		this.createGradientBackground()
		this.renderer.setClearColor(0x484848, 1)
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
		this.models.forEach((model: any) => {
			model.group.traverse((child: any) => {
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

		const urlCheck = validateModelUrlBeforeLoad(url)
		if (!urlCheck.ok) {
			const reason = (urlCheck as { ok: false; reason: string }).reason
			const err = new Error(
				`[Model3DEditor] 拒绝加载疑似非模型资源（${reason}）。请确认URL是否指向有效的3D模型文件。`
			)
			;(err as Error & { code?: string }).code = 'MODEL_URL_INVALID_FORMAT'
			throw err
		}

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

		group.traverse((child: any) => {
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

	/**
	 * 资源校验：联合 Content-Type（辅助） + 文件字节 magic number（权威）判定
	 * 决策规则（防止 CDN 误报误杀 GLB/gltf 合法模型）:
	 *  - magic 命中 MODEL_MAGIC_HINTS → 判定为模型，直接放行（忽略 Content-Type 任何值）
	 *  - magic 命中 IMAGE_MAGIC_NUMBERS → 判定为图片，必须拦截
	 *  - magic 未知 + Content-Type image/* → 不拦截，仅 warn，交给 Three.js 加载器兜底
	 *  - magic 未知 + Content-Type 正常 → 放行
	 */
	private async verifyModelResource(url: string): Promise<void> {
		// ---- 0. 扩展名快速放行：扩展名明确为模型格式时跳过所有网络校验 ----
		// 原因：dweb://project-assets?path=xxx.glb 的扩展名只能从 path 参数提取；
		// 且用户右键文件夹能确认真实是 glb，魔数/CT 可能因为 protocol handler
		// 返回缩略图或缓存 PNG 而误判，扩展名明确时直接交由 Three.js Loader 兜底。
		const ext = extractUrlExt(url)
		const urlShort = (url || '').length > 120 ? url.slice(0, 117) + '...' : url
		if (ext && MODEL_EXT_WHITELIST.includes(ext)) {
			console.debug(
				`[Model3DEditor.verifyModelResource] 扩展名(${ext}) 命中白名单，跳过 Content-Type/魔数检测，交由 Three.js 真实加载。 url=${urlShort}, ext=${ext}, decision: EXT_PASS`
			)
			return
		}
		if (ext && IMAGE_EXT_BLACKLIST.includes(ext)) {
			console.warn(
				`[Model3DEditor.verifyModelResource] 扩展名(${ext}) 命中图片黑名单，直接拒绝。 url=${urlShort}, ext=${ext}, decision: BLOCK`
			)
			const msg = `文件扩展名(${ext}) 为图片格式，拒绝作为3D模型加载。`
			const err = new Error(`[Model3DEditor] ${msg}`)
			;(err as Error & { code?: string }).code = 'MODEL_RESPONSE_IMAGE_EXT'
			throw err
		}

		// ---- 1. 可选 HEAD 请求（仅作参考信息，不做拦截决策，失败忽略）----
		let headCt = ''
		try {
			const headResp = await fetch(url, { method: 'HEAD' })
			if (headResp.ok) headCt = headResp.headers.get('Content-Type') || ''
		} catch {
			/* HEAD 失败（CDN 常见问题）完全忽略，不影响 */
		}

		// ---- 2. 唯一的一次 Range GET 请求：同时获取 Content-Type + 字节 magic ----
		let rangeCt = ''
		let detected: { kind: 'image' | 'model' | 'unknown'; name: string } = {
			kind: 'unknown',
			name: 'empty'
		}
		try {
			const rangeResp = await fetch(url, {
				method: 'GET',
				headers: { Range: 'bytes=0-4095' }
			})
			if (rangeResp.ok) {
				rangeCt = rangeResp.headers.get('Content-Type') || ''
				const buf = await rangeResp.arrayBuffer()
				detected = detectMagicFromBytes(new Uint8Array(buf))
			} else {
				// Range 请求不被支持/403/404 等 → 不拦截，交由 Three.js 加载器抛出原始错误
				return
			}
		} catch (e) {
			// fetch 抛错（CORS/网络错误）→ 不做拦截决策，让后续 loader 自行报错
			return
		}

		// ---- 3. 最终决策：magic number 绝对权威 ----
		const finalCt = rangeCt || headCt
		const ctIsImage = isImageContentType(finalCt)

		if (detected.kind === 'model') {
			// 是模型：绝对放行，即使 Content-Type 误报为 image/png 也忽略
			if (ctIsImage) {
				console.warn(
					`[Model3DEditor.verifyModelResource] Content-Type(${finalCt}) 疑似误报为图片，但文件魔数检测为 ${detected.name}，按模型资源放行。 url=${urlShort}, ext=${ext}, headCt=${headCt}, rangeCt=${rangeCt}, magicDetected={kind:${detected.kind},name:${detected.name}}, decision: PASS`
				)
			} else {
				console.debug(
					`[Model3DEditor.verifyModelResource] url=${urlShort}, ext=${ext}, headCt=${headCt}, rangeCt=${rangeCt}, magicDetected={kind:${detected.kind},name:${detected.name}}, decision: PASS`
				)
			}
			return
		}

		if (detected.kind === 'image') {
			// 字节 magic 是图片：绝对拦截（不管 Content-Type 是什么）
			const msg = ctIsImage
				? `Content-Type(${finalCt}) 和 文件魔数(${detected.name}) 均为图片格式，拒绝作为3D模型加载。`
				: `文件魔数检测为图片格式(${detected.name})，拒绝作为3D模型加载。`
			console.warn(
				`[Model3DEditor.verifyModelResource] url=${urlShort}, ext=${ext}, headCt=${headCt}, rangeCt=${rangeCt}, magicDetected={kind:${detected.kind},name:${detected.name}}, decision: BLOCK`
			)
			const err = new Error(`[Model3DEditor] ${msg}`)
			;(err as Error & { code?: string }).code = ctIsImage
				? 'MODEL_RESPONSE_IMAGE_CT_MAGIC'
				: 'MODEL_RESPONSE_IMAGE_MAGIC'
			throw err
		}

		// detected.kind === 'unknown'
		if (ctIsImage) {
			// Content-Type 说是图片但 magic 未知：不要硬拦截！只打 warn，交给 Three.js 真实加载去做最终判定
			console.warn(
				`[Model3DEditor.verifyModelResource] Content-Type(${finalCt}) 为图片类型，但文件前 4KB 魔数未知；不拦截，交由 Three.js Loader 真实加载。 url=${urlShort}, ext=${ext}, headCt=${headCt}, rangeCt=${rangeCt}, magicDetected={kind:${detected.kind},name:${detected.name}}, decision: WARN_PASS`
			)
			return
		}

		console.debug(
			`[Model3DEditor.verifyModelResource] url=${urlShort}, ext=${ext}, headCt=${headCt}, rangeCt=${rangeCt}, magicDetected={kind:${detected.kind},name:${detected.name}}, decision: PASS`
		)
	}

	// @deprecated Use verifyModelResource() instead — this method is no-op to preserve future calls
	private async verifyModelResourceHead(url: string): Promise<void> {
		// 旧方法已弃用：防止误杀 Content-Type 误报的合法 GLB/gltf 模型资源
		return
		/* ---- 旧代码保留（不再执行）----
		try {
			let resp: Response | null = null
			try {
				resp = await fetch(url, { method: 'HEAD' })
			} catch {
				resp = null
			}
			if (!resp || !resp.ok) {
				try {
					resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-4095' } })
				} catch {
					resp = null
				}
			}
			if (resp && resp.ok) {
				const ct = resp.headers.get('Content-Type') || ''
				if (isImageContentType(ct)) {
					const err = new Error(
						`[Model3DEditor] 资源Content-Type为图片类型(${ct})，拒绝作为3D模型加载。`
					)
					;(err as Error & { code?: string }).code = 'MODEL_RESPONSE_IMAGE_CT'
					throw err
				}
			}
		} catch (e: unknown) {
			if (e instanceof Error && (e as any).code && String((e as any).code).startsWith('MODEL_')) throw e
		}
		*/
	}

	// @deprecated Use verifyModelResource() instead — this method is no-op to preserve future calls
	private async verifyModelResourceMagic(url: string): Promise<void> {
		// 旧方法已弃用：已合并进 verifyModelResource() 内统一处理，避免重复 2 次 Range 请求
		return
		/* ---- 旧代码保留（不再执行）----
		try {
			const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-4095' } })
			if (!resp.ok) return
			const buf = await resp.arrayBuffer()
			const bytes = new Uint8Array(buf)
			const detected = detectMagicFromBytes(bytes)
			if (detected.kind === 'image') {
				const err = new Error(
					`[Model3DEditor] 检测到文件头部魔数为图片格式(${detected.name})，拒绝作为3D模型加载。`
				)
				;(err as Error & { code?: string }).code = 'MODEL_RESPONSE_IMAGE_MAGIC'
				throw err
			}
		} catch (e: unknown) {
			if (e instanceof Error && (e as any).code && String((e as any).code).startsWith('MODEL_')) throw e
		}
		*/
	}

	/**
	 * 直接从 ArrayBuffer 解析 3D 模型（用 GLTFLoader.parse / OBJLoader.parse）。
	 * 用途：
	 *   1) dweb://project-assets 等 electron 自定义协议，Three.js FileLoader 不识别；
	 *   2) https://assets.meshy.ai CDN URL，浏览器端 CORS 拦截；
	 *   都通过 electron 主进程 fetchAsArrayBuffer 拿到 ArrayBuffer 后再解析。
	 */
	async loadModelFromArrayBuffer(
		buffer: ArrayBuffer,
		originUrl: string,
		onProgress?: (loaded: number, total: number) => void
	): Promise<any> {
		if (!buffer || buffer.byteLength === 0) {
			throw new Error('[Model3DEditor] loadModelFromArrayBuffer 收到空 buffer')
		}
		onProgress?.(buffer.byteLength, buffer.byteLength)
		const ext = extractUrlExt(originUrl) || ''
		if (ext === 'obj' && typeof (this.objLoader as any).parse === 'function') {
			const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
			return (this.objLoader as any).parse(text, '')
		}
		// 走 GLTFLoader.parse，通过 originUrl 作为 path 处理外部引用纹理
		return new Promise<any>((resolve, reject) => {
			this.gltfLoader.parse(
				buffer,
				'',
				(gltf: any) => resolve(gltf.scene),
				(err: any) => reject(err)
			)
		})
	}

	private loadModelFile(
		url: string,
		onProgress?: (loaded: number, total: number) => void
	): Promise<any> {
		return new Promise<any>(async (resolve, reject) => {
			try {
				await this.verifyModelResource(url)
			} catch (e: unknown) {
				reject(e)
				return
			}
			// ===== 核心修复：dweb:// 或 http(s):// 远程 CDN URL，一律先走 electron 主进程 fetchAsArrayBuffer 代理 =====
			//  1) dweb://project-assets?path=xxx.glb：Three.js FileLoader 会当成非法 URL 去发 HTTP GET → 404
			//  2) https://assets.meshy.ai/.../model.glb：浏览器端 CORS 直接拦截（Access-Control-Allow-Origin 缺失）
			//  解决方案：统一交给 electron 主进程 (无 CORS 限制，有 dweb 协议处理) 拿 ArrayBuffer，再 parse 解析
			if (isDwebOrRemoteHttpUrl(url) && typeof fetchAsArrayBuffer === 'function') {
				try {
					const shortUrl = url.length > 160 ? url.slice(0, 157) + '...' : url
					console.debug(
						`[Model3DEditor.loadModelFile] 使用 electron fetchAsArrayBuffer 代理加载(${isDwebOrRemoteHttpUrl(url) ? 'dweb/远程' : '本地'}): ${shortUrl}`
					)
					onProgress?.(0, 1)
					const fetchResult = await fetchAsArrayBuffer(url)
					if (fetchResult?.ok && fetchResult.buffer) {
						const view = fetchResult.buffer as Uint8Array
						const arrayBuffer = view.buffer.slice(
							view.byteOffset,
							view.byteOffset + view.byteLength
						) as ArrayBuffer
						const group = await this.loadModelFromArrayBuffer(arrayBuffer, url, onProgress)
						resolve(group)
						return
					}
					console.warn(
						`[Model3DEditor.loadModelFile] fetchAsArrayBuffer 返回非 ok，fallback 到 Three.js 原生加载：err=${
							fetchResult?.error || String(fetchResult)
						}`
					)
				} catch (e: unknown) {
					console.warn(
						`[Model3DEditor.loadModelFile] fetchAsArrayBuffer 代理加载失败，fallback 到 Three.js 原生加载：`,
						e
					)
				}
			}
			const ext = extractUrlExt(url) || url.split('.').pop()?.toLowerCase().split('?')[0] || ''
			if (ext === 'obj' && this.objLoader.load) {
				this.objLoader.load(
					url,
					(obj: any) => resolve(obj as unknown as any),
					(e: any) => onProgress?.(e.loaded, e.total),
					(err: any) => reject(err)
				)
			} else {
				this.gltfLoader.load(
					url,
					(gltf: any) => resolve(gltf.scene),
					(e: any) => onProgress?.(e.loaded, e.total),
					(err: any) => reject(err)
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
				this.selectedObject.traverseAncestors?.((a: any) => {
					if (a === model.group) isSelectedOrChild = true
				})
			}
			if (isSelectedOrChild) {
				this.clearSelection()
			}
		}
		model.wireframeHelpers.forEach((wireframe: any, mesh: any) => {
			mesh.remove(wireframe)
			wireframe.geometry.dispose()
			;(wireframe.material as any).dispose()
		})
		model.wireframeHelpers.clear()
		this.scene.remove(model.group)
		model.group.traverse((child: any) => {
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
		this.models.forEach((m: any) => {
			box.expandByObject(m.group)
		})
		if (box.isEmpty()) return
		this.applyCameraFrame(box)
	}

	private applyCameraFrame(box: any) {
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
		const gridMat = this.gridHelper.material as any
		if (Array.isArray(gridMat)) {
			gridMat.forEach((m: any) => {
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
		this.models.forEach((m: any) => {
			m.group.traverse((child: any) => {
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
		this.models.forEach((m: any) => {
			m.group.traverse((child: any) => {
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
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown, true)
		this.canvas.removeEventListener('pointerup', this.handlePointerUp, true)
		this.canvas.removeEventListener('wheel', this.handleWheel, { capture: true } as any)
		this.resizeObserver?.disconnect()
		this.controls.removeEventListener('change', this.handleControlsChange)
		this.controls.removeEventListener('start', this.handleControlsStart)
		this.controls.removeEventListener('end', this.handleControlsEnd)
		this.transformControls.removeEventListener(
			'dragging-changed',
			this.handleTransformDraggingChanged
		)
		this.transformControls.removeEventListener('objectChange', this.handleTransformChange)
		this.transformControls.removeEventListener('change', this.handleTransformChange)
		this.transformControls.removeEventListener('mouseUp', this.handleTransformMouseUp)
		this.transformControls.detach()
		this.scene.remove(this.transformHelper)
		this.transformControls.dispose()
		this.disposeCurrentRenderModeMaterials()
		this.models.forEach((model: any) => {
			model.wireframeHelpers.forEach((wireframe: any, mesh: any) => {
				mesh.remove(wireframe)
				wireframe.geometry.dispose()
				;(wireframe.material as any).dispose()
			})
			model.wireframeHelpers.clear()
			this.scene.remove(model.group)
			model.group.traverse((child: any) => {
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
			;(this.bgMesh.material as any).dispose()
		}
		this.dracoLoader.dispose()
		if (this.environmentTexture) this.environmentTexture.dispose()
		this.pmremGenerator.dispose()
		if (this.ssaoPass) this.ssaoPass.dispose()
		this.bloomPass.dispose()
		this.colorCorrectionPass.dispose()
		this.fxaaPass.dispose()
		this.composer.dispose()
		this.controls.dispose()
		this.renderer.dispose()
	}
}
