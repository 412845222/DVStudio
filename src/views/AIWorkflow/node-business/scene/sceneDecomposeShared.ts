import type { WorkflowImageCrop, WorkflowPixelRect } from '../../../../aiworkflow/types'
import { t } from '../../../../i18n'

export interface SceneDecomposeInputItem {
	id?: unknown
	name?: unknown
	label?: unknown
	description?: unknown
	category?: unknown
	subCategory?: unknown
	material?: unknown
	color?: unknown
	semanticRole?: unknown
	keyElementType?: unknown
	wallRole?: unknown
	mountType?: unknown
	placement?: unknown
	parentId?: unknown
	groundReason?: unknown
	relationTags?: unknown
	observedImageIndices?: unknown
	sourceImageIndex?: unknown
	imageRect?: unknown
	imageRectPixels?: unknown
}

const MIN_CROP_WIDTH_PX = 350
const MIN_ASPECT_RATIO = 1.0
const MAX_ASPECT_RATIO = 16 / 9

const sceneDecomposeImageSizeCache = new Map<string, { width: number; height: number }>()

export const slugSceneDecomposeId = (value: unknown, index: number) => {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase()
	const slug = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
	return slug || `object-${index + 1}`
}

const getKeyElementLabel = (key: string): string => {
	const keyMap: Record<string, string> = {
		window: 'window',
		door: 'door',
		column: 'column',
		floor: 'floor',
		wall: 'wall',
		ceiling: 'ceiling',
		roof: 'roof',
		opening: 'opening',
		'builtin-fixture': 'builtinFixture',
		'fixed-installation': 'fixedInstallation'
	}
	const i18nKey = keyMap[key]
	return i18nKey ? t(`aiConfig.sceneElements.keyElement.${i18nKey}`) : ''
}

const getSemanticRoleLabel = (key: string): string => {
	const keyMap: Record<string, string> = {
		structure: 'structure',
		'architectural-opening': 'architecturalOpening',
		'architectural-fixed': 'architecturalFixed',
		'built-in-fixture': 'builtInFixture',
		'wall-fixture': 'wallFixture',
		'ceiling-fixture': 'ceilingFixture',
		'floor-object': 'floorObject',
		'support-object': 'supportObject',
		furniture: 'furniture',
		prop: 'prop'
	}
	const i18nKey = keyMap[key]
	return i18nKey ? t(`aiConfig.sceneElements.semanticRole.${i18nKey}`) : ''
}

const getMountTypeLabel = (key: string): string => {
	const keyMap: Record<string, string> = {
		floor: 'floor',
		wall: 'wall',
		'embedded-wall': 'embeddedWall',
		ceiling: 'ceiling',
		'support-top': 'supportTop',
		free: 'free'
	}
	const i18nKey = keyMap[key]
	return i18nKey ? t(`aiConfig.sceneElements.mountType.${i18nKey}`) : ''
}

const getWallRoleLabel = (key: string): string => {
	const keyMap: Record<string, string> = {
		left: 'left',
		right: 'right',
		front: 'front',
		back: 'back'
	}
	const i18nKey = keyMap[key]
	return i18nKey ? t(`aiConfig.sceneElements.wallRole.${i18nKey}`) : ''
}

