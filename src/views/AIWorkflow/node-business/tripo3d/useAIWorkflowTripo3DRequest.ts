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
	inputTaskId?: string
	isTripo3DGenerated?: boolean
} | null

const getSettingValue = (
	settings: Record<string, unknown>,
	plainKey: string,
	prefixedKey: string
): unknown => {
	if (plainKey in settings) return settings[plainKey]
	return settings[prefixedKey]
}

const getSettingString = (
	settings: Record<string, unknown>,
	plainKey: string,
	prefixedKey: string
): string => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	return typeof val === 'string' ? val.trim() : ''
}

const getSettingNumber = (
	settings: Record<string, unknown>,
	plainKey: string,
	prefixedKey: string,
	defaultValue = 0
): number => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	const num = Number(val)
	return Number.isFinite(num) ? num : defaultValue
}

const getSettingBoolean = (
	settings: Record<string, unknown>,
	plainKey: string,
	prefixedKey: string,
	defaultValue = false
): boolean => {
	const val = getSettingValue(settings, plainKey, prefixedKey)
	if (typeof val === 'boolean') return val
	if (typeof val === 'string') return val.toLowerCase() === 'true'
	return defaultValue
}

const getSettingArray = <T>(
	settings: Record<string, unknown>,
	plainKey: string,
	prefixedKey: string
): T[] => {
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
	const buildTripo3DRequestPayload = async (
		node: WorkflowNode
	): Promise<BuildTripo3DRequestResult> => {
		const model3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
		const settings = (
			isRecord(model3dSettings.tripo3dModelSettings) ? model3dSettings.tripo3dModelSettings : {}
		) as Record<string, unknown>
		const tripo3dSettings = isRecord((node as unknown as Record<string, unknown>).tripo3dSettings)
			? ((node as unknown as Record<string, unknown>).tripo3dSettings as Record<string, unknown>)
			: {}
		const nodeChatParams = isRecord((node as unknown as Record<string, unknown>).nodeChatParams)
			? ((node as unknown as Record<string, unknown>).nodeChatParams as Record<string, unknown>)
			: {}

		const getVal = (plainKey: string, prefixedKey: string): unknown => {
			if (plainKey in nodeChatParams) return nodeChatParams[plainKey]
			if (prefixedKey in nodeChatParams) return nodeChatParams[prefixedKey]
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
		const selectedImages = getArr<{ nodeId: string; view: string; order: number }>(
			'selectedImages',
			'tripo3dSelectedImages'
		)
		const taskMode = getStr('taskMode', 'tripo3dTaskMode')

		const selfTripo3dTaskId = String(
			settings.tripo3dTaskId ?? settings.tripo3dUpstreamTaskId ?? ''
		).trim()
		const selfModelUrl = String(
			model3dSettings.modelAssetUrl ?? model3dSettings.modelUrl ?? ''
		).trim()
		const effectiveModelInput: LinkedModelInput = linkedModelInput?.inputTaskId
			? linkedModelInput
			: selfTripo3dTaskId || selfModelUrl
				? {
						modelUrl: selfModelUrl || linkedModelInput?.modelUrl || '',
						sourceName: linkedModelInput?.sourceName,
						inputTaskId: selfTripo3dTaskId || undefined,
						isTripo3DGenerated: !!selfTripo3dTaskId
					}
				: linkedModelInput

		console.log('[Tripo3D Request] 模型输入解析:', {
			nodeId: node.id,
			taskMode,
			linkedModelInput: linkedModelInput
				? {
						hasInputTaskId: !!linkedModelInput.inputTaskId,
						inputTaskId: linkedModelInput.inputTaskId,
						modelUrl: linkedModelInput.modelUrl
							? linkedModelInput.modelUrl.slice(0, 80) + '...'
							: '',
						isTripo3DGenerated: linkedModelInput.isTripo3DGenerated
					}
				: null,
			selfTripo3dTaskId,
			selfModelUrl: selfModelUrl ? selfModelUrl.slice(0, 80) + '...' : '',
			effectiveModelInput: effectiveModelInput
				? {
						hasInputTaskId: !!effectiveModelInput.inputTaskId,
						inputTaskId: effectiveModelInput.inputTaskId,
						modelUrl: effectiveModelInput.modelUrl
							? effectiveModelInput.modelUrl.slice(0, 80) + '...'
							: ''
					}
				: null
		})

		const postProcessModes = [
			'texture',
			'refine',
			'mesh_segment',
			'mesh_smartsegment',
			'mesh_complete',
			'mesh_decimate',
			'models_convert'
		]
		const isPostProcess = postProcessModes.includes(taskMode)

		let mode: Tripo3DMode
		if (isPostProcess) {
			mode = taskMode as Tripo3DMode
		} else if (linkedImageInputs.length === 0) {
			mode = 'text_to_model'
		} else if (linkedImageInputs.length === 1 || forceSingleImage) {
			mode = 'image_to_model'
		} else {
			mode = selectedImages.length >= 2 ? 'multiview_to_model' : 'image_to_model'
		}

		if (!isPostProcess && !options.hasConnectedTripo3DConsumer(node)) {
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
		const textureAlignment = getStr('textureAlignment', 'tripo3dTextureAlignment') as
			| 'original_image'
			| 'geometry'
			| ''
		const orientation = getStr('orientation', 'tripo3dOrientation') as
			| 'default'
			| 'align_image'
			| ''
		const textureQuality = getStr('textureQuality', 'tripo3dTextureQuality') as
			| 'standard'
			| 'detailed'
			| 'extreme'
			| ''
		const geometryQuality = getStr('geometryQuality', 'tripo3dGeometryQuality') as
			| 'standard'
			| 'detailed'
			| ''
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
		const textureModelVersion =
			getStr('textureModelVersion', 'tripo3dTextureModelVersion') || 'v3.0-20250812'
		const textureForceSingleImage = getBool(
			'textureForceSingleImage',
			'tripo3dTextureForceSingleImage',
			false
		)
		const textureSelectedImages = getArr<{ nodeId: string; view: string; order: number }>(
			'textureSelectedImages',
			'tripo3dTextureSelectedImages'
		)
		const textureBake = getBool('textureBake', 'tripo3dTextureBake', true)

		const rawPrompt = linkedPrompt || getStr('prompt', 'tripo3dPrompt')

		const payload: Tripo3DGeneratePayload = {
			mode,
			...(isPostProcess
				? {}
				: {
						model_version: modelVersion,
						prompt: rawPrompt && mode === 'text_to_model' ? rawPrompt : rawPrompt || undefined,
						negative_prompt: negativePrompt || undefined,
						face_limit:
							Number.isFinite(faceLimit) && faceLimit > 0 ? Math.floor(faceLimit) : undefined,
						texture,
						enable_image_autofix: enableImageAutofix,
						orientation: orientation || undefined,
						geometry_quality: geometryQuality || undefined,
						auto_size: autoSize,
						quad,
						smart_low_poly: smartLowPoly,
						generate_parts: generateParts,
						export_uv: exportUv,
						model_seed:
							Number.isFinite(modelSeed) && modelSeed >= 0 ? Math.floor(modelSeed) : undefined
					}),
			...(!isPostProcess || mode === 'texture'
				? {
						pbr,
						texture_alignment: textureAlignment || undefined,
						texture_quality: textureQuality || undefined,
						compress: compress ? 'geometry' : undefined
					}
				: {}),
			texture_seed:
				Number.isFinite(textureSeed) && textureSeed >= 0 ? Math.floor(textureSeed) : undefined
		}

		let imageCount = 0
		if (mode === 'text_to_model') {
			if (!payload.prompt) return { ok: false, error: t('tasks.tripo3d.promptRequired') }
		} else if (mode === 'image_to_model') {
			let selectedImageUrl = ''
			if (selectedImages.length > 0) {
				const selected = selectedImages.find((s) => linkedImagesMap.has(s.nodeId))
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
						error: t('tasks.tripo3d.singleReferenceImageReadFailed', {
							error: getErrorMessage(err)
						})
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
				.filter((s) => linkedImagesMap.has(s.nodeId))
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
			payload.selectedImages = sortedSelected.map((s) => ({
				nodeId: s.nodeId,
				view: s.view,
				order: s.order
			}))
		} else if (mode === 'texture') {
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(effectiveModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl)
				return { ok: false, error: t('tasks.tripo3d.textureRequiresModel') }
			payload.input = modelTaskId || modelUrl
			payload.model = textureModelVersion

			const textureImageCount = linkedImagesMap.size
			const textureForceSingle = textureForceSingleImage === true
			const promptText = rawPrompt || ''

			if (textureImageCount === 0) {
				if (promptText) {
					payload.texture_prompt = { text: promptText }
				}
			} else if (textureImageCount === 1 || textureForceSingle) {
				const firstImgToken = Array.from(linkedImagesMap.values())[0]
				if (firstImgToken) {
					const tp: Record<string, unknown> = { image: { file_token: firstImgToken } }
					if (promptText) tp.text = promptText
					payload.texture_prompt = tp
				}
			} else {
				const viewOrder = ['front', 'left', 'back', 'right'] as const
				const imagesObj: Record<string, { file_token: string }> = {}
				let mapped = 0
				for (const sel of textureSelectedImages) {
					const token = linkedImagesMap.get(sel.nodeId)
					if (token && viewOrder.includes(sel.view as (typeof viewOrder)[number])) {
						imagesObj[sel.view] = { file_token: token }
						mapped++
					}
				}
				if (mapped === 0) {
					const imgTokens = Array.from(linkedImagesMap.values())
					for (let i = 0; i < Math.min(imgTokens.length, viewOrder.length); i++) {
						imagesObj[viewOrder[i]] = { file_token: imgTokens[i] }
					}
				}
				if (Object.keys(imagesObj).length > 0) {
					const tp: Record<string, unknown> = { images: imagesObj }
					if (promptText) tp.text = promptText
					payload.texture_prompt = tp
				} else if (promptText) {
					payload.texture_prompt = { text: promptText }
				}
			}

			payload.pbr = pbr
			if (textureQuality) payload.texture_quality = textureQuality
			if (textureAlignment) payload.texture_alignment = textureAlignment
			if (compress) payload.compress = 'geometry'
			if (textureBake) payload.bake = true
			if (textureSeed >= 0) payload.texture_seed = Math.floor(textureSeed)
			delete payload.model_version
			delete payload.texture
			imageCount = textureImageCount
		} else if (mode === 'refine') {
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(effectiveModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl)
				return { ok: false, error: t('tasks.tripo3d.refineRequiresModel') }
			payload.input = modelTaskId || modelUrl
			payload.prompt = getStr('hint', 'tripo3dHint') || rawPrompt || undefined
			delete payload.model_version
			delete payload.texture
		} else if (mode === 'mesh_segment') {
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(effectiveModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl)
				return { ok: false, error: t('tasks.tripo3d.postProcessRequiresModel') }
			payload.input = modelTaskId || modelUrl
			payload.model = getStr('modelVersion', 'tripo3dModelVersion') || undefined
		} else if (mode === 'mesh_smartsegment') {
			const segType = (getStr('segType', 'tripo3dSegType') as 'image' | 'model') || 'image'
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(effectiveModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl)
				return { ok: false, error: t('tasks.tripo3d.postProcessRequiresModel') }
			payload.seg_type = segType
			payload.input = modelTaskId || modelUrl
			payload.model = getStr('modelVersion', 'tripo3dModelVersion') || undefined
			payload.granularity =
				(getStr('granularity', 'tripo3dGranularity') as 'coarse' | 'medium' | 'fine') || undefined
			payload.hint = getStr('hint', 'tripo3dHint') || undefined
			if (segType === 'model') {
				const transform = getArr<number>('transform', 'tripo3dTransform')
				if (transform.length === 16) {
					payload.transform = transform.map(Number)
				} else {
					payload.transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
				}
			}
		} else if (mode === 'mesh_complete') {
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			if (!modelTaskId) return { ok: false, error: t('tasks.tripo3d.meshCompleteRequiresSegment') }
			payload.input = modelTaskId
			payload.model = getStr('modelVersion', 'tripo3dModelVersion') || undefined
			const partNames = getArr<string>('partNames', 'tripo3dPartNames')
			if (partNames.length > 0) {
				payload.part_names = partNames.map(String)
			}
		} else if (mode === 'mesh_decimate') {
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(effectiveModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl)
				return { ok: false, error: t('tasks.tripo3d.postProcessRequiresModel') }
			payload.input = modelTaskId || modelUrl
			payload.model = getStr('decimateModel', 'tripo3dDecimateModel') || 'v2.0'
			const faceLimit = getNum('convertFaceLimit', 'tripo3dConvertFaceLimit', 0)
			if (faceLimit > 0) payload.face_limit = Math.floor(faceLimit)
			payload.quad = getBool('convertQuad', 'tripo3dConvertQuad', false)
		} else if (mode === 'models_convert') {
			const modelTaskId =
				effectiveModelInput?.inputTaskId ||
				getStr('modelTaskId', 'tripo3dModelTaskId') ||
				getStr('taskId', 'tripo3dTaskId')
			const modelUrl = String(effectiveModelInput?.modelUrl ?? '').trim()
			if (!modelTaskId && !modelUrl)
				return { ok: false, error: t('tasks.tripo3d.postProcessRequiresModel') }
			payload.input = modelTaskId || modelUrl
			const format =
				(getStr('convertFormat', 'tripo3dConvertFormat') as
					| 'GLTF'
					| 'FBX'
					| 'USDZ'
					| 'OBJ'
					| 'STL'
					| '3MF') || 'GLTF'
			const convertQuad = getBool('convertQuad', 'tripo3dConvertQuad', false)
			payload.format = convertQuad ? 'FBX' : format
			payload.quad = convertQuad
			const convertFaceLimit = getNum('convertFaceLimit', 'tripo3dConvertFaceLimit', 0)
			if (convertFaceLimit > 0) payload.face_limit = Math.floor(convertFaceLimit)
			payload.flatten_bottom = getBool('convertFlattenBottom', 'tripo3dConvertFlattenBottom', false)
			const textureSize = getNum('convertTextureSize', 'tripo3dConvertTextureSize', 0)
			if (textureSize > 0) payload.texture_size = Math.floor(textureSize)
		}

		console.log(
			'[Tripo3D Request] 最终payload (mode=' + mode + '):',
			JSON.stringify(payload, null, 2)
		)

		return {
			ok: true,
			payload,
			promptText: String(payload.prompt ?? '').trim(),
			promptSource: linkedPrompt ? 'linked' : getStr('prompt', 'tripo3dPrompt') ? 'manual' : 'none',
			imageCount
		}
	}

	return {
		buildTripo3DRequestPayload
	}
}
