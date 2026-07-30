import { nextTick } from 'vue'
import type {
	WorkflowImageCrop,
	WorkflowNode,
	WorkflowSceneDecomposeOutput
} from '../../../../aiworkflow/types'
import {
	buildSceneDecomposeDescription,
	buildSceneDecomposePromptVisualDetails,
	extractSceneDecomposeItems,
	hasAnySceneDecomposeCrop,
	hasValidSceneDecomposeImageRect,
	hasValidSceneDecomposePixelRect,
	inferSceneDecomposeCategory,
	inferSceneDecomposeObjectName,
	inferSceneDecomposeSourceImageIndex,
	normalizeSceneDecomposeCrop,
	shouldSkipSceneDecomposeItem,
	slugSceneDecomposeId,
	ensureSceneDecomposeSourceDimensions
} from './sceneDecomposeShared'
import {
	computeEnforcedLandscapeCrop,
	uvCropToPixelRect
} from '../../../../aiworkflow/imageCropEnforcer'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'

export const useAIWorkflowSceneDecomposeController = (options: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
		commit: (type: string, value: unknown) => void
	}
	connectedTextInputValue: (nodeId: string, anchorId: string) => string
	connectedSceneDecomposeImageInputs: (
		nodeId: string
	) => Array<{ url: string; width?: number; height?: number }>
	connectedSceneDecomposeImageInputAt: (
		nodeId: string,
		sourceImageIndex: number
	) => { url: string; width?: number; height?: number } | null
	buildImageTransferFileFromCrop: (payload: {
		sourceUrl: string
		sourceName: string
		crop: WorkflowImageCrop
		outputWidth?: number
		outputHeight?: number
		suffix?: string
		sourceWidth?: number
		sourceHeight?: number
		enforceLandscape?: boolean
	}) => Promise<File | null>
	addGeneratedImageResource: (file: File) => { resourceId: string; url: string }
	autoExpandSceneDecomposeOutputs: (
		sourceNode: WorkflowNode,
		outputs: WorkflowSceneDecomposeOutput[],
		generatedFiles: Map<string, File>
	) => Promise<{ createdNodeIds: string[]; sceneLayoutConnections?: number }>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	onAutoWireStart?: (sourceNodeId: string) => void
	onAutoWireEnd?: () => void
}) => {
	const onNodeRunSceneDecompose = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'scene-decompose') return

		const inputJson = String(options.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
		const imageInputs = options.connectedSceneDecomposeImageInputs(nodeId)
		if (!inputJson) {
			options.store.commit('setNodeSceneDecomposeSettings', {
				nodeId,
				sceneDecomposeSettings: {
					status: 'error',
					message: t('aiworkflow.runtime.decomposeMissingJson')
				}
			})
			options.pushToast(t('aiworkflow.runtime.decomposeMissingJson'), 'warn')
			return
		}
		if (!imageInputs.length) {
			options.store.commit('setNodeSceneDecomposeSettings', {
				nodeId,
				sceneDecomposeSettings: {
					status: 'error',
					message: t('aiworkflow.runtime.decomposeMissingImage')
				}
			})
			options.pushToast(t('aiworkflow.runtime.decomposeMissingImage'), 'warn')
			return
		}

		options.store.commit('setNodeSceneDecomposeSettings', {
			nodeId,
			sceneDecomposeSettings: {
				status: 'running',
				message: t('aiworkflow.runtime.decomposeProcessingBySourceIndex'),
				inputJson,
				lastRunAt: Date.now(),
				outputs: []
			}
		})

		try {
			const parsed = JSON.parse(inputJson)
			const rawObjects = extractSceneDecomposeItems(parsed)
			if (!rawObjects.length) {
				options.store.commit('setNodeSceneDecomposeSettings', {
					nodeId,
					sceneDecomposeSettings: {
						status: 'error',
						message: t('aiworkflow.runtime.decomposeNoItemsFound'),
						inputJson,
						outputs: []
					}
				})
				options.pushToast(
					t('aiworkflow.runtime.decomposeFailed', {
						error: t('aiworkflow.runtime.decomposeNoItemsFound')
					}),
					'warn'
				)
				return
			}

			const actionableItems = rawObjects.filter((item) => !shouldSkipSceneDecomposeItem(item))
			const totalTasks = actionableItems.length
			if (!totalTasks) {
				options.store.commit('setNodeSceneDecomposeSettings', {
					nodeId,
					sceneDecomposeSettings: {
						status: 'error',
						message: t('aiworkflow.runtime.decomposeItemsStructuralOnly'),
						inputJson,
						outputs: [],
						progress: 0,
						totalTasks: 0,
						completedTasks: 0,
						croppedCount: 0,
						fallbackCount: 0
					}
				})
				options.pushToast(
					t('aiworkflow.runtime.decomposeFailed', {
						error: t('aiworkflow.runtime.decomposeNoItemsToProcess')
					}),
					'warn'
				)
				return
			}

			options.store.commit('setNodeSceneDecomposeSettings', {
				nodeId,
				sceneDecomposeSettings: {
					status: 'running',
					message: t('aiworkflow.runtime.decomposeProcessingProgress', {
						completed: '0',
						total: String(totalTasks)
					}),
					currentStep: t('aiworkflow.runtime.decomposePreparingCrop'),
					progress: 0,
					totalTasks,
					completedTasks: 0,
					croppedCount: 0,
					fallbackCount: 0,
					inputJson,
					outputs: [],
					lastRunAt: Date.now()
				}
			})

			const outputs: WorkflowSceneDecomposeOutput[] = []
			const generatedFiles = new Map<string, File>()
			let skippedCount = 0
			let completedTasks = 0
			let croppedCount = 0
			let fallbackCount = 0

			for (let index = 0; index < rawObjects.length; index += 1) {
				const item = rawObjects[index]
				if (shouldSkipSceneDecomposeItem(item)) {
					skippedCount += 1
					continue
				}
				const outputId = slugSceneDecomposeId(item?.id ?? item?.name, index)
				const objectId = String(item?.id ?? '').trim() || outputId
				const sourceImageIndex = inferSceneDecomposeSourceImageIndex(item)
				const source = options.connectedSceneDecomposeImageInputAt(nodeId, sourceImageIndex)
				const objectName = inferSceneDecomposeObjectName(item, index)
				const objectCategory = inferSceneDecomposeCategory(item)
				const objectMaterial = String(item?.material ?? '').trim()
				const taskLabel = t('aiworkflow.runtime.decomposeTaskLabel', {
					name: objectName,
					index: String(sourceImageIndex)
				})

				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} keys:`,
					Object.keys(item as Record<string, unknown>)
				)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} imageRect=`,
					item?.imageRect,
					'imageRectPixels=',
					item?.imageRectPixels
				)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} bbox=`,
					item?.bbox,
					'bbox_2d=',
					item?.bbox_2d,
					'box=',
					item?.box,
					'rect=',
					item?.rect
				)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} sourceImageIndex=${sourceImageIndex}, source=`,
					source?.url ? `${String(source.url).slice(0, 80)}...` : 'NO URL'
				)

				options.store.commit('setNodeSceneDecomposeSettings', {
					nodeId,
					sceneDecomposeSettings: {
						status: 'running',
						message: t('aiworkflow.runtime.decomposeProcessingProgress', {
							completed: String(completedTasks),
							total: String(totalTasks)
						}),
						currentStep: t('aiworkflow.runtime.decomposeCroppingItem', { label: taskLabel }),
						progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
						totalTasks,
						completedTasks,
						croppedCount,
						fallbackCount,
						inputJson,
						outputs,
						lastRunAt: Date.now()
					}
				})

				if (!source?.url) {
					skippedCount += 1
					completedTasks += 1
					continue
				}

				const hasExplicitCropInfo = hasAnySceneDecomposeCrop(item)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} hasExplicitCropInfo=`,
					hasExplicitCropInfo
				)
				const normalizedSource = await ensureSceneDecomposeSourceDimensions(source)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} normalizedSource dimensions:`,
					normalizedSource.width,
					'x',
					normalizedSource.height
				)

				const cropInfo = normalizeSceneDecomposeCrop(
					item?.imageRect,
					item?.imageRectPixels,
					normalizedSource,
					{
						allowFullImageFallback: !hasExplicitCropInfo,
						item
					}
				)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} cropInfo:`,
					cropInfo
						? {
								cropMode: cropInfo.cropMode,
								crop: cropInfo.crop,
								outputW: cropInfo.outputWidth,
								outputH: cropInfo.outputHeight
							}
						: 'NULL'
				)
				if (!cropInfo) {
					skippedCount += 1
					completedTasks += 1
					continue
				}

				const srcW = Math.max(
					1,
					Math.floor(Number(normalizedSource?.width ?? cropInfo.outputWidth ?? 0) || 1)
				)
				const srcH = Math.max(
					1,
					Math.floor(Number(normalizedSource?.height ?? cropInfo.outputHeight ?? 0) || 1)
				)
				const pixelCrop = uvCropToPixelRect(srcW, srcH, cropInfo.crop)
				const enforced = computeEnforcedLandscapeCrop(srcW, srcH, pixelCrop, { minWidth: 350 })

				const description = buildSceneDecomposeDescription(item, objectName)
				const visualDetails = buildSceneDecomposePromptVisualDetails(item, objectName)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} calling buildImageTransferFileFromCrop with sourceUrl=`,
					source.url,
					'crop=',
					cropInfo.crop,
					'enforcedCrop=',
					{
						sx: enforced.sourceCrop.sx,
						sy: enforced.sourceCrop.sy,
						sw: enforced.sourceCrop.sw,
						sh: enforced.sourceCrop.sh
					}
				)
				const transferFile = await options.buildImageTransferFileFromCrop({
					sourceUrl: source.url,
					sourceName: objectName,
					crop: cropInfo.crop,
					outputWidth: enforced.outputWidth,
					outputHeight: enforced.outputHeight,
					suffix: `decompose_${index + 1}`,
					sourceWidth: srcW,
					sourceHeight: srcH,
					enforceLandscape: true
				})
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} buildImageTransferFileFromCrop result:`,
					transferFile ? `File size=${transferFile.size} name=${transferFile.name}` : 'NULL'
				)
				if (!transferFile) {
					skippedCount += 1
					completedTasks += 1
					continue
				}

				const enforcedPixelRect = {
					x: enforced.sourceCrop.sx,
					y: enforced.sourceCrop.sy,
					width: enforced.sourceCrop.sw,
					height: enforced.sourceCrop.sh
				}

				const generated = options.addGeneratedImageResource(transferFile)
				console.log(
					`[SCENE-DECOMPOSE CROP] item#${index} generated resource: resourceId=${generated.resourceId}, blobUrl=${generated.url?.slice(0, 60)}...`
				)
				generatedFiles.set(outputId, transferFile)
				if (cropInfo.cropMode === 'fallback') fallbackCount += 1
				else croppedCount += 1
				outputs.push({
					id: outputId,
					objectId,
					name: objectName,
					category: objectCategory,
					material: objectMaterial,
					visualDetails,
					description,
					cropMode: enforced.adjusted ? `${cropInfo.cropMode}-enforced` : cropInfo.cropMode,
					sourceImageIndex,
					observedImageIndices: Array.isArray(item?.observedImageIndices)
						? item.observedImageIndices
								.map((value: unknown) => Number(value))
								.filter((value: number) => Number.isFinite(value) && value > 0)
						: undefined,
					imageRect: cropInfo.crop,
					imageRectPixels: enforcedPixelRect,
					imageAnchorId: `out-image-${outputId}`,
					textAnchorId: `out-text-${outputId}`,
					generatedResourceId: generated.resourceId,
					outputWidth: enforced.outputWidth,
					outputHeight: enforced.outputHeight
				})

				completedTasks += 1
				options.store.commit('setNodeSceneDecomposeSettings', {
					nodeId,
					sceneDecomposeSettings: {
						status: 'running',
						message: t('aiworkflow.runtime.decomposeProcessingProgress', {
							completed: String(completedTasks),
							total: String(totalTasks)
						}),
						currentStep: t('aiworkflow.runtime.decomposeCompletedItem', { label: taskLabel }),
						progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100,
						totalTasks,
						completedTasks,
						croppedCount,
						fallbackCount,
						inputJson,
						outputs,
						lastRunAt: Date.now()
					}
				})
			}

			if (!outputs.length) {
				options.store.commit('setNodeSceneDecomposeSettings', {
					nodeId,
					sceneDecomposeSettings: {
						status: 'error',
						message: t('aiworkflow.runtime.decomposeNoGeneratableItems'),
						inputJson,
						outputs: [],
						progress: totalTasks > 0 ? 100 : 0,
						totalTasks,
						completedTasks,
						croppedCount,
						fallbackCount
					}
				})
				options.pushToast(
					t('aiworkflow.runtime.decomposeFailed', {
						error: t('aiworkflow.runtime.decomposeNoItemsToGenerate')
					}),
					'warn'
				)
				return
			}

			// 先提交完整 outputs 以触发场景拆解节点输出锚点的渲染，
			// 等待 Vue 完成 DOM 刷新后再执行自动布线，确保连线起点能对准实际锚点位置。
			options.store.commit('setNodeSceneDecomposeSettings', {
				nodeId,
				sceneDecomposeSettings: {
					status: 'running',
					message: t('aiworkflow.runtime.decomposeGeneratingNodes', {
						count: String(outputs.length)
					}),
					currentStep: t('aiworkflow.runtime.decomposePreparingAutowire'),
					progress: 100,
					totalTasks,
					completedTasks,
					croppedCount,
					fallbackCount,
					inputJson,
					outputs,
					lastRunAt: Date.now()
				}
			})
			await nextTick()

			const refreshedNode = options.store.state.nodesById[nodeId]
			if (!refreshedNode || refreshedNode.type !== 'scene-decompose') {
				options.pushToast(t('aiworkflow.runtime.decomposeNodeInvalid'), 'warn')
				return
			}

			options.onAutoWireStart?.(nodeId)

			const autoExpandResult = await options.autoExpandSceneDecomposeOutputs(
				refreshedNode,
				outputs,
				generatedFiles
			)
			const createdNodeIds = autoExpandResult.createdNodeIds
			const sceneLayoutConnections = Number(autoExpandResult.sceneLayoutConnections ?? 0)
			const completedMessage =
				skippedCount > 0
					? t('aiworkflow.runtime.decomposeCompletedWithSkip', {
							count: String(outputs.length),
							cropped: String(croppedCount),
							fallback: String(fallbackCount),
							skipped: String(skippedCount)
						})
					: t('aiworkflow.runtime.decomposeCompletedFull', {
							count: String(outputs.length),
							cropped: String(croppedCount),
							fallback: String(fallbackCount),
							nodes: String(createdNodeIds.length),
							layoutMsg:
								sceneLayoutConnections > 0
									? t('aiworkflow.runtime.decomposeLayoutConnectionMessage', {
											count: String(sceneLayoutConnections)
										})
									: ''
						})

			options.store.commit('setNodeSceneDecomposeSettings', {
				nodeId,
				sceneDecomposeSettings: {
					status: 'completed',
					message: completedMessage,
					progress: 100,
					currentStep: t('aiworkflow.runtime.decomposeAutoCropComplete'),
					totalTasks,
					completedTasks,
					croppedCount,
					fallbackCount,
					inputJson,
					outputs,
					lastRunAt: Date.now(),
					lastExpandedAt: Date.now(),
					lastExpandedCount: createdNodeIds.length
				}
			})
			options.pushToast(t('aiworkflow.runtime.decomposeGeneratedExpanded'), 'info')

			options.onAutoWireEnd?.()
		} catch (err: unknown) {
			const message = getErrorMessage(err)
			options.store.commit('setNodeSceneDecomposeSettings', {
				nodeId,
				sceneDecomposeSettings: {
					status: 'error',
					message,
					inputJson,
					outputs: []
				}
			})
			options.pushToast(t('aiworkflow.toast.sceneDecomposeFailed', { error: message }), 'warn')
			options.onAutoWireEnd?.()
		}
	}

	return {
		onNodeRunSceneDecompose
	}
}