const ID_KEYWORD_NAME_MAP: Array<{ pattern: RegExp; labelKey: string }> = [
	{ pattern: /window|win-/i, labelKey: 'aiConfig.sceneElements.keyElement.window' },
	{ pattern: /door/i, labelKey: 'aiConfig.sceneElements.keyElement.door' },
	{ pattern: /desk|table/i, labelKey: 'aiConfig.sceneElements.furniture.table' },
	{ pattern: /chair/i, labelKey: 'aiConfig.sceneElements.furniture.chair' },
	{ pattern: /sofa|couch/i, labelKey: 'aiConfig.sceneElements.furniture.sofa' },
	{ pattern: /bed/i, labelKey: 'aiConfig.sceneElements.furniture.bed' },
	{ pattern: /bookshelf|shelf|book-case/i, labelKey: 'aiConfig.sceneElements.furniture.bookshelf' },
	{ pattern: /cabinet|cupboard|wardrobe/i, labelKey: 'aiConfig.sceneElements.furniture.cabinet' },
	{ pattern: /lamp|light/i, labelKey: 'aiConfig.sceneElements.furniture.lamp' },
	{ pattern: /plant|flower/i, labelKey: 'aiConfig.sceneElements.decor.plant' },
	{ pattern: /tv|monitor|screen/i, labelKey: 'aiConfig.sceneElements.decor.screen' },
	{ pattern: /mirror/i, labelKey: 'aiConfig.sceneElements.decor.mirror' },
	{ pattern: /picture|painting|art/i, labelKey: 'aiConfig.sceneElements.decor.painting' },
	{ pattern: /rug|carpet/i, labelKey: 'aiConfig.sceneElements.decor.rug' },
	{ pattern: /curtain/i, labelKey: 'aiConfig.sceneElements.decor.curtain' },
	{ pattern: /pillow|cushion/i, labelKey: 'aiConfig.sceneElements.decor.pillow' },
	{ pattern: /vase/i, labelKey: 'aiConfig.sceneElements.decor.vase' },
	{ pattern: /clock/i, labelKey: 'aiConfig.sceneElements.decor.clock' },
	{ pattern: /computer/i, labelKey: 'aiConfig.sceneElements.decor.computer' },
	{ pattern: /keyboard/i, labelKey: 'aiConfig.sceneElements.decor.keyboard' },
	{ pattern: /book/i, labelKey: 'aiConfig.sceneElements.decor.book' },
	{ pattern: /bottle|cup|glass/i, labelKey: 'aiConfig.sceneElements.decor.cup' }
]

const CATEGORY_HINT_MAP: Record<string, string> = {
	'窗': 'aiConfig.sceneElements.keyElement.window', '窗户': 'aiConfig.sceneElements.keyElement.window', 'window': 'aiConfig.sceneElements.keyElement.window',
	'门': 'aiConfig.sceneElements.keyElement.door', 'door': 'aiConfig.sceneElements.keyElement.door',
	'桌': 'aiConfig.sceneElements.furniture.table', '桌子': 'aiConfig.sceneElements.furniture.table', '书桌': 'aiConfig.sceneElements.furniture.deskWriting', 'desk': 'aiConfig.sceneElements.furniture.deskWriting', 'table': 'aiConfig.sceneElements.furniture.table',
	'椅': 'aiConfig.sceneElements.furniture.chair', '椅子': 'aiConfig.sceneElements.furniture.chair', 'chair': 'aiConfig.sceneElements.furniture.chair',
	'柜': 'aiConfig.sceneElements.furniture.cabinet', '书架': 'aiConfig.sceneElements.furniture.bookshelf', '书柜': 'aiConfig.sceneElements.furniture.bookcase', '柜架': 'aiConfig.sceneElements.furniture.shelfCabinet', 'shelf': 'aiConfig.sceneElements.furniture.shelf', 'bookshelf': 'aiConfig.sceneElements.furniture.bookshelf', 'cabinet': 'aiConfig.sceneElements.furniture.cabinet',
	'灯': 'aiConfig.sceneElements.furniture.lamp', '灯具': 'aiConfig.sceneElements.furniture.lamp', 'lamp': 'aiConfig.sceneElements.furniture.lamp', 'light': 'aiConfig.sceneElements.furniture.lamp', 'lighting': 'aiConfig.sceneElements.furniture.lamp',
	'沙发': 'aiConfig.sceneElements.furniture.sofa', 'sofa': 'aiConfig.sceneElements.furniture.sofa', 'couch': 'aiConfig.sceneElements.furniture.sofa',
	'床': 'aiConfig.sceneElements.furniture.bed', 'bed': 'aiConfig.sceneElements.furniture.bed',
	'装饰': 'aiConfig.sceneElements.decor.decoration', '植物': 'aiConfig.sceneElements.decor.plant', 'plant': 'aiConfig.sceneElements.decor.plant', '花': 'aiConfig.sceneElements.decor.flower',
	'屏幕': 'aiConfig.sceneElements.decor.screen', '显示器': 'aiConfig.sceneElements.decor.monitor', 'monitor': 'aiConfig.sceneElements.decor.monitor', 'tv': 'aiConfig.sceneElements.decor.tv', '电视': 'aiConfig.sceneElements.decor.tv',
	'镜子': 'aiConfig.sceneElements.decor.mirror', 'mirror': 'aiConfig.sceneElements.decor.mirror',
	'挂画': 'aiConfig.sceneElements.decor.painting', '画': 'aiConfig.sceneElements.decor.art'
}

