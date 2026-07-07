import type { WorkflowNode } from '../../../../aiworkflow/types'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	Tripo3DGeneratePayload,
	Tripo3DMode,
	Tripo3DGenerateFile,
	BuildTripo3DRequestResult
} from './types'

type LinkedImageInput = {
	fromNode: WorkflowNode
	fromAnchorId: string
	url: string
}

type LinkedModelInput = {
	modelUrl: string
	sourceName?: string
} | null

const getSettingValue = (
	settings: Record<string, unknown>,
	plainKey: string,
	prefixedKey: string
): unknown => {
	if (plainKey in settings) return settings[plainKey]
	return settings[prefixedKey]
}

const getSettingString = (settings: Record<string, unknown>, plainKey: string, prefixedKey: string): string => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	return typeof val === 'string' ? val.trim() : ''
}

const getSettingNumber = (settings: Record<string, unknown>, plainKey: string, prefixedKey: string, defaultValue = 0): number => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	const num = Number(val)
	return Number.isFinite(num) ? num : defaultValue
}

const getSettingBoolean = (settings: Record<string, unknown>, plainKey: string, prefixedKey: string, defaultValue = false): boolean => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	if (typeof val === 'boolean') return val
	if (typeof val === 'string') return val.toLowerCase() === 'true'
	return defaultValue
}

const getSettingArray = <T>(settings: Record<string, unknown>, plainKey: string, prefixedKey: string): T[] => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	return Array.isArray(val) ? (val as T[]) : []
}

