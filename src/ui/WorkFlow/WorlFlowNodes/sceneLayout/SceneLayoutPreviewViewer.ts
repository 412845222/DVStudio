/* three module is shimmed; runtime calls are valid, type references use custom Like types */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { isObject, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	WorkflowSceneLayoutItem,
	WorkflowSceneLayoutLightingControls,
	WorkflowSceneLayoutModelBinding,
	WorkflowUnrealResolvedConstraintDiagnostics,
	WorkflowUnrealResolvedLayoutExport,
	WorkflowUnrealResolvedLayoutSlot,
	WorkflowUnrealResolvedParentReference,
	WorkflowUnrealResolvedSurfaceSemantics,
	WorkflowSceneLightingPreviewConfig
} from '../../../../aiworkflow/types'

type AnchorPoint = { center: Vector3Like; base: Vector3Like; top: Vector3Like }
type RelationLine = {
	childId: string
	parentId: string
	placement: string
	line: LineLike
}
type TransformControlsDragEvent = { value: boolean }
type LightDefinition = {
	type?: unknown
	color?: unknown
	intensity?: unknown
	position?: { x?: unknown; y?: unknown; z?: unknown }
	target?: { x?: unknown; y?: unknown; z?: unknown }
	direction?: { x?: unknown; y?: unknown; z?: unknown }
	rotation?: { x?: unknown; y?: unknown; z?: unknown }
	width?: unknown
	height?: unknown
	distance?: unknown
	decay?: unknown
	angle?: unknown
	penumbra?: unknown
	castShadow?: unknown
	role?: unknown
	groundColor?: unknown
	emitMode?: unknown
}
type Disposable = { dispose(): void }
type TextureLike = Disposable
type MaterialWithMaps = Disposable & {
	map?: TextureLike | null
	normalMap?: TextureLike | null
	roughnessMap?: TextureLike | null
	metalnessMap?: TextureLike | null
	emissiveMap?: TextureLike | null
	aoMap?: TextureLike | null
	alphaMap?: TextureLike | null
	emissive?: { set: (color: string) => void }
	emissiveIntensity?: number
	opacity?: number
	color?: SettableColor
	groundColor?: SettableColor
}
type SettableColor = { set: (color: string) => void; getHexString: () => string }
type Vector2Like = { x: number; y: number; set(x: number, y: number): void }
type Vector3Like = {
	x: number
	y: number
	z: number
	clone(): Vector3Like
	copy(v: Vector3Like): Vector3Like
	set(x: number, y: number, z: number): Vector3Like
	add(v: Vector3Like): Vector3Like
	sub(v: Vector3Like): Vector3Like
	multiply(v: Vector3Like): Vector3Like
	multiplyScalar(s: number): Vector3Like
	normalize(): Vector3Like
	length(): number
	lengthSq(): number
	toArray(): number[]
}
type QuaternionLike = {
	x: number
	y: number
	z: number
	w: number
	clone(): QuaternionLike
	copy(q: QuaternionLike): QuaternionLike
	multiply(q: QuaternionLike): QuaternionLike
	setFromUnitVectors(from: Vector3Like, to: Vector3Like): QuaternionLike
	setFromEuler(euler: EulerLike): QuaternionLike
}
type EulerLike = {
	x: number
	y: number
	z: number
	clone(): EulerLike
	copy(e: EulerLike): EulerLike
	set(x: number, y: number, z: number, order?: string): EulerLike
}
type Matrix4Like = {
	copy(m: Matrix4Like): Matrix4Like
	invert(): Matrix4Like
	multiplyMatrices(a: Matrix4Like, b: Matrix4Like): Matrix4Like
	decompose(position: Vector3Like, quaternion: QuaternionLike, scale: Vector3Like): Matrix4Like
}
type Box3Like = {
	isEmpty(): boolean
	min: Vector3Like
	max: Vector3Like
	getSize(v: Vector3Like): Vector3Like
	getCenter(v: Vector3Like): Vector3Like
	setFromObject(obj: Object3Dlike): Box3Like
}
type Object3Dlike = {
	position: Vector3Like
	rotation: EulerLike
	quaternion: QuaternionLike
	scale: Vector3Like
	matrixWorld: Matrix4Like
	visible: boolean
	parent: Object3Dlike | null
	userData: Record<string, unknown>
	children: Object3Dlike[]
	material?: unknown
	geometry?: unknown
	clone(recursive?: boolean): Object3Dlike
	lookAt(x: number | Vector3Like, y?: number, z?: number): void
	updateMatrixWorld(force?: boolean): void
	traverse(callback: (object: Object3Dlike) => void): void
	add(...objects: Object3Dlike[]): Object3Dlike
	remove(...objects: Object3Dlike[]): Object3Dlike
	getWorldPosition(target: Vector3Like): Vector3Like
	getWorldQuaternion(target: QuaternionLike): QuaternionLike
	getWorldScale(target: Vector3Like): Vector3Like
}
type GltfTemplateLike = Object3Dlike
type MeshLike = Object3Dlike & {
	material: MaterialWithMaps | MaterialWithMaps[]
	geometry: Disposable
}
type ClonableMaterial = MaterialWithMaps & { clone(): ClonableMaterial }
type ClonableGeometry = Disposable & { clone?(): ClonableGeometry }
type DisposableMesh = Object3Dlike & {
	material: MaterialWithMaps | MaterialWithMaps[] | unknown
	geometry: (Disposable & { dispose(): void; clone?(): Disposable & { dispose(): void } }) | unknown
}
type BoundModelChild = Object3Dlike & {
	userData: { itemId?: unknown; isBoundModel?: boolean } & Record<string, unknown>
}
type LineLike = Object3Dlike & {
	material: { opacity?: number; dispose?: () => void }
	geometry: Disposable & { setFromPoints(points: Vector3Like[]): Disposable }
	computeLineDistances(): void
	renderOrder: number
}
type GroupLike = Object3Dlike
type HemisphereLightLike = LightLike & {
	groundColor: SettableColor
}
type LightLike = Object3Dlike & {
	color: SettableColor
	intensity: number
	position: Vector3Like
	target?: Object3Dlike
	distance?: number
	decay?: number
	angle?: number
	penumbra?: number
	castShadow?: boolean
	shadow?: { camera?: unknown }
	width?: number
	height?: number
}
type CameraLike = Object3Dlike & {
	aspect: number
	near: number
	far: number
	updateProjectionMatrix(): void
}
type PerspectiveCameraLike = CameraLike & {
	fov: number
}
type SceneLike = Object3Dlike & {
	background: unknown
	add(...objects: unknown[]): Object3Dlike
	remove(...objects: unknown[]): Object3Dlike
}
type RendererInfo = {
	memory?: { geometries?: number; textures?: number }
	render?: { calls?: number; triangles?: number; points?: number; lines?: number }
}
type WebGLRendererLike = {
	domElement: HTMLCanvasElement
	outputColorSpace: unknown
	setPixelRatio(value: number): void
	setClearColor(color: string, alpha: number): void
	setSize(width: number, height: number, updateStyle?: boolean): void
	render(scene: SceneLike, camera: CameraLike): void
	dispose(): void
	shadowMap: { enabled: boolean; type: unknown }
	toneMapping: unknown
	toneMappingExposure: number
	info: RendererInfo
}
type OrbitControlsLike = {
	enableDamping: boolean
	dampingFactor: number
	minDistance: number
	maxDistance: number
	target: Vector3Like
	enabled: boolean
	autoRotate?: boolean
	zoomSpeed?: number
	addEventListener(type: string, callback: (event?: unknown) => void): void
	removeEventListener(type: string, callback: (event?: unknown) => void): void
	update(): void
	dispose(): void
}
type TransformControlsLike = Object3Dlike & {
	visible: boolean
	enabled: boolean
	dragging: boolean
	object: Object3Dlike | null
	size: number
	showX: boolean
	showY: boolean
	showZ: boolean
	attach(object: Object3Dlike): void
	detach(): void
	setMode(mode: string): void
	setSpace(space: string): void
	getHelper?(): Object3Dlike
	addEventListener(type: string, callback: (event?: unknown) => void): void
	removeEventListener(type: string, callback: (event?: unknown) => void): void
	dispose(): void
}
type RaycasterLike = {
	setFromCamera(coords: Vector2Like, camera: CameraLike): void
	intersectObjects(objects: Object3Dlike[], recursive?: boolean): Array<{ object: Object3Dlike }>
}
type GLTFResult = {
	scene: Object3Dlike & { clone(recursive?: boolean): Object3Dlike }
}
type GLTFLoaderLike = {
	load(
		url: string,
		onLoad: (gltf: GLTFResult) => void,
		onProgress?: (event: { loaded: number; total: number }) => void,
		onError?: (err: unknown) => void
	): void
	loadAsync(
		url: string,
		onProgress?: (event: { loaded: number; total: number }) => void
	): Promise<GLTFResult>
}
type ViewerOptions = {
	onLayoutChange?: (items: WorkflowSceneLayoutItem[]) => void
	onSelectionChange?: (itemId: string) => void
	onModelLoadError?: (url: string, itemId: string) => void
	onCameraInteractionStart?: () => void
	onCameraInteractionEnd?: () => void
}

type SceneLayoutRenderOptions = {
	transparent?: boolean
	previewMode?: boolean
	modelBindings?: WorkflowSceneLayoutModelBinding[]
	hidePlaceholderCubes?: boolean
	lightingPreviewEnabled?: boolean
	lightingDebugEnabled?: boolean
	lightingJson?: string
	lightingControls?: WorkflowSceneLayoutLightingControls
}

export type SceneLayoutPreviewPerfSnapshot = {
	fps: number
	frameMs: number
	avgFrameMs: number
	renderMs: number
	avgRenderMs: number
	drawCalls: number
	triangles: number
	lines: number
	points: number
	geometries: number
	textures: number
}

type DragTransformBaseline = {
	itemId: string
	position: { x: number; y: number; z: number }
	rotation: { x: number; y: number; z: number }
}

const DRAG_POSITION_EPSILON = 0.06
const DRAG_ROTATION_EPSILON_RAD = THREE.MathUtils.degToRad(0.35)

const isDisposableTexture = (value: unknown): value is TextureLike => {
	return isObject(value) && typeof (value as { dispose?: unknown }).dispose === 'function'
}

const disposeMaterial = (material: MaterialWithMaps | MaterialWithMaps[]) => {
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
			if (value != null && isDisposableTexture(value)) value.dispose()
		}
		item.dispose()
	}
}

const cloneItem = (item: WorkflowSceneLayoutItem): WorkflowSceneLayoutItem => ({
	...item,
	position: { ...item.position },
	size: { ...item.size },
	rotation: item.rotation ? { ...item.rotation } : undefined,
	scale: item.scale ? { ...item.scale } : undefined,
	orientationFix: item.orientationFix ? { ...item.orientationFix } : undefined
})

export const safeNumber = (value: unknown, fallback: number) => {
	const num = Number(value)
	return Number.isFinite(num) ? num : fallback
}

export const isSameVec3 = (
	a: { x?: number; y?: number; z?: number } | undefined,
	b: { x?: number; y?: number; z?: number } | undefined
): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	return (
		safeNumber(a.x, 0) === safeNumber(b.x, 0) &&
		safeNumber(a.y, 0) === safeNumber(b.y, 0) &&
		safeNumber(a.z, 0) === safeNumber(b.z, 0)
	)
}

export const isSameSize = (
	a: { width?: number; height?: number; depth?: number } | undefined,
	b: { width?: number; height?: number; depth?: number } | undefined
): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	return (
		safeNumber(a.width, 0) === safeNumber(b.width, 0) &&
		safeNumber(a.height, 0) === safeNumber(b.height, 0) &&
		safeNumber(a.depth, 0) === safeNumber(b.depth, 0)
	)
}

export const isSameRotation = (
	a: { yaw?: number; pitch?: number; roll?: number } | undefined,
	b: { yaw?: number; pitch?: number; roll?: number } | undefined
): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	return (
		safeNumber(a.yaw, 0) === safeNumber(b.yaw, 0) &&
		safeNumber(a.pitch, 0) === safeNumber(b.pitch, 0) &&
		safeNumber(a.roll, 0) === safeNumber(b.roll, 0)
	)
}

export const isSameItem = (a: WorkflowSceneLayoutItem, b: WorkflowSceneLayoutItem): boolean => {
	if (a === b) return true
	if (a.id !== b.id) return false
	if (a.name !== b.name) return false
	if (a.color !== b.color) return false
	if (a.category !== b.category) return false
	if (a.subCategory !== b.subCategory) return false
	if (a.surfaceType !== b.surfaceType) return false
	if (a.material !== b.material) return false
	if (!isSameVec3(a.position, b.position)) return false
	if (!isSameSize(a.size, b.size)) return false
	if (!isSameVec3(a.scale, b.scale)) return false
	if (!isSameRotation(a.rotation, b.rotation)) return false
	if (a.inferred !== b.inferred) return false
	if (a.fitMode !== b.fitMode) return false
	if (a.fitMessage !== b.fitMessage) return false
	if (a.previewScaleMode !== b.previewScaleMode) return false
	if (a.fillMode !== b.fillMode) return false
	if (a.fillCount !== b.fillCount) return false
	if (a.fillAxisScale !== b.fillAxisScale) return false
	if (a.orientationFix?.mode !== b.orientationFix?.mode) return false
	if (a.orientationFix?.confidence !== b.orientationFix?.confidence) return false
	if (a.orientationFix?.yaw !== b.orientationFix?.yaw) return false
	if (a.orientationFix?.pitch !== b.orientationFix?.pitch) return false
	if (a.orientationFix?.roll !== b.orientationFix?.roll) return false
	if (a.parentId !== b.parentId) return false
	if (a.placement !== b.placement) return false
	if (a.supportSurface !== b.supportSurface) return false
	if (a.wallRole !== b.wallRole) return false
	if (a.semanticRole !== b.semanticRole) return false
	if (a.keyElementType !== b.keyElementType) return false
	if (a.mountType !== b.mountType) return false
	if (a.isKeyElement !== b.isKeyElement) return false
	if (a.fixedInRoom !== b.fixedInRoom) return false
	if (a.shouldTouchGround !== b.shouldTouchGround) return false
	const aHoles = Array.isArray(a.holePunches) ? a.holePunches.length : 0
	const bHoles = Array.isArray(b.holePunches) ? b.holePunches.length : 0
	if (aHoles !== bHoles) return false
	if (aHoles > 0) {
		for (let i = 0; i < aHoles; i++) {
			const ah = a.holePunches![i]
			const bh = b.holePunches![i]
			if (ah?.id !== bh?.id || ah?.targetItemId !== bh?.targetItemId || ah?.toolItemId !== bh?.toolItemId) return false
		}
	}
	return true
}

export const isSameItems = (a: WorkflowSceneLayoutItem[], b: WorkflowSceneLayoutItem[]): boolean => {
	if (a.length !== b.length) return false
	const len = a.length
	for (let i = 0; i < len; i++) {
		if (!isSameItem(a[i], b[i])) return false
	}
	return true
}

export const isSameBinding = (
	a: WorkflowSceneLayoutModelBinding | undefined,
	b: WorkflowSceneLayoutModelBinding | undefined
): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	if (a.objectId !== b.objectId) return false
	if (a.connected !== b.connected) return false
	if (a.modelUrl !== b.modelUrl) return false
	if (a.modelAssetUrl !== b.modelAssetUrl) return false
	if (a.sourceNodeId !== b.sourceNodeId) return false
	if (a.sourceNodeType !== b.sourceNodeType) return false
	return true
}

export const isSameBindings = (
	a: WorkflowSceneLayoutModelBinding[] | undefined,
	b: WorkflowSceneLayoutModelBinding[] | undefined
): boolean => {
	const arrA = Array.isArray(a)
		? a.filter((b) => b && b.connected && String(b.objectId ?? '').trim())
		: []
	const arrB = Array.isArray(b)
		? b.filter((b) => b && b.connected && String(b.objectId ?? '').trim())
		: []
	if (arrA.length !== arrB.length) return false
	const mapB = new Map(arrB.map((nb) => [String(nb.objectId ?? '').trim(), nb]))
	for (const na of arrA) {
		const key = String(na.objectId ?? '').trim()
		const existing = mapB.get(key)
		if (!isSameBinding(existing, na)) return false
	}
	return true
}

export type OrientationOffset = {
	yaw: number
	pitch: number
	roll: number
}

type OrientationCandidate = {
	offset: OrientationOffset
	size: { x: number; y: number; z: number }
	score: number
	scaleRatio: number
}

type ObjectSemanticClass =
	| 'floor-standing'
	| 'surface-placed'
	| 'wall-mounted'
	| 'ceiling-mounted'
	| 'support-surface'
	| 'wall-support'
	| 'structure'
	| 'unknown'

type AlignmentRule = {
	x: 'min' | 'center' | 'max'
	y: 'min' | 'center' | 'max'
	z: 'min' | 'center' | 'max'
}

export type FillAxis = 'x' | 'y' | 'z'

type FillSuggestion = {
	axis: FillAxis
	mode: 'fill-x' | 'fill-y' | 'fill-z'
	count: number
	axisScale: number
	score: number
}

type SceneLayoutFitMode = 'normal' | 'oriented' | 'filled' | 'forced'

type SceneLayoutActionResult = {
	ok: boolean
	applied: boolean
	mode: SceneLayoutFitMode
	message: string
}

const ORIENTATION_IMPROVEMENT_THRESHOLD = 0.32
const ORIENTATION_NEAR_MATCH_THRESHOLD = 0.06
const FILL_MATCH_TOLERANCE = 0.35
const FILL_MIN_COVERAGE = 1.02
const FILL_AXIS_SCALE_MIN = 0.55
const FILL_AXIS_SCALE_MAX = 1.45
const FILL_MAX_COUNT = 24

export const normalizeAngleDeg = (value: number) => {
	let next = Number.isFinite(value) ? value : 0
	while (next > 180) next -= 360
	while (next <= -180) next += 360
	return next
}

export const orientationOffsetEquals = (a: OrientationOffset, b: OrientationOffset, eps = 0.01) => {
	return (
		Math.abs(normalizeAngleDeg(a.yaw - b.yaw)) <= eps &&
		Math.abs(normalizeAngleDeg(a.pitch - b.pitch)) <= eps &&
		Math.abs(normalizeAngleDeg(a.roll - b.roll)) <= eps
	)
}

export const constrainManualOrientation = (offset: OrientationOffset): OrientationOffset => {
	const yaw = normalizeAngleDeg(offset.yaw)
	const pitch = normalizeAngleDeg(offset.pitch)
	const roll = normalizeAngleDeg(offset.roll)
	return { ...offset, yaw, pitch, roll }
}

export const roundOrientation = (value: number) => Math.round(normalizeAngleDeg(value) * 100) / 100

export const canonicalWallRole = (value: unknown) => {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase()
	if (!raw) return ''
	if (raw.includes('left') || raw.includes('左')) return 'left'
	if (raw.includes('right') || raw.includes('右')) return 'right'
	if (raw.includes('back') || raw.includes('rear') || raw.includes('后')) return 'back'
	if (raw.includes('front') || raw.includes('前')) return 'front'
	return raw
}

export const canonicalWallRoleYaw = (role: string) => {
	if (role === 'left') return 90
	if (role === 'right') return 270
	if (role === 'back') return 180
	return 0
}

export const isWallMountedSupportSurface = (item: WorkflowSceneLayoutItem) => {
	const placement = String(item.placement ?? '')
		.trim()
		.toLowerCase()
	const mountType = String(item.mountType ?? '')
		.trim()
		.toLowerCase()
	const semanticRole = String(item.semanticRole ?? '')
		.trim()
		.toLowerCase()
	const keyElementType = String(item.keyElementType ?? '')
		.trim()
		.toLowerCase()
	const relationTags = Array.isArray(item.relationTags)
		? item.relationTags.map((tag) =>
				String(tag ?? '')
					.trim()
					.toLowerCase()
			)
		: []
	if (
		!(
			placement.includes('wall') ||
			mountType.includes('wall') ||
			canonicalWallRole(item.wallRole).length > 0
		)
	)
		return false
	if (keyElementType === 'wall') return false
	if (keyElementType === 'window' || keyElementType === 'door' || keyElementType === 'opening')
		return false
	if (keyElementType === 'builtin-fixture' || keyElementType === 'fixed-installation') return false
	if (semanticRole.includes('wall-fixture')) return false
	if (semanticRole.includes('built-in-fixture') || semanticRole.includes('architectural-opening'))
		return false
	if (mountType.includes('embedded') || relationTags.includes('embedded')) return false
	const tokens = [
		String(item.name ?? ''),
		String(item.category ?? ''),
		String(item.subCategory ?? ''),
		semanticRole
	]
		.join(' ')
		.toLowerCase()
	return /(desk|table|workbench|workstation|counter|console|bench|board|desktop|台|桌|桌板|台板|台面|工作台|工位|操作台|长台|层板|搁板)/.test(
		tokens
	)
}

export const isDeskLikeSurface = (item: WorkflowSceneLayoutItem) => {
	if (isWallMountedSupportSurface(item)) return true
	const semanticRole = String(item.semanticRole ?? '')
		.trim()
		.toLowerCase()
	if (semanticRole === 'support-object') return true
	const tokens = [
		String(item.name ?? ''),
		String(item.category ?? ''),
		String(item.subCategory ?? ''),
		String(item.surfaceType ?? '')
	]
		.join(' ')
		.toLowerCase()
	return /(desk|table|workbench|workstation|counter|console|bench|台|桌|工作台|工位|岛台|桌面)/.test(
		tokens
	)
}

const resolvePlaceholderColor = (item: WorkflowSceneLayoutItem) => {
	if (typeof item.color === 'string' && item.color.trim()) return item.color
	const keyElementType = String(item.keyElementType ?? '')
		.trim()
		.toLowerCase()
	const semanticRole = String(item.semanticRole ?? '')
		.trim()
		.toLowerCase()
	const category = String(item.category ?? '')
		.trim()
		.toLowerCase()
	if (keyElementType === 'floor' || category === 'floor') return '#5b8bd9'
	if (keyElementType === 'wall' || isWallSurfaceLike(item)) return '#6d4acb'
	if (keyElementType === 'ceiling' || category === 'ceiling') return '#334155'
	if (keyElementType === 'column' || category === 'column') return '#2f6fdd'
	if (isDeskLikeSurface(item)) return '#8b5a2b'
	if (
		/monitor|computer|screen|display|tower|电脑|显示器|主机/.test(
			`${category} ${String(item.subCategory ?? '').toLowerCase()}`
		)
	)
		return '#d97706'
	if (/chair|seat|椅/.test(`${category} ${String(item.subCategory ?? '').toLowerCase()}`))
		return '#16a34a'
	if (
		semanticRole.includes('wall-fixture') ||
		/poster|decor|海报|贴纸/.test(`${category} ${String(item.subCategory ?? '').toLowerCase()}`)
	)
		return '#ec4899'
	if (semanticRole.includes('ceiling-fixture') || category === 'light') return '#eab308'
	return '#60a5fa'
}

const resolvePreviewDisplaySize = (item: WorkflowSceneLayoutItem) => {
	const width = Math.max(0.05, safeNumber(item.size.width, 1))
	const depth = Math.max(0.05, safeNumber(item.size.depth, 1))
	let height = Math.max(0.05, safeNumber(item.size.height, 1))
	if (isDeskLikeSurface(item)) {
		height = Math.max(height, isWallMountedSupportSurface(item) ? 0.14 : 0.18)
	}
	return { width, height, depth }
}

export const isWallSurfaceLike = (item: WorkflowSceneLayoutItem) => {
	const placement = String(item.placement ?? '')
		.trim()
		.toLowerCase()
	const supportSurface = String(item.supportSurface ?? '')
		.trim()
		.toLowerCase()
	const mountType = String(item.mountType ?? '')
		.trim()
		.toLowerCase()
	if (isWallMountedSupportSurface(item)) return false
	return (
		String(item.keyElementType ?? '')
			.trim()
			.toLowerCase() === 'wall' ||
		String(item.semanticRole ?? '')
			.trim()
			.toLowerCase()
			.includes('wall-fixture') ||
		placement.includes('wall') ||
		supportSurface.includes('wall') ||
		mountType.includes('wall') ||
		canonicalWallRole(item.wallRole).length > 0
	)
}

const snapWallAttachedItemToParentSurface = (
	item: WorkflowSceneLayoutItem,
	parent: WorkflowSceneLayoutItem | undefined
) => {
	if (!parent) return item
	const placement = String(item.placement ?? '')
		.trim()
		.toLowerCase()
	if (placement !== 'attached-to-wall') return item
	if (
		String(parent.keyElementType ?? '')
			.trim()
			.toLowerCase() !== 'wall'
	)
		return item
	const role = canonicalWallRole(item.wallRole || parent.wallRole)
	if (!role) return item
	const next = cloneItem(item)
	const wallDepth = Math.max(
		0.05,
		safeNumber(parent.size.depth, 0.2) * Math.max(0.01, safeNumber(parent.scale?.z ?? 1, 1))
	)
	const childDepth = Math.max(
		0.05,
		safeNumber(next.size.depth, 0.2) * Math.max(0.01, safeNumber(next.scale?.z ?? 1, 1))
	)
	const wallX = safeNumber(parent.position.x, 0)
	const wallZ = safeNumber(parent.position.z, 0)
	const offset = wallDepth * 0.5 + childDepth * 0.5 + 0.01
	const supportSurface = String(next.supportSurface ?? '')
		.trim()
		.toLowerCase()
	const currentDeltaX = safeNumber(next.position.x, wallX) - wallX
	const currentDeltaZ = safeNumber(next.position.z, wallZ) - wallZ
	const inferInteriorSign = (roleName: string) => {
		if (roleName === 'left' || roleName === 'right') {
			if (Math.abs(currentDeltaX) > 0.001) return currentDeltaX >= 0 ? 1 : -1
			if (Math.abs(wallX) > 0.001) return wallX < 0 ? 1 : -1
			return roleName === 'left' ? 1 : -1
		}
		if (Math.abs(currentDeltaZ) > 0.001) return currentDeltaZ >= 0 ? 1 : -1
		if (Math.abs(wallZ) > 0.001) return wallZ < 0 ? 1 : -1
		return roleName === 'front' ? 1 : -1
	}
	const interiorSign = inferInteriorSign(role)
	if (role === 'left' || role === 'right') next.position.x = wallX + offset * interiorSign
	else if (role === 'back' || role === 'front') next.position.z = wallZ + offset * interiorSign
	next.wallRole = role
	if (!supportSurface || supportSurface === 'wall') {
		next.supportSurface = role
	}
	return next
}