const extractMaterialHint = (material: string) => {
	if (!material) return ''
	if (/木|wood|oak|pine|maple|walnut/i.test(material)) return t('aiConfig.sceneElements.material.wood')
	if (/金属|metal|steel|iron|brass|aluminum/i.test(material)) return t('aiConfig.sceneElements.material.metal')
	if (/玻璃|glass/i.test(material)) return t('aiConfig.sceneElements.material.glass')
	if (/布|fabric|cloth|textile|linen|cotton/i.test(material)) return t('aiConfig.sceneElements.material.fabric')
	if (/皮|leather/i.test(material)) return t('aiConfig.sceneElements.material.leather')
	if (/陶瓷|ceramic|porcelain/i.test(material)) return t('aiConfig.sceneElements.material.ceramic')
	if (/塑料|plastic|pvc/i.test(material)) return t('aiConfig.sceneElements.material.plastic')
	if (/石|marble|stone|granite/i.test(material)) return t('aiConfig.sceneElements.material.stone')
	return ''
}

const extractColorHint = (color: string, material: string) => {
	const text = `${color || ''} ${material || ''}`
	const colorKeywords: Array<[string, string]> = [
		['白色|白', 'white'], ['黑色|黑', 'black'], ['灰色|灰', 'gray'],
		['红色|红', 'red'], ['蓝色|蓝', 'blue'], ['绿色|绿', 'green'],
		['黄色|黄', 'yellow'], ['棕色|棕|木色', 'brown'], ['米色|米', 'beige'],
		['金色|金', 'gold'], ['银色|银', 'silver'], ['深色|dark', 'dark'], ['浅色|light', 'light'],
		['暖', 'warm']
	]
	for (const [pat, key] of colorKeywords) {
		if (new RegExp(pat, 'i').test(text)) return t(`aiConfig.sceneElements.color.${key}`)
	}
	return ''
}

export const inferSceneDecomposeCategory = (item: SceneDecomposeInputItem): string => {
	const direct = [item?.category, item?.subCategory]
		.map(v => String(v ?? '').trim())
		.filter(Boolean)[0]
	if (direct) {
		for (const [key, labelKey] of Object.entries(CATEGORY_HINT_MAP)) {
			if (direct.includes(key)) return t(labelKey)
		}
		return direct
	}

	const id = String(item?.id ?? '').toLowerCase()
	const keyElementType = String(item?.keyElementType ?? '').toLowerCase()
	const semanticRole = String(item?.semanticRole ?? '').toLowerCase()
	const material = String(item?.material ?? '')

	const keyElementLabel = getKeyElementLabel(keyElementType)
	if (keyElementLabel) return keyElementLabel
	for (const { pattern, labelKey } of ID_KEYWORD_NAME_MAP) {
		if (pattern.test(id)) return t(labelKey)
	}
	if (semanticRole === 'furniture') return t('aiConfig.sceneElements.default.furniture')
	if (semanticRole === 'prop') return t('aiConfig.sceneElements.default.prop')
	if (semanticRole === 'wall-fixture') return t('aiConfig.sceneElements.default.wallFixture')
	if (semanticRole === 'ceiling-fixture') return t('aiConfig.sceneElements.default.ceilingFixture')
	if (semanticRole === 'floor-object') return t('aiConfig.sceneElements.default.floorObject')
	if (semanticRole === 'support-object') return t('aiConfig.sceneElements.default.supportObject')
	if (semanticRole === 'built-in-fixture') return t('aiConfig.sceneElements.default.builtInFixture')

	const materialHint = extractMaterialHint(material)
	return materialHint ? t('aiConfig.sceneElements.default.materialObject', { material: materialHint }) : t('aiConfig.sceneElements.default.object')
}

