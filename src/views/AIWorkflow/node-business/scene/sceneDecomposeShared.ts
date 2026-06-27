import type { WorkflowImageCrop, WorkflowPixelRect } from '../../../../aiworkflow/types'

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

const KEY_ELEMENT_LABEL_MAP: Record<string, string> = {
	window: '窗户',
	door: '门',
	column: '柱子',
	floor: '地面',
	wall: '墙面',
	ceiling: '天花板',
	roof: '屋顶',
	opening: '洞口',
	'builtin-fixture': '固定设施',
	'fixed-installation': '固定装置'
}

const SEMANTIC_ROLE_LABEL_MAP: Record<string, string> = {
	structure: '结构',
	'architectural-opening': '建筑洞口',
	'architectural-fixed': '建筑固定件',
	'built-in-fixture': '嵌入式装置',
	'wall-fixture': '墙面装置',
	'ceiling-fixture': '顶面装置',
	'floor-object': '地面摆件',
	'support-object': '支撑物',
	furniture: '家具',
	prop: '道具'
}

const MOUNT_TYPE_LABEL_MAP: Record<string, string> = {
	floor: '落地',
	wall: '壁挂',
	'embedded-wall': '嵌入墙体',
	ceiling: '吊顶',
	'support-top': '台面摆放',
	free: '独立摆放'
}

const WALL_ROLE_LABEL_MAP: Record<string, string> = {
	left: '左墙',
	right: '右墙',
	front: '前墙',
	back: '后墙'
}

const ID_KEYWORD_NAME_MAP: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /window|win-/i, label: '窗户' },
	{ pattern: /door/i, label: '门' },
	{ pattern: /desk|table/i, label: '桌子' },
	{ pattern: /chair/i, label: '椅子' },
	{ pattern: /sofa|couch/i, label: '沙发' },
	{ pattern: /bed/i, label: '床' },
	{ pattern: /bookshelf|shelf|book-case/i, label: '书架' },
	{ pattern: /cabinet|cupboard|wardrobe/i, label: '柜子' },
	{ pattern: /lamp|light/i, label: '灯具' },
	{ pattern: /plant|flower/i, label: '植物' },
	{ pattern: /tv|monitor|screen/i, label: '屏幕' },
	{ pattern: /mirror/i, label: '镜子' },
	{ pattern: /picture|painting|art/i, label: '挂画' },
	{ pattern: /rug|carpet/i, label: '地毯' },
	{ pattern: /curtain/i, label: '窗帘' },
	{ pattern: /pillow|cushion/i, label: '靠垫' },
	{ pattern: /vase/i, label: '花瓶' },
	{ pattern: /clock/i, label: '时钟' },
	{ pattern: /computer/i, label: '电脑' },
	{ pattern: /keyboard/i, label: '键盘' },
	{ pattern: /book/i, label: '书籍' },
	{ pattern: /bottle|cup|glass/i, label: '杯具' }
]

const CATEGORY_HINT_MAP: Record<string, string> = {
	'窗': '窗户', '窗户': '窗户', 'window': '窗户',
	'门': '门', 'door': '门',
	'桌': '桌子', '桌子': '桌子', '书桌': '书桌', 'desk': '书桌', 'table': '桌子',
	'椅': '椅子', '椅子': '椅子', 'chair': '椅子',
	'柜': '柜子', '书架': '书架', '书柜': '书柜', '柜架': '柜架', 'shelf': '架', 'bookshelf': '书架', 'cabinet': '柜子',
	'灯': '灯具', '灯具': '灯具', 'lamp': '灯具', 'light': '灯具', 'lighting': '灯具',
	'沙发': '沙发', 'sofa': '沙发', 'couch': '沙发',
	'床': '床', 'bed': '床',
	'装饰': '装饰', '植物': '植物', 'plant': '植物', '花': '花卉',
	'屏幕': '屏幕', '显示器': '显示器', 'monitor': '显示器', 'tv': '电视', '电视': '电视',
	'镜子': '镜子', 'mirror': '镜子',
	'挂画': '挂画', '画': '画作'
}

const extractMaterialHint = (material: string) => {
	if (!material) return ''
	const hints: string[] = []
	if (/木|wood|oak|pine|maple|walnut/i.test(material)) hints.push('木质')
	if (/金属|metal|steel|iron|brass|aluminum/i.test(material)) hints.push('金属')
	if (/玻璃|glass/i.test(material)) hints.push('玻璃')
	if (/布|fabric|cloth|textile|linen|cotton/i.test(material)) hints.push('布艺')
	if (/皮|leather/i.test(material)) hints.push('皮革')
	if (/陶瓷|ceramic|porcelain/i.test(material)) hints.push('陶瓷')
	if (/塑料|plastic|pvc/i.test(material)) hints.push('塑料')
	if (/石|marble|stone|granite/i.test(material)) hints.push('石材')
	return hints[0] || ''
}