const compactWallMountedSupportSurface = (
	item: WorkflowSceneLayoutItem,
	children: WorkflowSceneLayoutItem[],
	parent: WorkflowSceneLayoutItem | undefined
) => {
	if (!isWallMountedSupportSurface(item)) return item
	const next = cloneItem(item)
	const role = canonicalWallRole(next.wallRole || parent?.wallRole)
	if (!role) return next
	const width = Math.max(0.05, safeNumber(next.size.width, 1))
	const height = Math.max(0.05, safeNumber(next.size.height, 1))
	const depth = Math.max(0.05, safeNumber(next.size.depth, 1))
	const placement = String(next.placement ?? '')
		.trim()
		.toLowerCase()
	const needsCompaction = height > 0.22 || depth > 1.35 || placement === 'on-floor'
	if (!needsCompaction) return next
	const supportedChildren = children.filter(
		(child) =>
			String(child.placement ?? '')
				.trim()
				.toLowerCase() === 'on-top'
	)
	const childMinY = supportedChildren.length
		? Math.min(...supportedChildren.map((child) => safeNumber(child.position.y, 0.9)))
		: safeNumber(next.position.y, 0) + height
	const minX = supportedChildren.length
		? Math.min(
				...supportedChildren.map(
					(child) =>
						safeNumber(child.position.x, 0) -
						Math.max(0.05, safeNumber(child.size.width, 0.5)) * 0.5
				)
			)
		: safeNumber(next.position.x, 0) - width * 0.5
	const maxX = supportedChildren.length
		? Math.max(
				...supportedChildren.map(
					(child) =>
						safeNumber(child.position.x, 0) +
						Math.max(0.05, safeNumber(child.size.width, 0.5)) * 0.5
				)
			)
		: safeNumber(next.position.x, 0) + width * 0.5
	const minZ = supportedChildren.length
		? Math.min(
				...supportedChildren.map(
					(child) =>
						safeNumber(child.position.z, 0) -
						Math.max(0.05, safeNumber(child.size.depth, 0.5)) * 0.5
				)
			)
		: safeNumber(next.position.z, 0) - depth * 0.5
	const maxZ = supportedChildren.length
		? Math.max(
				...supportedChildren.map(
					(child) =>
						safeNumber(child.position.z, 0) +
						Math.max(0.05, safeNumber(child.size.depth, 0.5)) * 0.5
				)
			)
		: safeNumber(next.position.z, 0) + depth * 0.5
	const childSpanX = Math.max(0, maxX - minX)
	const childSpanZ = Math.max(0, maxZ - minZ)
	const alongSpan = role === 'left' || role === 'right' ? childSpanZ : childSpanX
	const outwardSpan = role === 'left' || role === 'right' ? childSpanX : childSpanZ
	const nextHeight = Math.min(0.14, Math.max(0.08, height > 0.14 ? 0.1 : height))
	const nextDepth = Math.min(1.05, Math.max(0.45, outwardSpan + 0.2))
	next.size = {
		...next.size,
		width: Math.max(width, alongSpan + 0.36),
		height: nextHeight,
		depth: nextDepth
	}
	next.position = {
		...next.position,
		y: Math.max(0.68, childMinY - nextHeight),
		x: role === 'front' || role === 'back' ? (minX + maxX) * 0.5 : next.position.x,
		z: role === 'left' || role === 'right' ? (minZ + maxZ) * 0.5 : next.position.z
	}
	next.wallRole = role
	next.placement = 'attached-to-wall'
	next.supportSurface = role
	next.mountType = 'wall'
	next.shouldTouchGround = false
	return next
}

const buildOrientationCandidates = () => {
	const yawSet = [0, 90, 180, -90]
	const baseTilts: Array<{ pitch: number; roll: number }> = [
		{ pitch: 0, roll: 0 },
		{ pitch: 90, roll: 0 },
		{ pitch: -90, roll: 0 },
		{ pitch: 0, roll: 90 },
		{ pitch: 0, roll: -90 }
	]
	const out: OrientationOffset[] = []
	for (const tilt of baseTilts) {
		for (const yaw of yawSet) {
			out.push({ yaw, pitch: tilt.pitch, roll: tilt.roll })
		}
	}
	return out
}

export const fillModeToAxis = (mode: WorkflowSceneLayoutItem['fillMode']): FillAxis | null => {
	if (mode === 'fill-x') return 'x'
	if (mode === 'fill-y') return 'y'
	if (mode === 'fill-z') return 'z'
	return null
}

const fillAxisLabel = (axis: FillAxis) => {
	if (axis === 'x') return 'X'
	if (axis === 'y') return 'Y'
	return 'Z'
}

export type SceneLayoutViewState = {
	cameraPosition: { x: number; y: number; z: number }
	target: { x: number; y: number; z: number }
}