export const inferSceneDecomposeObjectName = (item: SceneDecomposeInputItem, index: number): string => {
	const direct = [item?.name, item?.label]
		.map(v => String(v ?? '').trim())
		.filter(Boolean)[0]
	if (direct && direct.length <= 12 && !/^对象?\s*\d+$|^object\s*\d+$/i.test(direct)) {
		return direct
	}

	const category = inferSceneDecomposeCategory(item)
	const material = String(item?.material ?? '')
	const color = String(item?.color ?? '')
	const wallRole = getWallRoleLabel(String(item?.wallRole ?? '').toLowerCase())
	const keyElementType = String(item?.keyElementType ?? '').toLowerCase()
	const id = String(item?.id ?? '').toLowerCase()

	const materialHint = extractMaterialHint(material)
	const colorHint = extractColorHint(color, material)

	let prefix = ''
	if (colorHint && materialHint && materialHint !== category) {
		prefix = `${colorHint}${materialHint}`
	} else if (materialHint && materialHint !== category && !category.includes(materialHint)) {
		prefix = materialHint
	}

	if (keyElementType === 'window' && wallRole) {
		return `${prefix}${wallRole}${category}`
	}

	const matched = ID_KEYWORD_NAME_MAP.find(({ pattern }) => pattern.test(id))
	if (matched) {
		const matchedLabel = t(matched.labelKey)
		return prefix ? `${prefix}${matchedLabel}` : matchedLabel
	}

	if (direct && direct.length > 0) return direct

	const fallback = prefix ? `${prefix}${category}` : category
	return fallback || t('aiConfig.sceneElements.default.objectFallback', { index: index + 1 })
}