const extractColorHint = (color: string, material: string) => {
	const text = `${color || ''} ${material || ''}`
	const colorKeywords = [
		['白色|白', '白色'], ['黑色|黑', '黑色'], ['灰色|灰', '灰色'],
		['红色|红', '红色'], ['蓝色|蓝', '蓝色'], ['绿色|绿', '绿色'],
		['黄色|黄', '黄色'], ['棕色|棕|木色', '棕色'], ['米色|米', '米色'],
		['金色|金', '金色'], ['银色|银', '银色'], ['深色|dark', '深色'], ['浅色|light', '浅色'],
		['暖', '暖色调']
	]
	for (const [pat, label] of colorKeywords) {
		if (new RegExp(pat, 'i').test(text)) return label
	}
	return ''
}

export const inferSceneDecomposeCategory = (item: SceneDecomposeInputItem): string => {
	const direct = [item?.category, item?.subCategory]
		.map(v => String(v ?? '').trim())
		.filter(Boolean)[0]
	if (direct) {
		for (const [key, label] of Object.entries(CATEGORY_HINT_MAP)) {
			if (direct.includes(key)) return label
		}
		return direct
	}

	const id = String(item?.id ?? '').toLowerCase()
	const keyElementType = String(item?.keyElementType ?? '').toLowerCase()
	const semanticRole = String(item?.semanticRole ?? '').toLowerCase()
	const material = String(item?.material ?? '')

	if (KEY_ELEMENT_LABEL_MAP[keyElementType]) return KEY_ELEMENT_LABEL_MAP[keyElementType]
	for (const { pattern, label } of ID_KEYWORD_NAME_MAP) {
		if (pattern.test(id)) return label
	}
	if (semanticRole === 'furniture') return '家具'
	if (semanticRole === 'prop') return '摆件'
	if (semanticRole === 'wall-fixture') return '墙面装置'
	if (semanticRole === 'ceiling-fixture') return '顶面装置'
	if (semanticRole === 'floor-object') return '地面物件'
	if (semanticRole === 'support-object') return '支撑物'
	if (semanticRole === 'built-in-fixture') return '嵌入式装置'

	const materialHint = extractMaterialHint(material)
	return materialHint ? `${materialHint}物件` : '物体'
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
	const wallRole = WALL_ROLE_LABEL_MAP[String(item?.wallRole ?? '').toLowerCase()] || ''
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
		return prefix ? `${prefix}${matched.label}` : matched.label
	}

	if (direct && direct.length > 0) return direct

	const fallback = prefix ? `${prefix}${category}` : category
	return fallback || `对象${index + 1}`
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
	const wallRole = WALL_ROLE_LABEL_MAP[String(item?.wallRole ?? '').toLowerCase()] || ''
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
		lines.push(`类别：${category}`)
	}
	const attrParts: string[] = []
	if (wallRole) attrParts.push(wallRole)
	const mountLabel = MOUNT_TYPE_LABEL_MAP[mountType.toLowerCase()]
	if (mountLabel) attrParts.push(mountLabel)
	if (placement) attrParts.push(placement.replace(/-/g, ''))
	if (attrParts.length) lines.push(`位置：${attrParts.join(' · ')}`)
	const visualParts: string[] = []
	if (color) visualParts.push(color)
	if (material) visualParts.push(material)
	if (visualParts.length) lines.push(`外观：${visualParts.join('，')}`)
	if (directDesc && directDesc !== name) {
		lines.push(directDesc)
	}
	if (groundReason && !lines.some(l => l.includes(groundReason.slice(0, 6)))) {
		lines.push(groundReason)
	}
	if (observed.length) lines.push(`观测参考图：${observed.join('、')}`)
	return lines.join('\n').trim() || fallbackName
}

export const buildSceneDecomposePromptVisualDetails = (item: SceneDecomposeInputItem, name: string) => {
	const parts: string[] = []
	const directDesc = String(item?.description ?? '').trim()
	const category = inferSceneDecomposeCategory(item)
	const material = String(item?.material ?? '').trim()
	const color = String(item?.color ?? '').trim()
	const keyElementType = String(item?.keyElementType ?? '').trim().toLowerCase()
	const wallRole = WALL_ROLE_LABEL_MAP[String(item?.wallRole ?? '').toLowerCase()] || ''
	const groundReason = String(item?.groundReason ?? '').trim()

	const subject = name || category || '物体'
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