export class SceneLayoutPreviewViewer {
	private readonly renderer: WebGLRendererLike
	private readonly scene: SceneLike
	private readonly camera: CameraLike
	private readonly controls: OrbitControlsLike
	private readonly transformControls: TransformControlsLike
	private readonly transformHelper: Object3Dlike
	private readonly resizeObserver: ResizeObserver | null
	private readonly group: GroupLike
	private readonly lightsGroup: GroupLike
	private readonly raycaster: RaycasterLike
	private readonly pointer: Vector2Like
	private readonly meshesById = new Map<string, MeshLike>()
	private readonly edgesById = new Map<string, LineLike>()
	private readonly boundModelsById = new Map<string, GroupLike>()
	private readonly bindingById = new Map<string, WorkflowSceneLayoutModelBinding>()
	private readonly relationLines: RelationLine[] = []
	private readonly loader: GLTFLoaderLike
	private readonly modelTemplateCache = new Map<string, Promise<GltfTemplateLike>>()
	private readonly handlePointerDown: (event: PointerEvent) => void
	private readonly handlePointerMove: (event: PointerEvent) => void
	private readonly handleWheel: (event: WheelEvent) => void
	private readonly handleKeyDown: (event: KeyboardEvent) => void
	private disposed = false
	private raf = 0
	private lastRenderTs = 0
	private perfFpsEma = 0
	private perfFrameMsEma = 0
	private perfRenderMsEma = 0
	private perfFrameMsLast = 0
	private perfRenderMsLast = 0
	private layoutRevision = 0
	private currentItems: WorkflowSceneLayoutItem[] = []
	private selectedId = ''
	private dragDirty = false
	private dragBaseline: DragTransformBaseline | null = null
	private transparent = true
	private interactiveActive = false
	private orbiting = false
	private transforming = false
	private previewModeActive = false
	private renderSuspended = false
	private cameraDirty = false
	private hidePlaceholderCubes = false
	private lightingDebugEnabled = false
	private pendingBindingSync: Promise<void> | null = null
	private pendingBindingRevision = 0
	private idleTimer: ReturnType<typeof setInterval> | null = null
	private rightClickPickCache: { ts: number; x: number; y: number; itemId: string } | null = null
	private onCameraInteractionStart: (() => void) | null = null
	private onCameraInteractionEnd: (() => void) | null = null
	private readonly baseHemisphereLight: HemisphereLightLike
	private readonly baseDirectionalLight: LightLike
	private readonly baseDirectionalTarget: Object3Dlike
	private holePunchMode = false
	private holePunchStep: 'select-target' | 'select-tool' = 'select-target'
	private holePunchTargetId = ''
	private holePunchToolId = ''
	private readonly holePunchHighlightMeshes = new Map<string, MeshLike>()
	private readonly holedGeometryCache = new Map<string, { geometry: unknown; edgeGeometry: unknown }>()
	private onHolePunchStateChange: ((state: {
		mode: boolean
		step: 'select-target' | 'select-tool'
		targetId: string
		toolId: string
	}) => void) | null = null
	private exportLogCallback: ((message: string) => void) | null = null

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly options: ViewerOptions = {}
	) {
		this.scene = new THREE.Scene() as unknown as SceneLike
		this.scene.background = new THREE.Color('#0c1420')
		this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000) as unknown as PerspectiveCameraLike
		this.camera.position.set(360, 260, 420)
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance'
		}) as unknown as WebGLRendererLike
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping
		this.renderer.toneMappingExposure = 0.9
		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = THREE.PCFShadowMap
		this.renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5)))
		RectAreaLightUniformsLib.init()

		this.controls = new OrbitControls(this.camera, canvas) as unknown as OrbitControlsLike
		this.controls.enableDamping = false
		this.controls.zoomSpeed = 0.9
		this.controls.target.set(0, 40, 0)
		this.controls.enabled = false
		this.controls.addEventListener('change', this.handleControlsChange)
		this.controls.addEventListener('start', this.handleControlsStart)
		this.controls.addEventListener('end', this.handleControlsEnd)

		this.transformControls = new TransformControls(
			this.camera,
			canvas
		) as unknown as TransformControlsLike
		this.transformControls.setMode('translate')
		this.transformControls.setSpace('world')
		this.transformControls.size = 1.05
		this.transformControls.showX = true
		this.transformControls.showY = true
		this.transformControls.showZ = true
		this.transformHelper =
			typeof this.transformControls.getHelper === 'function'
				? this.transformControls.getHelper()
				: this.transformControls
		this.transformControls.addEventListener('dragging-changed', (event?: unknown) => {
			const dragEvent = event as TransformControlsDragEvent
			this.transforming = dragEvent.value === true
			this.controls.enabled = this.interactiveActive && !this.transforming
			if (dragEvent.value) {
				this.dragBaseline = this.captureSelectedDragBaseline()
				this.dragDirty = false
			} else {
				if (!this.dragDirty) this.restoreFromDragBaseline()
				if (this.dragDirty) this.emitLayoutChange()
				this.dragDirty = false
				this.dragBaseline = null
			}
			this.requestRender()
		})
		this.transformControls.addEventListener('objectChange', () => {
			if (!this.transforming) return
			this.syncSelectedObjectToItem()
			if (!this.dragDirty) this.dragDirty = this.hasMeaningfulDragDelta()
			this.requestRender()
		})
		this.scene.add(this.transformHelper)

		const hemi = new THREE.HemisphereLight('#dbeafe', '#1f2937', 1.25)
		const dir = new THREE.DirectionalLight('#ffffff', 1.5)
		dir.position.set(200, 300, 160)
		const dirTarget = new THREE.Object3D()
		dirTarget.position.set(0, 40, 0)
		dir.target = dirTarget
		this.scene.add(hemi)
		this.scene.add(dir)
		this.scene.add(dirTarget)
		this.baseHemisphereLight = hemi
		this.baseDirectionalLight = dir
		this.baseDirectionalTarget = dirTarget
		this.scene.add(new THREE.GridHelper(800, 20, '#64748b', '#334155'))
		this.scene.add(new THREE.AxesHelper(120))

		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(800, 800),
			new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.95, metalness: 0.02 })
		)
		floor.rotation.x = -Math.PI / 2
		floor.position.y = 0
		this.scene.add(floor)

		this.group = new THREE.Group() as unknown as GroupLike
		this.scene.add(this.group)
		this.lightsGroup = new THREE.Group() as unknown as GroupLike
		this.scene.add(this.lightsGroup)
		this.raycaster = new THREE.Raycaster() as unknown as RaycasterLike
		this.pointer = new THREE.Vector2() as unknown as Vector2Like
		this.loader = new GLTFLoader() as unknown as GLTFLoaderLike

		this.handlePointerDown = (event: PointerEvent) => {
			this.canvas.focus({ preventScroll: true })
			if (this.transformControls.dragging) return
			const button = Number(event.button)
			if (button === 2) {
				return
			}
			if (button === 1) {
				return
			}
			if (button !== 0) return
			this.pickObject(event)
			this.requestRender()
		}
		this.handlePointerMove = () => {
			if (!this.interactiveActive || (!this.orbiting && !this.transforming)) return
			this.requestRender()
		}
		this.handleWheel = () => {
			if (!this.interactiveActive) return
			this.requestRender()
		}
		this.handleKeyDown = (event: KeyboardEvent) => {
			const key = String(event.key ?? '').toLowerCase()
			if (key !== 'delete' && key !== 'backspace') return
			if (!this.selectedId) return
			event.preventDefault()
			event.stopPropagation()
			this.deleteSelectedItem()
		}

		this.canvas.addEventListener('pointerdown', this.handlePointerDown)
		this.canvas.addEventListener('pointermove', this.handlePointerMove, { passive: true })
		this.canvas.addEventListener('wheel', this.handleWheel, { passive: true })
		this.canvas.addEventListener('keydown', this.handleKeyDown)

		this.resize()
		this.requestRender()
		this.resizeObserver =
			typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null
		this.resizeObserver?.observe(this.canvas)

		this.onCameraInteractionStart = options.onCameraInteractionStart ?? null
		this.onCameraInteractionEnd = options.onCameraInteractionEnd ?? null
	}

	private handleControlsChange = () => {
		if (!this.interactiveActive) return
		this.requestRender()
	}

	private handleControlsStart = () => {
		if (!this.controls.enabled) return
		this.orbiting = true
		this.cameraDirty = true
		this.requestRender()
		this.onCameraInteractionStart?.()
	}

	private handleControlsEnd = () => {
		this.orbiting = false
		this.requestRender()
		this.onCameraInteractionEnd?.()
	}

	private requestRender() {
		if (this.disposed || this.renderSuspended) return
		if (this.raf) return
		this.raf = window.requestAnimationFrame(() => this.renderFrame())
	}

	private isObjectInSceneGraph(object: Object3Dlike | null | undefined) {
		let current: Object3Dlike | null = object ?? null
		while (current) {
			if (current === this.scene) return true
			current = current.parent
		}
		return false
	}

	private ensureTransformAttachmentValid() {
		const attached = this.transformControls.object
		if (!attached) return
		if (!this.isObjectInSceneGraph(attached)) {
			this.transformControls.detach()
			this.transformControls.visible = false
			return
		}
		if (this.selectedId) {
			const selectedMesh = this.meshesById.get(this.selectedId)
			if (selectedMesh !== attached) {
				this.transformControls.detach()
				this.transformControls.visible = false
			}
		}
	}

	private renderFrame() {
		this.raf = 0
		if (this.disposed || this.renderSuspended) return
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
		if (this.lastRenderTs > 0) {
			const frameDelta = Math.max(0, now - this.lastRenderTs)
			if (frameDelta > 0) {
				this.perfFrameMsLast = frameDelta
				this.perfFrameMsEma =
					this.perfFrameMsEma > 0 ? this.perfFrameMsEma * 0.82 + frameDelta * 0.18 : frameDelta
				const fps = 1000 / frameDelta
				this.perfFpsEma = this.perfFpsEma > 0 ? this.perfFpsEma * 0.82 + fps * 0.18 : fps
			}
		}
		this.lastRenderTs = now
		this.ensureTransformAttachmentValid()
		this.controls.update()
		const renderStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
		this.renderer.render(this.scene, this.camera)
		const renderEnd = typeof performance !== 'undefined' ? performance.now() : Date.now()
		const renderCost = Math.max(0, renderEnd - renderStart)
		this.perfRenderMsLast = renderCost
		this.perfRenderMsEma =
			this.perfRenderMsEma > 0 ? this.perfRenderMsEma * 0.82 + renderCost * 0.18 : renderCost
		if (this.controls.autoRotate === true && this.interactiveActive) {
			if (!this.raf) this.raf = window.requestAnimationFrame(() => this.renderFrame())
		}
	}

	getPerformanceSnapshot(): SceneLayoutPreviewPerfSnapshot {
		const info = this.renderer?.info
		const renderInfo = info?.render ?? {}
		const memoryInfo = info?.memory ?? {}
		return {
			fps: Number.isFinite(this.perfFpsEma) ? this.perfFpsEma : 0,
			frameMs: Number.isFinite(this.perfFrameMsLast) ? this.perfFrameMsLast : 0,
			avgFrameMs: Number.isFinite(this.perfFrameMsEma) ? this.perfFrameMsEma : 0,
			renderMs: Number.isFinite(this.perfRenderMsLast) ? this.perfRenderMsLast : 0,
			avgRenderMs: Number.isFinite(this.perfRenderMsEma) ? this.perfRenderMsEma : 0,
			drawCalls: Number(renderInfo.calls || 0),
			triangles: Number(renderInfo.triangles || 0),
			lines: Number(renderInfo.lines || 0),
			points: Number(renderInfo.points || 0),
			geometries: Number(memoryInfo.geometries || 0),
			textures: Number(memoryInfo.textures || 0)
		}
	}

	setRenderSuspended(suspended: boolean) {
		const prev = this.renderSuspended
		const next = suspended === true
		if (prev === next) return
		this.renderSuspended = next
		if (this.renderSuspended) {
			if (this.raf) cancelAnimationFrame(this.raf)
			this.raf = 0
			this.orbiting = false
			this.updateIdleLoop()
			return
		}
		this.requestRender()
		this.updateIdleLoop()
	}

	setInteractive(active: boolean) {
		const next = active === true
		if (this.interactiveActive === next) return
		this.interactiveActive = next
		this.controls.enabled = this.interactiveActive && !this.transforming
		this.transformControls.enabled = this.interactiveActive
		this.transformControls.visible = this.interactiveActive && !!this.selectedId
		if (!this.interactiveActive) this.orbiting = false
		this.requestRender()
		this.updateIdleLoop()
	}

	requestStaticFrames() {
		if (this.disposed || this.renderSuspended) return
		this.requestRender()
	}

	async awaitPendingBindingSync(timeoutMs = 2000) {
		const pending = this.pendingBindingSync
		if (!pending) return
		const timeout = Math.max(0, Math.floor(Number(timeoutMs) || 0))
		if (timeout <= 0) {
			await pending.catch(() => undefined)
			return
		}
		await Promise.race([
			pending.catch(() => undefined),
			new Promise<void>((resolve) => setTimeout(resolve, timeout))
		])
	}

	private isSameVec3(
		a: { x?: number; y?: number; z?: number } | undefined,
		b: { x?: number; y?: number; z?: number } | undefined
	): boolean {
		return isSameVec3(a, b)
	}

	private isSameRotation(
		a: { yaw?: number; pitch?: number; roll?: number } | undefined,
		b: { yaw?: number; pitch?: number; roll?: number } | undefined
	): boolean {
		return isSameRotation(a, b)
	}

	private isSameSize(
		a: { width?: number; height?: number; depth?: number } | undefined,
		b: { width?: number; height?: number; depth?: number } | undefined
	): boolean {
		return isSameSize(a, b)
	}

	private isSameItem(a: WorkflowSceneLayoutItem, b: WorkflowSceneLayoutItem): boolean {
		return isSameItem(a, b)
	}

	private isSameItems(newItems: WorkflowSceneLayoutItem[]): boolean {
		return isSameItems(this.currentItems, newItems)
	}

	private isSameBinding(
		a: WorkflowSceneLayoutModelBinding | undefined,
		b: WorkflowSceneLayoutModelBinding | undefined
	): boolean {
		return isSameBinding(a, b)
	}

	private isSameBindings(newBindings: WorkflowSceneLayoutModelBinding[] | undefined): boolean {
		const currentArr = Array.from(this.bindingById.values())
		return isSameBindings(currentArr, newBindings)
	}

	private updateRenderOptions(renderOptions?: SceneLayoutRenderOptions) {
		const prevHideCubes = this.hidePlaceholderCubes
		const prevTransparent = this.transparent
		const prevLightingDebug = this.lightingDebugEnabled

		this.transparent = renderOptions?.transparent !== false
		this.hidePlaceholderCubes = renderOptions?.hidePlaceholderCubes === true
		this.lightingDebugEnabled = renderOptions?.lightingDebugEnabled === true

		const previewMode = renderOptions?.previewMode === true
		const previewModeChanged = this.previewModeActive !== previewMode
		this.previewModeActive = previewMode
		if (previewModeChanged) this.cameraDirty = false

		if (prevHideCubes !== this.hidePlaceholderCubes) {
			for (const mesh of this.meshesById.values()) mesh.visible = !this.hidePlaceholderCubes
			for (const edge of this.edgesById.values()) edge.visible = !this.hidePlaceholderCubes
			if (this.hidePlaceholderCubes) {
				this.transformControls.detach()
				this.transformControls.visible = false
				this.selectedId = ''
			}
		}

		if (prevTransparent !== this.transparent) {
			for (const mesh of this.meshesById.values()) {
				const mat = mesh.material as typeof THREE.MeshStandardMaterial.prototype
				if (mat && typeof mat === 'object' && 'transparent' in mat) {
					mat.transparent = this.transparent
					mat.depthWrite = !this.transparent
				}
			}
		}

		const lightingEnabled = renderOptions?.lightingPreviewEnabled === true
		const lightingJson = String(renderOptions?.lightingJson ?? '')
		const lightingControls = renderOptions?.lightingControls
		this.applyLightingPreview(lightingEnabled, lightingJson, lightingControls)
	}

	setLayout(
		items: WorkflowSceneLayoutItem[],
		cameraCfg?: {
			position?: { x: number; y: number; z: number }
			target?: { x: number; y: number; z: number }
		} | null,
		renderOptions?: SceneLayoutRenderOptions,
		cachedView?: SceneLayoutViewState | null
	) {
		const previousSelection = this.selectedId

		const normalizedNewItems = this.normalizeItemsForPreview((items ?? []).map(cloneItem), renderOptions?.previewMode === true)
		const itemsSame = this.isSameItems(normalizedNewItems)
		const bindingsSame = this.isSameBindings(renderOptions?.modelBindings)

		if (itemsSame && bindingsSame) {
			this.updateRenderOptions(renderOptions)
			const effectiveCamera = cachedView
				? { position: cachedView.cameraPosition, target: cachedView.target }
				: cameraCfg
			this.applyCamera(effectiveCamera, {
				forcePreviewFrame: false,
				allowAutoFit: !cachedView
			})
			if (previousSelection && !this.hidePlaceholderCubes) {
				this.selectItem(previousSelection)
			}
			this.requestRender()
			return
		}

		this.layoutRevision += 1
		const revision = this.layoutRevision
		this.transparent = renderOptions?.transparent !== false
		const previewMode = renderOptions?.previewMode === true
		const previewModeChanged = this.previewModeActive !== previewMode
		this.previewModeActive = previewMode
		this.hidePlaceholderCubes = renderOptions?.hidePlaceholderCubes === true
		const prevItemIds = this.currentItems
			.map((i) => String(i.id ?? ''))
			.sort()
			.join('|')
		if (previewModeChanged) this.cameraDirty = false
		const bindingMap = new Map(
			(
				(Array.isArray(renderOptions?.modelBindings)
					? renderOptions!.modelBindings!
					: []) as WorkflowSceneLayoutModelBinding[]
			)
				.filter((binding) => binding && binding.connected && String(binding.objectId ?? '').trim())
				.map((binding) => [String(binding.objectId ?? '').trim(), binding])
		)
		this.currentItems = normalizedNewItems
		this.clearLayout()
		this.bindingById.clear()
		for (const [key, value] of bindingMap.entries()) this.bindingById.set(key, value)
		this.lightingDebugEnabled = renderOptions?.lightingDebugEnabled === true
		this.applyLightingPreview(
			renderOptions?.lightingPreviewEnabled === true,
			String(renderOptions?.lightingJson ?? ''),
			renderOptions?.lightingControls
		)
		const useTransparent = this.transparent
		for (const item of this.currentItems) {
			const posX = safeNumber(item.position.x, 0)
			const posY = safeNumber(item.position.y, 0)
			const posZ = safeNumber(item.position.z, 0)
			const scaleX = Math.max(0.01, safeNumber(item.scale?.x ?? 1, 1))
			const scaleY = Math.max(0.01, safeNumber(item.scale?.y ?? 1, 1))
			const scaleZ = Math.max(0.01, safeNumber(item.scale?.z ?? 1, 1))
			const yaw = safeNumber(item.rotation?.yaw ?? 0, 0)
			const pitch = safeNumber(item.rotation?.pitch ?? 0, 0)
			const roll = safeNumber(item.rotation?.roll ?? 0, 0)
			const hasBoundModel = previewMode && bindingMap.has(String(item.id ?? '').trim())
			const hasHolePunches = Array.isArray(item.holePunches) && item.holePunches.length > 0
			const cachedHoled = hasHolePunches ? this.holedGeometryCache.get(String(item.id ?? '').trim()) : null
			const displaySize = resolvePreviewDisplaySize(item)
			const width = displaySize.width * scaleX
			const height = displaySize.height * scaleY
			const depth = displaySize.depth * scaleZ
			let geometry: unknown
			let edgeGeometry: unknown
			if (cachedHoled && cachedHoled.geometry) {
				const geomCloneFn = (cachedHoled.geometry as Record<string, unknown>).clone as (() => unknown) | undefined
				geometry = geomCloneFn ? geomCloneFn.call(cachedHoled.geometry) : cachedHoled.geometry
				if (cachedHoled.edgeGeometry) {
					const edgeCloneFn = (cachedHoled.edgeGeometry as Record<string, unknown>).clone as (() => unknown) | undefined
					edgeGeometry = edgeCloneFn ? edgeCloneFn.call(cachedHoled.edgeGeometry) : cachedHoled.edgeGeometry
				} else {
					edgeGeometry = new THREE.EdgesGeometry(geometry as unknown)
				}
			} else {
				geometry = new THREE.BoxGeometry(width, height, depth)
				;(geometry as { translate: (x: number, y: number, z: number) => void }).translate(0, height / 2, 0)
				edgeGeometry = new THREE.EdgesGeometry(geometry as unknown)
			}
			const inferred = item.inferred === true
			const material = new THREE.MeshStandardMaterial({
				color: inferred ? '#cbd5e1' : resolvePlaceholderColor(item),
				transparent: useTransparent,
				opacity: useTransparent
					? hasBoundModel
						? inferred
							? 0.12
							: 0.18
						: inferred
							? 0.28
							: isDeskLikeSurface(item)
								? 0.76
								: 0.58
					: hasBoundModel
						? 0.22
						: inferred
							? 0.65
							: 1,
				depthWrite: !useTransparent,
				roughness: 0.42,
				metalness: 0.12,
				emissive: '#000000',
				emissiveIntensity: 0
			})
			const mesh = new THREE.Mesh(geometry as unknown, material)
			mesh.scale.set(1, 1, 1)
			mesh.position.set(posX, posY, posZ)
			mesh.rotation.y = (yaw * Math.PI) / 180
			mesh.rotation.x = (pitch * Math.PI) / 180
			mesh.rotation.z = (roll * Math.PI) / 180
			mesh.userData.itemId = item.id
			mesh.userData.label = item.name || item.id
			mesh.userData.isPlaceholder = true
			const edge = new THREE.LineSegments(
				edgeGeometry as unknown,
				new THREE.LineBasicMaterial({
					color: '#e2e8f0',
					transparent: true,
					opacity: hasBoundModel ? 0.25 : isDeskLikeSurface(item) ? 0.82 : 0.55
				})
			)
			edge.position.copy(mesh.position)
			edge.rotation.copy(mesh.rotation)
			edge.scale.set(1, 1, 1)
			mesh.visible = !this.hidePlaceholderCubes
			edge.visible = !this.hidePlaceholderCubes
			edge.renderOrder = 2
			this.group.add(mesh)
			this.group.add(edge)
			this.meshesById.set(item.id, mesh as unknown as MeshLike)
			this.edgesById.set(item.id, edge as unknown as LineLike)
		}
		this.buildRelationLines()
		const nextItemIds = this.currentItems
			.map((i) => String(i.id ?? ''))
			.sort()
			.join('|')
		if (prevItemIds !== nextItemIds) this.cameraDirty = false
		const effectiveCamera = cachedView
			? { position: cachedView.cameraPosition, target: cachedView.target }
			: cameraCfg
		this.applyCamera(effectiveCamera, {
			forcePreviewFrame: previewModeChanged,
			allowAutoFit: !cachedView
		})
		this.selectItem(this.hidePlaceholderCubes ? '' : previousSelection)
		this.requestRender()
		if (previewMode && bindingMap.size) {
			this.pendingBindingRevision = revision
			this.pendingBindingSync = this.syncModelBindings(revision, bindingMap)
				.then(() => undefined)
				.finally(() => {
					if (this.pendingBindingRevision === revision) this.pendingBindingSync = null
				})
		} else {
			this.pendingBindingRevision = revision
			this.pendingBindingSync = null
		}
	}

	async exportResolvedLayoutForUnreal(): Promise<WorkflowUnrealResolvedLayoutExport> {
		const revision = this.layoutRevision
		if (this.pendingBindingSync) {
			await this.pendingBindingSync
		}
		if (this.disposed || revision !== this.layoutRevision) {
			return {
				generatedAt: Date.now(),
				sourceItemCount: this.currentItems.length,
				slotCount: 0,
				actorOrigin: { x: 0, y: 0, z: 0 },
				warnings: [t('aiworkflow.scenePreview.warningLayoutChanged')],
				slots: []
			}
		}

		// 强制更新整个场景的世界矩阵，确保所有模型的matrixWorld是最新的
		this.group.updateMatrixWorld(true)

		const warnings: string[] = []
		const slots: WorkflowUnrealResolvedLayoutSlot[] = []
		const actorOrigin = { x: 0, y: 0, z: 0 }

		// 彻底扫描Three.js场景，找出所有真实模型
		// 策略：
		// 1. 遍历group的所有直接子对象
		// 2. 排除：占位体方块(isPlaceholder=true)、线条(THREE.Line/LineSegments)、辅助对象
		// 3. 对于剩余对象，检查是否包含Mesh几何体（来自glb/fbx加载的真实模型）
		// 4. 优先使用isBoundModel标记，同时也检测未标记但有几何体的模型
		// 5. 从userData中恢复模型源信息(modelUrl等)
		const sceneBoundModels = new Map<string, GroupLike>()
		const sceneModelUserData = new Map<string, Record<string, unknown>>()
		
		const isLineObject = (obj: unknown): boolean => {
			if (!obj) return true
			const o = obj as { isLine?: boolean; isLineSegments?: boolean; type?: string }
			return o.isLine === true || o.isLineSegments === true || o.type === 'Line' || o.type === 'LineSegments'
		}
		
		const hasGeometry = (obj: unknown): boolean => {
			if (!obj) return false
			const o = obj as { isMesh?: boolean; geometry?: unknown; children?: unknown[] }
			if (o.isMesh === true && o.geometry) return true
			if (Array.isArray(o.children)) {
				return o.children.some((child) => hasGeometry(child))
			}
			return false
		}
		
		for (const child of this.group.children as unknown as BoundModelChild[]) {
			if (!child) continue
			if (child.userData?.isPlaceholder === true) continue
			if (isLineObject(child)) continue
			
			let modelRoot: BoundModelChild | null = null
			let modelItemId = ''
			
			// 首先查找isBoundModel标记
			if (child.userData?.isBoundModel === true) {
				modelRoot = child
				modelItemId = String(child.userData?.itemId ?? '').trim()
			} else {
				child.traverse((entry: Object3Dlike) => {
					if (modelRoot) return
					const entryChild = entry as unknown as BoundModelChild
					if (entryChild.userData?.isBoundModel === true) {
						modelRoot = entryChild
						modelItemId = String(entryChild.userData?.itemId ?? '').trim()
					}
				})
			}
			
			// 如果没找到isBoundModel标记，但该对象包含Mesh几何体，也视为真实模型
			if (!modelRoot && hasGeometry(child)) {
				modelRoot = child
				// 尝试从子节点获取itemId
				child.traverse((entry: Object3Dlike) => {
					if (modelItemId) return
					const entryChild = entry as unknown as BoundModelChild
					const id = String(entryChild.userData?.itemId ?? '').trim()
					if (id) modelItemId = id
				})
				if (!modelItemId) {
					modelItemId = `__scene_model_${sceneBoundModels.size}`
				}
			}
			
			if (modelRoot && modelItemId) {
				// 找到最上层的模型根节点
				let rootNode = modelRoot
				while (rootNode.parent && rootNode.parent !== this.group) {
					const parent = rootNode.parent as unknown as BoundModelChild
					if (parent.userData?.isBoundModel === true || hasGeometry(parent)) {
						rootNode = parent
					} else {
						break
					}
				}
				if (!sceneBoundModels.has(modelItemId)) {
					sceneBoundModels.set(modelItemId, rootNode as unknown as GroupLike)
					// 收集userData中的模型源信息
					const userData = rootNode.userData as Record<string, unknown>
					if (userData) {
						sceneModelUserData.set(modelItemId, userData)
					}
				}
			}
		}

		// 合并boundModelsById和场景扫描结果，确保所有真实模型都被包含
		const allBoundModels = new Map<string, GroupLike>()
		for (const [id, model] of this.boundModelsById.entries()) {
			allBoundModels.set(id, model)
		}
		for (const [id, model] of sceneBoundModels.entries()) {
			if (!allBoundModels.has(id)) {
				allBoundModels.set(id, model)
				warnings.push(t('aiworkflow.scenePreview.warningModelNotInBinding', { id }))
			}
		}

		// 收集所有需要处理的itemId：currentItems中的 + 场景中发现的额外模型
		const processedItemIds = new Set<string>()
		const itemsToProcess: Array<{ item: WorkflowSceneLayoutItem | null; itemId: string }> = []
		
		for (const item of this.currentItems) {
			const itemId = String(item.id ?? '').trim()
			if (!itemId) continue
			itemsToProcess.push({ item, itemId })
			processedItemIds.add(itemId)
		}
		
		// 添加场景中发现但currentItems中没有的模型
		for (const itemId of sceneBoundModels.keys()) {
			if (!processedItemIds.has(itemId)) {
				const existingItem = this.currentItems.find(i => String(i.id ?? '').trim() === itemId)
				itemsToProcess.push({ item: existingItem ?? null, itemId })
				processedItemIds.add(itemId)
			}
		}

		for (const { item, itemId } of itemsToProcess) {
			let binding = this.bindingById.get(itemId)
			const boundModel = allBoundModels.get(itemId)
			
			if (!boundModel) {
				if (item) {
					warnings.push(t('aiworkflow.scenePreview.warningPlaceholderNoResult', { name: item.name || itemId }))
				}
				continue
			}
			
			// 如果bindingById中没有有效的binding，尝试从场景模型userData中恢复
			if (!binding?.connected) {
				const sceneUserData = sceneModelUserData.get(itemId)
				if (sceneUserData) {
					const modelUrl = String(sceneUserData.modelUrl ?? '').trim()
					const modelAssetUrl = String(sceneUserData.modelAssetUrl ?? '').trim()
					if (modelUrl || modelAssetUrl) {
						const rawSourceType = String(sceneUserData.sourceNodeType ?? '').trim()
						const validSourceType = (rawSourceType === 'model3d' || rawSourceType === 'meshy' || rawSourceType === 'manual')
							? rawSourceType
							: 'model3d' as const
						binding = {
							objectId: itemId,
							inputAnchorId: `in-model-${itemId}`,
							connected: true,
							sourceNodeId: String(sceneUserData.sourceNodeId ?? '').trim() || undefined,
							sourceNodeType: validSourceType,
							modelUrl: modelUrl || undefined,
							modelAssetUrl: modelAssetUrl || undefined,
							modelSourcePath: String(sceneUserData.modelSourcePath ?? '').trim() || undefined,
							modelAssetPath: String(sceneUserData.modelAssetPath ?? '').trim() || undefined,
							modelSourceName: String(sceneUserData.modelSourceName ?? '').trim() || undefined,
							modelFormat: sceneUserData.modelFormat === 'gltf' || sceneUserData.modelFormat === 'glb'
								? sceneUserData.modelFormat
								: undefined
						}
					}
				}
			}
			
			if (!binding?.connected) {
				// 如果模型在场景中存在但没有绑定信息，我们仍然导出它，因为它确实在Three.js中渲染了
				// 但需要记录警告
				const displayName = item?.name || itemId
				warnings.push(t('aiworkflow.scenePreview.warningModelIncompleteBinding', { name: displayName }))
			}
			
			const placeholderMesh = this.meshesById.get(itemId)
			const placeholderTransform = placeholderMesh
				? this.captureObjectTransform(placeholderMesh)
				: null
			const placeholderBounds = placeholderMesh ? this.captureObjectBounds(placeholderMesh) : null
			const instances =
				Array.isArray(boundModel.children) && boundModel.children.length
					? boundModel.children.slice()
					: [boundModel]
			const cloneCount = Math.max(instances.length, 1)
			const parentReferenceResult = item 
				? this.buildParentReference(item, boundModel, actorOrigin)
				: { warnings: [], parentReference: { mode: 'root' as const, relativeTransform: this.captureObjectTransform(boundModel, actorOrigin) } }
			if (parentReferenceResult.warnings.length) warnings.push(...parentReferenceResult.warnings)
			const slotTransform =
				parentReferenceResult.parentReference.relativeTransform ??
				this.captureObjectTransform(boundModel, actorOrigin)
			const normalizedParentSlotId =
				parentReferenceResult.parentReference.mode === 'parent-slot'
					? parentReferenceResult.parentReference.targetSlotId
					: undefined
			const normalizedParentSourceObjectId =
				parentReferenceResult.parentReference.mode === 'parent-slot'
					? parentReferenceResult.parentReference.targetObjectId
					: undefined
			const surfaceSemantics = item ? this.buildSurfaceSemantics(item) : undefined
			const constraintDiagnostics: WorkflowUnrealResolvedConstraintDiagnostics = {
				exportMode:
					parentReferenceResult.parentReference.mode === 'parent-slot'
						? 'parent-relative'
						: 'root-relative',
				notes: parentReferenceResult.warnings.length
					? [...parentReferenceResult.warnings]
					: undefined
			}
			for (let index = 0; index < instances.length; index += 1) {
				const instance = instances[index]
				const slotId = cloneCount > 1 ? `${itemId}__clone_${index + 1}` : itemId
				const sourceName = item ? (String(item.name ?? itemId).trim() || itemId) : itemId
				const orientationMode =
					item?.orientationFix?.mode === 'manual' ? ('manual' as const) : ('auto' as const)
				const fitMode = item
					? item.fitMode === 'forced'
						? ('forced' as const)
						: item.fitMode === 'filled'
							? ('filled' as const)
							: item.fitMode === 'oriented'
								? ('oriented' as const)
								: ('normal' as const)
					: ('normal' as const)
				const fillMode = item
					? item.fillMode === 'fill-x' || item.fillMode === 'fill-y' || item.fillMode === 'fill-z'
						? item.fillMode
						: 'single'
					: 'single'
				const manualAdjustmentApplied =
					orientationMode === 'manual' ||
					fitMode === 'forced' ||
					(fillMode !== 'single' && Math.max(1, Number(item?.fillCount ?? 1)) > 1)
				// 直接从Three.js世界矩阵分解变换（position/quaternion/scale），不做任何手动覆盖
				// 世界矩阵已经包含了所有变换：位置、rotation(yaw/pitch/roll)、orientationFix朝向修正、缩放、对齐等
				instance.updateMatrixWorld(true)
				const meshWorldTransform = this.captureObjectTransform(instance)
				const meshTransform = meshWorldTransform
				const previewInstanceTransform = this.captureObjectTransform(instance, actorOrigin)
				const previewInstanceWorldTransform = meshWorldTransform
				slots.push({
					slotId,
					sourceSlotId: itemId,
					parentSlotId: normalizedParentSlotId,
					parentSourceObjectId: normalizedParentSourceObjectId,
					sourceObjectId: itemId,
					sourceObjectName: sourceName,
					displayName: cloneCount > 1 ? `${sourceName} [${index + 1}/${cloneCount}]` : sourceName,
					cloneIndex: index,
					cloneCount,
					isClone: cloneCount > 1,
					previewScaleMode: item?.previewScaleMode,
					fitMode: item?.fitMode,
					fillMode: item?.fillMode,
					fillCount: item && Number.isFinite(Number(item.fillCount)) ? Number(item.fillCount) : undefined,
					fillAxisScale: item && Number.isFinite(Number(item.fillAxisScale))
						? Number(item.fillAxisScale)
						: undefined,
					materialOverrides: item && Array.isArray(item.materialOverrides)
						? item.materialOverrides.map((entry) => ({ ...entry }))
						: undefined,
					relationTags: item && Array.isArray(item.relationTags) ? [...item.relationTags] : undefined,
					notes: item ? (String(item.fitMessage ?? item.description ?? '').trim() || undefined) : undefined,
					surfaceSemantics,
					parentReference: parentReferenceResult.parentReference,
					constraintDiagnostics,
					modelBinding: binding ? {
						sourceNodeId: binding.sourceNodeId,
						sourceNodeType: binding.sourceNodeType,
						modelUrl: binding.modelUrl,
						modelAssetUrl: binding.modelAssetUrl,
						modelSourcePath: binding.modelSourcePath,
						modelAssetPath: binding.modelAssetPath,
						modelSourceName: binding.modelSourceName,
						modelFormat: binding.modelFormat
					} : undefined,
					slotTransform,
					meshTransform,
					previewInstanceTransform,
					previewInstanceWorldTransform,
					worldTransform: previewInstanceWorldTransform,
					relativeTransform: previewInstanceTransform,
					worldBounds: this.captureObjectBounds(instance),
					placeholderTransform,
					placeholderBounds,
					manualAdjustmentApplied,
					manualAdjustment: {
						orientationMode,
						fitMode,
						fillMode
					}
				})
			}
		}

		return {
			generatedAt: Date.now(),
			sourceItemCount: this.currentItems.length,
			slotCount: slots.length,
			actorOrigin,
			warnings,
			slots
		}
	}

	private applyBrowseBaseLights() {
		this.baseHemisphereLight.color.set('#dbeafe')
		this.baseHemisphereLight.groundColor.set('#475569')
		this.baseHemisphereLight.intensity = 0.9
		this.baseDirectionalLight.color.set('#ffffff')
		this.baseDirectionalLight.intensity = 1.36
		this.baseDirectionalLight.position.set(175, 255, 235)
		this.baseDirectionalTarget.position.set(0, 55, 0)
		this.renderer.toneMappingExposure = 1.06
	}

	private applyPreviewBaseLights() {
		this.baseHemisphereLight.color.set('#dcecff')
		this.baseHemisphereLight.groundColor.set('#2d3748')
		this.baseHemisphereLight.intensity = 0.72
		this.baseDirectionalLight.color.set('#f8fbff')
		this.baseDirectionalLight.intensity = 1.08
		this.baseDirectionalLight.position.set(165, 235, 185)
		this.baseDirectionalTarget.position.set(0, 45, 0)
		this.renderer.toneMappingExposure = 1.08
	}

	private clearLightingPreview() {
		while (this.lightsGroup.children.length) {
			const child = this.lightsGroup.children.pop()
			if (!child) continue
			if (child.parent) child.parent.remove(child)
		}
	}

	private applyColor(target: SettableColor | null | undefined, value: unknown) {
		const text = String(value ?? '').trim()
		if (!text || !target?.set) return
		try {
			target.set(text)
		} catch {
			// ignore invalid colors
		}
	}

	private normalizeVector3(
		raw: { x?: unknown; y?: unknown; z?: unknown } | null | undefined,
		fallback: { x: number; y: number; z: number }
	) {
		const rx = raw?.x
		const ry = raw?.y
		const rz = raw?.z
		return new THREE.Vector3(
			Number.isFinite(Number(rx)) ? Number(rx) : fallback.x,
			Number.isFinite(Number(ry)) ? Number(ry) : fallback.y,
			Number.isFinite(Number(rz)) ? Number(rz) : fallback.z
		)
	}

	private clampNumber(value: unknown, min: number, max: number, fallback: number) {
		const num = Number(value)
		if (!Number.isFinite(num)) return fallback
		return Math.min(max, Math.max(min, num))
	}

	private normalizeLightingType(raw: unknown) {
		const text = String(raw ?? '')
			.trim()
			.toLowerCase()
			.replace(/[_\s]+/g, '-')
		if (text === 'rectarea' || text === 'rect-light' || text === 'area' || text === 'area-light')
			return 'rect-area'
		if (text === 'dir' || text === 'direction') return 'directional'
		return text || 'point'
	}

	private toRadians(value: unknown) {
		const num = Number(value)
		if (!Number.isFinite(num)) return 0
		if (Math.abs(num) > Math.PI * 2) return (num * Math.PI) / 180
		return num
	}

	private resolveAtmosphereSettings(config: WorkflowSceneLightingPreviewConfig) {
		const preset = String(config.atmosphere?.preset ?? config.lightingStyle ?? '')
			.trim()
			.toLowerCase()
		const brightness = String(config.atmosphere?.brightness ?? '')
			.trim()
			.toLowerCase()
		const presetMap: Record<
			string,
			{ intensityScale: number; exposure: number; environmentIntensity: number }
		> = {
			'soft-daylight-interior': {
				intensityScale: 1.16,
				exposure: 1.08,
				environmentIntensity: 0.38
			},
			'cozy-warm-evening': { intensityScale: 1.02, exposure: 1.02, environmentIntensity: 0.3 },
			'moody-cinematic': { intensityScale: 1.08, exposure: 1.04, environmentIntensity: 0.3 },
			'focused-task-studio': { intensityScale: 1.08, exposure: 1.06, environmentIntensity: 0.34 },
			'bright-showroom': { intensityScale: 1.2, exposure: 1.12, environmentIntensity: 0.42 }
		}
		const presetSettings = presetMap[preset] ?? {
			intensityScale: 1.06,
			exposure: 1.04,
			environmentIntensity: 0.32
		}
		const brightnessScale =
			brightness === 'low'
				? 1.02
				: brightness === 'high'
					? 1.1
					: brightness === 'low-medium'
						? 1.06
						: 1.04
		const intensityScale =
			this.clampNumber(
				config.globalSettings?.intensityScale ??
					config.atmosphere?.intensityScale ??
					presetSettings.intensityScale,
				0.45,
				1.8,
				presetSettings.intensityScale
			) * brightnessScale
		const exposure = this.clampNumber(
			config.globalSettings?.exposure,
			0.42,
			1.12,
			presetSettings.exposure
		)
		const environmentIntensity = this.clampNumber(
			config.globalSettings?.environmentIntensity,
			0.02,
			0.28,
			presetSettings.environmentIntensity
		)
		return { preset, intensityScale, exposure, environmentIntensity }
	}

	private resolveLightingControlOverrides(raw?: WorkflowSceneLayoutLightingControls) {
		return {
			masterIntensity: this.clampNumber(raw?.masterIntensity, 0, 2.5, 1),
			exposure: this.clampNumber(raw?.exposure, 0.4, 2.5, 1),
			ambient: this.clampNumber(raw?.ambient, 0, 2.5, 1),
			hemisphere: this.clampNumber(raw?.hemisphere, 0, 2.5, 1),
			directional: this.clampNumber(raw?.directional, 0, 2.5, 1),
			point: this.clampNumber(raw?.point, 0, 2.5, 1),
			spot: this.clampNumber(raw?.spot, 0, 2.5, 1),
			rectArea: this.clampNumber(raw?.rectArea, 0, 2.5, 1)
		}
	}

	private getLightingTypeScale(
		type: string,
		controls: ReturnType<SceneLayoutPreviewViewer['resolveLightingControlOverrides']>
	) {
		if (type === 'ambient') return controls.masterIntensity * controls.ambient
		if (type === 'hemisphere') return controls.masterIntensity * controls.hemisphere
		if (type === 'directional') return controls.masterIntensity * controls.directional
		if (type === 'spot') return controls.masterIntensity * controls.spot
		if (type === 'rect-area') return controls.masterIntensity * controls.rectArea
		return controls.masterIntensity * controls.point
	}

	private clampLightIntensity(type: string, intensity: unknown, scale = 1) {
		const raw = Math.max(0, Number(intensity ?? 0)) * Math.max(0.1, scale)
		if (type === 'ambient') return Math.min(raw, 0.4)
		if (type === 'hemisphere') return Math.min(raw, 0.58)
		if (type === 'directional') return Math.min(raw, 2.2)
		if (type === 'spot') return Math.min(raw, 5.2)
		if (type === 'rect-area') return Math.min(raw, 18)
		return Math.min(raw, 4.2)
	}

	private getSceneScaleHint() {
		if (!this.currentItems.length) return 3.5
		let minX = Infinity
		let maxX = -Infinity
		let minY = Infinity
		let maxY = -Infinity
		let minZ = Infinity
		let maxZ = -Infinity
		for (const item of this.currentItems) {
			const width = Math.max(
				0.05,
				safeNumber(item.size.width, 1) * Math.max(0.01, safeNumber(item.scale?.x ?? 1, 1))
			)
			const height = Math.max(
				0.05,
				safeNumber(item.size.height, 1) * Math.max(0.01, safeNumber(item.scale?.y ?? 1, 1))
			)
			const depth = Math.max(
				0.05,
				safeNumber(item.size.depth, 1) * Math.max(0.01, safeNumber(item.scale?.z ?? 1, 1))
			)
			const posX = safeNumber(item.position.x, 0)
			const posY = safeNumber(item.position.y, 0)
			const posZ = safeNumber(item.position.z, 0)
			minX = Math.min(minX, posX - width * 0.5)
			maxX = Math.max(maxX, posX + width * 0.5)
			minY = Math.min(minY, posY)
			maxY = Math.max(maxY, posY + height)
			minZ = Math.min(minZ, posZ - depth * 0.5)
			maxZ = Math.max(maxZ, posZ + depth * 0.5)
		}
		const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
		return Math.max(2.5, Math.min(12, span))
	}

	private applyRoleIntensityBias(type: string, role: unknown, intensity: number) {
		const roleText = String(role ?? '')
			.trim()
			.toLowerCase()
		let factor = 1
		if (roleText === 'fill') factor = 1.04
		else if (roleText === 'accent') factor = 1.22
		else if (roleText === 'practical') factor = 1.36
		else if (roleText === 'rim' || roleText === 'back' || roleText === 'backlight') factor = 0.72
		else if (roleText === 'key') factor = 1
		if (type === 'rect-area' && roleText === 'key') factor *= 0.96
		return intensity * factor
	}

	private adjustRectAreaPreviewIntensity(intensity: number, lightDef: LightDefinition) {
		const width = this.clampNumber(lightDef?.width, 0.02, 24, 1.2)
		const height = this.clampNumber(lightDef?.height, 0.02, 24, 0.4)
		const area = width * height
		const roleText = String(lightDef?.role ?? '')
			.trim()
			.toLowerCase()
		const largePanelFactor = area > 2.2 ? Math.pow(area / 2.2, 0.15) : 1
		const thinStripBoost = height <= 0.12 || width <= 0.18 ? 1.7 : 1
		const roleBoost =
			roleText === 'key'
				? 7.2
				: roleText === 'fill'
					? 6.8
					: roleText === 'accent'
						? 9.6
						: roleText === 'practical'
							? 10.5
							: 6.2
		return (intensity * roleBoost * thinStripBoost) / largePanelFactor
	}

	private addPreviewAssistLight(
		type: string,
		color: string,
		position: Vector3Like,
		lightDef: LightDefinition,
		baseIntensity: number
	) {
		const roleText = String(lightDef?.role ?? '')
			.trim()
			.toLowerCase()
		const sceneScale = this.getSceneScaleHint()
		if (type === 'rect-area') {
			const width = this.clampNumber(lightDef?.width, 0.02, 24, 1.2)
			const height = this.clampNumber(lightDef?.height, 0.02, 24, 0.4)
			const isThinStrip = height <= 0.12 || width <= 0.18
			if (isThinStrip) return
			const target = this.resolveLightTarget(position, lightDef, {
				x: position.x,
				y: position.y,
				z: position.z + 1
			})
			const dir = target.clone().sub(position)
			const assist = new THREE.SpotLight(
				color,
				Math.max(0.4, baseIntensity * (roleText === 'fill' ? 0.36 : 0.28))
			)
			assist.position.copy(position)
			assist.angle = Math.max(
				0.55,
				Math.min(1.05, Math.atan2(Math.max(width, height) * 1.6, Math.max(0.4, dir.length())))
			)
			assist.penumbra = 0.92
			assist.distance = Math.max(dir.length() * 1.8, Math.max(width, height) * 6, sceneScale * 0.95)
			assist.decay = 1.05
			const assistTarget = new THREE.Object3D()
			assistTarget.position.copy(target)
			this.lightsGroup.add(assistTarget)
			assist.target = assistTarget
			this.lightsGroup.add(assist)
			return
		}
		if (type === 'spot') {
			const assist = new THREE.PointLight(color, Math.max(0.32, baseIntensity * 0.2))
			assist.position.copy(position)
			assist.distance = Math.max(Number(lightDef.distance ?? 0) || 0, sceneScale * 0.65)
			assist.decay = 1.0
			this.lightsGroup.add(assist)
			return
		}
		if (type === 'point' && roleText === 'accent') {
			const assist = new THREE.PointLight(color, Math.max(0.28, baseIntensity * 0.18))
			assist.position.copy(position)
			assist.distance = Math.max(Number(lightDef.distance ?? 0) || 0, sceneScale * 0.55)
			assist.decay = 0.9
			this.lightsGroup.add(assist)
		}
	}

	private shouldLightCastShadow(type: string, lightDef: LightDefinition, intensity: number) {
		if (lightDef?.castShadow !== true) return false
		if (type === 'rect-area' || type === 'ambient' || type === 'hemisphere') return false
		if (type === 'point') return intensity >= 0.55
		return intensity >= 0.35
	}

	private createLightDebugMarker(color: string, radius: number) {
		return new THREE.Mesh(
			new THREE.SphereGeometry(Math.max(0.015, radius), 12, 12),
			new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
		)
	}

	private createDebugLine(points: Vector3Like[], color: string, opacity = 0.9) {
		const geometry = new THREE.BufferGeometry().setFromPoints(points)
		return new THREE.Line(
			geometry,
			new THREE.LineBasicMaterial({ color, transparent: true, opacity })
		)
	}

	private addLightDebugHelper(
		type: string,
		color: string,
		position: Vector3Like,
		lightDef: LightDefinition
	) {
		if (!this.lightingDebugEnabled) return
		const helperGroup = new THREE.Group()
		const scaleHint = this.getSceneScaleHint()
		const helperColor = new THREE.Color(color)
		const marker = this.createLightDebugMarker(
			`#${helperColor.getHexString()}`,
			Math.max(0.025, scaleHint * 0.006)
		)
		marker.position.copy(position)
		helperGroup.add(marker)
		if (type === 'rect-area') {
			const width = this.clampNumber(lightDef.width, 0.02, 24, 1.2)
			const height = this.clampNumber(lightDef.height, 0.02, 24, 0.4)
			const plane = new THREE.Mesh(
				new THREE.PlaneGeometry(width, height),
				new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.16,
					side: THREE.DoubleSide,
					depthWrite: false
				})
			)
			plane.position.copy(position)
			this.applyRectAreaOrientation(plane, lightDef, position)
			helperGroup.add(plane)
			const edges = new THREE.LineSegments(
				new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
				new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
			)
			edges.position.copy(position)
			this.applyRectAreaOrientation(edges, lightDef, position)
			helperGroup.add(edges)
			const normalLength = Math.max(0.35, Math.min(1.4, Math.max(width, height) * 0.4))
			const normal = new THREE.Vector3(0, 0, -1)
			normal.applyQuaternion(plane.quaternion)
			helperGroup.add(
				this.createDebugLine(
					[position, position.clone().add(normal.normalize().multiplyScalar(normalLength))],
					color,
					0.85
				)
			)
		} else if (type === 'spot') {
			const target = this.resolveLightTarget(position, lightDef, {
				x: position.x,
				y: position.y - 1,
				z: position.z
			})
			helperGroup.add(this.createDebugLine([position, target], color, 0.9))
			const dir = target.clone().sub(position)
			const length = Math.max(0.2, dir.length())
			const angle = Math.max(0.05, Math.min(Math.PI / 2, Number(lightDef.angle ?? 0.75)))
			const radius = Math.max(0.03, Math.tan(angle) * length)
			const cone = new THREE.Mesh(
				new THREE.ConeGeometry(radius, length, 18, 1, true),
				new THREE.MeshBasicMaterial({
					color,
					wireframe: true,
					transparent: true,
					opacity: 0.28,
					depthWrite: false
				})
			)
			cone.position.copy(position.clone().add(dir.clone().multiplyScalar(0.5)))
			cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
			helperGroup.add(cone)
		} else if (type === 'directional') {
			const target = this.resolveLightTarget(position, lightDef, { x: 0, y: 0, z: 0 })
			helperGroup.add(this.createDebugLine([position, target], color, 0.95))
		} else if (type === 'point') {
			const distance = Math.max(0.08, Number(lightDef.distance ?? 0.8) || 0.8)
			const ring = new THREE.Mesh(
				new THREE.SphereGeometry(distance, 16, 12),
				new THREE.MeshBasicMaterial({
					color,
					wireframe: true,
					transparent: true,
					opacity: 0.12,
					depthWrite: false
				})
			)
			ring.position.copy(position)
			helperGroup.add(ring)
		}
		this.lightsGroup.add(helperGroup)
	}

	private resolveLightTarget(
		position: Vector3Like,
		lightDef: LightDefinition,
		fallback: { x: number; y: number; z: number }
	) {
		if (lightDef?.target) return this.normalizeVector3(lightDef.target, fallback)
		const direction = this.normalizeVector3(lightDef?.direction, { x: 0, y: -1, z: 0 })
		if (direction.lengthSq() > 0.0001) {
			return position
				.clone()
				.add(direction.normalize().multiplyScalar(Math.max(1.2, this.getSceneScaleHint() * 0.35)))
		}
		return this.normalizeVector3(undefined, fallback)
	}

	private applyRectAreaOrientation(
		light: Object3Dlike,
		lightDef: LightDefinition,
		position: Vector3Like
	) {
		const target = lightDef?.target || lightDef?.direction
		if (target) {
			light.lookAt(this.resolveLightTarget(position, lightDef, { x: 0, y: 40, z: 0 }))
			return
		}
		const rotation = lightDef?.rotation
		if (rotation && isObject(rotation)) {
			light.rotation.set(
				this.toRadians(rotation.x),
				this.toRadians(rotation.y),
				this.toRadians(rotation.z)
			)
			return
		}
		light.rotation.set(-Math.PI / 2, 0, 0)
	}

	private parseLightingPreviewConfig(
		lightingJson: string
	): WorkflowSceneLightingPreviewConfig | null {
		const raw = String(lightingJson ?? '').trim()
		if (!raw) return null
		try {
			const parsed = JSON.parse(raw)
			return parsed && typeof parsed === 'object'
				? (parsed as WorkflowSceneLightingPreviewConfig)
				: null
		} catch {
			return null
		}
	}

	private applyLightingPreview(
		enabled: boolean,
		lightingJson: string,
		lightingControls?: WorkflowSceneLayoutLightingControls
	) {
		this.clearLightingPreview()
		if (!enabled) {
			this.applyBrowseBaseLights()
			this.requestRender()
			return
		}
		this.applyPreviewBaseLights()
		const controls = this.resolveLightingControlOverrides(lightingControls)
		const config = this.parseLightingPreviewConfig(lightingJson)
		if (!config) {
			this.baseHemisphereLight.intensity = 0.06 * this.getLightingTypeScale('hemisphere', controls)
			this.baseDirectionalLight.intensity =
				0.12 * this.getLightingTypeScale('directional', controls)
			this.renderer.toneMappingExposure = Math.max(0.18, 0.72 * controls.exposure)
			this.requestRender()
			return
		}
		const atmosphere = this.resolveAtmosphereSettings(config)
		this.renderer.toneMappingExposure = Math.max(0.08, atmosphere.exposure * controls.exposure)
		const inspectionAmbient = new THREE.AmbientLight(
			'#d9e6ff',
			Math.max(
				0,
				atmosphere.environmentIntensity * 0.22 * this.getLightingTypeScale('ambient', controls)
			)
		)
		this.lightsGroup.add(inspectionAmbient)
		const inspectionFill = new THREE.DirectionalLight(
			'#dce8ff',
			0.16 * this.getLightingTypeScale('directional', controls)
		)
		inspectionFill.position.set(
			this.getSceneScaleHint() * 0.9,
			this.getSceneScaleHint() * 1.35,
			this.getSceneScaleHint() * 1.05
		)
		const inspectionTarget = new THREE.Object3D()
		inspectionTarget.position.set(0, this.getSceneScaleHint() * 0.2, 0)
		this.lightsGroup.add(inspectionTarget)
		inspectionFill.target = inspectionTarget
		this.lightsGroup.add(inspectionFill)
		if (config.ambientLight) {
			const ambient = new THREE.AmbientLight(
				'#ffffff',
				this.clampLightIntensity(
					'ambient',
					config.ambientLight.intensity ?? 0.08,
					atmosphere.intensityScale * this.getLightingTypeScale('ambient', controls)
				)
			)
			this.applyColor(ambient.color, config.ambientLight.color)
			this.lightsGroup.add(ambient)
		}
		if (config.hemisphereLight) {
			this.baseHemisphereLight.intensity = Math.max(
				0,
				this.clampLightIntensity(
					'hemisphere',
					config.hemisphereLight.intensity ?? 0.2,
					atmosphere.intensityScale * this.getLightingTypeScale('hemisphere', controls)
				) +
					atmosphere.environmentIntensity * 0.12 * this.getLightingTypeScale('hemisphere', controls)
			)
			this.applyColor(this.baseHemisphereLight.color, config.hemisphereLight.skyColor)
			this.applyColor(this.baseHemisphereLight.groundColor, config.hemisphereLight.groundColor)
		} else {
			this.baseHemisphereLight.intensity = Math.max(
				0,
				atmosphere.environmentIntensity * 0.4 * this.getLightingTypeScale('hemisphere', controls)
			)
		}
		if (config.mainDirectionalLight) {
			this.baseDirectionalLight.intensity = Math.max(
				0,
				this.clampLightIntensity(
					'directional',
					config.mainDirectionalLight.intensity ?? 0.75,
					atmosphere.intensityScale * this.getLightingTypeScale('directional', controls)
				)
			)
			this.applyColor(this.baseDirectionalLight.color, config.mainDirectionalLight.color)
			const pos = this.normalizeVector3(config.mainDirectionalLight.position, {
				x: 200,
				y: 300,
				z: 160
			})
			this.baseDirectionalLight.position.copy(pos)
			this.baseDirectionalTarget.position.copy(
				this.normalizeVector3(config.mainDirectionalLight.target, { x: 0, y: 40, z: 0 })
			)
		} else {
			this.baseDirectionalLight.intensity =
				0.08 * this.getLightingTypeScale('directional', controls)
		}
		for (const rawLightDef of Array.isArray(config.lights) ? config.lights : []) {
			if (!rawLightDef || typeof rawLightDef !== 'object') continue
			const lightDef = rawLightDef as LightDefinition
			const type = this.normalizeLightingType(lightDef.type)
			const emitMode = String(lightDef.emitMode ?? '')
				.trim()
				.toLowerCase()
			if (emitMode === 'self-emissive-only') {
				this.addLightDebugHelper(
					type,
					String(lightDef.color ?? '#ffffff').trim() || '#ffffff',
					this.normalizeVector3(lightDef.position, { x: 0, y: 120, z: 0 }),
					lightDef
				)
				continue
			}
			const color = String(lightDef.color ?? '#ffffff').trim() || '#ffffff'
			let intensity = this.clampLightIntensity(
				type,
				lightDef.intensity ?? 1,
				atmosphere.intensityScale * this.getLightingTypeScale(type, controls)
			)
			intensity = this.applyRoleIntensityBias(type, lightDef.role, intensity)
			if (
				type === 'spot' &&
				String(lightDef.role ?? '')
					.trim()
					.toLowerCase() === 'accent'
			)
				intensity *= 1.5
			if (
				type === 'point' &&
				String(lightDef.role ?? '')
					.trim()
					.toLowerCase() === 'accent'
			)
				intensity *= 1.35
			const position = this.normalizeVector3(lightDef.position, { x: 0, y: 120, z: 0 })
			let light: (Object3Dlike & { castShadow?: boolean }) | null = null
			if (type === 'ambient') {
				light = new THREE.AmbientLight(color, intensity) as unknown as Object3Dlike & {
					castShadow?: boolean
				}
			} else if (type === 'hemisphere') {
				light = new THREE.HemisphereLight(
					color,
					String(lightDef.groundColor ?? '#1f2937'),
					intensity
				) as unknown as Object3Dlike & { castShadow?: boolean }
			} else if (type === 'directional') {
				const dirLight = new THREE.DirectionalLight(color, intensity)
				dirLight.position.copy(position)
				const target = new THREE.Object3D()
				target.position.copy(this.resolveLightTarget(position, lightDef, { x: 0, y: 40, z: 0 }))
				this.lightsGroup.add(target)
				dirLight.target = target
				light = dirLight as unknown as Object3Dlike & { castShadow?: boolean }
			} else if (type === 'spot') {
				const spotLight = new THREE.SpotLight(color, intensity)
				spotLight.position.copy(position)
				spotLight.distance = Math.max(
					Number(lightDef.distance ?? 0) || 0,
					this.getSceneScaleHint() * 0.75
				)
				spotLight.decay = Math.max(0.6, Math.min(1.2, Number(lightDef.decay ?? 1)))
				spotLight.angle = Math.max(
					0.01,
					Math.min(Math.PI / 2, Number(lightDef.angle ?? 0.75) * 1.15)
				)
				spotLight.penumbra = Math.max(0.45, Math.min(1, Number(lightDef.penumbra ?? 0.25) + 0.3))
				const target = new THREE.Object3D()
				target.position.copy(this.resolveLightTarget(position, lightDef, { x: 0, y: 20, z: 0 }))
				this.lightsGroup.add(target)
				spotLight.target = target
				light = spotLight as unknown as Object3Dlike & { castShadow?: boolean }
			} else if (type === 'rect-area') {
				intensity = this.adjustRectAreaPreviewIntensity(intensity, lightDef)
				const rectLight = new THREE.RectAreaLight(
					color,
					intensity,
					this.clampNumber(lightDef.width, 0.02, 24, 1.2),
					this.clampNumber(lightDef.height, 0.02, 24, 0.4)
				)
				rectLight.position.copy(position)
				this.applyRectAreaOrientation(rectLight as unknown as Object3Dlike, lightDef, position)
				light = rectLight as unknown as Object3Dlike & { castShadow?: boolean }
			} else {
				const pointLight = new THREE.PointLight(color, intensity)
				pointLight.position.copy(position)
				pointLight.distance = Math.max(
					Number(lightDef.distance ?? 0) || 0,
					this.getSceneScaleHint() * 0.55
				)
				pointLight.decay = Math.max(0.75, Math.min(1.15, Number(lightDef.decay ?? 1)))
				light = pointLight as unknown as Object3Dlike & { castShadow?: boolean }
			}
			if (light && 'castShadow' in light)
				light.castShadow = this.shouldLightCastShadow(type, lightDef, intensity)
			if (
				light &&
				type !== 'directional' &&
				type !== 'spot' &&
				type !== 'ambient' &&
				type !== 'hemisphere'
			) {
				light.position.copy(position)
			}
			if (light) this.lightsGroup.add(light)
			this.addPreviewAssistLight(type, color, position, lightDef, intensity)
			this.addLightDebugHelper(type, color, position, lightDef)
		}
		this.requestRender()
	}

	applyCamera(
		cameraCfg?: {
			position?: { x: number; y: number; z: number }
			target?: { x: number; y: number; z: number }
		} | null,
		options?: { forcePreviewFrame?: boolean; allowAutoFit?: boolean }
	) {
		const allowAutoFit = options?.allowAutoFit !== false
		if (options?.forcePreviewFrame !== true && this.cameraDirty) {
			this.requestRender()
			return
		}
		if (this.previewModeActive) {
			if (allowAutoFit || !this.hasUsableCamera(cameraCfg)) {
				this.frameItemsFromRight()
				return
			}
		}
		if (!this.hasUsableCamera(cameraCfg)) {
			if (allowAutoFit) {
				this.frameItemsFromRight()
			}
			return
		}
		if (cameraCfg?.position) {
			this.camera.position.set(
				safeNumber(cameraCfg.position.x, this.camera.position.x),
				safeNumber(cameraCfg.position.y, this.camera.position.y),
				safeNumber(cameraCfg.position.z, this.camera.position.z)
			)
		}
		if (cameraCfg?.target) {
			this.controls.target.set(
				safeNumber(cameraCfg.target.x, this.controls.target.x),
				safeNumber(cameraCfg.target.y, this.controls.target.y),
				safeNumber(cameraCfg.target.z, this.controls.target.z)
			)
		}
		this.cameraDirty = true
		this.controls.update()
		this.requestRender()
	}

	private hasUsableCamera(cameraCfg?: {
		position?: { x: number; y: number; z: number }
		target?: { x: number; y: number; z: number }
	} | null) {
		return !!(
			cameraCfg?.position &&
			cameraCfg?.target &&
			Number.isFinite(Number(cameraCfg.position.x)) &&
			Number.isFinite(Number(cameraCfg.position.y)) &&
			Number.isFinite(Number(cameraCfg.position.z)) &&
			Number.isFinite(Number(cameraCfg.target.x)) &&
			Number.isFinite(Number(cameraCfg.target.y)) &&
			Number.isFinite(Number(cameraCfg.target.z))
		)
	}

	private normalizeItemsForPreview(items: WorkflowSceneLayoutItem[], previewMode: boolean = false) {
		if (!items.length) return items
		const firstPass = items.map((item) => {
			const next = cloneItem(item)
			const placement = String(next.placement ?? '')
				.trim()
				.toLowerCase()
			const supportSurface = String(next.supportSurface ?? '')
				.trim()
				.toLowerCase()
			const mountType = String(next.mountType ?? '')
				.trim()
				.toLowerCase()
			const role = canonicalWallRole(next.wallRole)
			const isWallAligned =
				role.length > 0 &&
				!isWallMountedSupportSurface(next) &&
				(String(next.keyElementType ?? '')
					.trim()
					.toLowerCase() === 'wall' ||
					placement.includes('wall') ||
					mountType.includes('wall') ||
					supportSurface.includes('wall') ||
					supportSurface === 'left' ||
					supportSurface === 'right' ||
					supportSurface === 'front' ||
					supportSurface === 'back')
			if (isWallAligned) {
				const width = Math.max(0.05, safeNumber(next.size.width, 1))
				const depth = Math.max(0.05, safeNumber(next.size.depth, 1))
				next.size = {
					...next.size,
					width: Math.max(width, depth),
					depth: Math.min(width, depth)
				}
				next.rotation = {
					...(next.rotation ?? {}),
					yaw: canonicalWallRoleYaw(role),
					pitch: 0,
					roll: 0
				}
				next.wallRole = role
			}
			return next
		})

		if (previewMode) {
			return firstPass
		}

		const itemsById = new Map(firstPass.map((item) => [String(item.id ?? '').trim(), item]))
		const childrenByParent = new Map<string, WorkflowSceneLayoutItem[]>()
		for (const item of firstPass) {
			const parentId = String(item.parentId ?? '').trim()
			if (!parentId) continue
			const siblings = childrenByParent.get(parentId) ?? []
			siblings.push(item)
			childrenByParent.set(parentId, siblings)
		}
		const normalized = firstPass.map((item) => {
			const parentId = String(item.parentId ?? '').trim()
			const parent = parentId ? itemsById.get(parentId) : undefined
			const compacted = compactWallMountedSupportSurface(
				item,
				childrenByParent.get(String(item.id ?? '').trim()) ?? [],
				parent
			)
			return snapWallAttachedItemToParentSurface(compacted, parent)
		})
		let minX = Infinity
		let maxX = -Infinity
		let minZ = Infinity
		let maxZ = -Infinity
		for (const item of normalized) {
			const width = Math.max(
				0.05,
				safeNumber(item.size.width, 1) * Math.max(0.01, safeNumber(item.scale?.x ?? 1, 1))
			)
			const depth = Math.max(
				0.05,
				safeNumber(item.size.depth, 1) * Math.max(0.01, safeNumber(item.scale?.z ?? 1, 1))
			)
			const posX = safeNumber(item.position.x, 0)
			const posZ = safeNumber(item.position.z, 0)
			minX = Math.min(minX, posX - width * 0.5)
			maxX = Math.max(maxX, posX + width * 0.5)
			minZ = Math.min(minZ, posZ - depth * 0.5)
			maxZ = Math.max(maxZ, posZ + depth * 0.5)
		}
		if (
			!Number.isFinite(minX) ||
			!Number.isFinite(maxX) ||
			!Number.isFinite(minZ) ||
			!Number.isFinite(maxZ)
		)
			return items
		const centerX = (minX + maxX) * 0.5
		const centerZ = (minZ + maxZ) * 0.5
		if (Math.abs(centerX) < 0.001 && Math.abs(centerZ) < 0.001) return normalized
		return normalized.map((item) => ({
			...item,
			position: {
				...item.position,
				x: safeNumber(item.position.x, 0) - centerX,
				z: safeNumber(item.position.z, 0) - centerZ
			}
		}))
	}

	private frameItemsFromRight() {
		if (!this.currentItems.length) {
			this.controls.target.set(0, 32, 0)
			this.camera.position.set(360, 260, 420)
			this.controls.update()
			this.requestRender()
			return
		}
		let minX = Infinity
		let maxX = -Infinity
		let minY = Infinity
		let maxY = -Infinity
		let minZ = Infinity
		let maxZ = -Infinity
		for (const item of this.currentItems) {
			const width = Math.max(
				0.05,
				safeNumber(item.size.width, 1) * Math.max(0.01, safeNumber(item.scale?.x ?? 1, 1))
			)
			const height = Math.max(
				0.05,
				safeNumber(item.size.height, 1) * Math.max(0.01, safeNumber(item.scale?.y ?? 1, 1))
			)
			const depth = Math.max(
				0.05,
				safeNumber(item.size.depth, 1) * Math.max(0.01, safeNumber(item.scale?.z ?? 1, 1))
			)
			const posX = safeNumber(item.position.x, 0)
			const posY = safeNumber(item.position.y, 0)
			const posZ = safeNumber(item.position.z, 0)
			minX = Math.min(minX, posX - width * 0.5)
			maxX = Math.max(maxX, posX + width * 0.5)
			minY = Math.min(minY, posY)
			maxY = Math.max(maxY, posY + height)
			minZ = Math.min(minZ, posZ - depth * 0.5)
			maxZ = Math.max(maxZ, posZ + depth * 0.5)
		}
		const sizeX = Math.max(1, maxX - minX)
		const sizeY = Math.max(1, maxY - minY)
		const sizeZ = Math.max(1, maxZ - minZ)
		const radius = Math.max(sizeX, sizeY, sizeZ)
		const targetX = minX + sizeX * 0.58
		const targetY = minY + sizeY * 0.42
		const targetZ = (minZ + maxZ) * 0.5
		this.controls.target.set(targetX, targetY, targetZ)
		this.camera.position.set(maxX + radius * 0.95, targetY + radius * 0.72, maxZ + radius * 1.05)
		this.controls.update()
		this.requestRender()
	}

	private async syncModelBindings(
		revision: number,
		bindings: Map<string, WorkflowSceneLayoutModelBinding>
	) {
		const entries = Array.from(bindings.entries())
		const changed: boolean[] = []
		const batchSize = 2
		for (let index = 0; index < entries.length; index += batchSize) {
			if (
				this.disposed ||
				revision !== this.layoutRevision ||
				this.pendingBindingRevision !== revision
			)
				return
			const batch = entries.slice(index, index + batchSize)
			const results = await Promise.all(
				batch.map(([itemId, binding]) => this.attachModelBinding(revision, itemId, binding))
			)
			changed.push(...results)
			this.requestRender()
		}
		if (changed.some(Boolean)) this.emitLayoutChange()
	}

	private async attachModelBinding(
		revision: number,
		itemId: string,
		binding: WorkflowSceneLayoutModelBinding
	) {
		const mesh = this.meshesById.get(itemId)
		const item = this.currentItems.find((entry) => entry.id === itemId)
		const sourceUrl = String(binding.modelUrl ?? binding.modelAssetUrl ?? '').trim()
		if (!mesh || !item || !sourceUrl) return false
		if (
			this.disposed ||
			revision !== this.layoutRevision ||
			this.pendingBindingRevision !== revision
		)
			return false

		try {
			const template = await this.loadModelTemplate(sourceUrl, itemId)
			if (
				this.disposed ||
				revision !== this.layoutRevision ||
				this.pendingBindingRevision !== revision
			)
				return false
			const latestMesh = this.meshesById.get(itemId)
			if (!latestMesh) return false
			const autoAdjust = this.resolveShouldAutoAdjust(binding, item)
			const changed = this.mountBoundModel(
				itemId,
				item,
				latestMesh,
				template,
				autoAdjust ? 'auto' : 'keep',
				binding
			)
			latestMesh.userData.itemId = item.id
			const fitChanged = !item.fitMode
				? this.setFitState(
						item,
						'normal',
						t('aiworkflow.scenePreview.boxPreviewHint')
					)
				: false
			this.requestRender()
			return changed || fitChanged
		} catch {
			// keep placeholder box when model preview loading fails
			return false
		}
	}

	private loadModelTemplate(url: string, itemId: string) {
		const source = String(url ?? '').trim()
		if (!source) return Promise.reject(new Error('empty model source'))
		const cached = this.modelTemplateCache.get(source)
		if (cached) return cached
		const next = this.loader.loadAsync(source).then((gltf: GLTFResult) => gltf.scene).catch((err) => {
			if (this.options.onModelLoadError) {
				this.options.onModelLoadError(source, itemId)
			}
			throw err
		})
		this.modelTemplateCache.set(source, next)
		return next
	}

	private cloneModelScene(template: GltfTemplateLike) {
		const cloned: GltfTemplateLike = template.clone(true)
		cloned.traverse((entry: Object3Dlike) => {
			if (entry instanceof THREE.Mesh) {
				const meshEntry = entry as unknown as DisposableMesh
				const geom = meshEntry.geometry as ClonableGeometry | undefined
				if (geom && typeof geom.clone === 'function') {
					meshEntry.geometry = geom.clone() as Disposable
				}
				const material = meshEntry.material
				if (Array.isArray(material)) {
					meshEntry.material = material.map((item: ClonableMaterial | null) =>
						item && typeof item.clone === 'function' ? item.clone() : item
					)
				} else if (material && typeof (material as ClonableMaterial).clone === 'function') {
					meshEntry.material = (material as ClonableMaterial).clone()
				}
			}
		})
		cloned.updateMatrixWorld(true)
		return cloned as unknown as GltfTemplateLike
	}

	private getCurrentRenderOptions(): SceneLayoutRenderOptions {
		return {
			transparent: this.transparent,
			previewMode: this.previewModeActive,
			modelBindings: Array.from(this.bindingById.values()),
			hidePlaceholderCubes: this.hidePlaceholderCubes
		}
	}

	private resolvePlaceholderWorldSize(item: WorkflowSceneLayoutItem) {
		return new THREE.Vector3(
			Math.max(
				0.05,
				safeNumber(item.size.width, 1) * Math.max(0.01, safeNumber(item.scale?.x ?? 1, 1))
			),
			Math.max(
				0.05,
				safeNumber(item.size.height, 1) * Math.max(0.01, safeNumber(item.scale?.y ?? 1, 1))
			),
			Math.max(
				0.05,
				safeNumber(item.size.depth, 1) * Math.max(0.01, safeNumber(item.scale?.z ?? 1, 1))
			)
		)
	}

	private clearFillState(item: WorkflowSceneLayoutItem) {
		item.fillMode = undefined
		item.fillCount = undefined
		item.fillAxisScale = undefined
		item.fillUpdatedAt = undefined
	}

	private clearForcedFitState(item: WorkflowSceneLayoutItem) {
		if (item.fitMode !== 'forced') return false
		item.fitMode = undefined
		item.fitMessage = undefined
		item.fitUpdatedAt = undefined
		return true
	}

	private setFitState(item: WorkflowSceneLayoutItem, mode: SceneLayoutFitMode, message: string) {
		const nextMessage = String(message ?? '').trim()
		const changed = item.fitMode !== mode || String(item.fitMessage ?? '').trim() !== nextMessage
		item.fitMode = mode
		item.fitMessage = nextMessage || undefined
		item.fitUpdatedAt = Date.now()
		return changed
	}

	private disposeBoundModel(itemId: string) {
		const existingModel = this.boundModelsById.get(itemId)
		if (existingModel) {
			this.group.remove(existingModel)
			existingModel.traverse((entry: Object3Dlike) => {
				if (entry instanceof THREE.Mesh) {
					const meshEntry = entry as unknown as DisposableMesh
					const geom = meshEntry.geometry as Disposable | undefined
					geom?.dispose()
					if (meshEntry.material)
						disposeMaterial(meshEntry.material as MaterialWithMaps | MaterialWithMaps[])
				}
			})
		}
		this.boundModelsById.delete(itemId)
		this.purgeBoundModelResidue(itemId)
	}

	private purgeBoundModelResidue(itemId: string) {
		const targetId = String(itemId ?? '').trim()
		if (!targetId) return
		for (let index = this.group.children.length - 1; index >= 0; index -= 1) {
			const child: BoundModelChild | undefined = this.group.children[index] as BoundModelChild | undefined
			if (!child) continue
			const directItemId = String(child.userData?.itemId ?? '').trim()
			const directIsBoundModel = child.userData?.isBoundModel === true
			let matched = directIsBoundModel && directItemId === targetId
			if (!matched) {
				child.traverse((entry: Object3Dlike) => {
					if (matched) return
					const entryChild = entry as unknown as BoundModelChild
					const entryItemId = String(entryChild?.userData?.itemId ?? '').trim()
					if (entryItemId === targetId && entryChild?.userData?.isBoundModel === true) matched = true
				})
			}
			if (!matched) continue
			this.group.remove(child)
			child.traverse((entry: Object3Dlike) => {
				if (entry instanceof THREE.Mesh) {
					const meshEntry = entry as unknown as DisposableMesh
					const geom = meshEntry.geometry as Disposable | undefined
					geom?.dispose()
					if (meshEntry.material)
						disposeMaterial(meshEntry.material as MaterialWithMaps | MaterialWithMaps[])
				}
			})
		}
	}

	private async rebuildBoundModelForItem(
		itemId: string,
		mode: 'auto' | 'manual' | 'keep' = 'keep'
	) {
		const targetId = String(itemId ?? '').trim()
		if (!targetId) return false
		const binding = this.bindingById.get(targetId)
		const item = this.currentItems.find((entry) => entry.id === targetId)
		const mesh = this.meshesById.get(targetId)
		const sourceUrl = String(binding?.modelUrl ?? binding?.modelAssetUrl ?? '').trim()
		if (!binding || !item || !mesh || !sourceUrl) {
			this.disposeBoundModel(targetId)
			return false
		}
		const template = await this.loadModelTemplate(sourceUrl, targetId)
		if (this.disposed) return false
		this.disposeBoundModel(targetId)
		this.mountBoundModel(targetId, item, mesh, template, mode, binding)
		this.requestRender()
		return true
	}

	private mountBoundModel(
		itemId: string,
		item: WorkflowSceneLayoutItem,
		mesh: MeshLike,
		template: GltfTemplateLike,
		mode: 'auto' | 'manual' | 'keep',
		binding?: WorkflowSceneLayoutModelBinding
	) {
		this.disposeBoundModel(itemId)
		const modelContent = this.cloneModelScene(template)
		const orientationChanged = this.prepareModelPreview(
			modelContent as unknown as Object3Dlike,
			item,
			mode
		)
		const modelRoot = this.createBoundModelRoot(modelContent, mesh, item) as unknown as GroupLike
		const bindingSourceInfo = binding ? {
			modelUrl: binding.modelUrl,
			modelAssetUrl: binding.modelAssetUrl,
			modelSourcePath: binding.modelSourcePath,
			modelAssetPath: binding.modelAssetPath,
			modelSourceName: binding.modelSourceName,
			modelFormat: binding.modelFormat,
			sourceNodeId: binding.sourceNodeId,
			sourceNodeType: binding.sourceNodeType
		} : {}
		modelRoot.userData = {
			...(modelRoot.userData ?? {}),
			itemId: item.id,
			isBoundModel: true,
			...bindingSourceInfo
		}
		modelRoot.traverse((child: Object3Dlike) => {
			child.userData = {
				...(child.userData ?? {}),
				itemId: item.id,
				isBoundModel: true,
				...bindingSourceInfo
			}
		})
		this.group.add(modelRoot)
		this.boundModelsById.set(itemId, modelRoot)
		return orientationChanged
	}

	private cycleOrientationYaw(existingOffset: OrientationOffset): OrientationOffset {
		const currentYaw = normalizeAngleDeg(existingOffset.yaw)
		const roundedYaw = Math.round(currentYaw / 90) * 90
		const nextYaw = normalizeAngleDeg(roundedYaw + 90)
		return {
			yaw: nextYaw,
			pitch: existingOffset.pitch,
			roll: existingOffset.roll
		}
	}

	private cycleOrientationPitch(existingOffset: OrientationOffset): OrientationOffset {
		const currentPitch = normalizeAngleDeg(existingOffset.pitch)
		const roundedPitch = Math.round(currentPitch / 90) * 90
		const nextPitch = normalizeAngleDeg(roundedPitch + 90)
		return {
			yaw: existingOffset.yaw,
			pitch: nextPitch,
			roll: existingOffset.roll
		}
	}

	private cycleOrientationRoll(existingOffset: OrientationOffset): OrientationOffset {
		const currentRoll = normalizeAngleDeg(existingOffset.roll)
		const roundedRoll = Math.round(currentRoll / 90) * 90
		const nextRoll = normalizeAngleDeg(roundedRoll + 90)
		return {
			yaw: existingOffset.yaw,
			pitch: existingOffset.pitch,
			roll: nextRoll
		}
	}

	private resolveAxisReferenceScale(
		axis: FillAxis,
		previewScaleMode: string,
		scaleX: number,
		scaleY: number,
		scaleZ: number
	) {
		const others =
			axis === 'x' ? [scaleY, scaleZ] : axis === 'y' ? [scaleX, scaleZ] : [scaleX, scaleY]
		if (previewScaleMode === 'model') return Math.max(0.0001, Math.min(others[0], others[1]))
		return Math.max(0.0001, Math.min(others[0], others[1]))
	}

	private resolveFillSuggestion(
		size: { x: number; y: number; z: number },
		target: { x: number; y: number; z: number },
		previewScaleMode: string
	): FillSuggestion | null {
		const ratios = {
			x: target.x / Math.max(size.x, 0.001),
			y: target.y / Math.max(size.y, 0.001),
			z: target.z / Math.max(size.z, 0.001)
		}
		const axes: FillAxis[] = ['x', 'y', 'z']
		let best: FillSuggestion | null = null
		for (const axis of axes) {
			const others = axes.filter((value) => value !== axis)
			const otherRatios = others.map((value) => ratios[value])
			const otherDiff = Math.abs(
				Math.log(Math.max(otherRatios[0], 0.0001)) - Math.log(Math.max(otherRatios[1], 0.0001))
			)
			if (otherDiff > FILL_MATCH_TOLERANCE) continue
			const referenceScale = this.resolveAxisReferenceScale(
				axis,
				previewScaleMode,
				ratios.x,
				ratios.y,
				ratios.z
			)
			const otherCoverage = others.map(
				(value) => (size[value] * referenceScale) / Math.max(target[value], 0.0001)
			)
			if (
				otherCoverage.some(
					(value) => !Number.isFinite(value) || value < 0.72 || value > 1 + FILL_MATCH_TOLERANCE
				)
			) {
				continue
			}
			const singleLength = size[axis] * Math.max(referenceScale, 0.0001)
			const coverage = target[axis] / Math.max(singleLength, 0.0001)
			if (!Number.isFinite(coverage) || coverage < FILL_MIN_COVERAGE) continue
			const countCandidates = [Math.floor(coverage), Math.ceil(coverage)]
				.filter(
					(value, index, list) =>
						Number.isFinite(value) && value >= 2 && list.indexOf(value) === index
				)
				.map((value) => Math.min(FILL_MAX_COUNT, value))
			let bestCount = 0
			let bestAxisScale = 1
			let bestAxisPenalty = Infinity
			for (const count of countCandidates) {
				const axisScale = target[axis] / Math.max(singleLength * count, 0.0001)
				if (axisScale < FILL_AXIS_SCALE_MIN || axisScale > FILL_AXIS_SCALE_MAX) continue
				const penalty = Math.abs(Math.log(Math.max(axisScale, 0.0001)))
				if (penalty < bestAxisPenalty) {
					bestAxisPenalty = penalty
					bestCount = count
					bestAxisScale = axisScale
				}
			}
			if (!bestCount) continue
			const otherCoveragePenalty =
				otherCoverage.reduce((sum, value) => sum + Math.abs(1 - value), 0) / otherCoverage.length
			const score = otherDiff * 0.45 + otherCoveragePenalty * 0.25 + bestAxisPenalty * 0.3
			const suggestion: FillSuggestion = {
				axis,
				mode: axis === 'x' ? 'fill-x' : axis === 'y' ? 'fill-y' : 'fill-z',
				count: bestCount,
				axisScale: bestAxisScale,
				score
			}
			if (!best || suggestion.score < best.score) best = suggestion
		}
		return best
	}

	private resolveWorldFillSuggestion(
		placeholderMesh: MeshLike,
		template: GltfTemplateLike,
		item: WorkflowSceneLayoutItem
	): FillSuggestion | null {
		const placeholderBox = this.getWorldBox(placeholderMesh)
		if (!placeholderBox) return null
		const probeItem: WorkflowSceneLayoutItem = {
			...item,
			fillMode: undefined,
			fillCount: undefined,
			fillAxisScale: undefined,
			fillUpdatedAt: undefined
		}
		const probeRoot = new THREE.Group()
		const probeContent = this.cloneModelScene(template)
		this.prepareModelPreview(probeContent, probeItem, 'keep')
		probeRoot.add(probeContent)
		this.applyBoundModelWorldTransform(probeRoot, placeholderMesh)
		this.fitBoundModelToPlaceholderWorld(probeRoot, placeholderMesh, probeItem)
		const modelBox = this.getWorldBox(probeRoot)
		if (!modelBox) return null
		const placeholderSize = placeholderBox.getSize(new THREE.Vector3())
		const modelSize = modelBox.getSize(new THREE.Vector3())
		const axes: FillAxis[] = ['x', 'y', 'z']
		const gaps = axes.map((axis) => ({
			axis,
			gap: placeholderSize[axis] - modelSize[axis]
		}))
		let best: FillSuggestion | null = null
		for (const entry of gaps.sort((left, right) => right.gap - left.gap)) {
			if (!Number.isFinite(entry.gap) || entry.gap <= 0.01) continue
			const rawCount = placeholderSize[entry.axis] / Math.max(modelSize[entry.axis], 0.0001)
			const countCandidates = [Math.floor(rawCount), Math.ceil(rawCount)]
				.filter(
					(count, index, list) =>
						Number.isFinite(count) && count >= 2 && list.indexOf(count) === index
				)
				.map((count) => Math.min(FILL_MAX_COUNT, count))
			if (!countCandidates.length) {
				countCandidates.push(2)
			}
			for (const count of countCandidates) {
				const axisScale =
					placeholderSize[entry.axis] / Math.max(modelSize[entry.axis] * count, 0.0001)
				const score = -entry.gap
				const suggestion: FillSuggestion = {
					axis: entry.axis,
					mode: entry.axis === 'x' ? 'fill-x' : entry.axis === 'y' ? 'fill-y' : 'fill-z',
					count,
					axisScale,
					score
				}
				if (!best || suggestion.score < best.score) best = suggestion
			}
		}
		return best
	}

	private classifyObjectSemantics(item: WorkflowSceneLayoutItem): ObjectSemanticClass {
		const keyElementType = String(item.keyElementType ?? '')
			.trim()
			.toLowerCase()
		const semanticRole = String(item.semanticRole ?? '')
			.trim()
			.toLowerCase()
		const placement = String(item.placement ?? '')
			.trim()
			.toLowerCase()
		const mountType = String(item.mountType ?? '')
			.trim()
			.toLowerCase()
		const supportSurface = String(item.supportSurface ?? '')
			.trim()
			.toLowerCase()
		const id = String(item.id ?? '')
			.trim()
			.toLowerCase()
		const relationTags = Array.isArray(item.relationTags)
			? item.relationTags.map((tag) =>
					String(tag ?? '')
						.trim()
						.toLowerCase()
				)
			: []

		if (
			keyElementType === 'floor' ||
			keyElementType === 'wall' ||
			keyElementType === 'ceiling' ||
			keyElementType === 'column' ||
			semanticRole === 'structure-shell' ||
			relationTags.includes('structural-shell') ||
			id === 'floor1' ||
			id === 'ceiling1' ||
			/wall\d+$/i.test(id)
		) {
			return 'structure'
		}

		if (isWallMountedSupportSurface(item)) {
			return 'wall-support'
		}

		if (isDeskLikeSurface(item)) {
			return 'support-surface'
		}

		if (
			placement.includes('ceiling') ||
			supportSurface.includes('ceiling') ||
			supportSurface.includes('roof') ||
			mountType.includes('ceiling') ||
			mountType.includes('roof')
		) {
			return 'ceiling-mounted'
		}

		const isExplicitlyFloorStanding =
			mountType.includes('floor') ||
			placement === 'on-floor' ||
			semanticRole.includes('floor-standing') ||
			item.shouldTouchGround === true

		const isExplicitlyWallMounted =
			mountType.includes('wall') ||
			placement.includes('wall') ||
			supportSurface.includes('wall')

		const tokens = [
			String(item.name ?? ''),
			String(item.category ?? ''),
			String(item.subCategory ?? ''),
			semanticRole
		]
			.join(' ')
			.toLowerCase()

		const isFloorStandingByToken =
			!isExplicitlyWallMounted &&
			/(chair|seat|sofa|couch|table|desk|cabinet|wardrobe|bed|stool|bench|bookcase|bookshelf|椅|沙发|桌|柜|床|凳|衣柜|书柜|书架)/.test(
				tokens
			)

		if (isExplicitlyFloorStanding || isFloorStandingByToken) {
			return 'floor-standing'
		}

		if (isWallSurfaceLike(item)) {
			return 'wall-mounted'
		}

		if (
			placement === 'on-top' ||
			supportSurface === 'table' ||
			supportSurface.includes('desk') ||
			semanticRole.includes('surface-placed')
		) {
			return 'surface-placed'
		}

		if (
			/(lamp|light|chandelier|pendant|灯|吊灯|吸顶灯)/.test(tokens)
		) {
			if (mountType.includes('ceiling') || /ceiling|pendant|chandelier|吊|吸顶/.test(tokens)) {
				return 'ceiling-mounted'
			}
			return 'floor-standing'
		}
		if (
			/(monitor|computer|screen|display|keyboard|mouse|cup|bottle|book|phone|laptop|显示器|键盘|鼠标|杯子|书|手机|笔记本)/.test(
				tokens
			)
		) {
			return 'surface-placed'
		}
		if (
			/(picture|poster|painting|mirror|tv|shelf|hook|rack|画|海报|镜子|电视|壁挂|挂钩)/.test(tokens)
		) {
			return 'wall-mounted'
		}

		return 'unknown'
	}

	private getAllowedOrientationCandidates(item: WorkflowSceneLayoutItem): OrientationOffset[] {
		const semanticClass = this.classifyObjectSemantics(item)
		const yawSet = [0, 90, 180, -90]
		const wallYaw = canonicalWallRoleYaw(canonicalWallRole(item.wallRole))

		switch (semanticClass) {
			case 'structure':
				return [{ yaw: 0, pitch: 0, roll: 0 }]
			case 'floor-standing':
			case 'surface-placed':
			case 'support-surface':
			case 'unknown':
				return yawSet.map((yaw) => ({ yaw, pitch: 0, roll: 0 }))
			case 'wall-mounted':
			case 'wall-support': {
				const candidates: OrientationOffset[] = []
				for (const yaw of [wallYaw, normalizeAngleDeg(wallYaw + 180)]) {
					candidates.push({ yaw, pitch: 0, roll: 0 })
				}
				return candidates
			}
			case 'ceiling-mounted':
				return yawSet.map((yaw) => ({ yaw, pitch: -90, roll: 0 }))
			default:
				return yawSet.map((yaw) => ({ yaw, pitch: 0, roll: 0 }))
		}
	}

	private getAlignmentRule(
		item: WorkflowSceneLayoutItem,
		semanticClass?: ObjectSemanticClass
	): AlignmentRule {
		const cls = semanticClass ?? this.classifyObjectSemantics(item)
		switch (cls) {
			case 'ceiling-mounted':
				return { x: 'center', y: 'max', z: 'center' }
			case 'wall-mounted':
			case 'wall-support': {
				const role = canonicalWallRole(item.wallRole)
				if (role === 'left') return { x: 'min', y: 'center', z: 'center' }
				if (role === 'right') return { x: 'max', y: 'center', z: 'center' }
				if (role === 'back') return { x: 'center', y: 'center', z: 'max' }
				return { x: 'center', y: 'center', z: 'min' }
			}
			case 'floor-standing':
			case 'surface-placed':
			case 'support-surface':
			case 'unknown':
			case 'structure':
			default:
				return { x: 'center', y: 'min', z: 'center' }
		}
	}

	private calculateUniformScaleToFit(
		modelSize: { x: number; y: number; z: number },
		targetSize: { x: number; y: number; z: number }
	): number {
		const sx = targetSize.x / Math.max(modelSize.x, 0.001)
		const sy = targetSize.y / Math.max(modelSize.y, 0.001)
		const sz = targetSize.z / Math.max(modelSize.z, 0.001)
		return Math.max(0.0001, Math.min(sx, sy, sz))
	}

	private alignModelToTarget(
		modelObject: Object3Dlike,
		targetMin: { x: number; y: number; z: number },
		targetMax: { x: number; y: number; z: number },
		rule: AlignmentRule
	) {
		const modelBox = this.getWorldBox(modelObject)
		if (!modelBox) return

		const modelSize = modelBox.getSize(new THREE.Vector3())
		const modelMin = modelBox.min
		const modelCenter = modelBox.getCenter(new THREE.Vector3())
		const targetSize = {
			x: targetMax.x - targetMin.x,
			y: targetMax.y - targetMin.y,
			z: targetMax.z - targetMin.z
		}
		const targetCenter = {
			x: (targetMin.x + targetMax.x) * 0.5,
			y: (targetMin.y + targetMax.y) * 0.5,
			z: (targetMin.z + targetMax.z) * 0.5
		}

		const getOffset = (axis: 'x' | 'y' | 'z', align: 'min' | 'center' | 'max') => {
			switch (align) {
				case 'min':
					return targetMin[axis] - modelMin[axis]
				case 'max':
					return targetMax[axis] - (modelMin[axis] + modelSize[axis])
				case 'center':
					return targetCenter[axis] - modelCenter[axis]
			}
		}

		modelObject.position.x += getOffset('x', rule.x)
		modelObject.position.y += getOffset('y', rule.y)
		modelObject.position.z += getOffset('z', rule.z)
		modelObject.updateMatrixWorld(true)
	}

	private prepareModelPreview(
		object: Object3Dlike,
		item: WorkflowSceneLayoutItem,
		mode: 'auto' | 'manual' | 'keep'
	) {
		const target = new THREE.Vector3(...this.resolvePlaceholderWorldSize(item).toArray())
		const baseScale = object.scale.clone()
		const baseQuaternion = object.quaternion.clone()
		const basePosition = object.position.clone()

		const existingOffset = this.resolveExistingOrientationOffset(item)
		
		const decision = this.resolveOrientationDecision(
			object,
			baseScale,
			baseQuaternion,
			basePosition,
			target,
			item,
			existingOffset,
			mode
		)

		object.position.copy(basePosition)
		object.scale.copy(baseScale)
		object.quaternion.copy(baseQuaternion)
		object.quaternion.multiply(
			new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					THREE.MathUtils.degToRad(decision.offset.pitch),
					THREE.MathUtils.degToRad(decision.offset.yaw),
					THREE.MathUtils.degToRad(decision.offset.roll),
					'XYZ'
				)
			)
		)
		object.updateMatrixWorld(true)

		const rotatedBox = new THREE.Box3().setFromObject(object)
		if (!rotatedBox.isEmpty()) {
			const center = rotatedBox.getCenter(new THREE.Vector3())
			const min = rotatedBox.min.clone()
			object.position.x += -center.x
			object.position.y += -min.y
			object.position.z += -center.z
			object.updateMatrixWorld(true)
		}

		const nextFix = {
			mode:
				mode === 'manual'
					? 'manual'
					: mode === 'keep'
						? (item.orientationFix?.mode ?? 'auto')
						: 'auto',
			yaw: roundOrientation(decision.offset.yaw),
			pitch: roundOrientation(decision.offset.pitch),
			roll: roundOrientation(decision.offset.roll),
			confidence: decision.best.score <= 0.45 ? ('high' as const) : ('low' as const),
			updatedAt: Date.now()
		}
		const previousFix = item.orientationFix
		if (mode === 'keep') return false
		const changed =
			!previousFix ||
			previousFix.mode !== nextFix.mode ||
			previousFix.confidence !== nextFix.confidence ||
			!orientationOffsetEquals(
				{
					yaw: safeNumber(previousFix.yaw, 0),
					pitch: safeNumber(previousFix.pitch, 0),
					roll: safeNumber(previousFix.roll, 0)
				},
				{ yaw: nextFix.yaw, pitch: nextFix.pitch, roll: nextFix.roll }
			)
		if (changed) item.orientationFix = nextFix
		return changed
	}

	private createBoundModelRoot(
		modelContent: GltfTemplateLike,
		placeholderMesh: MeshLike,
		item: WorkflowSceneLayoutItem
	) {
		const boundRoot = new THREE.Group()
		const fillAxis = fillModeToAxis(item.fillMode)
		const fillCount = Number(item.fillCount ?? 1)
		if (!fillAxis || !Number.isFinite(fillCount) || fillCount <= 1) {
			boundRoot.add(modelContent)
			this.applyBoundModelWorldTransform(boundRoot, placeholderMesh)
			this.fitBoundModelToPlaceholderWorld(boundRoot, placeholderMesh, item)
		} else {
			for (let index = 0; index < fillCount; index += 1) {
				const clone = this.cloneModelScene(modelContent)
				clone.updateMatrixWorld(true)
				boundRoot.add(clone)
			}
			this.applyBoundModelWorldTransform(boundRoot, placeholderMesh)
			this.arrangeFilledClonesInWorld(boundRoot, placeholderMesh, item)
		}
		return boundRoot
	}

	private applyBoundModelWorldTransform(boundRoot: Object3Dlike, placeholderMesh: Object3Dlike) {
		if (!boundRoot || !placeholderMesh) return
		boundRoot.position.copy(placeholderMesh.position)
		boundRoot.rotation.copy(placeholderMesh.rotation)
		boundRoot.updateMatrixWorld(true)
	}

	private getWorldBox(object: Object3Dlike): Box3Like | null {
		if (!object) return null
		object.updateMatrixWorld(true)
		const box = new THREE.Box3().setFromObject(object)
		return box.isEmpty() ? null : box
	}

	private arrangeFilledClonesInWorld(
		boundRoot: Object3Dlike,
		placeholderMesh: MeshLike,
		item: WorkflowSceneLayoutItem
	) {
		const fillAxis = fillModeToAxis(item.fillMode)
		if (!fillAxis) return
		const placeholderBox = this.getWorldBox(placeholderMesh)
		if (!placeholderBox) return
		const clones = boundRoot.children.slice()
		const count = clones.length
		if (!count) return

		const savedPos = boundRoot.position.clone()
		const savedQuat = boundRoot.quaternion.clone()
		boundRoot.position.set(0, 0, 0)
		boundRoot.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'XYZ'))
		boundRoot.scale.set(1, 1, 1)
		boundRoot.updateMatrixWorld(true)

		const placeholderSize = new THREE.Vector3(
			...this.resolvePlaceholderWorldSize(item).toArray()
		)
		const axisLength = placeholderSize[fillAxis] / Math.max(count, 1)
		const semanticClass = this.classifyObjectSemantics(item)
		const alignmentRule = this.getAlignmentRule(item, semanticClass)

		for (let index = 0; index < clones.length; index += 1) {
			const clone = clones[index]
			const cloneBox = this.getWorldBox(clone)
			if (!cloneBox) continue
			const cloneSize = cloneBox.getSize(new THREE.Vector3())

			const cellSize = {
				x: fillAxis === 'x' ? axisLength : placeholderSize.x,
				y: fillAxis === 'y' ? axisLength : placeholderSize.y,
				z: fillAxis === 'z' ? axisLength : placeholderSize.z
			}

			const uniformScale = this.calculateUniformScaleToFit(
				{ x: cloneSize.x, y: cloneSize.y, z: cloneSize.z },
				cellSize
			)
			clone.scale.multiplyScalar(uniformScale)
			clone.updateMatrixWorld(true)

			const cellMin = {
				x: fillAxis === 'x' ? placeholderBox.min.x + axisLength * index : placeholderBox.min.x,
				y: fillAxis === 'y' ? placeholderBox.min.y + axisLength * index : placeholderBox.min.y,
				z: fillAxis === 'z' ? placeholderBox.min.z + axisLength * index : placeholderBox.min.z
			}
			const cellMax = {
				x: fillAxis === 'x' ? cellMin.x + axisLength : placeholderBox.max.x,
				y: fillAxis === 'y' ? cellMin.y + axisLength : placeholderBox.max.y,
				z: fillAxis === 'z' ? cellMin.z + axisLength : placeholderBox.max.z
			}

			this.alignModelToTarget(clone, cellMin, cellMax, alignmentRule)
		}

		const cloneWorldTransforms = clones.map((clone) => {
			clone.updateMatrixWorld(true)
			const pos = new THREE.Vector3()
			const quat = new THREE.Quaternion()
			clone.getWorldPosition(pos)
			clone.getWorldQuaternion(quat)
			return { pos, quat }
		})

		boundRoot.position.copy(savedPos)
		boundRoot.quaternion.copy(savedQuat)
		boundRoot.scale.set(1, 1, 1)
		boundRoot.updateMatrixWorld(true)

		const invMatrix = new THREE.Matrix4().copy(boundRoot.matrixWorld).invert()
		const parentQuatInverse = new THREE.Quaternion().copy(boundRoot.quaternion).invert()
		for (let i = 0; i < clones.length; i += 1) {
			const clone = clones[i]
			const { pos: worldPos, quat: worldQuat } = cloneWorldTransforms[i]
			const localPos = worldPos.clone().applyMatrix4(invMatrix)
			clone.position.copy(localPos)
			const localQuat = parentQuatInverse.clone().multiply(worldQuat)
			clone.quaternion.copy(localQuat)
		}
		boundRoot.updateMatrixWorld(true)
	}

	private fitBoundModelToPlaceholderWorld(
		boundRoot: Object3Dlike,
		placeholderMesh: MeshLike,
		item: WorkflowSceneLayoutItem
	) {
		const placeholderBox = this.getWorldBox(placeholderMesh)
		if (!placeholderBox) return

		const savedPosition = boundRoot.position.clone()
		const savedQuaternion = boundRoot.quaternion.clone()

		boundRoot.position.set(0, 0, 0)
		boundRoot.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'XYZ'))
		boundRoot.scale.set(1, 1, 1)
		boundRoot.updateMatrixWorld(true)

		const modelBox = new THREE.Box3().setFromObject(boundRoot)
		const modelSize = modelBox.getSize(new THREE.Vector3())

		const placeholderSize = new THREE.Vector3(
			...this.resolvePlaceholderWorldSize(item).toArray()
		)

		const fillAxis = fillModeToAxis(item.fillMode)
		const isForced = item.fitMode === 'forced'
		const allowDeform = Boolean(
			(item as { allowDeformInForcedMode?: unknown }).allowDeformInForcedMode
		)
		const previewScaleMode = String(item.previewScaleMode ?? 'placeholder')
			.trim()
			.toLowerCase()
		const usePlaceholderScale = !isForced && previewScaleMode === 'placeholder'
		const semanticClass = this.classifyObjectSemantics(item)
		const alignmentRule = this.getAlignmentRule(item, semanticClass)

		let finalScale = new THREE.Vector3(1, 1, 1)

		if (fillAxis && !isForced) {
			const fillScale = placeholderSize[fillAxis] / Math.max(modelSize[fillAxis], 0.001)
			const uniformScale = Math.min(
				placeholderSize.x / Math.max(modelSize.x, 0.001),
				placeholderSize.y / Math.max(modelSize.y, 0.001),
				placeholderSize.z / Math.max(modelSize.z, 0.001)
			)
			const s = Math.max(0.0001, Math.min(fillScale, uniformScale))
			finalScale.set(s, s, s)
		} else {
			if (isForced && allowDeform) {
				const sx = placeholderSize.x / Math.max(modelSize.x, 0.001)
				const sy = placeholderSize.y / Math.max(modelSize.y, 0.001)
				const sz = placeholderSize.z / Math.max(modelSize.z, 0.001)
				finalScale.set(
					Math.max(0.0001, sx),
					Math.max(0.0001, sy),
					Math.max(0.0001, sz)
				)
			} else if (usePlaceholderScale) {
				const sx = placeholderSize.x / Math.max(modelSize.x, 0.001)
				const sy = placeholderSize.y / Math.max(modelSize.y, 0.001)
				const sz = placeholderSize.z / Math.max(modelSize.z, 0.001)
				finalScale.set(
					Math.max(0.0001, sx),
					Math.max(0.0001, sy),
					Math.max(0.0001, sz)
				)
			} else {
				const scaleFactor = this.calculateUniformScaleToFit(
					{ x: modelSize.x, y: modelSize.y, z: modelSize.z },
					{ x: placeholderSize.x, y: placeholderSize.y, z: placeholderSize.z }
				)
				finalScale.set(scaleFactor, scaleFactor, scaleFactor)
			}
		}

		boundRoot.position.copy(savedPosition)
		boundRoot.quaternion.copy(savedQuaternion)
		boundRoot.scale.copy(finalScale)
		boundRoot.updateMatrixWorld(true)

		this.alignModelToTarget(
			boundRoot,
			{ x: placeholderBox.min.x, y: placeholderBox.min.y, z: placeholderBox.min.z },
			{ x: placeholderBox.max.x, y: placeholderBox.max.y, z: placeholderBox.max.z },
			alignmentRule
		)
	}

	async adjustSelectedModelOrientation(): Promise<SceneLayoutActionResult> {
		return this.rotateSelectedModelByAxis('y')
	}

	async rotateSelectedModelByAxis(axis: 'x' | 'y' | 'z'): Promise<SceneLayoutActionResult> {
		if (!this.selectedId)
			return { ok: false, applied: false, mode: 'normal', message: t('aiworkflow.scenePreview.selectPlaceholderFirst') }
		const item = this.currentItems.find((entry) => entry.id === this.selectedId)
		const binding = this.bindingById.get(this.selectedId)
		const mesh = this.meshesById.get(this.selectedId)
		if (!item || !binding || !mesh) {
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noRotatableModel')
			}
		}
		const sourceUrl = String(binding.modelUrl ?? binding.modelAssetUrl ?? '').trim()
		if (!sourceUrl) {
			const fitChanged = this.setFitState(
				item,
				'normal',
				t('aiworkflow.scenePreview.noModelUrlForRotation')
			)
			if (fitChanged) this.emitLayoutChange()
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noModelUrlForRotation')
			}
		}
		try {
			const existingOffset = this.resolveExistingOrientationOffset(item)
			let cycled: OrientationOffset
			if (axis === 'x') {
				cycled = this.cycleOrientationPitch(existingOffset)
			} else if (axis === 'z') {
				cycled = this.cycleOrientationRoll(existingOffset)
			} else {
				cycled = this.cycleOrientationYaw(existingOffset)
			}
			const semanticClass = this.classifyObjectSemantics(item)
			const constrained = this.applyManualOrientationConstraint(cycled, semanticClass)

			item.orientationFix = {
				mode: 'manual',
				yaw: roundOrientation(constrained.yaw),
				pitch: roundOrientation(constrained.pitch),
				roll: roundOrientation(constrained.roll),
				confidence: 'low',
				updatedAt: Date.now()
			}

			this.clearFillState(item)

			const axisLabel = axis === 'x' ? 'X' : axis === 'y' ? 'Y' : 'Z'
			const angleLabel =
				axis === 'x'
					? roundOrientation(constrained.pitch)
					: axis === 'z'
						? roundOrientation(constrained.roll)
						: roundOrientation(constrained.yaw)
			const message = t('aiworkflow.scenePreview.rotatedTo', { axis: axisLabel, angle: angleLabel })

			await this.rebuildBoundModelForItem(this.selectedId, 'keep')

			const fitChanged = this.setFitState(item, 'oriented', message)
			if (fitChanged || item.orientationFix) this.emitLayoutChange()
			this.requestRender()
			return { ok: true, applied: true, mode: 'oriented', message }
		} catch {
			const fitChanged = this.setFitState(item, 'normal', t('aiworkflow.scenePreview.rotationModelLoadFailed'))
			if (fitChanged) this.emitLayoutChange()
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.rotationModelLoadFailed')
			}
		}
	}

	async resetSelectedModelOrientation(): Promise<SceneLayoutActionResult> {
		if (!this.selectedId)
			return { ok: false, applied: false, mode: 'normal', message: t('aiworkflow.scenePreview.selectPlaceholderFirst') }
		const item = this.currentItems.find((entry) => entry.id === this.selectedId)
		const binding = this.bindingById.get(this.selectedId)
		if (!item || !binding) {
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noResettableModel')
			}
		}
		if (!item.orientationFix) {
			return {
				ok: true,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.alreadyInitialRotation')
			}
		}
		try {
			item.orientationFix = undefined
			this.clearFillState(item)
			this.clearForcedFitState(item)

			const message = t('aiworkflow.scenePreview.rotationReset')

			await this.rebuildBoundModelForItem(this.selectedId, 'auto')

			const fitChanged = this.setFitState(item, 'normal', message)
			if (fitChanged || !item.orientationFix) this.emitLayoutChange()
			this.requestRender()
			return { ok: true, applied: true, mode: 'normal', message }
		} catch {
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.resetModelLoadFailed')
			}
		}
	}

	async cycleFillSelectedModel(): Promise<SceneLayoutActionResult> {
		if (!this.selectedId)
			return { ok: false, applied: false, mode: 'normal', message: t('aiworkflow.scenePreview.selectPlaceholderFirst') }
		const item = this.currentItems.find((entry) => entry.id === this.selectedId)
		const binding = this.bindingById.get(this.selectedId)
		const mesh = this.meshesById.get(this.selectedId)
		if (!item || !binding || !mesh) {
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noFillableModel')
			}
		}
		const sourceUrl = String(binding.modelUrl ?? binding.modelAssetUrl ?? '').trim()
		if (!sourceUrl) {
			const fitChanged = this.setFitState(
				item,
				'normal',
				t('aiworkflow.scenePreview.noModelUrlForFill')
			)
			if (fitChanged) this.emitLayoutChange()
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noModelUrlForFill')
			}
		}
		const template = await this.loadModelTemplate(sourceUrl, this.selectedId)
		if (item.fillMode) {
			this.clearFillState(item)
			const mode = item.orientationFix ? 'oriented' : 'normal'
			const message = t('aiworkflow.scenePreview.fillCanceled')
			this.setFitState(item, mode, message)
			await this.rebuildBoundModelForItem(this.selectedId, 'keep')
			this.emitLayoutChange()
			this.requestRender()
			return { ok: true, applied: true, mode, message }
		}
		const probe = this.cloneModelScene(template)
		const offset = this.resolveExistingOrientationOffset(item)
		probe.quaternion.multiply(
			new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					THREE.MathUtils.degToRad(offset.pitch),
					THREE.MathUtils.degToRad(offset.yaw),
					THREE.MathUtils.degToRad(offset.roll),
					'XYZ'
				)
			)
		)
		probe.updateMatrixWorld(true)
		const box = new THREE.Box3().setFromObject(probe)
		if (box.isEmpty()) {
			const fitChanged = this.setFitState(
				item,
				'normal',
				t('aiworkflow.scenePreview.modelNotMeasurable')
			)
			if (fitChanged) this.emitLayoutChange()
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.modelNotMeasurable')
			}
		}
		const size = box.getSize(new THREE.Vector3())
		const target = this.resolvePlaceholderWorldSize(item)
		const previewScaleMode = String(item.previewScaleMode ?? 'placeholder')
			.trim()
			.toLowerCase()
		const suggestion =
			this.resolveWorldFillSuggestion(mesh, template, item) ??
			this.resolveFillSuggestion(size, target, previewScaleMode)
		if (!suggestion) {
			const hadFill = !!item.fillMode
			this.clearFillState(item)
			if (hadFill || this.boundModelsById.has(this.selectedId)) {
				this.mountBoundModel(this.selectedId, item, mesh, template, 'keep', binding)
			}
			const message = hadFill
				? t('aiworkflow.scenePreview.fillAxisMismatch')
				: t('aiworkflow.scenePreview.fillTooManyUnconstrained')
			const fitChanged = this.setFitState(
				item,
				item.orientationFix ? 'oriented' : 'normal',
				message
			)
			if (hadFill || fitChanged) this.emitLayoutChange()
			this.requestRender()
			return {
				ok: false,
				applied: false,
				mode: item.orientationFix ? 'oriented' : 'normal',
				message
			}
		}
		item.fillMode = suggestion.mode
		item.fillCount = suggestion.count
		item.fillAxisScale = suggestion.axisScale
		item.fillUpdatedAt = Date.now()
		this.disposeBoundModel(this.selectedId)
		this.mountBoundModel(this.selectedId, item, mesh, template, 'keep', binding)
		const message = t('aiworkflow.scenePreview.loopFilled', { axis: fillAxisLabel(suggestion.axis), count: suggestion.count })
		this.setFitState(item, 'filled', message)
		this.emitLayoutChange()
		this.requestRender()
		return { ok: true, applied: true, mode: 'filled', message }
	}

	async forceFitSelectedModel(): Promise<SceneLayoutActionResult> {
		if (!this.selectedId)
			return { ok: false, applied: false, mode: 'normal', message: t('aiworkflow.scenePreview.selectPlaceholderFirst') }
		const item = this.currentItems.find((entry) => entry.id === this.selectedId)
		const binding = this.bindingById.get(this.selectedId)
		const mesh = this.meshesById.get(this.selectedId)
		if (!item || !binding || !mesh) {
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noFittableModel')
			}
		}
		const sourceUrl = String(binding.modelUrl ?? binding.modelAssetUrl ?? '').trim()
		if (!sourceUrl) {
			const fitChanged = this.setFitState(
				item,
				'normal',
				t('aiworkflow.scenePreview.noModelUrlForFit')
			)
			if (fitChanged) this.emitLayoutChange()
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.noModelUrlForFit')
			}
		}
		try {
			const template = await this.loadModelTemplate(sourceUrl, this.selectedId)
			this.clearFillState(item)
			item.fitMode = 'forced'
			item.fitUpdatedAt = Date.now()
			this.mountBoundModel(this.selectedId, item, mesh, template, 'keep', binding)
			const message = t('aiworkflow.scenePreview.forceFitApplied')
			this.setFitState(item, 'forced', message)
			this.emitLayoutChange()
			this.requestRender()
			return { ok: true, applied: true, mode: 'forced', message }
		} catch {
			const fitChanged = this.setFitState(item, 'normal', t('aiworkflow.scenePreview.fitModelLoadFailed'))
			if (fitChanged) this.emitLayoutChange()
			return {
				ok: false,
				applied: false,
				mode: 'normal',
				message: t('aiworkflow.scenePreview.fitModelLoadFailed')
			}
		}
	}

	private resolveExistingOrientationOffset(item: WorkflowSceneLayoutItem): OrientationOffset {
		const fix = item.orientationFix
		if (!fix || typeof fix !== 'object') return { yaw: 0, pitch: 0, roll: 0 }
		return {
			yaw: normalizeAngleDeg(safeNumber(fix.yaw, 0)),
			pitch: normalizeAngleDeg(safeNumber(fix.pitch, 0)),
			roll: normalizeAngleDeg(safeNumber(fix.roll, 0))
		}
	}

	private resolveShouldAutoAdjust(
		binding: WorkflowSceneLayoutModelBinding,
		item: WorkflowSceneLayoutItem
	) {
		if (item.orientationFix?.mode === 'manual') return false
		if (binding.sourceNodeType === 'manual') return true
		if (binding.sourceNodeType === 'meshy' || binding.sourceNodeType === 'model3d') return true
		return false
	}

	private resolveOrientationDecision(
		object: Object3Dlike,
		baseScale: Vector3Like,
		baseQuaternion: QuaternionLike,
		basePosition: Vector3Like,
		target: { x: number; y: number; z: number },
		item: WorkflowSceneLayoutItem,
		existingOffset: OrientationOffset,
		mode: 'auto' | 'manual' | 'keep'
	) {
		const allowedCandidates = this.getAllowedOrientationCandidates(item)
		const candidates = allowedCandidates.map((offset) =>
			this.measureOrientationCandidate(
				object,
				baseScale,
				baseQuaternion,
				basePosition,
				target,
				offset,
				item
			)
		)
		const current = this.measureOrientationCandidate(
			object,
			baseScale,
			baseQuaternion,
			basePosition,
			target,
			existingOffset,
			item
		)
		let best = current
		for (const candidate of candidates) {
			if (candidate.score < best.score) best = candidate
		}
		let nextOffset = existingOffset
		if (mode === 'manual') {
			const improvement = current.score - best.score
			if (improvement <= ORIENTATION_NEAR_MATCH_THRESHOLD) {
				const semanticClass = this.classifyObjectSemantics(item)
				if (semanticClass === 'wall-mounted' || semanticClass === 'wall-support') {
					nextOffset = best.offset
				} else {
					nextOffset = {
						yaw: normalizeAngleDeg(existingOffset.yaw + 180),
						pitch: existingOffset.pitch,
						roll: existingOffset.roll
					}
				}
			} else {
				nextOffset = best.offset
			}
		} else if (mode === 'auto') {
			const improvement = current.score - best.score
			nextOffset = improvement > ORIENTATION_IMPROVEMENT_THRESHOLD ? best.offset : existingOffset
		}
		if (mode !== 'keep') {
			nextOffset = this.applySurfaceFacingConstraint(nextOffset, item)
		} else {
			nextOffset = this.applyManualOrientationConstraint(
				nextOffset,
				this.classifyObjectSemantics(item)
			)
		}
		const finalBest = this.measureOrientationCandidate(
			object,
			baseScale,
			baseQuaternion,
			basePosition,
			target,
			nextOffset,
			item
		)
		return {
			offset: nextOffset,
			best: finalBest
		}
	}

	private measureOrientationCandidate(
		object: Object3Dlike,
		baseScale: Vector3Like,
		baseQuaternion: QuaternionLike,
		basePosition: Vector3Like,
		target: { x: number; y: number; z: number },
		offset: OrientationOffset,
		item?: WorkflowSceneLayoutItem
	): OrientationCandidate {
		object.position.copy(basePosition)
		object.scale.copy(baseScale)
		object.quaternion.copy(baseQuaternion)
		object.quaternion.multiply(
			new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					THREE.MathUtils.degToRad(offset.pitch),
					THREE.MathUtils.degToRad(offset.yaw),
					THREE.MathUtils.degToRad(offset.roll),
					'XYZ'
				)
			)
		)
		object.updateMatrixWorld(true)
		const box = new THREE.Box3().setFromObject(object)
		const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3())
		const sx = target.x / Math.max(0.001, size.x)
		const sy = target.y / Math.max(0.001, size.y)
		const sz = target.z / Math.max(0.001, size.z)
		const previewScaleMode = String(item?.previewScaleMode ?? 'placeholder')
			.trim()
			.toLowerCase()
		const effective = previewScaleMode === 'model' ? Math.max(0.0001, Math.min(sx, sy, sz)) : 1
		const normalized =
			previewScaleMode === 'model'
				? [
						(size.x * effective) / Math.max(target.x, 0.0001),
						(size.y * effective) / Math.max(target.y, 0.0001),
						(size.z * effective) / Math.max(target.z, 0.0001)
					]
				: [sx, sy, sz]
		const maxScale = Math.max(sx, sy, sz)
		const minScale = Math.max(0.0001, Math.min(sx, sy, sz))
		const scaleRatio = maxScale / minScale
		const logs = normalized.map((value) => Math.log(Math.max(value, 0.0001)))
		const avg = (logs[0] + logs[1] + logs[2]) / 3
		const variance = ((logs[0] - avg) ** 2 + (logs[1] - avg) ** 2 + (logs[2] - avg) ** 2) / 3
		let score =
			previewScaleMode === 'model'
				? Math.abs(1 - normalized[0]) + Math.abs(1 - normalized[1]) + Math.abs(1 - normalized[2])
				: Math.max(0, scaleRatio - 1) + Math.sqrt(Math.max(0, variance))

		if (item) {
			const semanticClass = this.classifyObjectSemantics(item)
			const ORIENTATION_PENALTY = 50
			switch (semanticClass) {
				case 'floor-standing':
				case 'surface-placed':
				case 'support-surface':
				case 'unknown':
					if (Math.abs(normalizeAngleDeg(offset.pitch)) > 5) score += ORIENTATION_PENALTY
					if (Math.abs(normalizeAngleDeg(offset.roll)) > 5) score += ORIENTATION_PENALTY
					break
				case 'wall-mounted':
				case 'wall-support':
					if (Math.abs(normalizeAngleDeg(offset.pitch)) > 5) score += ORIENTATION_PENALTY
					if (Math.abs(normalizeAngleDeg(offset.roll)) > 5) score += ORIENTATION_PENALTY
					break
				case 'ceiling-mounted':
					if (Math.abs(normalizeAngleDeg(offset.pitch) + 90) > 10) score += ORIENTATION_PENALTY
					if (Math.abs(normalizeAngleDeg(offset.roll)) > 5) score += ORIENTATION_PENALTY
					break
				case 'structure':
					if (Math.abs(normalizeAngleDeg(offset.pitch)) > 1) score += ORIENTATION_PENALTY
					if (Math.abs(normalizeAngleDeg(offset.roll)) > 1) score += ORIENTATION_PENALTY
					if (Math.abs(normalizeAngleDeg(offset.yaw)) > 1) score += ORIENTATION_PENALTY
					break
			}
		}

		return {
			offset,
			size,
			score,
			scaleRatio
		}
	}

	private applyManualOrientationConstraint(
		offset: OrientationOffset,
		_semanticClass: ObjectSemanticClass
	): OrientationOffset {
		return constrainManualOrientation(offset)
	}

	private applySurfaceFacingConstraint(
		offset: OrientationOffset,
		item: WorkflowSceneLayoutItem
	): OrientationOffset {
		const semanticClass = this.classifyObjectSemantics(item)
		let yaw = normalizeAngleDeg(offset.yaw)
		let pitch = normalizeAngleDeg(offset.pitch)
		let roll = normalizeAngleDeg(offset.roll)

		switch (semanticClass) {
			case 'floor-standing':
			case 'surface-placed':
			case 'support-surface':
			case 'unknown':
				pitch = 0
				roll = 0
				break
			case 'wall-mounted':
			case 'wall-support': {
				pitch = 0
				roll = 0
				const wallYaw = canonicalWallRoleYaw(canonicalWallRole(item.wallRole))
				const diff = normalizeAngleDeg(yaw - wallYaw)
				if (Math.abs(diff) > 90 + 5) {
					yaw = normalizeAngleDeg(yaw - 180)
				}
				break
			}
			case 'ceiling-mounted':
				pitch = -90
				roll = 0
				break
			case 'structure':
				yaw = 0
				pitch = 0
				roll = 0
				break
		}

		return {
			...offset,
			yaw,
			pitch,
			roll
		}
	}

	private captureObjectTransform(
		object: Object3Dlike,
		origin?: { x: number; y: number; z: number }
	) {
		object?.updateMatrixWorld?.(true)
		const worldPosition = new THREE.Vector3()
		const worldQuaternion = new THREE.Quaternion()
		const worldScale = new THREE.Vector3(1, 1, 1)
		object?.getWorldPosition?.(worldPosition)
		object?.getWorldQuaternion?.(worldQuaternion)
		object?.getWorldScale?.(worldScale)
		const euler = new THREE.Euler().setFromQuaternion(worldQuaternion, 'XYZ')
		return {
			position: {
				x: worldPosition.x - safeNumber(origin?.x, 0),
				y: worldPosition.y - safeNumber(origin?.y, 0),
				z: worldPosition.z - safeNumber(origin?.z, 0)
			},
			rotation: {
				yaw: roundOrientation(THREE.MathUtils.radToDeg(euler.y)),
				pitch: roundOrientation(THREE.MathUtils.radToDeg(euler.x)),
				roll: roundOrientation(THREE.MathUtils.radToDeg(euler.z))
			},
			quaternion: {
				x: Number(worldQuaternion.x || 0),
				y: Number(worldQuaternion.y || 0),
				z: Number(worldQuaternion.z || 0),
				w: Number(worldQuaternion.w || 1)
			},
			scale: {
				x: Number(worldScale.x || 1),
				y: Number(worldScale.y || 1),
				z: Number(worldScale.z || 1)
			}
		}
	}

	private captureLocalTransform(object: Object3Dlike) {
		const position = object?.position ?? new THREE.Vector3()
		const quaternion = object?.quaternion ?? new THREE.Quaternion()
		const scale = object?.scale ?? new THREE.Vector3(1, 1, 1)
		const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
		return {
			position: {
				x: safeNumber(position.x, 0),
				y: safeNumber(position.y, 0),
				z: safeNumber(position.z, 0)
			},
			rotation: {
				yaw: roundOrientation(THREE.MathUtils.radToDeg(euler.y)),
				pitch: roundOrientation(THREE.MathUtils.radToDeg(euler.x)),
				roll: roundOrientation(THREE.MathUtils.radToDeg(euler.z))
			},
			quaternion: {
				x: Number(quaternion.x || 0),
				y: Number(quaternion.y || 0),
				z: Number(quaternion.z || 0),
				w: Number(quaternion.w || 1)
			},
			scale: {
				x: safeNumber(scale.x, 1),
				y: safeNumber(scale.y, 1),
				z: safeNumber(scale.z, 1)
			}
		}
	}

	private captureObjectBounds(object: Object3Dlike) {
		const box = this.getWorldBox(object)
		if (!box) return null
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		return {
			min: { x: box.min.x, y: box.min.y, z: box.min.z },
			max: { x: box.max.x, y: box.max.y, z: box.max.z },
			center: { x: center.x, y: center.y, z: center.z },
			size: { x: size.x, y: size.y, z: size.z }
		}
	}

	private buildSurfaceSemantics(
		item: WorkflowSceneLayoutItem
	): WorkflowUnrealResolvedSurfaceSemantics {
		const placement = String(item.placement ?? '').trim() || undefined
		const supportSurface = String(item.supportSurface ?? '').trim() || undefined
		const mountType = String(item.mountType ?? '').trim() || undefined
		const wallRole = String(item.wallRole ?? '').trim() || undefined
		const anchor = String(item.anchor ?? '').trim() || undefined
		const semanticRole = String(item.semanticRole ?? '').trim() || undefined
		const category = this.resolveSurfaceCategory(item)
		return {
			category,
			placement,
			supportSurface,
			mountType,
			wallRole,
			anchor,
			semanticRole
		}
	}

	private resolveSurfaceCategory(
		item: WorkflowSceneLayoutItem
	): WorkflowUnrealResolvedSurfaceSemantics['category'] {
		const placement = String(item.placement ?? '')
			.trim()
			.toLowerCase()
		const supportSurface = String(item.supportSurface ?? '')
			.trim()
			.toLowerCase()
		const mountType = String(item.mountType ?? '')
			.trim()
			.toLowerCase()
		if (isWallMountedSupportSurface(item)) {
			return 'object'
		}
		if (
			placement.includes('wall') ||
			supportSurface.includes('wall') ||
			String(item.wallRole ?? '').trim().length > 0
		) {
			return 'wall'
		}
		if (
			placement.includes('ceiling') ||
			supportSurface.includes('ceiling') ||
			supportSurface.includes('roof') ||
			mountType.includes('ceiling') ||
			mountType.includes('roof')
		) {
			return 'ceiling'
		}
		if (
			placement.includes('floor') ||
			placement.includes('on-top') ||
			supportSurface.includes('floor') ||
			mountType.includes('floor')
		) {
			return 'floor'
		}
		if (String(item.parentId ?? '').trim()) return 'object'
		return 'unknown'
	}

	private resolveReferenceAnchors(item: WorkflowSceneLayoutItem): {
		parentAnchor: WorkflowUnrealResolvedParentReference['parentAnchor']
		childAnchor: WorkflowUnrealResolvedParentReference['childAnchor']
	} {
		const placement = String(item.placement ?? '')
			.trim()
			.toLowerCase()
		const category = this.resolveSurfaceCategory(item)
		if (placement === 'on-top') {
			return { parentAnchor: 'top', childAnchor: 'base' }
		}
		if (category === 'wall' || category === 'ceiling') {
			return { parentAnchor: 'surface', childAnchor: 'surface' }
		}
		return { parentAnchor: 'center', childAnchor: 'center' }
	}

	private captureTransformRelativeTo(object: Object3Dlike, parentObject?: Object3Dlike) {
		if (!object) return this.captureObjectTransform(object)
		object.updateMatrixWorld?.(true)
		if (!parentObject) return this.captureObjectTransform(object)
		parentObject.updateMatrixWorld?.(true)
		const localMatrix = new THREE.Matrix4()
		const inverseParentMatrix = new THREE.Matrix4().copy(parentObject.matrixWorld).invert()
		localMatrix.multiplyMatrices(inverseParentMatrix, object.matrixWorld)
		const position = new THREE.Vector3()
		const quaternion = new THREE.Quaternion()
		const scale = new THREE.Vector3(1, 1, 1)
		localMatrix.decompose(position, quaternion, scale)
		const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
		return {
			position: {
				x: safeNumber(position.x, 0),
				y: safeNumber(position.y, 0),
				z: safeNumber(position.z, 0)
			},
			rotation: {
				yaw: roundOrientation(THREE.MathUtils.radToDeg(euler.y)),
				pitch: roundOrientation(THREE.MathUtils.radToDeg(euler.x)),
				roll: roundOrientation(THREE.MathUtils.radToDeg(euler.z))
			},
			scale: {
				x: safeNumber(scale.x, 1),
				y: safeNumber(scale.y, 1),
				z: safeNumber(scale.z, 1)
			}
		}
	}

	private buildParentReference(
		item: WorkflowSceneLayoutItem,
		boundModel: Object3Dlike,
		actorOrigin: { x: number; y: number; z: number }
	): { parentReference: WorkflowUnrealResolvedParentReference; warnings: string[] } {
		const parentId = String(item.parentId ?? '').trim()
		const warnings: string[] = []
		if (!parentId) {
			return {
				parentReference: {
					mode: 'root',
					relativeTransform: this.captureObjectTransform(boundModel, actorOrigin)
				},
				warnings
			}
		}
		const parentBoundModel = this.boundModelsById.get(parentId)
		if (!parentBoundModel) {
			warnings.push(
				t('aiworkflow.scenePreview.warningParentNotGenerated', { name: item.name || item.id, parent: parentId })
			)
			return {
				parentReference: {
					mode: 'root',
					targetObjectId: parentId,
					relativeTransform: this.captureObjectTransform(boundModel, actorOrigin)
				},
				warnings
			}
		}
		const anchors = this.resolveReferenceAnchors(item)
		return {
			parentReference: {
				mode: 'parent-slot',
				targetObjectId: parentId,
				targetSlotId: parentId,
				parentAnchor: anchors.parentAnchor,
				childAnchor: anchors.childAnchor,
				relativeTransform: this.captureTransformRelativeTo(boundModel, parentBoundModel)
			},
			warnings
		}
	}

	private buildRelationLines() {
		for (const item of this.currentItems) {
			const parentId = String(item.parentId ?? '').trim()
			if (!parentId) continue
			const points = this.getRelationPoints(item.id, parentId, String(item.placement ?? ''))
			if (!points) continue
			if (!this.isFinitePoint(points[0]) || !this.isFinitePoint(points[1])) continue
			const material = new THREE.LineDashedMaterial({
				color:
					String(item.placement ?? '') === 'attached-to-wall'
						? '#fb923c'
						: item.inferred
							? '#fde68a'
							: '#86efac',
				dashSize: 10,
				gapSize: 6,
				transparent: true,
				opacity: 0.9
			})
			const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material)
			line.computeLineDistances()
			line.renderOrder = 3
			this.group.add(line)
			this.relationLines.push({
				childId: item.id,
				parentId,
				placement: String(item.placement ?? ''),
				line
			})
		}
	}

	private getRelationPoints(
		childId: string,
		parentId: string,
		placement: string
	): [Vector3Like, Vector3Like] | null {
		const childItem = this.currentItems.find((item) => item.id === childId)
		const parentItem = this.resolveParentItem(parentId)
		if (!childItem || !parentItem) return null
		const childAnchor = this.createAnchorPoint(childItem)
		const parentAnchor = this.createAnchorPoint(parentItem)
		return placement === 'on-top'
			? [parentAnchor.top, childAnchor.base]
			: [parentAnchor.center, childAnchor.center]
	}

	private createAnchorPoint(item: WorkflowSceneLayoutItem): AnchorPoint {
		const size = {
			width: item.size.width * (item.scale?.x ?? 1),
			height: item.size.height * (item.scale?.y ?? 1),
			depth: item.size.depth * (item.scale?.z ?? 1)
		}
		return {
			center: new THREE.Vector3(
				item.position.x,
				item.position.y + size.height * 0.5,
				item.position.z
			),
			base: new THREE.Vector3(item.position.x, item.position.y, item.position.z),
			top: new THREE.Vector3(item.position.x, item.position.y + size.height, item.position.z)
		}
	}

	private resolveParentItem(parentId: string): WorkflowSceneLayoutItem | undefined {
		const normalized = String(parentId ?? '').trim()
		const direct = this.currentItems.find((item) => item.id === normalized)
		if (direct) return direct
		if (
			normalized === 'ceiling' ||
			normalized === 'ceiling_main' ||
			normalized === 'auto-ceiling-shell'
		) {
			return this.currentItems.find(
				(item) =>
					String(item.id).includes('ceiling') || String(item.placement ?? '') === 'ceiling-shell'
			)
		}
		if (
			normalized === 'floor' ||
			normalized === 'floor_main' ||
			normalized === 'auto-floor-shell'
		) {
			return this.currentItems.find(
				(item) => String(item.id).includes('floor') || String(item.supportSurface ?? '') === 'floor'
			)
		}
		return undefined
	}

	private isFinitePoint(point: Vector3Like | null | undefined): boolean {
		return (
			!!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
		)
	}

	private pickObject(event: PointerEvent) {
		if (this.hidePlaceholderCubes) return
		const rect = this.canvas.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
		const cache = this.rightClickPickCache
		if (event.button === 0 && cache) {
			const dx = event.clientX - cache.x
			const dy = event.clientY - cache.y
			if (dx * dx + dy * dy <= 16 * 16 && now - cache.ts <= 140) {
				this.selectItem(cache.itemId)
				return
			}
		}
		this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
		this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
		this.raycaster.setFromCamera(this.pointer, this.camera)
		const pickTargets = Array.from(this.meshesById.values()).filter(
			(mesh: MeshLike) => mesh?.visible !== false
		)
		const intersects = this.raycaster.intersectObjects(pickTargets, false)
		let hit = intersects[0]?.object as Object3Dlike | undefined
		let nextId = ''
		while (hit && !nextId) {
			if ((hit.userData as { isPlaceholder?: boolean; itemId?: unknown }).isPlaceholder === true)
				nextId = String(
					(hit.userData as { isPlaceholder?: boolean; itemId?: unknown }).itemId ?? ''
				).trim()
			hit = hit.parent as Object3Dlike | undefined
		}
		this.rightClickPickCache = { ts: now, x: event.clientX, y: event.clientY, itemId: nextId }
		if (this.holePunchMode && nextId) {
			this.handleHolePunchPick(nextId)
		} else {
			this.selectItem(nextId)
		}
	}

	setSelectedItem(itemId: string) {
		this.selectItem(itemId)
	}

	private selectItem(itemId: string) {
		const nextSelectedId = this.hidePlaceholderCubes ? '' : String(itemId ?? '').trim()
		const selectionChanged = nextSelectedId !== this.selectedId
		if (!selectionChanged) {
			this.ensureTransformAttachmentValid()
			this.requestRender()
			return
		}
		const prevSelectedId = this.selectedId
		this.ensureTransformAttachmentValid()
		this.selectedId = nextSelectedId
		this.options.onSelectionChange?.(this.selectedId)
		if (prevSelectedId) {
			const prevMesh = this.meshesById.get(prevSelectedId)
			if (prevMesh) {
				const material = Array.isArray(prevMesh.material) ? prevMesh.material[0] : prevMesh.material
				if (material && 'emissive' in material && material.emissive) {
					material.emissive.set('#000000')
					if ('emissiveIntensity' in material) material.emissiveIntensity = 0
				}
			}
			const prevEdge = this.edgesById.get(prevSelectedId)
			if (prevEdge && 'opacity' in prevEdge.material) {
				prevEdge.material.opacity = 0.55
			}
		}
		if (this.selectedId) {
			const nextMesh = this.meshesById.get(this.selectedId)
			if (nextMesh) {
				const material = Array.isArray(nextMesh.material) ? nextMesh.material[0] : nextMesh.material
				if (material && 'emissive' in material && material.emissive) {
					material.emissive.set('#60a5fa')
					if ('emissiveIntensity' in material) material.emissiveIntensity = 0.35
				}
			}
			const nextEdge = this.edgesById.get(this.selectedId)
			if (nextEdge && 'opacity' in nextEdge.material) {
				nextEdge.material.opacity = 1
			}
		}
		const mesh = this.selectedId ? this.meshesById.get(this.selectedId) : null
		if (mesh && mesh.visible !== false && this.isObjectInSceneGraph(mesh)) {
			this.transformControls.attach(mesh)
			this.transformControls.visible = this.interactiveActive
		} else {
			this.transformControls.detach()
			this.transformControls.visible = false
		}
		this.requestRender()
	}

	setPlaceholderVisibility(visible: boolean) {
		this.hidePlaceholderCubes = visible !== true
		for (const mesh of this.meshesById.values()) mesh.visible = !this.hidePlaceholderCubes
		for (const edge of this.edgesById.values()) edge.visible = !this.hidePlaceholderCubes
		if (this.hidePlaceholderCubes) {
			this.selectItem('')
			return
		}
		this.requestRender()
	}

	private syncSelectedObjectToItem() {
		if (!this.selectedId) return
		const mesh = this.meshesById.get(this.selectedId)
		const item = this.currentItems.find((entry) => entry.id === this.selectedId)
		const edge = this.edgesById.get(this.selectedId)
		if (!mesh || !item) return
		item.position.x = mesh.position.x
		item.position.y = mesh.position.y
		item.position.z = mesh.position.z
		item.rotation = {
			yaw: THREE.MathUtils.radToDeg(mesh.rotation.y),
			pitch: THREE.MathUtils.radToDeg(mesh.rotation.x),
			roll: THREE.MathUtils.radToDeg(mesh.rotation.z)
		}
		item.scale = {
			x: mesh.scale.x,
			y: mesh.scale.y,
			z: mesh.scale.z
		}
		if (edge) {
			edge.position.copy(mesh.position)
			edge.rotation.copy(mesh.rotation)
			edge.scale.copy(mesh.scale)
		}
		const boundModel = this.boundModelsById.get(this.selectedId)
		if (boundModel) {
			this.applyBoundModelWorldTransform(boundModel, mesh)
			this.fitBoundModelToPlaceholderWorld(boundModel, mesh, item)
		}
		this.updateRelationLinesFor(this.selectedId)
	}

	private captureSelectedDragBaseline(): DragTransformBaseline | null {
		if (!this.selectedId) return null
		const mesh = this.meshesById.get(this.selectedId)
		if (!mesh) return null
		return {
			itemId: this.selectedId,
			position: {
				x: Number(mesh.position.x),
				y: Number(mesh.position.y),
				z: Number(mesh.position.z)
			},
			rotation: {
				x: Number(mesh.rotation.x),
				y: Number(mesh.rotation.y),
				z: Number(mesh.rotation.z)
			}
		}
	}

	private hasMeaningfulDragDelta() {
		const baseline = this.dragBaseline
		if (!baseline || !this.selectedId || baseline.itemId !== this.selectedId) return false
		const mesh = this.meshesById.get(this.selectedId)
		if (!mesh) return false
		const dx = Number(mesh.position.x) - baseline.position.x
		const dy = Number(mesh.position.y) - baseline.position.y
		const dz = Number(mesh.position.z) - baseline.position.z
		const positionDeltaSq = dx * dx + dy * dy + dz * dz
		if (positionDeltaSq > DRAG_POSITION_EPSILON * DRAG_POSITION_EPSILON) return true
		const rx = Math.abs(Number(mesh.rotation.x) - baseline.rotation.x)
		const ry = Math.abs(Number(mesh.rotation.y) - baseline.rotation.y)
		const rz = Math.abs(Number(mesh.rotation.z) - baseline.rotation.z)
		return (
			rx > DRAG_ROTATION_EPSILON_RAD ||
			ry > DRAG_ROTATION_EPSILON_RAD ||
			rz > DRAG_ROTATION_EPSILON_RAD
		)
	}

	private restoreFromDragBaseline() {
		const baseline = this.dragBaseline
		if (!baseline || !this.selectedId || baseline.itemId !== this.selectedId) return
		const mesh = this.meshesById.get(this.selectedId)
		if (!mesh) return
		mesh.position.set(baseline.position.x, baseline.position.y, baseline.position.z)
		mesh.rotation.set(baseline.rotation.x, baseline.rotation.y, baseline.rotation.z)
		this.syncSelectedObjectToItem()
	}

	private updateRelationLinesFor(itemId: string) {
		for (const entry of this.relationLines) {
			if (entry.childId !== itemId && entry.parentId !== itemId) continue
			const points = this.getRelationPoints(entry.childId, entry.parentId, entry.placement)
			if (!points) continue
			if (!this.isFinitePoint(points[0]) || !this.isFinitePoint(points[1])) continue
			entry.line.geometry.dispose()
			entry.line.geometry = new THREE.BufferGeometry().setFromPoints(points)
			entry.line.computeLineDistances()
		}
	}

	private emitLayoutChange() {
		this.options.onLayoutChange?.(this.currentItems.map(cloneItem))
	}

	private deleteSelectedItem() {
		const selectedId = this.selectedId
		if (!selectedId) return
		let changed = false
		const nextItems = this.currentItems
			.filter((item) => item.id !== selectedId)
			.map((item) => {
				if (String(item.parentId ?? '').trim() !== selectedId) return item
				changed = true
				return {
					...item,
					parentId: undefined,
					relationReason: undefined
				}
			})
		if (!changed && nextItems.length === this.currentItems.length) return
		this.selectedId = ''
		this.setLayout(nextItems, undefined, { transparent: this.transparent })
		this.emitLayoutChange()
	}

	private clearLayout() {
		this.pendingBindingRevision += 1
		this.pendingBindingSync = null
		this.dragDirty = false
		this.dragBaseline = null
		this.transforming = false
		this.transformControls.detach()
		this.transformControls.visible = false
		this.selectedId = ''
		this.meshesById.clear()
		this.edgesById.clear()
		for (const model of this.boundModelsById.values()) {
			this.group.remove(model)
			model.traverse((entry: Object3Dlike) => {
				if (entry instanceof THREE.Mesh) {
					const meshEntry = entry as unknown as DisposableMesh
					const geom = meshEntry.geometry as Disposable | undefined
					if (geom && typeof geom.dispose === 'function') geom.dispose()
					if (meshEntry.material) disposeMaterial(meshEntry.material as MaterialWithMaps | MaterialWithMaps[])
				}
			})
		}
		this.boundModelsById.clear()
		this.bindingById.clear()
		this.clearLightingPreview()
		for (const relation of this.relationLines.splice(0, this.relationLines.length)) {
			relation.line.geometry.dispose()
			const material = relation.line.material as Disposable
			material.dispose()
		}
		while (this.group.children.length) {
			const child: Object3Dlike | undefined = this.group.children.pop() as Object3Dlike | undefined
			if (!child) continue
			child.traverse((entry: Object3Dlike) => {
				if (entry instanceof THREE.Mesh) {
					const meshEntry = entry as unknown as DisposableMesh
					const geom = meshEntry.geometry as Disposable | undefined
					if (geom && typeof geom.dispose === 'function') geom.dispose()
					if (meshEntry.material) disposeMaterial(meshEntry.material as MaterialWithMaps | MaterialWithMaps[])
				}
			})
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
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		this.requestRender()
	}

	captureSnapshotDataUrl() {
		try {
			if (this.disposed) return ''
			const width = Math.max(1, Math.floor(this.canvas.width || this.canvas.clientWidth || 1))
			const height = Math.max(1, Math.floor(this.canvas.height || this.canvas.clientHeight || 1))
			this.renderer.render(this.scene, this.camera)
			const snapshotCanvas = document.createElement('canvas')
			snapshotCanvas.width = width
			snapshotCanvas.height = height
			const ctx = snapshotCanvas.getContext('2d')
			if (!ctx) return ''
			ctx.drawImage(this.canvas, 0, 0, width, height)
			return snapshotCanvas.toDataURL('image/png')
		} catch {
			return ''
		}
	}

	getViewState(): SceneLayoutViewState | null {
		if (this.disposed) return null
		if (!this.currentItems.length) return null
		const cam = this.camera
		return {
			cameraPosition: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
			target: {
				x: this.controls.target.x,
				y: this.controls.target.y,
				z: this.controls.target.z
			}
		}
	}

	private updateIdleLoop() {
		const shouldIdle =
			this.interactiveActive && !this.previewModeActive && !this.renderSuspended && !this.disposed
		if (shouldIdle && !this.idleTimer) {
			this.idleTimer = setInterval(() => {
				if (this.disposed || this.renderSuspended || !this.interactiveActive) {
					this.stopIdleLoop()
					return
				}
				this.requestRender()
			}, 800)
		} else if (!shouldIdle && this.idleTimer) {
			this.stopIdleLoop()
		}
	}

	private stopIdleLoop() {
		if (this.idleTimer) {
			clearInterval(this.idleTimer)
			this.idleTimer = null
		}
	}

	setHolePunchStateChangeCallback(
		callback: ((state: {
			mode: boolean
			step: 'select-target' | 'select-tool'
			targetId: string
			toolId: string
		}) => void) | null
	) {
		this.onHolePunchStateChange = callback
	}

	startHolePunchMode() {
		if (this.hidePlaceholderCubes || !this.previewModeActive) return
		this.holePunchMode = true
		this.holePunchStep = 'select-target'
		this.holePunchTargetId = ''
		this.holePunchToolId = ''
		this.transformControls.detach()
		this.transformControls.visible = false
		this.clearHolePunchHighlights()
		this.emitHolePunchStateChange()
		this.requestRender()
	}

	cancelHolePunchMode() {
		if (!this.holePunchMode) return
		this.holePunchMode = false
		this.holePunchStep = 'select-target'
		this.holePunchTargetId = ''
		this.holePunchToolId = ''
		this.clearHolePunchHighlights()
		if (this.selectedId) {
			const mesh = this.meshesById.get(this.selectedId)
			if (mesh && mesh.visible !== false && this.isObjectInSceneGraph(mesh)) {
				this.transformControls.attach(mesh)
				this.transformControls.visible = this.interactiveActive
			}
		}
		this.emitHolePunchStateChange()
		this.requestRender()
	}

	private emitHolePunchStateChange() {
		this.onHolePunchStateChange?.({
			mode: this.holePunchMode,
			step: this.holePunchStep,
			targetId: this.holePunchTargetId,
			toolId: this.holePunchToolId
		})
	}

	private handleHolePunchPick(itemId: string) {
		if (!this.holePunchMode || !itemId) return
		if (this.holePunchStep === 'select-target') {
			this.holePunchTargetId = itemId
			this.holePunchStep = 'select-tool'
			this.updateHolePunchHighlights()
			this.emitHolePunchStateChange()
			this.requestRender()
		} else if (this.holePunchStep === 'select-tool') {
			if (itemId === this.holePunchTargetId) return
			this.holePunchToolId = itemId
			this.updateHolePunchHighlights()
			this.emitHolePunchStateChange()
			this.requestRender()
		}
	}

	private updateHolePunchHighlights() {
		this.clearHolePunchHighlights()
		if (this.holePunchTargetId) {
			this.createHolePunchHighlight(this.holePunchTargetId, '#22c55e')
		}
		if (this.holePunchToolId) {
			this.createHolePunchHighlight(this.holePunchToolId, '#f97316')
		}
	}

	private createHolePunchHighlight(itemId: string, color: string) {
		const mesh = this.meshesById.get(itemId)
		if (!mesh) return
		const geom = (mesh as unknown as { geometry?: unknown }).geometry
		if (!geom) return
		const highlightGeom = (geom as { clone?: () => unknown }).clone?.() ?? geom
		const highlightMat = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.25,
			side: THREE.DoubleSide,
			depthWrite: false
		})
		const highlight = new THREE.Mesh(highlightGeom as unknown, highlightMat)
		const meshAny = mesh as unknown as {
			position: Vector3Like
			rotation: { x: number; y: number; z: number; copy?: (v: unknown) => void }
			scale: Vector3Like
		}
		highlight.position.copy(meshAny.position as unknown as Vector3Like)
		highlight.rotation.copy(meshAny.rotation as unknown as { x: number; y: number; z: number })
		highlight.scale.copy(meshAny.scale as unknown as Vector3Like)
		highlight.renderOrder = 3
		;(highlight as unknown as { userData: Record<string, unknown> }).userData.isHolePunchHighlight = true
		this.group.add(highlight as unknown as Object3Dlike)
		this.holePunchHighlightMeshes.set(itemId, highlight as unknown as MeshLike)
	}

	private clearHolePunchHighlights() {
		for (const highlight of this.holePunchHighlightMeshes.values()) {
			this.group.remove(highlight)
			const geom = (highlight as unknown as { geometry?: Disposable }).geometry
			if (geom && typeof geom.dispose === 'function') geom.dispose()
			const mat = (highlight as unknown as { material?: MaterialWithMaps | MaterialWithMaps[] }).material
			if (mat) disposeMaterial(mat)
		}
		this.holePunchHighlightMeshes.clear()
	}

	async confirmHolePunch(): Promise<{ ok: boolean; message: string }> {
		if (!this.holePunchMode) return { ok: false, message: t('aiworkflow.scenePreview.notInHolePunchMode') }
		if (!this.holePunchTargetId) return { ok: false, message: t('aiworkflow.scenePreview.selectHoleTarget') }
		if (!this.holePunchToolId) return { ok: false, message: t('aiworkflow.scenePreview.selectHoleTool') }

		const targetItem = this.currentItems.find((item) => item.id === this.holePunchTargetId)
		const toolItem = this.currentItems.find((item) => item.id === this.holePunchToolId)
		if (!targetItem || !toolItem) return { ok: false, message: t('aiworkflow.scenePreview.placeholderNotFound') }

		const toolBinding = this.bindingById.get(this.holePunchToolId)
		if (!toolBinding) {
			return { ok: false, message: t('aiworkflow.scenePreview.toolNotBound') }
		}

		try {
			await this.applyHolePunch(targetItem, toolItem, toolBinding)
			const holePunchId = `hp_${Date.now()}`
			if (!targetItem.holePunches) targetItem.holePunches = []
			targetItem.holePunches.push({
				id: holePunchId,
				targetItemId: this.holePunchTargetId,
				toolItemId: this.holePunchToolId,
				createdAt: Date.now()
			})
			this.cancelHolePunchMode()
			this.emitLayoutChange()
			return { ok: true, message: t('aiworkflow.scenePreview.holePunchSuccess') }
		} catch (err) {
			const errMessage =
				isObject(err) && isString((err as { message?: unknown }).message)
					? (err as { message: string }).message
					: String(err ?? 'unknown')
			return { ok: false, message: t('aiworkflow.scenePreview.holePunchFailed', { error: errMessage }) }
		}
	}

	private async applyHolePunch(
		targetItem: WorkflowSceneLayoutItem,
		toolItem: WorkflowSceneLayoutItem,
		toolBinding: WorkflowSceneLayoutModelBinding
	) {
		const targetMesh = this.meshesById.get(targetItem.id)
		const toolMesh = this.meshesById.get(toolItem.id)
		if (!targetMesh || !toolMesh) {
			throw new Error(t('aiworkflow.scenePreview.meshNotFound'))
		}

		targetMesh.updateMatrixWorld(true)
		toolMesh.updateMatrixWorld(true)

		const targetBox3 = new THREE.Box3()
		;(targetBox3 as unknown as { setFromObject: (obj: unknown) => void }).setFromObject(targetMesh)
		const targetSizeVec = new THREE.Vector3()
		targetBox3.getSize(targetSizeVec)
		const maxTargetDim = Math.max(targetSizeVec.x, targetSizeVec.y, targetSizeVec.z)

		const toolQuat = new THREE.Quaternion()
		const toolPosVec = new THREE.Vector3()
		const toolScaleVec = new THREE.Vector3()
		;(toolMesh.matrixWorld as unknown as { decompose: (pos: unknown, quat: unknown, scale: unknown) => void }).decompose(toolPosVec, toolQuat, toolScaleVec)

		const toolCenter = new THREE.Vector3()
		const toolBox3 = new THREE.Box3()
		;(toolBox3 as unknown as { setFromObject: (obj: unknown) => void }).setFromObject(toolMesh)
		toolBox3.getCenter(toolCenter)

		const localAxisDirs = [
			new THREE.Vector3(1, 0, 0).applyQuaternion(toolQuat).normalize(),
			new THREE.Vector3(-1, 0, 0).applyQuaternion(toolQuat).normalize(),
			new THREE.Vector3(0, 1, 0).applyQuaternion(toolQuat).normalize(),
			new THREE.Vector3(0, -1, 0).applyQuaternion(toolQuat).normalize(),
			new THREE.Vector3(0, 0, 1).applyQuaternion(toolQuat).normalize(),
			new THREE.Vector3(0, 0, -1).applyQuaternion(toolQuat).normalize()
		]

		let bestDir = null
		let bestHitDist = Infinity
		const ray = new THREE.Ray()
		const hitPoint = new THREE.Vector3()

		for (const dir of localAxisDirs) {
			ray.set(toolCenter, dir)
			const hit = ray.intersectBox(targetBox3, hitPoint)
			if (hit) {
				const dist = toolCenter.distanceTo(hit)
				if (dist < bestHitDist) {
					bestHitDist = dist
					bestDir = dir.clone()
				}
			}
		}

		if (!bestDir) {
			const fallbackDir = new THREE.Vector3()
			targetBox3.getCenter(fallbackDir)
			fallbackDir.sub(toolCenter).normalize()
			bestDir = fallbackDir
			console.log('=== Hole Punch: No axis hit target, using fallback direction ===', bestDir)
		} else {
			console.log('=== Hole Punch: Detected punch direction ===', bestDir, 'hit distance:', bestHitDist)
		}

		const punchDir = bestDir.normalize()

		const toolLocalY = new THREE.Vector3(0, 1, 0).applyQuaternion(toolQuat)
		const yDotDir = toolLocalY.dot(punchDir)
		let vAxis = toolLocalY.clone().sub(punchDir.clone().multiplyScalar(yDotDir))
		if (vAxis.lengthSq() < 0.001) {
			vAxis.set(0, 0, 1)
			const zDotDir = vAxis.dot(punchDir)
			vAxis.sub(punchDir.clone().multiplyScalar(zDotDir))
		}
		vAxis.normalize()

		const uAxis = new THREE.Vector3().crossVectors(vAxis, punchDir).normalize()

		let geometrySource: unknown = null
		let needsDispose = false

		const existingBoundModel = this.boundModelsById.get(toolItem.id)
		if (existingBoundModel) {
			existingBoundModel.updateMatrixWorld(true)
			geometrySource = existingBoundModel
			console.log('=== Hole Punch: Using existing bound model from scene ===')
		} else {
			const modelUrl = toolBinding.modelUrl || toolBinding.modelAssetUrl
			if (!modelUrl) {
				throw new Error(t('aiworkflow.scenePreview.toolNoValidUrl'))
			}
			const template = await this.loadModelTemplate(modelUrl, toolItem.id)
			const modelContent = this.cloneModelScene(template)
			const toolModelRoot = this.createBoundModelRoot(modelContent, toolMesh, toolItem) as unknown as { traverse: (cb: (child: unknown) => void) => void; updateMatrixWorld: (force: boolean) => void }
			toolModelRoot.updateMatrixWorld(true)
			geometrySource = toolModelRoot
			needsDispose = true
			console.log('=== Hole Punch: Created new bound model for cross-section ===')
		}

		const modelGeometries: unknown[] = []
		;(geometrySource as { traverse: (cb: (child: unknown) => void) => void }).traverse((child: unknown) => {
			const childAny = child as Record<string, unknown>
			if (childAny.isMesh && childAny.geometry) {
				const geomAny = childAny.geometry as Record<string, unknown>
				const cloned = (geomAny.clone as () => unknown)()
				const clonedAny = cloned as Record<string, unknown>
				;(clonedAny.applyMatrix4 as (m: unknown) => void)(childAny.matrixWorld)
				modelGeometries.push(cloned)
			}
		})

		if (modelGeometries.length === 0) {
			const placeholderGeom = (toolMesh as unknown as { geometry: Record<string, unknown> }).geometry
			const placeholderCloned = (placeholderGeom.clone as () => unknown)()
			const placeholderClonedAny = placeholderCloned as Record<string, unknown>
			;(placeholderClonedAny.applyMatrix4 as (m: unknown) => void)(toolMesh.matrixWorld)
			modelGeometries.push(placeholderCloned)
		}

		const modelMergedGeom = this.mergeGeometries(modelGeometries) as { getAttribute: (name: string) => unknown; dispose?: () => void }
		modelGeometries.forEach(g => ((g as { dispose?: () => void }).dispose?.()))

		const modelPosAttr = (modelMergedGeom as { getAttribute: (name: string) => unknown }).getAttribute('position') as { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } | undefined

		const projectedPoints2D: { u: number; v: number; d: number }[] = []
		let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity, minD = Infinity, maxD = -Infinity

		if (modelPosAttr) {
			for (let i = 0; i < modelPosAttr.count; i++) {
				const px = modelPosAttr.getX(i)
				const py = modelPosAttr.getY(i)
				const pz = modelPosAttr.getZ(i)
				const u = px * uAxis.x + py * uAxis.y + pz * uAxis.z
				const v = px * vAxis.x + py * vAxis.y + pz * vAxis.z
				const d = px * punchDir.x + py * punchDir.y + pz * punchDir.z
				projectedPoints2D.push({ u, v, d })
				minU = Math.min(minU, u)
				maxU = Math.max(maxU, u)
				minV = Math.min(minV, v)
				maxV = Math.max(maxV, v)
				minD = Math.min(minD, d)
				maxD = Math.max(maxD, d)
			}
		} else {
			const fallbackPoints = [
				{ u: toolCenter.x - 0.5, v: toolCenter.y - 0.5, d: toolCenter.z - 0.5 },
				{ u: toolCenter.x + 0.5, v: toolCenter.y - 0.5, d: toolCenter.z - 0.5 },
				{ u: toolCenter.x + 0.5, v: toolCenter.y + 0.5, d: toolCenter.z - 0.5 },
				{ u: toolCenter.x - 0.5, v: toolCenter.y + 0.5, d: toolCenter.z - 0.5 },
				{ u: toolCenter.x - 0.5, v: toolCenter.y - 0.5, d: toolCenter.z + 0.5 },
				{ u: toolCenter.x + 0.5, v: toolCenter.y - 0.5, d: toolCenter.z + 0.5 },
				{ u: toolCenter.x + 0.5, v: toolCenter.y + 0.5, d: toolCenter.z + 0.5 },
				{ u: toolCenter.x - 0.5, v: toolCenter.y + 0.5, d: toolCenter.z + 0.5 }
			]
			projectedPoints2D.push(...fallbackPoints)
			minU = toolCenter.x - 0.5; maxU = toolCenter.x + 0.5
			minV = toolCenter.y - 0.5; maxV = toolCenter.y + 0.5
			minD = toolCenter.z - 0.5; maxD = toolCenter.z + 0.5
		}

		const centerU = (minU + maxU) * 0.5
		const centerV = (minV + maxV) * 0.5
		const centerD = (minD + maxD) * 0.5

		type Point2D = { x: number; y: number }
		const convexHull = (points: Point2D[]): Point2D[] => {
			if (points.length <= 1) return points
			const sorted = points.slice().sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x)
			const cross = (o: Point2D, a: Point2D, b: Point2D) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
			const lower: Point2D[] = []
			for (const p of sorted) {
				while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
				lower.push(p)
			}
			const upper: Point2D[] = []
			for (let i = sorted.length - 1; i >= 0; i--) {
				const p = sorted[i]
				while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
				upper.push(p)
			}
			lower.pop()
			upper.pop()
			return lower.concat(upper)
		}

		const rawHullPoints = convexHull(projectedPoints2D.map(p => ({ x: p.u, y: p.v })))
		const shrinkFactor = 0.92
		const hullPoints: Point2D[] = rawHullPoints.map(p => ({
			x: centerU + (p.x - centerU) * shrinkFactor,
			y: centerV + (p.y - centerV) * shrinkFactor
		}))

		const targetCorners = [
			new THREE.Vector3(targetBox3.min.x, targetBox3.min.y, targetBox3.min.z),
			new THREE.Vector3(targetBox3.min.x, targetBox3.min.y, targetBox3.max.z),
			new THREE.Vector3(targetBox3.min.x, targetBox3.max.y, targetBox3.min.z),
			new THREE.Vector3(targetBox3.min.x, targetBox3.max.y, targetBox3.max.z),
			new THREE.Vector3(targetBox3.max.x, targetBox3.min.y, targetBox3.min.z),
			new THREE.Vector3(targetBox3.max.x, targetBox3.min.y, targetBox3.max.z),
			new THREE.Vector3(targetBox3.max.x, targetBox3.max.y, targetBox3.min.z),
			new THREE.Vector3(targetBox3.max.x, targetBox3.max.y, targetBox3.max.z)
		]
		let targetMinD = Infinity, targetMaxD = -Infinity
		for (const corner of targetCorners) {
			const d = corner.dot(punchDir)
			targetMinD = Math.min(targetMinD, d)
			targetMaxD = Math.max(targetMaxD, d)
		}

		const startD = Math.min(minD, targetMinD) - 3.0
		const endD = Math.max(maxD, targetMaxD) + 3.0
		const stretchLength = endD - startD

		let stretchedGeom
		if (hullPoints.length >= 3) {
			const shape = new THREE.Shape()
			shape.moveTo(hullPoints[0].x - centerU, hullPoints[0].y - centerV)
			for (let i = 1; i < hullPoints.length; i++) {
				shape.lineTo(hullPoints[i].x - centerU, hullPoints[i].y - centerV)
			}
			shape.closePath()
			const extrudeSettings = {
				depth: stretchLength,
				bevelEnabled: false,
				steps: 1,
				curveSegments: 12
			}
			stretchedGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings)
			stretchedGeom.translate(0, 0, 0)
		} else {
			const rawCrossWidth = Math.max(0.05, maxU - minU)
			const rawCrossHeight = Math.max(0.05, maxV - minV)
			const crossWidth = rawCrossWidth * shrinkFactor
			const crossHeight = rawCrossHeight * shrinkFactor
			stretchedGeom = new THREE.BoxGeometry(crossWidth, crossHeight, stretchLength)
			stretchedGeom.translate(0, 0, stretchLength * 0.5)
		}

		const basisMatrix = new THREE.Matrix4()
		basisMatrix.makeBasis(uAxis, vAxis, punchDir)

		const startWorld = new THREE.Vector3(
			centerU * uAxis.x + centerV * vAxis.x + startD * punchDir.x,
			centerU * uAxis.y + centerV * vAxis.y + startD * punchDir.y,
			centerU * uAxis.z + centerV * vAxis.z + startD * punchDir.z
		)

		const positionMatrix = new THREE.Matrix4()
		positionMatrix.makeTranslation(startWorld.x, startWorld.y, startWorld.z)

		const transformMatrix = new THREE.Matrix4()
		transformMatrix.multiplyMatrices(positionMatrix, basisMatrix)

		stretchedGeom.applyMatrix4(transformMatrix)

		const debugModelBounds = new THREE.Box3().setFromBufferAttribute(modelMergedGeom.getAttribute('position') as unknown)
		console.log('=== Stretched Tool Geometry (Convex Hull) ===')
		console.log('Punch direction:', punchDir)
		console.log('uAxis:', uAxis, 'vAxis:', vAxis)
		console.log('Model bounds min:', debugModelBounds.min, 'max:', debugModelBounds.max)
		console.log('Model U range:', minU, 'to', maxU)
		console.log('Model V range:', minV, 'to', maxV)
		console.log('Model D range (along punch):', minD, 'to', maxD)
		console.log('Target D range:', targetMinD, 'to', targetMaxD)
		console.log('Stretch start/end D:', startD, endD, 'length:', stretchLength)
		console.log('Projected points count:', projectedPoints2D.length)
		console.log('Convex hull points count:', hullPoints.length)
		console.log('Hull points (local to center):', hullPoints.map(p => ({ x: p.x - centerU, y: p.y - centerV })))
		console.log('Start world:', startWorld)

		const stretchedMesh = new THREE.Mesh(
			stretchedGeom,
			new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
		)

		const targetGeomAny = targetMesh.geometry as Record<string, unknown>
		const targetWorldMatrix = targetMesh.matrixWorld
		const inverseTargetMatrix = new THREE.Matrix4()
		;(inverseTargetMatrix as unknown as { copy: (m: unknown) => unknown }).copy(targetWorldMatrix)
		;(inverseTargetMatrix as unknown as { invert: () => unknown }).invert()

		const targetWorldGeom = (targetGeomAny.clone as () => unknown)()
		;(targetWorldGeom as { applyMatrix4: (m: unknown) => void }).applyMatrix4(targetWorldMatrix)

		const csgModule = await import('three-bvh-csg')
		const { Brush, Evaluator, SUBTRACTION } = csgModule
		const evaluator = new Evaluator()

		const targetBrush = new Brush() as unknown as { geometry: unknown; material: unknown; markUpdated: () => void }
		targetBrush.geometry = targetWorldGeom
		targetBrush.material = new THREE.MeshBasicMaterial()
		targetBrush.markUpdated()

		const toolBrush = new Brush() as unknown as { geometry: unknown; material: unknown; markUpdated: () => void }
		toolBrush.geometry = stretchedMesh.geometry
		toolBrush.material = stretchedMesh.material
		toolBrush.markUpdated()

		const resultBrush = (evaluator as unknown as { evaluate: (a: unknown, b: unknown, c: unknown) => { geometry: Record<string, unknown> } }).evaluate(targetBrush, toolBrush, SUBTRACTION)
		const resultGeom = resultBrush.geometry

		const targetVertexCount = (targetWorldGeom as { getAttribute: (name: string) => { count: number } }).getAttribute('position')
		const resultVertexCount = (resultGeom as { getAttribute: (name: string) => { count: number } }).getAttribute('position')

		console.log('=== Hole Punch Result ===')
		console.log('Target vertex count:', targetVertexCount.count)
		console.log('Result vertex count:', resultVertexCount.count)
		console.log('CSG changed geometry:', targetVertexCount.count !== resultVertexCount.count)

		;(resultGeom as { applyMatrix4: (m: unknown) => void; computeBoundingBox: () => void; computeBoundingSphere: () => void; computeVertexNormals: () => void }).applyMatrix4(inverseTargetMatrix)
		;(resultGeom as { computeBoundingBox: () => void }).computeBoundingBox()
		;(resultGeom as { computeBoundingSphere: () => void }).computeBoundingSphere()
		;(resultGeom as { computeVertexNormals: () => void }).computeVertexNormals()

		const oldGeom = targetMesh.geometry as Disposable
		if (oldGeom && typeof oldGeom.dispose === 'function') {
			oldGeom.dispose()
		}
		targetMesh.geometry = resultGeom as unknown as Disposable

		const targetEdge = this.edgesById.get(targetItem.id)
		let newEdgeGeom: unknown = null
		if (targetEdge) {
			const oldEdgeGeom = targetEdge.geometry as Disposable
			if (oldEdgeGeom && typeof oldEdgeGeom.dispose === 'function') {
				oldEdgeGeom.dispose()
			}
			newEdgeGeom = new THREE.EdgesGeometry(resultGeom as unknown)
			;(targetEdge as unknown as { geometry: unknown }).geometry = newEdgeGeom
			targetEdge.scale.set(1, 1, 1)
		}

		const geomCloneFn = (resultGeom as Record<string, unknown>).clone as (() => unknown) | undefined
		const cachedGeom = geomCloneFn ? geomCloneFn.call(resultGeom) : resultGeom
		const cachedEdgeGeom = newEdgeGeom
			? ((newEdgeGeom as Record<string, unknown>).clone as (() => unknown) | undefined)?.call(newEdgeGeom) ?? newEdgeGeom
			: null
		const cacheKey = String(targetItem.id ?? '').trim()
		this.holedGeometryCache.set(cacheKey, { geometry: cachedGeom, edgeGeometry: cachedEdgeGeom })

		;(modelMergedGeom as { dispose?: () => void }).dispose?.()
		stretchedGeom.dispose()
		stretchedMesh.geometry.dispose()
		;(stretchedMesh.material as { dispose?: () => void }).dispose?.()
		;((targetBrush as unknown as { geometry?: { dispose?: () => void } }).geometry)?.dispose?.()
		;((toolBrush as unknown as { geometry?: { dispose?: () => void } }).geometry)?.dispose?.()

		if (needsDispose && geometrySource) {
			(geometrySource as unknown as { traverse?: (cb: (child: unknown) => void) => void }).traverse?.((child: unknown) => {
				const childAny = child as Record<string, unknown>
				if (childAny.isMesh && childAny.geometry) {
					((childAny.geometry as { dispose?: () => void }).dispose?.())
				}
			})
		}
	}

	private createStretchedToolGeometryFromPlaceholder(
		toolMesh: unknown,
		direction: { x: number; y: number; z: number },
		distance: number,
		toolCenter: { x: number; y: number; z: number }
	): unknown {
		const dirVec = new THREE.Vector3(direction.x, direction.y, direction.z).normalize()

		const toolWorldGeom = ((toolMesh as unknown as { geometry: { clone?: () => unknown } }).geometry.clone?.() ?? (toolMesh as unknown as { geometry: unknown }).geometry)
		const toolMatrixWorld = (toolMesh as unknown as { matrixWorld: unknown }).matrixWorld
		;(toolWorldGeom as { applyMatrix4?: (m: unknown) => void }).applyMatrix4?.(toolMatrixWorld)

		const toolQuat = new THREE.Quaternion()
		const toolPosVec = new THREE.Vector3()
		const toolScaleVec = new THREE.Vector3()
		;(toolMatrixWorld as { decompose: (pos: unknown, quat: unknown, scale: unknown) => void }).decompose(toolPosVec, toolQuat, toolScaleVec)

		const toolLocalY = new THREE.Vector3(0, 1, 0).applyQuaternion(toolQuat)

		const vAxis = toolLocalY.clone()
		const vDotDir = vAxis.dot(dirVec)
		vAxis.sub(dirVec.clone().multiplyScalar(vDotDir))
		if (vAxis.lengthSq() < 0.001) {
			vAxis.set(0, 0, 1)
			const vDotDir2 = vAxis.dot(dirVec)
			vAxis.sub(dirVec.clone().multiplyScalar(vDotDir2))
		}
		vAxis.normalize()

		const uAxis = new THREE.Vector3().crossVectors(dirVec, vAxis).normalize()

		const posAttr = (toolWorldGeom as unknown as { getAttribute: (name: string) => unknown }).getAttribute('position')
		let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity

		if (posAttr) {
			const positions = posAttr as unknown as { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number }
			for (let i = 0; i < positions.count; i++) {
				const px = positions.getX(i)
				const py = positions.getY(i)
				const pz = positions.getZ(i)
				const u = px * uAxis.x + py * uAxis.y + pz * uAxis.z
				const v = px * vAxis.x + py * vAxis.y + pz * vAxis.z
				minU = Math.min(minU, u)
				maxU = Math.max(maxU, u)
				minV = Math.min(minV, v)
				maxV = Math.max(maxV, v)
			}
		}

		const crossWidth = Math.max(0.05, maxU - minU)
		const crossHeight = Math.max(0.05, maxV - minV)
		const stretchLength = distance * 2

		const stretchedBox = new THREE.BoxGeometry(crossWidth, crossHeight, stretchLength)

		;(stretchedBox as { translate?: (x: number, y: number, z: number) => void }).translate?.(0, 0, stretchLength * 0.5)

		const basisMatrix = new THREE.Matrix4()
		basisMatrix.makeBasis(uAxis, vAxis, dirVec)

		const positionMatrix = new THREE.Matrix4()
		;(positionMatrix as unknown as { makeTranslation: (x: number, y: number, z: number) => void }).makeTranslation(toolCenter.x, toolCenter.y, toolCenter.z)

		const transformMatrix = new THREE.Matrix4()
		transformMatrix.multiply(positionMatrix)
		transformMatrix.multiply(basisMatrix)

		stretchedBox.applyMatrix4(transformMatrix)

		const resultBounds = new THREE.Box3()
		const resultPosAttr = (stretchedBox as unknown as { getAttribute: (name: string) => unknown }).getAttribute('position')
		;(resultBounds as unknown as { setFromBufferAttribute: (attr: unknown) => void }).setFromBufferAttribute(resultPosAttr)

		console.log('=== Stretched Placeholder Debug ===')
		console.log('Direction:', dirVec)
		console.log('Tool center:', toolCenter)
		console.log('uAxis:', uAxis, 'vAxis:', vAxis)
		console.log('Cross width/height:', crossWidth, crossHeight)
		console.log('Stretch length:', stretchLength)
		console.log('Result bounds min:', resultBounds.min)
		console.log('Result bounds max:', resultBounds.max)

		;(toolWorldGeom as { dispose?: () => void }).dispose?.()

		return stretchedBox
	}

	private createStretchedToolGeometry(
		toolModel: Object3Dlike,
		direction: { x: number; y: number; z: number },
		distance: number,
		localCenter: { x: number; y: number; z: number }
	): unknown {
		console.log('=== Stretched Tool Geometry Debug ===')
		console.log('Direction:', direction)
		console.log('Distance:', distance)
		console.log('Local center:', localCenter)

		const mergedGeometries: unknown[] = []

		;(toolModel as unknown as { updateMatrixWorld: (force: boolean) => void }).updateMatrixWorld(true)

		toolModel.traverse((child: Object3Dlike) => {
			const childMesh = child as unknown as { isMesh?: boolean; geometry?: unknown; matrixWorld?: unknown }
			if (childMesh.isMesh && childMesh.geometry) {
				const geom = (childMesh.geometry as { clone?: () => unknown }).clone?.()
				if (!geom) return
				const childMatrix = new THREE.Matrix4() as unknown as { copy: (m: unknown) => void }
				childMatrix.copy(childMesh.matrixWorld)
				;(geom as { applyMatrix4?: (m: unknown) => void }).applyMatrix4?.(childMatrix)
				mergedGeometries.push(geom)
			}
		})

		console.log('Merged geometries count:', mergedGeometries.length)

		if (mergedGeometries.length === 0) {
			console.log('No geometries found, returning fallback box')
			return new THREE.BoxGeometry(1, 1, 1)
		}

		const merged = this.mergeGeometries(mergedGeometries as unknown[])
		const posAttr = (merged as unknown as { getAttribute: (name: string) => unknown }).getAttribute('position')
		if (!posAttr) {
			console.log('No position attribute, returning fallback box')
			return new THREE.BoxGeometry(1, 1, 1)
		}

		const dirVec = new THREE.Vector3(direction.x, direction.y, direction.z).normalize()

		const geomBounds = new THREE.Box3()
		;(geomBounds as unknown as { setFromBufferAttribute: (attr: unknown) => void }).setFromBufferAttribute(posAttr)

		const geomCenter = new THREE.Vector3() as unknown as Vector3Like
		;(geomBounds as unknown as { getCenter: (target: Vector3Like) => void }).getCenter(geomCenter)

		const geomSize = new THREE.Vector3() as unknown as Vector3Like
		;(geomBounds as unknown as { getSize: (target: Vector3Like) => void }).getSize(geomSize)

		console.log('Model bounds min:', (geomBounds as unknown as { min: Vector3Like }).min)
		console.log('Model bounds max:', (geomBounds as unknown as { max: Vector3Like }).max)
		console.log('Model center:', geomCenter)
		console.log('Model size:', geomSize)

		const crossWidth = Math.max(0.1, geomSize.x)
		const crossHeight = Math.max(0.1, geomSize.y)
		const stretchLength = distance * 2

		const stretchedBox = new THREE.BoxGeometry(crossWidth, crossHeight, stretchLength)

		const zAxis = new THREE.Vector3(0, 0, 1)
		const quaternion = new THREE.Quaternion()
		;(quaternion as unknown as { setFromUnitVectors: (a: unknown, b: unknown) => void }).setFromUnitVectors(zAxis, dirVec)

		const rotationMatrix = new THREE.Matrix4()
		;(rotationMatrix as unknown as { makeRotationFromQuaternion: (q: unknown) => void }).makeRotationFromQuaternion(quaternion)

		;(stretchedBox as { applyMatrix4?: (m: unknown) => void }).applyMatrix4?.(rotationMatrix)

		const offsetVec = new THREE.Vector3(dirVec.x, dirVec.y, dirVec.z) as unknown as Vector3Like
		offsetVec.multiplyScalar(stretchLength * 0.5)

		;(stretchedBox as { translate?: (x: number, y: number, z: number) => void }).translate?.(
			localCenter.x + offsetVec.x,
			localCenter.y + offsetVec.y,
			localCenter.z + offsetVec.z
		)

		const stretchedBounds = new THREE.Box3()
		;(stretchedBounds as unknown as { setFromBufferAttribute: (attr: unknown) => void }).setFromBufferAttribute((stretchedBox as unknown as { getAttribute: (name: string) => unknown }).getAttribute('position'))
		console.log('Stretched box bounds min:', (stretchedBounds as unknown as { min: Vector3Like }).min)
		console.log('Stretched box bounds max:', (stretchedBounds as unknown as { max: Vector3Like }).max)

		return stretchedBox
	}

	private mergeGeometries(geometries: unknown[]): unknown {
		if (geometries.length === 0) return new THREE.BufferGeometry()
		if (geometries.length === 1) return geometries[0]

		const merged = new THREE.BufferGeometry()
		const positions: number[] = []
		const normals: number[] = []
		const uvs: number[] = []
		const indices: number[] = []
		let indexOffset = 0

		for (const geom of geometries) {
			const geomAny = geom as {
				getAttribute?: (name: string) => unknown
				index?: unknown
			}
			const posAttr = geomAny.getAttribute?.('position') as {
				count: number
				getX: (i: number) => number
				getY: (i: number) => number
				getZ: (i: number) => number
			} | undefined
			if (!posAttr) continue

			const normAttr = geomAny.getAttribute?.('normal') as {
				count: number
				getX: (i: number) => number
				getY: (i: number) => number
				getZ: (i: number) => number
			} | undefined
			const uvAttr = geomAny.getAttribute?.('uv') as {
				count: number
				getX: (i: number) => number
				getY: (i: number) => number
			} | undefined

			for (let i = 0; i < posAttr.count; i++) {
				positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
				if (normAttr) {
					normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i))
				}
				if (uvAttr) {
					uvs.push(uvAttr.getX(i), uvAttr.getY(i))
				}
			}

			const indexAttr = geomAny.index as {
				count: number
				getX: (i: number) => number
			} | undefined
			if (indexAttr) {
				for (let i = 0; i < indexAttr.count; i++) {
					indices.push(indexAttr.getX(i) + indexOffset)
				}
			} else {
				for (let i = 0; i < posAttr.count; i++) {
					indices.push(i + indexOffset)
				}
			}

			indexOffset += posAttr.count
		}

		merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		if (normals.length > 0) {
			merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
		}
		if (uvs.length > 0) {
			merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		}
		merged.setIndex(indices)

		return merged
	}

	setExportLogCallback(callback: ((message: string) => void) | null) {
		this.exportLogCallback = callback
	}

	private logExport(message: string) {
		console.log(`[GLB Export] ${message}`)
		this.exportLogCallback?.(message)
	}

	private sanitizeGeometry(geom: Record<string, unknown>): Record<string, unknown> {
		try {
			const getAttributeFn = geom.getAttribute as ((name: string) => unknown) | undefined
			const posAttr = getAttributeFn?.call(geom, 'position') as {
				count: number
				getX: (i: number) => number
				getY: (i: number) => number
				getZ: (i: number) => number
				setXYZ: (i: number, x: number, y: number, z: number) => void
			} | undefined
			if (!posAttr || !posAttr.count) return geom

			let badVertices = 0
			const isFiniteNumber = (v: number) => typeof v === 'number' && Number.isFinite(v) && !Number.isNaN(v)
			for (let i = 0; i < posAttr.count; i++) {
				const x = posAttr.getX(i)
				const y = posAttr.getY(i)
				const z = posAttr.getZ(i)
				if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
					posAttr.setXYZ(i, 0, 0, 0)
					badVertices++
				}
			}
			if (badVertices > 0) {
				this.logExport(t('aiworkflow.scenePreview.exportLog.fixedVertices', { count: badVertices }))
			}

			const computeVertexNormals = geom.computeVertexNormals as (() => void) | undefined
			computeVertexNormals?.call(geom)
			const computeBoundingBox = geom.computeBoundingBox as (() => void) | undefined
			computeBoundingBox?.call(geom)
			const computeBoundingSphere = geom.computeBoundingSphere as (() => void) | undefined
			computeBoundingSphere?.call(geom)
		} catch (err) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.vertexCleanupError', { error: err instanceof Error ? err.message : String(err) }))
		}
		return geom
	}

	async exportPlaceholderGLB(itemId: string, name?: string): Promise<ArrayBuffer | null> {
		this.logExport(t('aiworkflow.scenePreview.exportLog.findingMesh'))
		const mesh = this.meshesById.get(itemId)
		if (!mesh) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.meshNotFound'))
			return null
		}

		this.logExport(t('aiworkflow.scenePreview.exportLog.ensuringMatrix'))
		mesh.updateMatrixWorld(true)

		const getPositionCount = (g: Record<string, unknown>): number => {
			const attr = g.attributes as Record<string, { count?: number }> | undefined
			return attr?.position?.count ?? 0
		}

		this.logExport(t('aiworkflow.scenePreview.exportLog.gettingGeometry'))
		const meshGeom = mesh.geometry
		const meshVertexCount = getPositionCount(meshGeom as unknown as Record<string, unknown>)
		this.logExport(t('aiworkflow.scenePreview.exportLog.vertexCount', { count: meshVertexCount }))

		let sourceGeom: unknown = meshGeom

		const cacheKey = String(itemId ?? '').trim()
		const cachedEntry = this.holedGeometryCache.get(cacheKey)
		if (cachedEntry?.geometry && meshVertexCount <= 24) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.tryCachedGeometry'))
			try {
				const cachedGeom = cachedEntry.geometry
				const cachedVertexCount = getPositionCount(cachedGeom as unknown as Record<string, unknown>)
				this.logExport(t('aiworkflow.scenePreview.exportLog.cachedVertexCount', { count: cachedVertexCount }))
				if (cachedVertexCount > 24) {
					sourceGeom = cachedGeom
					this.logExport(t('aiworkflow.scenePreview.exportLog.usingCachedCopy'))
				}
			} catch (e) {
				this.logExport(t('aiworkflow.scenePreview.exportLog.cacheFailed'))
			}
		}

		this.logExport(t('aiworkflow.scenePreview.exportLog.creatingCopy'))
		let exportGeometry: Record<string, unknown>
		try {
			const newGeom = new THREE.BufferGeometry() as unknown as Record<string, unknown>
			const sourceAny = sourceGeom as unknown as { attributes: Record<string, { array: Float32Array; itemSize: number; normalized: boolean }>; index?: { array: Uint16Array | Uint32Array } | null }
			const srcAttrs = sourceAny.attributes
			const srcIndex = sourceAny.index
			for (const attrName in srcAttrs) {
				const srcAttr = srcAttrs[attrName]
				const array = new Float32Array(srcAttr.array.length)
				array.set(srcAttr.array)
				const newAttr = new THREE.BufferAttribute(array, srcAttr.itemSize, srcAttr.normalized)
				const setAttrFn = newGeom.setAttribute as (name: string, attr: unknown) => void
				setAttrFn.call(newGeom, attrName, newAttr)
			}
			if (srcIndex) {
				const IndexArrayCtor = srcIndex.array.constructor as Uint16ArrayConstructor | Uint32ArrayConstructor
				const indexArray = new IndexArrayCtor(srcIndex.array.length)
				indexArray.set(srcIndex.array)
				const newIndexAttr = new THREE.BufferAttribute(indexArray, 1)
				const setIndexFn = newGeom.setIndex as (attr: unknown) => void
				setIndexFn.call(newGeom, newIndexAttr)
			}
			exportGeometry = newGeom
		} catch (err) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.copyFailed', { error: err instanceof Error ? err.message : String(err) }))
			const cloneFn = (sourceGeom as Record<string, unknown>).clone as (() => unknown) | undefined
			exportGeometry = (cloneFn?.call(sourceGeom) as Record<string, unknown>) ?? (sourceGeom as Record<string, unknown>)
		}

		this.logExport(t('aiworkflow.scenePreview.exportLog.exportVertexCount', { count: getPositionCount(exportGeometry) }))

		exportGeometry = this.sanitizeGeometry(exportGeometry)

		this.logExport(t('aiworkflow.scenePreview.exportLog.applyingMatrix'))
		const applyMatrixFn = exportGeometry.applyMatrix4 as ((m: unknown) => void) | undefined
		applyMatrixFn?.call(exportGeometry, mesh.matrixWorld)

		this.logExport(t('aiworkflow.scenePreview.exportLog.computingBBox'))
		const computeBBoxFn = exportGeometry.computeBoundingBox as (() => void) | undefined
		computeBBoxFn?.call(exportGeometry)
		const bbox = exportGeometry.boundingBox as { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null | undefined
		if (!bbox || !bbox.min || !bbox.max) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.bboxFailed'))
			return null
		}

		this.logExport(t('aiworkflow.scenePreview.exportLog.bboxResult', {
			x1: bbox.min.x.toFixed(2), y1: bbox.min.y.toFixed(2), z1: bbox.min.z.toFixed(2),
			x2: bbox.max.x.toFixed(2), y2: bbox.max.y.toFixed(2), z2: bbox.max.z.toFixed(2)
		}))

		const centerX = (bbox.min.x + bbox.max.x) / 2
		const centerZ = (bbox.min.z + bbox.max.z) / 2
		this.logExport(t('aiworkflow.scenePreview.exportLog.translatingOrigin'))
		const translateFn = exportGeometry.translate as ((x: number, y: number, z: number) => void) | undefined
		translateFn?.call(exportGeometry, -centerX, -bbox.min.y, -centerZ)
		computeBBoxFn?.call(exportGeometry)

		const finalBbox = exportGeometry.boundingBox as { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null | undefined
		if (finalBbox?.min && finalBbox?.max) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.translatedBBox', {
				x1: finalBbox.min.x.toFixed(2), y1: finalBbox.min.y.toFixed(2), z1: finalBbox.min.z.toFixed(2),
				x2: finalBbox.max.x.toFixed(2), y2: finalBbox.max.y.toFixed(2), z2: finalBbox.max.z.toFixed(2)
			}))
		}

		this.logExport(t('aiworkflow.scenePreview.exportLog.preparingMaterials'))
		const materialAny = mesh.material as Record<string, unknown> | undefined
		const materialColor = materialAny?.color as { getHexString?: () => string } | undefined
		const colorHex = materialColor?.getHexString?.()
		const exportMaterial = new THREE.MeshStandardMaterial({
			color: colorHex ? `#${colorHex}` : '#94a3b8',
			roughness: 0.88,
			metalness: 0.08
		})

		this.logExport(t('aiworkflow.scenePreview.exportLog.creatingMesh'))
		const exportMesh = new THREE.Mesh(exportGeometry as unknown, exportMaterial)
		const meshName = String(name || (mesh.userData as Record<string, unknown>)?.label || itemId || 'placeholder').trim() || 'placeholder'
		exportMesh.name = meshName
		exportMesh.position.set(0, 0, 0)
		exportMesh.rotation.set(0, 0, 0)
		exportMesh.scale.set(1, 1, 1)
		exportMesh.updateMatrixWorld(true)

		this.logExport(t('aiworkflow.scenePreview.exportLog.buildingScene'))
		const root = new THREE.Group()
		root.name = meshName
		root.userData = { source: 'scene-layout-placeholder', objectId: itemId, holed: true }
		root.add(exportMesh)
		root.updateMatrixWorld(true)

		this.logExport(t('aiworkflow.scenePreview.exportLog.startingGlb'))
		const exporter = new GLTFExporter()
		try {
			const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
				exporter.parse(
					root as unknown,
					(result: unknown) => {
						if (result instanceof ArrayBuffer) {
							this.logExport(t('aiworkflow.scenePreview.exportLog.glbSuccess', { size: (result.byteLength / 1024).toFixed(1) }))
							resolve(result)
							return
						}
						reject(new Error('GLB export returned non-binary payload'))
					},
					(error: unknown) => reject(error instanceof Error ? error : new Error(String(error ?? 'GLB export failed'))),
					{ binary: true, onlyVisible: true }
				)
			})
			return arrayBuffer
		} catch (err) {
			this.logExport(t('aiworkflow.scenePreview.exportLog.glbFailed', { error: err instanceof Error ? err.message : String(err) }))
			throw err
		} finally {
			(exportMaterial as unknown as { dispose: () => void }).dispose()
		}
	}

	dispose() {
		if (this.disposed) return
		this.disposed = true
		this.stopIdleLoop()
		this.pendingBindingRevision += 1
		this.pendingBindingSync = null
		if (this.raf) cancelAnimationFrame(this.raf)
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
		this.canvas.removeEventListener('pointermove', this.handlePointerMove)
		this.canvas.removeEventListener('wheel', this.handleWheel)
		this.canvas.removeEventListener('keydown', this.handleKeyDown)
		this.resizeObserver?.disconnect()
		for (const cached of this.holedGeometryCache.values()) {
			const geom = cached.geometry as { dispose?: () => void } | undefined
			geom?.dispose?.()
			const edgeGeom = cached.edgeGeometry as { dispose?: () => void } | undefined
			edgeGeom?.dispose?.()
		}
		this.holedGeometryCache.clear()
		this.clearLayout()
		this.controls.removeEventListener('change', this.handleControlsChange)
		this.controls.removeEventListener('start', this.handleControlsStart)
		this.controls.removeEventListener('end', this.handleControlsEnd)
		this.transformControls.dispose()
		this.controls.dispose()
		this.modelTemplateCache.clear()
		this.renderer.dispose()
	}
}