export const buildSceneDecomposeDescription = (item: SceneDecomposeInputItem, fallbackName: string) => {
	const lines: string[] = []
	const name = String(item?.name ?? fallbackName).trim() || fallbackName
	const directDesc = String(item?.description ?? '').trim()
	const category = inferSceneDecomposeCategory(item)
	const material = String(item?.material ?? '').trim()
	const color = String(item?.color ?? '').trim()
	const semanticRole = String(item?.semanticRole ?? '').trim()
	const keyElementType = String(item?.keyElementType ?? '').trim()
	const mountType = String(item?.mountType ?? '').trim()
	const wallRole = getWallRoleLabel(String(item?.wallRole ?? '').toLowerCase())
	const groundReason = String(item?.groundReason ?? '').trim()
	const placement = String(item?.placement ?? '').trim()
	const observedImageIndices = item?.observedImageIndices
	const observed = Array.isArray(observedImageIndices)
		? observedImageIndices
				.map((value: unknown) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []

	lines.push(name)
	if (category && !name.includes(category)) {
		lines.push(t('nodes.sceneDecompose.categoryLabel', { category }))
	}
	const attrParts: string[] = []
	if (wallRole) attrParts.push(wallRole)
	const mountLabel = getMountTypeLabel(mountType.toLowerCase())
	if (mountLabel) attrParts.push(mountLabel)
	if (placement) attrParts.push(placement.replace(/-/g, ''))
	if (attrParts.length) lines.push(t('nodes.sceneDecompose.positionLabel', { position: attrParts.join(' · ') }))
	const visualParts: string[] = []
	if (color) visualParts.push(color)
	if (material) visualParts.push(material)
	if (visualParts.length) lines.push(t('nodes.sceneDecompose.appearanceLabel', { appearance: visualParts.join('，') }))
	if (directDesc && directDesc !== name) {
		lines.push(directDesc)
	}
	if (groundReason && !lines.some(l => l.includes(groundReason.slice(0, 6)))) {
		lines.push(groundReason)
	}
	if (observed.length) lines.push(t('nodes.sceneDecompose.observedImagesLabel', { indices: observed.join('、') }))
	return lines.join('\n').trim() || fallbackName
}

export const buildSceneDecomposePromptVisualDetails = (item: SceneDecomposeInputItem, name: string) => {
	const parts: string[] = []
	const directDesc = String(item?.description ?? '').trim()
	const category = inferSceneDecomposeCategory(item)
	const material = String(item?.material ?? '').trim()
	const color = String(item?.color ?? '').trim()
	const keyElementType = String(item?.keyElementType ?? '').trim().toLowerCase()
	const wallRole = getWallRoleLabel(String(item?.wallRole ?? '').toLowerCase())
	const groundReason = String(item?.groundReason ?? '').trim()

	const subject = name || category || t('aiConfig.sceneElements.default.object')
	parts.push(subject)

	const attrs: string[] = []
	if (category && category !== subject && !subject.includes(category)) attrs.push(category)
	if (wallRole) attrs.push(`位于${wallRole}`)
	if (material) attrs.push(material)
	else if (keyElementType === 'window') attrs.push('带窗框与玻璃')
	if (color) attrs.push(color)
	if (attrs.length) parts.push(`，${attrs.join('，')}`)

	if (directDesc && directDesc !== name) {
		parts.push(`；${directDesc}`)
	}
	if (groundReason) {
		parts.push(`；${groundReason}`)
	}
	return parts.join('')
}

export const extractSceneDecomposeItems = (parsed: unknown): SceneDecomposeInputItem[] => {
	const obj = parsed as Record<string, unknown>
	if (Array.isArray(obj?.objects)) return obj.objects as SceneDecomposeInputItem[]
	if (Array.isArray(obj?.layoutItems)) return obj.layoutItems as SceneDecomposeInputItem[]
	if (Array.isArray(parsed)) return parsed as SceneDecomposeInputItem[]
	return []
}

export const inferSceneDecomposeSourceImageIndex = (item: SceneDecomposeInputItem) => {
	const direct = Number(item?.sourceImageIndex)
	if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.floor(direct))
	const observedImageIndices = item?.observedImageIndices
	const observed = Array.isArray(observedImageIndices)
		? observedImageIndices
				.map((value: unknown) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []
	if (observed.length) return Math.max(1, Math.floor(observed[0]))
	return 1
}

export const shouldSkipSceneDecomposeItem = (item: SceneDecomposeInputItem) => {
	const id = String(item?.id ?? '')
		.trim()
		.toLowerCase()
	const semanticRole = String(item?.semanticRole ?? '')
		.trim()
		.toLowerCase()
	const keyElementType = String(item?.keyElementType ?? '')
		.trim()
		.toLowerCase()
	const relationTagsArr = item?.relationTags
	const relationTags = Array.isArray(relationTagsArr)
		? relationTagsArr.map((value: unknown) =>
				String(value ?? '')
					.trim()
					.toLowerCase()
			)
		: []
	const observedImageIndices = item?.observedImageIndices
	const observed = Array.isArray(observedImageIndices)
		? observedImageIndices
				.map((value: unknown) => Number(value))
				.filter((value: number) => Number.isFinite(value) && value > 0)
		: []

	if (!item || typeof item !== 'object') return true
	if (semanticRole === 'structure-shell') return true
	if (relationTags.includes('structural-shell')) return true
	if (id === 'floor1' || id === 'ceiling1' || /wall\d+$/i.test(id)) return true
	if (!observed.length && !item?.imageRect && !item?.imageRectPixels) {
		if (keyElementType === 'floor' || keyElementType === 'wall' || keyElementType === 'ceiling')
			return true
	}
	return false
}

export const isSceneLayoutModelTargetItem = (item: SceneDecomposeInputItem) => !shouldSkipSceneDecomposeItem(item)

export const hasValidSceneDecomposeImageRect = (imageRect: unknown) => {
	if (!imageRect || typeof imageRect !== 'object') return false
	const obj = imageRect as Record<string, unknown>
	const x = Number(obj.x)
	const y = Number(obj.y)
	const width = Number(obj.width)
	const height = Number(obj.height)
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width > 0 &&
		height > 0
	)
}

export const hasValidSceneDecomposePixelRect = (imageRectPixels: unknown) => {
	if (!imageRectPixels || typeof imageRectPixels !== 'object') return false
	const obj = imageRectPixels as Record<string, unknown>
	const x = Number(obj.x)
	const y = Number(obj.y)
	const width = Number(obj.width)
	const height = Number(obj.height)
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width > 0 &&
		height > 0
	)
}