export const useAIWorkflowTripo3DRequest = (options: {
	connectedTripo3DPrompt: (nodeId: string) => string
	connectedTripo3DImageInputs: (nodeId: string) => LinkedImageInput[]
	connectedTripo3DModelInput: (nodeId: string) => Promise<LinkedModelInput>
	buildTripo3DImageInputFromNode: (fromNode: WorkflowNode, fromAnchorId: string) => Promise<string>
	normalizeTripo3DImageInputValue: (rawValue: string, label: string) => Promise<string>
	hasConnectedTripo3DConsumer: (node: WorkflowNode) => boolean
}) => {
	const buildTripo3DRequestPayload = async (node: WorkflowNode): Promise<BuildTripo3DRequestResult> => {
		const model3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
		const settings = (isRecord(model3dSettings.tripo3dModelSettings) ? model3dSettings.tripo3dModelSettings : {}) as Record<string, unknown>
		const tripo3dSettings = isRecord((node as unknown as Record<string, unknown>).tripo3dSettings)
			? ((node as unknown as Record<string, unknown>).tripo3dSettings as Record<string, unknown>)
			: {}

		const getVal = (plainKey: string, prefixedKey: string): unknown => {
			if (plainKey in settings) return settings[plainKey]
			if (prefixedKey in tripo3dSettings) return tripo3dSettings[prefixedKey]
			if (prefixedKey in settings) return settings[prefixedKey]
			return undefined
		}

		const getStr = (plainKey: string, prefixedKey: string): string => {
			const val = getVal(plainKey, prefixedKey)
			return typeof val === 'string' ? val.trim() : ''
		}

		const getNum = (plainKey: string, prefixedKey: string, defaultValue = 0): number => {
			const val = getVal(plainKey, prefixedKey)
			const num = Number(val)
			return Number.isFinite(num) ? num : defaultValue
		}

		const getBool = (plainKey: string, prefixedKey: string, defaultValue = false): boolean => {
			const val = getVal(plainKey, prefixedKey)
			if (typeof val === 'boolean') return val
			if (typeof val === 'string') return val.toLowerCase() === 'true'
			return defaultValue
		}

		const getArr = <T>(plainKey: string, prefixedKey: string): T[] => {
			const val = getVal(plainKey, prefixedKey)
			return Array.isArray(val) ? (val as T[]) : []
		}

		const linkedPrompt = options.connectedTripo3DPrompt(node.id)
		const linkedImageInputs = options.connectedTripo3DImageInputs(node.id)
		let linkedModelInput: LinkedModelInput = null
		try {
			linkedModelInput = await options.connectedTripo3DModelInput(node.id)
		} catch (err: unknown) {
			return {
				ok: false,
				error: t('tasks.tripo3d.modelInputReadFailed', { error: getErrorMessage(err) })
			}
		}

		const forceSingleImage = getBool('forceSingleImage', 'tripo3dForceSingleImage', false)
		const selectedImages = getArr<{nodeId: string; view: string; order: number}>('selectedImages', 'tripo3dSelectedImages')

		let mode: Tripo3DMode
		if (linkedImageInputs.length === 0) {
			mode = 'text_to_model'
		} else if (linkedImageInputs.length === 1 || forceSingleImage) {
			mode = 'image_to_model'
		} else {
			mode = selectedImages.length >= 2 ? 'multiview_to_model' : 'image_to_model'
		}

		if (!options.hasConnectedTripo3DConsumer(node)) {
			return {
				ok: false,
				error: t('tasks.tripo3d.connectModelOutputFirst')
			}
		}

		const imageLimit = 4
		const linkedImagesMap = new Map<string, string>()
		for (const item of linkedImageInputs.slice(0, imageLimit)) {
			try {
				const normalized = await options.buildTripo3DImageInputFromNode(
					item.fromNode,
					item.fromAnchorId
				)
				if (normalized) {
					linkedImagesMap.set(item.fromNode.id, normalized)
				}
			} catch (err: unknown) {
				const label =
					String(item.fromNode.alias ?? item.fromNode.title ?? item.fromNode.id).trim() ||
					item.fromNode.id
				return {
					ok: false,
					error: t('tasks.tripo3d.referenceImageReadFailed', { label, error: getErrorMessage(err) })
				}
			}
		}

		const modelVersion = getStr('modelVersion', 'tripo3dModelVersion') || 'v2.0-20240919'
		let texture = getBool('texture', 'tripo3dTexture', true)
		let pbr = getBool('pbr', 'tripo3dPbr', true)
		const quad = getBool('quad', 'tripo3dQuad', false)
		const smartLowPoly = getBool('smartLowPoly', 'tripo3dSmartLowPoly', false)
		const generateParts = getBool('generateParts', 'tripo3dGenerateParts', false)
		const enableImageAutofix = getBool('enableImageAutofix', 'tripo3dEnableImageAutofix', true)
		const textureAlignment = getStr('textureAlignment', 'tripo3dTextureAlignment') as 'original_image' | 'geometry' | ''
		const orientation = getStr('orientation', 'tripo3dOrientation') as 'default' | 'align_image' | ''
		const textureQuality = getStr('textureQuality', 'tripo3dTextureQuality') as 'standard' | 'detailed' | 'extreme' | ''
		const geometryQuality = getStr('geometryQuality', 'tripo3dGeometryQuality') as 'standard' | 'detailed' | ''
		const autoSize = getBool('autoSize', 'tripo3dAutoSize', true)
		const compress = getBool('compress', 'tripo3dCompress', false)
		const exportUv = getBool('exportUv', 'tripo3dExportUv', false)

		if (generateParts) {
			texture = false
			pbr = false
		}
		if (pbr) {
			texture = true
		}

		const faceLimit = getNum('faceLimit', 'tripo3dFaceLimit', 2000000)
		const modelSeed = getNum('modelSeed', 'tripo3dModelSeed', -1)
		const textureSeed = getNum('textureSeed', 'tripo3dTextureSeed', -1)
		const negativePrompt = getStr('negativePrompt', 'tripo3dNegativePrompt')

		const rawPrompt = linkedPrompt || getStr('prompt', 'tripo3dPrompt')

		const payload: Tripo3DGeneratePayload = {
			mode,
			model_version: modelVersion,
			prompt: (rawPrompt && mode === 'text_to_model') ? rawPrompt : (rawPrompt || undefined),
			negative_prompt: negativePrompt || undefined,
			face_limit: Number.isFinite(faceLimit) && faceLimit > 0 ? Math.floor(faceLimit) : undefined,
			texture,
			pbr,
			enable_image_autofix: enableImageAutofix,
			texture_alignment: textureAlignment || undefined,
			orientation: orientation || undefined,
			texture_quality: textureQuality || undefined,
			geometry_quality: geometryQuality || undefined,
			auto_size: autoSize,
			quad,
			smart_low_poly: smartLowPoly,
			generate_parts: generateParts,
			compress: compress ? 'geometry' : undefined,
			export_uv: exportUv,
			model_seed: Number.isFinite(modelSeed) && modelSeed >= 0 ? Math.floor(modelSeed) : undefined,
			texture_seed: Number.isFinite(textureSeed) && textureSeed >= 0 ? Math.floor(textureSeed) : undefined
		}

		let imageCount = 0
		if (mode === 'text_to_model') {
			if (!payload.prompt) return { ok: false, error: t('tasks.tripo3d.promptRequired') }
		} else if (mode === 'image_to_model') {
			let selectedImageUrl = ''
			if (selectedImages.length > 0) {
				const selected = selectedImages.find(s => linkedImagesMap.has(s.nodeId))
				if (selected) {
					selectedImageUrl = linkedImagesMap.get(selected.nodeId) || ''
				}
			}
			if (!selectedImageUrl && linkedImagesMap.size > 0) {
				selectedImageUrl = Array.from(linkedImagesMap.values())[0]
			}
			const singleImageUrl = getStr('imageUrl', 'tripo3dImageUrl')
			if (!selectedImageUrl && singleImageUrl) {
				try {
					selectedImageUrl = await options.normalizeTripo3DImageInputValue(
						singleImageUrl,
						'tripo3d_single_ref'
					)
				} catch (err: unknown) {
					return {
						ok: false,
						error: t('tasks.tripo3d.singleReferenceImageReadFailed', { error: getErrorMessage(err) })
					}
				}
			}
			if (!selectedImageUrl) {
				return { ok: false, error: t('tasks.tripo3d.imageToModelRequiresImage') }
			}
			payload.file = { type: 'png', url: selectedImageUrl }
			payload.image_url = selectedImageUrl
			imageCount = 1
		} else if (mode === 'multiview_to_model') {
			const viewOrder = ['front', 'left', 'back', 'right'] as const
			const selectedByView = new Map<string, string>()

			const sortedSelected = [...selectedImages]
				.filter(s => linkedImagesMap.has(s.nodeId))
				.sort((a, b) => a.order - b.order)

			for (const selected of sortedSelected) {
				const imgUrl = linkedImagesMap.get(selected.nodeId)
				if (imgUrl) {
					selectedByView.set(selected.view, imgUrl)
				}
			}

			if (!selectedByView.has('front') || selectedByView.size < 2) {
				return { ok: false, error: t('tasks.tripo3d.multiviewRequiresFrontAndMore') }
			}

			const multiviewImageCount = selectedByView.size
			const viewKeyInputs: Array<Record<string, string>> = []
			for (const view of viewOrder) {
				const imgUrl = selectedByView.get(view)
				if (imgUrl) {
					viewKeyInputs.push({ [view]: imgUrl })
				}
			}

			imageCount = multiviewImageCount
			payload.inputs = viewKeyInputs
			payload.selectedImages = sortedSelected.map(s => ({
				nodeId: s.nodeId,
				view: s.view,
				order: s.order
			}))
		} else if (mode === 'texture') {
			const modelTaskId = getStr('modelTaskId', 'tripo3dModelTaskId') || getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(linkedModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl) return { ok: false, error: t('tasks.tripo3d.textureRequiresModel') }
			payload.model_task_id = modelTaskId || undefined
			payload.model_url = modelUrl || undefined
		} else if (mode === 'refine') {
			const modelTaskId = getStr('modelTaskId', 'tripo3dModelTaskId') || getStr('taskId', 'tripo3dTaskId')
			const originalModelTaskId = getStr('rootTaskId', 'tripo3dRootTaskId')
			const modelUrl = String(linkedModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl) return { ok: false, error: t('tasks.tripo3d.refineRequiresModel') }
			payload.model_task_id = modelTaskId || undefined
			payload.original_model_task_id = originalModelTaskId || undefined
			payload.model_url = modelUrl || undefined
		}

		return {
			ok: true,
			payload,
			promptText: String(payload.prompt ?? '').trim(),
			promptSource: linkedPrompt
				? 'linked'
				: getStr('prompt', 'tripo3dPrompt')
					? 'manual'
					: 'none',
			imageCount
		}
	}

	return {
		buildTripo3DRequestPayload
	}
}