export const ensureSceneDecomposeSourceDimensions = async (source: {
	url: string
	width?: number
	height?: number
}) => {
	const knownWidth = Number(source.width ?? 0)
	const knownHeight = Number(source.height ?? 0)
	if (
		Number.isFinite(knownWidth) &&
		knownWidth > 0 &&
		Number.isFinite(knownHeight) &&
		knownHeight > 0
	) {
		return { width: knownWidth, height: knownHeight }
	}

	const key = String(source.url ?? '').trim()
	if (!key) return { width: undefined, height: undefined } as { width?: number; height?: number }

	const cached = sceneDecomposeImageSizeCache.get(key)
	if (cached) {
		source.width = cached.width
		source.height = cached.height
		return cached
	}

	const measured = await new Promise<{ width: number; height: number } | null>((resolve) => {
		const img = new Image()
		img.onload = () => {
			const width = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
			const height = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
			resolve({ width, height })
		}
		img.onerror = () => resolve(null)
		img.src = key
	})

	if (measured) {
		sceneDecomposeImageSizeCache.set(key, measured)
		source.width = measured.width
		source.height = measured.height
		return measured
	}

	return { width: undefined, height: undefined } as { width?: number; height?: number }
}

export const normalizeSceneDecomposeCrop = (
	imageRect: unknown,
	imageRectPixels: unknown,
	source: { width?: number; height?: number },
	opts?: { allowFullImageFallback?: boolean }
): {
	crop: WorkflowImageCrop
	pixelRect?: WorkflowPixelRect
	outputWidth: number
	outputHeight: number
	cropMode: 'cropped' | 'fallback'
} | null => {
	const width = Number(source.width ?? 0)
	const height = Number(source.height ?? 0)
	const imageRectObj = imageRect as Record<string, unknown>
	const imageRectPixelsObj = imageRectPixels as Record<string, unknown>
	if (hasValidSceneDecomposeImageRect(imageRect)) {
		let crop: WorkflowImageCrop = {
			x: Math.max(0, Math.min(1, Number(imageRectObj.x))),
			y: Math.max(0, Math.min(1, Number(imageRectObj.y))),
			width: Math.max(0.0001, Math.min(1, Number(imageRectObj.width))),
			height: Math.max(0.0001, Math.min(1, Number(imageRectObj.height)))
		}
		if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
			crop = adjustCropForMinimumSize(crop, width, height)
		}
		const outputWidth =
			Number.isFinite(width) && width > 0
				? Math.max(1, Math.round(width * crop.width))
				: Math.max(1, Math.round(Number(imageRectPixelsObj?.width ?? 1024 * crop.width)))
		const outputHeight =
			Number.isFinite(height) && height > 0
				? Math.max(1, Math.round(height * crop.height))
				: Math.max(1, Math.round(Number(imageRectPixelsObj?.height ?? 1024 * crop.height)))
		const pixelRect = hasValidSceneDecomposePixelRect(imageRectPixels)
			? {
					x: Number(imageRectPixelsObj.x),
					y: Number(imageRectPixelsObj.y),
					width: Math.max(1, Number(imageRectPixelsObj.width)),
					height: Math.max(1, Number(imageRectPixelsObj.height))
				}
			: undefined
		return { crop, pixelRect, outputWidth, outputHeight, cropMode: 'cropped' }
	}

	if (
		hasValidSceneDecomposePixelRect(imageRectPixels) &&
		Number.isFinite(width) &&
		width > 0 &&
		Number.isFinite(height) &&
		height > 0
	) {
		const px = Number(imageRectPixelsObj.x)
		const py = Number(imageRectPixelsObj.y)
		const pw = Math.max(1, Number(imageRectPixelsObj.width))
		const ph = Math.max(1, Number(imageRectPixelsObj.height))
		let crop: WorkflowImageCrop = {
			x: Math.max(0, Math.min(1, px / width)),
			y: Math.max(0, Math.min(1, py / height)),
			width: Math.max(0.0001, Math.min(1, pw / width)),
			height: Math.max(0.0001, Math.min(1, ph / height))
		}
		crop = adjustCropForMinimumSize(crop, width, height)
		const adjustedPx = Math.round(crop.x * width)
		const adjustedPy = Math.round(crop.y * height)
		const adjustedPw = Math.max(1, Math.round(crop.width * width))
		const adjustedPh = Math.max(1, Math.round(crop.height * height))
		return {
			crop,
			pixelRect: { x: adjustedPx, y: adjustedPy, width: adjustedPw, height: adjustedPh },
			outputWidth: adjustedPw,
			outputHeight: adjustedPh,
			cropMode: 'cropped'
		}
	}

	if (opts?.allowFullImageFallback) {
		const fallbackWidth =
			Number.isFinite(width) && width > 0 ? Math.max(1, Math.round(width)) : 1024
		const fallbackHeight =
			Number.isFinite(height) && height > 0 ? Math.max(1, Math.round(height)) : 1024
		return {
			crop: { x: 0, y: 0, width: 1, height: 1 },
			pixelRect: { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight },
			outputWidth: fallbackWidth,
			outputHeight: fallbackHeight,
			cropMode: 'fallback'
		}
	}

	return null
}

interface CropAdjustOptions {
	minWidthPx?: number
	minAspectRatio?: number
	maxAspectRatio?: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const adjustCropForMinimumSize = (
	crop: WorkflowImageCrop,
	sourceWidth: number,
	sourceHeight: number,
	options: CropAdjustOptions = {}
): WorkflowImageCrop => {
	const minWidthPx = options.minWidthPx ?? MIN_CROP_WIDTH_PX
	const minAspectRatio = options.minAspectRatio ?? MIN_ASPECT_RATIO
	const maxAspectRatio = options.maxAspectRatio ?? MAX_ASPECT_RATIO

	if (
		!Number.isFinite(sourceWidth) ||
		sourceWidth <= 0 ||
		!Number.isFinite(sourceHeight) ||
		sourceHeight <= 0
	) {
		return crop
	}

	let { x, y, width, height } = crop
	let pixelWidth = Math.max(1, Math.round(sourceWidth * width))
	let pixelHeight = Math.max(1, Math.round(sourceHeight * height))

	let needsAdjust = false

	if (pixelWidth < minWidthPx) {
		const targetPixelWidth = Math.min(sourceWidth, minWidthPx)
		const targetWidth = targetPixelWidth / sourceWidth
		const centerX = x + width / 2
		x = clamp(centerX - targetWidth / 2, 0, 1 - targetWidth)
		width = targetWidth
		pixelWidth = targetPixelWidth
		needsAdjust = true
	}

	const aspectRatio = pixelWidth / pixelHeight
	if (aspectRatio < minAspectRatio) {
		const targetPixelHeight = Math.max(1, Math.round(pixelWidth / minAspectRatio))
		const maxPixelHeight = Math.round(sourceHeight * (1 - y))
		const finalPixelHeight = Math.min(targetPixelHeight, maxPixelHeight, Math.round(sourceHeight))
		if (finalPixelHeight > pixelHeight) {
			const targetHeight = finalPixelHeight / sourceHeight
			const centerY = y + height / 2
			y = clamp(centerY - targetHeight / 2, 0, 1 - targetHeight)
			height = targetHeight
			needsAdjust = true
		}
	} else if (aspectRatio > maxAspectRatio) {
		const targetPixelWidth = Math.max(1, Math.round(pixelHeight * maxAspectRatio))
		const maxPixelWidth = Math.round(sourceWidth * (1 - x))
		const finalPixelWidth = Math.min(targetPixelWidth, maxPixelWidth, Math.round(sourceWidth))
		if (finalPixelWidth < pixelWidth) {
			const targetWidth = finalPixelWidth / sourceWidth
			const centerX = x + width / 2
			x = clamp(centerX - targetWidth / 2, 0, 1 - targetWidth)
			width = targetWidth
			needsAdjust = true
		}
	}

	if (!needsAdjust) return crop

	x = clamp(x, 0, 1 - width)
	y = clamp(y, 0, 1 - height)
	width = clamp(width, 0.0001, 1 - x)
	height = clamp(height, 0.0001, 1 - y)

	return { x, y, width, height }
}

export const cleanupSceneDecomposeSharedRuntime = () => {
	sceneDecomposeImageSizeCache.clear()
}
