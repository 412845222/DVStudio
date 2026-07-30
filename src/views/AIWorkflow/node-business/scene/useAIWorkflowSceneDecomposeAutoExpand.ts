import type {
	WorkflowNode,
	WorkflowSceneDecomposeOutput,
	WorkflowEdge,
	WorkflowState,
	WorkflowAnchorSpec
} from '../../../../aiworkflow/types'
import { t } from '../../../../i18n'
import { makeSyncSceneLayoutNodeToEngine } from './useAIWorkflowSceneLayoutSync'

interface AutoExpandOptions {
	store: { commit: (mutation: string, payload?: unknown) => void; state: WorkflowState }
	engineApi?: {
		addNode?: (type: string, x: number, y: number, data?: Record<string, any>) => string | null
		connectPorts?: (fId: string, fA: string, tId: string, tA: string) => boolean
		removeEdge?: (edgeId: string) => void
		updateNodeData?: (nodeId: string, patch: Record<string, any>) => boolean
		moveNode?: (nodeId: string, x: number, y: number) => void
		beginBulkUpdate?: () => void
		endBulkUpdate?: () => void
		forceSyncToStore?: () => Promise<boolean>
	}
	getIncomingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	connectedTextInputValue: (nodeId: string, anchorId: string) => string
	hasExactEdge: (payload: {
		fromNodeId: string
		fromAnchorId: string
		toNodeId: string
		toAnchorId: string
	}) => boolean
	onNodeRunSceneLayout: (nodeId: string) => Promise<void>
	sceneLayoutModelInputAnchorId: (objectId: string) => string
	connectedSceneDecomposeImageInputRefAt: (
		nodeId: string,
		sourceImageIndex: number
	) => {
		inputAnchorId: string
		fromNodeId: string
		fromAnchorId: string
		fromNode: WorkflowNode
	} | null
	onNodeUploadResource: (
		nodeId: string,
		file: File,
		kind: 'image' | 'video',
		opts?: { autoDistribute?: boolean }
	) => Promise<void> | void
	setNodeResource?: (nodeId: string, resourceId: string) => void
	patchBlueprintNodeData?: (nodeId: string) => void
	onAutoWireNodeCreated?: (nodeId: string) => void
}

export const useAIWorkflowSceneDecomposeAutoExpand = (options: AutoExpandOptions) => {
	const autoExpandSceneDecomposeOutputs = async (
		sourceNode: WorkflowNode,
		outputs: WorkflowSceneDecomposeOutput[],
		generatedFiles: Map<string, File>
	) => {
		const createdNodeIds: string[] = []
		const createdModelTargets: Array<{ objectId: string; model3dNodeId: string }> = []

		const jsonInputEdge = options.getIncomingEdges(sourceNode.id, 'in-json')[0] ?? null
		const jsonSourceNodeId = String(jsonInputEdge?.fromNodeId ?? '').trim()
		const jsonSourceAnchorId =
			String(jsonInputEdge?.fromAnchorId ?? 'out-0').trim() || 'out-0'
		const inputJson = String(options.connectedTextInputValue(sourceNode.id, 'in-json') ?? '').trim()
		const actionableOutputs = outputs.filter((output) => generatedFiles.has(output.id) || output.generatedResourceId)
		const baseX = sourceNode.worldX + sourceNode.width + 180
		const baseY = sourceNode.worldY - 30
		const horizontalGap = 110
		const rowGap = 620
		const now = Date.now()

		const nodeFootprint = {
			image: { width: 450, height: 300 },
			text: { width: 360, height: 260 },
			model3d: { width: 450, height: 420 },
			sceneLayout: { width: 520, height: 720 }
		}

		const pipelineColumns = [
			nodeFootprint.image.width,
			nodeFootprint.text.width,
			nodeFootprint.image.width,
			nodeFootprint.text.width,
			nodeFootprint.model3d.width
		]

		const columnCenterX = (columnIndex: number) => {
			let offset = baseX
			for (let index = 0; index < columnIndex; index += 1) {
				offset += pipelineColumns[index] + horizontalGap
			}
			return offset + pipelineColumns[columnIndex] / 2
		}

		const rowCenterY = (rowIndex: number) => baseY + rowIndex * rowGap

		const normalizePromptText = (value: string) =>
			String(value ?? '')
				.replace(/\s+/g, ' ')
				.trim()
		const isWindowLikeObject = (output: WorkflowSceneDecomposeOutput) => {
			const haystack = [
				output.name,
				output.category,
				output.material,
				output.visualDetails,
				output.description,
				output.objectId
			]
				.filter(Boolean)
				.join(' ')
			return /窗|window|glass|玻璃/i.test(haystack)
		}
		const buildObjectSubjectPhrase = (output: WorkflowSceneDecomposeOutput) => {
			const name = normalizePromptText(String(output.name ?? '')) || '对象'
			const category = normalizePromptText(String(output.category ?? ''))
			const material = normalizePromptText(String(output.material ?? ''))
			const visual = normalizePromptText(String(output.visualDetails ?? ''))
			if (visual && visual.length > name.length) return visual
			const parts: string[] = [name]
			if (category && !name.includes(category)) parts.push(`（${category}）`)
			if (material) parts.push(`，材质为${material}`)
			return parts.join('')
		}
		const buildMeshyImagePrompt = (output: WorkflowSceneDecomposeOutput) => {
			const subject = buildObjectSubjectPhrase(output)
			const windowLike = isWindowLikeObject(output)
			const windowExtra = windowLike
				? [
						'目标是窗户构件本体，只保留窗框与玻璃，不要出现室内或室外场景内容。',
						'玻璃不要反射任何环境，不要透视看到后方画面，可使用中性灰或轻微磨砂半透明玻璃占位。'
					]
				: []
			const desc = normalizePromptText(String(output.description ?? ''))
			return [
				`请生成"${subject}"的单体三维建模参考图。`,
				desc && desc.length > 6 ? `识别特征：${desc}。` : '',
				'仅保留一个目标物体，居中展示，完整可见，正交风格，方图构图，纯白背景。',
				'保留目标物体的真实外形比例、结构层级和材质分区，线条清晰，边界干净。',
				...windowExtra,
				'禁止出现环境、房间、地面、墙面、道具、人物、文字、水印。',
				'禁止镜面反射、禁止高光反射出其他画面、禁止投影干扰。',
				'结果应适合下游 3D 重建与低模建模参考。'
			]
				.filter(Boolean)
				.join(' ')
		}

		const buildMeshy3dPrompt = (output: WorkflowSceneDecomposeOutput) => {
			const subject = buildObjectSubjectPhrase(output)
			const windowLike = isWindowLikeObject(output)
			const windowExtra = windowLike
				? [
						'若目标为窗户，仅建模窗框与玻璃平面占位，不要把室内外场景烘焙进模型。',
						'玻璃材质保持干净中性，不要反射或贴图出其他房间画面。'
					]
				: []
			const desc = normalizePromptText(String(output.description ?? ''))
			return [
				`请基于参考图生成"${subject}"的单体低模 3D 模型。`,
				desc && desc.length > 6 ? `识别特征：${desc}。` : '',
				'仅建模目标物体本体，保持可识别轮廓、主要结构和材质分区。',
				'网格应轻量、拓扑清晰、比例稳定，便于场景布局预览和后续编辑。',
				...windowExtra,
				'禁止包含背景、底座、墙地面、文字、水印、支撑架或其他附加物体。',
				'输出为可独立使用的单体模型资产。'
			]
				.filter(Boolean)
				.join(' ')
		}

		const buildNodeAlias = (output: WorkflowSceneDecomposeOutput, suffix: string) => {
			const name = normalizePromptText(String(output.name ?? '')) || '对象'
			const category = normalizePromptText(String(output.category ?? ''))
			const shortId = String(output.objectId ?? output.id ?? '')
				.split('-')
				.slice(-1)[0]
			const label = category && !name.includes(category) ? `${name}·${category}` : name
			const idTag = shortId ? ` [${shortId}]` : ''
			return `${label}${idTag} ${suffix}`
		}
		const buildNodeTitle = (output: WorkflowSceneDecomposeOutput, fallback: string) => {
			const name = normalizePromptText(String(output.name ?? '')) || fallback
			return name
		}

		type NodeGroup = {
			imageNodeId: string
			imagePromptNodeId: string
			generatedImageNodeId: string
			modelPromptNodeId: string
			model3dNodeId: string
			imageFile?: File
			imageResourceId?: string
			sourceImageIndex: number
		}
		const nodeGroups: NodeGroup[] = []

		// === 阶段1: 开启批量更新，直接在引擎中创建所有节点 ===
		const hasEngine = !!options.engineApi?.addNode

		// === 使用共享工具创建同步函数：将store中最新场景布局节点数据同步回引擎 ===
		const syncSceneLayoutNodeToEngine = makeSyncSceneLayoutNodeToEngine({
			store: options.store as any,
			patchBlueprintNodeData: options.patchBlueprintNodeData,
			engineApi: options.engineApi as any,
			hasEngine
		})

		// === 定义连线函数 ===
		const connectPorts = (fromId: string, fromA: string, toId: string, toA: string) => {
			if (hasEngine && options.engineApi?.connectPorts) {
				options.engineApi.connectPorts(fromId, fromA, toId, toA)
			} else {
				// Fallback: 在store中创建连线
				const exists = options.hasExactEdge({ fromNodeId: fromId, fromAnchorId: fromA, toNodeId: toId, toAnchorId: toA })
				if (!exists) {
					options.store.commit('addEdge', { fromNodeId: fromId, fromAnchorId: fromA, toNodeId: toId, toAnchorId: toA })
				}
			}
		}

		if (hasEngine && options.engineApi?.beginBulkUpdate) {
			options.engineApi.beginBulkUpdate()
		}

		try {
			for (let index = 0; index < actionableOutputs.length; index += 1) {
				const output = actionableOutputs[index]
				const file = generatedFiles.get(output.id)
				const resourceId = output.generatedResourceId
				const currentY = rowCenterY(index)

				const imagePromptText = buildMeshyImagePrompt(output)
				const modelPromptText = buildMeshy3dPrompt(output)

				// 列0: 拆解截图节点
				const imageNodeData: Record<string, any> = {
					title: buildNodeTitle(output, t('aiworkflow.runtime.decomposeImageTitle')),
					alias: buildNodeAlias(output, t('aiworkflow.runtime.decomposeImageAlias')),
					createdAt: now
				}
				if (resourceId) {
					imageNodeData.resourceId = resourceId
				}
				let imageNodeId: string | null = null
				if (hasEngine && options.engineApi?.addNode) {
					imageNodeId = options.engineApi.addNode(
						'image',
						columnCenterX(0),
						currentY,
						imageNodeData
					)
					if (imageNodeId && resourceId) {
						console.log(`[SCENE-DECOMPOSE-AUTOEXPAND] setting resourceId=${resourceId} on engine-created imageNode=${imageNodeId}`)
						options.store.commit('setNodeResource', { nodeId: imageNodeId, resourceId })
						if (options.setNodeResource) {
							options.setNodeResource(imageNodeId, resourceId)
						}
					}
				}
				if (!imageNodeId) {
					// Fallback: 在store中创建
					options.store.commit('addNodeAt', {
						worldX: columnCenterX(0),
						worldY: currentY,
						title: buildNodeTitle(output, t('aiworkflow.runtime.decomposeImageTitle'))
					})
					imageNodeId = String(options.store.state.selectedNodeId ?? '').trim()
					if (imageNodeId) {
						options.store.commit('setNodeType', { nodeId: imageNodeId, type: 'image' })
						options.store.commit('setNodeAlias', {
							nodeId: imageNodeId,
							alias: buildNodeAlias(output, t('aiworkflow.runtime.decomposeImageAlias'))
						})
						if (resourceId) {
							options.store.commit('setNodeResource', { nodeId: imageNodeId, resourceId })
							if (options.setNodeResource) {
								options.setNodeResource(imageNodeId, resourceId)
							}
						}
					}
				}
				if (!imageNodeId) continue
				createdNodeIds.push(imageNodeId)
				options.onAutoWireNodeCreated?.(imageNodeId)

				// 列1: 图像Prompt文本节点
				const imagePromptNodeData: Record<string, any> = {
					title: buildNodeTitle(output, t('aiworkflow.runtime.imagePromptTitle')),
					alias: buildNodeAlias(output, t('aiworkflow.runtime.imagePromptAlias')),
					textValue: imagePromptText,
					createdAt: now
				}
				let imagePromptNodeId: string | null = null
				if (hasEngine && options.engineApi?.addNode) {
					imagePromptNodeId = options.engineApi.addNode(
						'text',
						columnCenterX(1),
						currentY,
						imagePromptNodeData
					)
				}
				if (!imagePromptNodeId) {
					options.store.commit('addNodeAt', {
						worldX: columnCenterX(1),
						worldY: currentY,
						title: buildNodeTitle(output, t('aiworkflow.runtime.imagePromptTitle'))
					})
					imagePromptNodeId = String(options.store.state.selectedNodeId ?? '').trim()
					if (imagePromptNodeId) {
						options.store.commit('setNodeType', { nodeId: imagePromptNodeId, type: 'text' })
						options.store.commit('setNodeAlias', {
							nodeId: imagePromptNodeId,
							alias: buildNodeAlias(output, t('aiworkflow.runtime.imagePromptAlias'))
						})
						options.store.commit('setNodeTextValue', { nodeId: imagePromptNodeId, textValue: imagePromptText })
					}
				}
				if (!imagePromptNodeId) continue
				createdNodeIds.push(imagePromptNodeId)
				options.onAutoWireNodeCreated?.(imagePromptNodeId)

				// 列2: 参考图节点（裁剪后的物体图）
				const generatedImageNodeData: Record<string, any> = {
					title: buildNodeTitle(output, t('aiworkflow.runtime.generatedImageTitle')),
					alias: buildNodeAlias(output, t('aiworkflow.runtime.generatedImageAlias')),
					createdAt: now
				}
				let generatedImageNodeId: string | null = null
				if (hasEngine && options.engineApi?.addNode) {
					generatedImageNodeId = options.engineApi.addNode(
						'image',
						columnCenterX(2),
						currentY,
						generatedImageNodeData
					)
				}
				if (!generatedImageNodeId) {
					options.store.commit('addNodeAt', {
						worldX: columnCenterX(2),
						worldY: currentY,
						title: buildNodeTitle(output, t('aiworkflow.runtime.generatedImageTitle'))
					})
					generatedImageNodeId = String(options.store.state.selectedNodeId ?? '').trim()
					if (generatedImageNodeId) {
						options.store.commit('setNodeType', { nodeId: generatedImageNodeId, type: 'image' })
						options.store.commit('setNodeAlias', {
							nodeId: generatedImageNodeId,
							alias: buildNodeAlias(output, t('aiworkflow.runtime.generatedImageAlias'))
						})
					}
				}
				if (!generatedImageNodeId) continue
				createdNodeIds.push(generatedImageNodeId)
				options.onAutoWireNodeCreated?.(generatedImageNodeId)

				// 列3: 3D Prompt文本节点
				const modelPromptNodeData: Record<string, any> = {
					title: buildNodeTitle(output, t('aiworkflow.runtime.modelPromptTitle')),
					alias: buildNodeAlias(output, t('aiworkflow.runtime.modelPromptAlias')),
					textValue: modelPromptText,
					createdAt: now
				}
				let modelPromptNodeId: string | null = null
				if (hasEngine && options.engineApi?.addNode) {
					modelPromptNodeId = options.engineApi.addNode(
						'text',
						columnCenterX(3),
						currentY,
						modelPromptNodeData
					)
				}
				if (!modelPromptNodeId) {
					options.store.commit('addNodeAt', {
						worldX: columnCenterX(3),
						worldY: currentY,
						title: buildNodeTitle(output, t('aiworkflow.runtime.modelPromptTitle'))
					})
					modelPromptNodeId = String(options.store.state.selectedNodeId ?? '').trim()
					if (modelPromptNodeId) {
						options.store.commit('setNodeType', { nodeId: modelPromptNodeId, type: 'text' })
						options.store.commit('setNodeAlias', {
							nodeId: modelPromptNodeId,
							alias: buildNodeAlias(output, t('aiworkflow.runtime.modelPromptAlias'))
						})
						options.store.commit('setNodeTextValue', { nodeId: modelPromptNodeId, textValue: modelPromptText })
					}
				}
				if (!modelPromptNodeId) continue
				createdNodeIds.push(modelPromptNodeId)
				options.onAutoWireNodeCreated?.(modelPromptNodeId)

				// 列4: 3D模型节点
				const meshySettings = {
					modelGenerationSource: 'meshy',
					meshyModelSettings: {
						taskFamily: 'image-to-3d',
						prompt: modelPromptText,
						aiModel: 'latest',
						modelType: 'lowpoly',
						topology: 'triangle',
						targetPolycount: 12000,
						shouldTexture: true,
						removeLighting: false
					}
				}
				const model3dNodeData: Record<string, any> = {
					title: buildNodeTitle(output, t('aiworkflow.runtime.model3dTitle')),
					alias: buildNodeAlias(output, t('aiworkflow.runtime.model3dAlias')),
					model3dSettings: meshySettings,
					createdAt: now
				}
				let model3dNodeId: string | null = null
				if (hasEngine && options.engineApi?.addNode) {
					model3dNodeId = options.engineApi.addNode(
						'model3d',
						columnCenterX(4),
						currentY,
						model3dNodeData
					)
				}
				if (!model3dNodeId) {
					options.store.commit('addNodeAt', {
						worldX: columnCenterX(4),
						worldY: currentY,
						title: buildNodeTitle(output, t('aiworkflow.runtime.model3dTitle'))
					})
					model3dNodeId = String(options.store.state.selectedNodeId ?? '').trim()
					if (model3dNodeId) {
						options.store.commit('setNodeType', { nodeId: model3dNodeId, type: 'model3d' })
						options.store.commit('setNodeAlias', {
							nodeId: model3dNodeId,
							alias: buildNodeAlias(output, t('aiworkflow.runtime.model3dAlias'))
						})
						options.store.commit('setNodeModel3DSettings', {
							nodeId: model3dNodeId,
							model3dSettings: meshySettings
						})
					}
				}
				if (!model3dNodeId) continue
				createdNodeIds.push(model3dNodeId)
				options.onAutoWireNodeCreated?.(model3dNodeId)
				createdModelTargets.push({ objectId: String(output.objectId ?? output.id ?? ''), model3dNodeId })

				nodeGroups.push({
					imageNodeId,
					imagePromptNodeId,
					generatedImageNodeId,
					modelPromptNodeId,
					model3dNodeId,
					imageFile: file || undefined,
					imageResourceId: resourceId || undefined,
					sourceImageIndex: output.sourceImageIndex ?? 0
				})
			}

			// === 阶段2: 在引擎中创建连线 ===
			for (const group of nodeGroups) {
				// 1. 场景分解节点 → 截图节点（示意连线：仅表示数据来源关系，不参与实际内容计算）
				connectPorts(sourceNode.id, 'out-0', group.imageNodeId, 'in-0')
				// 2. 截图节点 → 生成图像节点（裁剪截图作为生成参考）
				connectPorts(group.imageNodeId, 'out-image', group.generatedImageNodeId, 'in-0')
				// 3. 图像提示词 → 生成图像节点
				connectPorts(group.imagePromptNodeId, 'out-0', group.generatedImageNodeId, 'in-0')
				// 4. 3D提示词 → 3D模型节点
				connectPorts(group.modelPromptNodeId, 'out-0', group.model3dNodeId, 'in-text')
				// 5. 生成图像 → 3D模型节点（参考图1）
				connectPorts(group.generatedImageNodeId, 'out-image', group.model3dNodeId, 'in-image-1')
				// 6. 上游参考图 → 生成图像节点（原始参考图作为额外输入）
				const sourceRef = options.connectedSceneDecomposeImageInputRefAt(sourceNode.id, group.sourceImageIndex)
				if (sourceRef?.fromNodeId && sourceRef?.fromAnchorId) {
					connectPorts(sourceRef.fromNodeId, sourceRef.fromAnchorId, group.generatedImageNodeId, 'in-0')
				}
			}
		} finally {
			// === 阶段3: 结束批量更新 ===
			if (hasEngine && options.engineApi?.endBulkUpdate) {
				options.engineApi.endBulkUpdate()
			}
		}

		// === 阶段4: 强制同步引擎到store，确保所有节点都在Vuex中 ===
		if (hasEngine && options.engineApi?.forceSyncToStore) {
			try {
				await options.engineApi.forceSyncToStore()
			} catch (err) {
				console.error('[SceneDecomposeAutoExpand] forceSyncToStore failed:', err)
			}
		} else {
			// Fallback: 等待几帧让debounced change事件完成同步
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						setTimeout(() => resolve(), 100)
					})
				})
			})
		}

		// === 阶段5: 双重确保所有节点数据正确设置（防止同步过程中数据丢失）===
		await new Promise((resolve) => setTimeout(resolve, 100))

		// 确保截图节点resourceId正确绑定（核心修复：forceSync后强制重新设置）
		for (const group of nodeGroups) {
			if (group.imageResourceId) {
				// 无条件重新设置resourceId，防止引擎同步覆盖
				options.store.commit('setNodeResource', { nodeId: group.imageNodeId, resourceId: group.imageResourceId })
				if (options.setNodeResource) {
					options.setNodeResource(group.imageNodeId, group.imageResourceId)
				}
				if (options.engineApi?.updateNodeData) {
					options.engineApi.updateNodeData(group.imageNodeId, { resourceId: group.imageResourceId })
				}
			}
			// 如果有文件但没有resourceId，上传文件
			if (group.imageFile && !group.imageResourceId) {
				const imgNode = options.store.state.nodesById[group.imageNodeId]
				if (imgNode) {
					const clonedFile = new File([group.imageFile], group.imageFile.name, { type: group.imageFile.type || 'image/png' })
					await options.onNodeUploadResource(group.imageNodeId, clonedFile, 'image', { autoDistribute: false })
				}
			}
		}

		// 再次同步确保resourceId持久化到引擎
		if (hasEngine && options.engineApi?.forceSyncToStore) {
			try {
				await options.engineApi.forceSyncToStore()
			} catch (err) {
				console.error('[SceneDecomposeAutoExpand] second forceSyncToStore failed:', err)
			}
		}

		// 等待一帧后再次校验截图节点是否有资源
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		for (const group of nodeGroups) {
			if (group.imageResourceId) {
				const imgNode = options.store.state.nodesById[group.imageNodeId]
				if (imgNode && !imgNode.resourceId) {
					// 最终兜底：再次设置
					options.store.commit('setNodeResource', { nodeId: group.imageNodeId, resourceId: group.imageResourceId })
					if (options.engineApi?.updateNodeData) {
						options.engineApi.updateNodeData(group.imageNodeId, { resourceId: group.imageResourceId })
					}
				}
			}
		}

		// 再次确认文本节点内容
		for (let i = 0; i < nodeGroups.length; i++) {
			const group = nodeGroups[i]
			const output = actionableOutputs[i]
			// 图像Prompt文本
			const imgPromptNode = options.store.state.nodesById[group.imagePromptNodeId]
			const imagePromptText = buildMeshyImagePrompt(output)
			if (imgPromptNode && imgPromptNode.type === 'text' && !(imgPromptNode as any).textValue) {
				options.store.commit('setNodeTextValue', { nodeId: group.imagePromptNodeId, textValue: imagePromptText })
				if (options.engineApi?.updateNodeData) {
					options.engineApi.updateNodeData(group.imagePromptNodeId, { textValue: imagePromptText })
				}
			}
			// 3D Prompt文本
			const modelPromptNode = options.store.state.nodesById[group.modelPromptNodeId]
			const modelPromptText = buildMeshy3dPrompt(output)
			if (modelPromptNode && modelPromptNode.type === 'text' && !(modelPromptNode as any).textValue) {
				options.store.commit('setNodeTextValue', { nodeId: group.modelPromptNodeId, textValue: modelPromptText })
				if (options.engineApi?.updateNodeData) {
					options.engineApi.updateNodeData(group.modelPromptNodeId, { textValue: modelPromptText })
				}
			}
			// 3D模型设置
			const model3dNode = options.store.state.nodesById[group.model3dNodeId]
			const meshySettings = {
				modelGenerationSource: 'meshy',
				meshyModelSettings: {
					taskFamily: 'image-to-3d',
					prompt: modelPromptText,
					aiModel: 'latest',
					modelType: 'lowpoly',
					topology: 'triangle',
					targetPolycount: 12000,
					shouldTexture: true,
					removeLighting: false
				}
			}
			if (model3dNode && model3dNode.type === 'model3d') {
				const hasSettings = !!(model3dNode as any).model3dSettings?.meshyModelSettings
				if (!hasSettings) {
					options.store.commit('setNodeModel3DSettings', {
						nodeId: group.model3dNodeId,
						model3dSettings: meshySettings
					})
					if (options.engineApi?.updateNodeData) {
						options.engineApi.updateNodeData(group.model3dNodeId, { model3dSettings: meshySettings })
					}
				}
			}
		}

		// 刷新所有节点的蓝图数据
		for (const nodeId of createdNodeIds) {
			if (options.patchBlueprintNodeData) {
				options.patchBlueprintNodeData(nodeId)
			}
		}

		// === 阶段6: 创建/连接到场景布局预览节点 ===
		// 计算最后一列（model3d，列索引4）的右边缘X坐标
		const lastColumnRightEdge = (() => {
			let x = baseX
			for (let i = 0; i < pipelineColumns.length; i += 1) {
				x += pipelineColumns[i]
				if (i < pipelineColumns.length - 1) {
					x += horizontalGap
				}
			}
			return x + horizontalGap / 2
		})()
		// 场景布局节点额外间距（比列间距更大，视觉上更分开）
		const sceneLayoutExtraGap = horizontalGap * 2
		const sceneLayoutTargetX = lastColumnRightEdge + sceneLayoutExtraGap + nodeFootprint.sceneLayout.width / 2
		const sceneLayoutTargetY =
			actionableOutputs.length > 1
				? baseY + ((actionableOutputs.length - 1) * rowGap) / 2 - nodeFootprint.sceneLayout.height / 2 + nodeFootprint.model3d.height / 2
				: baseY

		const ensureSceneLayoutPreviewNode = async () => {
			const targetX = sceneLayoutTargetX
			const targetY = sceneLayoutTargetY

			let sceneLayoutNodeId = ''
			if (jsonSourceNodeId) {
				for (const candidateId of options.store.state.nodeOrder) {
					const candidate = options.store.state.nodesById[candidateId]
					if (!candidate || candidate.type !== 'scene-layout') continue
					const edge = options.getIncomingEdges(candidateId, 'in-json')[0]
					if (!edge) continue
					const sameSource =
						String(edge.fromNodeId ?? '').trim() === jsonSourceNodeId &&
						String(edge.fromAnchorId ?? '').trim() === jsonSourceAnchorId
					if (sameSource) {
						sceneLayoutNodeId = candidateId
						break
					}
				}
			}

			let created = false
			if (!sceneLayoutNodeId) {
				// 直接在引擎中创建场景布局节点
				const sceneLayoutNodeData = {
					title: t('aiworkflow.runtime.sceneLayoutPreviewTitle'),
					alias: t('aiworkflow.runtime.sceneLayoutPreviewTitle'),
					sceneLayoutSettings: { previewMode: true },
					createdAt: now
				}
				if (hasEngine && options.engineApi?.addNode) {
					sceneLayoutNodeId = options.engineApi.addNode('scene-layout', targetX, targetY, sceneLayoutNodeData) ?? ''
				}
				if (!sceneLayoutNodeId) {
					// Fallback: 在store中创建
					options.store.commit('addNodeAt', {
						worldX: targetX,
						worldY: targetY,
						title: t('aiworkflow.runtime.sceneLayoutPreviewTitle')
					})
					sceneLayoutNodeId = String(options.store.state.selectedNodeId ?? '').trim()
					if (sceneLayoutNodeId) {
						options.store.commit('setNodeType', { nodeId: sceneLayoutNodeId, type: 'scene-layout' })
						options.store.commit('setNodeAlias', {
							nodeId: sceneLayoutNodeId,
							alias: t('aiworkflow.runtime.sceneLayoutPreviewTitle')
						})
					}
				}
				if (sceneLayoutNodeId) {
					createdNodeIds.push(sceneLayoutNodeId)
					options.onAutoWireNodeCreated?.(sceneLayoutNodeId)
					created = true
				}
			} else {
				if (options.engineApi?.moveNode) {
					options.engineApi.moveNode(sceneLayoutNodeId, targetX, targetY)
				} else {
					options.store.commit('setNodePosition', {
						nodeId: sceneLayoutNodeId,
						worldX: targetX,
						worldY: targetY
					})
				}
			}

			if (!sceneLayoutNodeId) return ''

			// 确保场景布局节点设置正确
			// 先预设inputJson到cache，确保onNodeRunSceneLayout的cachedJson fallback有效
			const slNode = options.store.state.nodesById[sceneLayoutNodeId]
			if (slNode) {
				options.store.commit('setNodeSceneLayoutSettings', {
					nodeId: sceneLayoutNodeId,
					sceneLayoutSettings: {
						previewMode: true,
						inputJson
					}
				})
			}
			if (options.engineApi?.updateNodeData) {
				options.engineApi.updateNodeData(sceneLayoutNodeId, {
					sceneLayoutSettings: {
						previewMode: true,
						inputJson
					}
				})
			}

			// 连接JSON输入
			if (jsonSourceNodeId) {
				connectPorts(jsonSourceNodeId, jsonSourceAnchorId, sceneLayoutNodeId, 'in-json')
			}

			if (inputJson && actionableOutputs.length > 0) {
				// 同步确保连线和预设inputJson已存在
				if (hasEngine && options.engineApi?.forceSyncToStore) {
					try {
						await options.engineApi.forceSyncToStore()
					} catch (err) {
						console.error('[SceneDecomposeAutoExpand] forceSyncToStore before scene layout failed:', err)
					}
				}
				await new Promise((resolve) => setTimeout(resolve, 100))
				// ✅ 调用onNodeRunSceneLayout获取真实3D布局
				// 该函数会：
				//   1. 优先从in-json连线读取JSON（linkedJson）
				//   2. 回退到sceneLayoutSettings.inputJson缓存（cachedJson，即上面预设的值）
				//   3. 如果所有对象已有合法3D position/size字段 → Direct路径，直接使用
				//   4. 如果缺少3D字段 → API路径，调用后端AI生成真实3D布局（位置/尺寸/旋转）
				console.info('[SCENE-LAYOUT-PREVIEW] calling onNodeRunSceneLayout to get real 3D layout...')
				await options.onNodeRunSceneLayout(sceneLayoutNodeId)
				console.info('[SCENE-LAYOUT-PREVIEW] onNodeRunSceneLayout completed')
				// 同步store到引擎，确保动态生成的in-model锚点在画布上可见
				if (hasEngine && options.engineApi?.forceSyncToStore) {
					try {
						await options.engineApi.forceSyncToStore()
					} catch (err) {
						console.error('[SceneDecomposeAutoExpand] forceSyncToStore after scene layout failed:', err)
					}
				}
				// 把完整的节点数据（包含新inputs数组）同步回引擎，确保画布显示动态锚点
				await syncSceneLayoutNodeToEngine(sceneLayoutNodeId)
			} else if (created) {
				options.store.commit('setNodeSceneLayoutSettings', {
					nodeId: sceneLayoutNodeId,
					sceneLayoutSettings: { message: t('aiworkflow.runtime.waitingForSceneJson') }
				})
			}

			return sceneLayoutNodeId
		}

		const replaceIncomingSceneLayoutModelEdge = (
			sceneLayoutNodeId: string,
			inputAnchorId: string,
			nextModel3dNodeId: string
		) => {
			const incomingEdges = options.getIncomingEdges(sceneLayoutNodeId, inputAnchorId)
			for (const edge of incomingEdges) {
				const fromNodeId = String(edge?.fromNodeId ?? '').trim()
				if (!fromNodeId || fromNodeId === nextModel3dNodeId) continue
				const fromNode = options.store.state.nodesById[fromNodeId]
				if (!fromNode || fromNode.type !== 'model3d') continue
				const edgeId = String(edge?.id ?? '').trim()
				if (!edgeId) continue
				if (options.engineApi?.removeEdge) {
					options.engineApi.removeEdge(edgeId)
				} else {
					options.store.commit('removeEdge', { edgeId })
				}
			}
		}

		const autoConnectGroupsToSceneLayout = (
			sceneLayoutNodeId: string,
			groups: Array<{ objectId: string; model3dNodeId: string }>
		) => {
			if (!sceneLayoutNodeId) return { connected: 0, missing: [] as string[] }
			const sceneLayoutNode = options.store.state.nodesById[sceneLayoutNodeId]
			if (!sceneLayoutNode || sceneLayoutNode.type !== 'scene-layout') {
				return { connected: 0, missing: groups.map((g) => g.objectId) }
			}

			const existingAnchorIds = new Set(
				(Array.isArray(sceneLayoutNode.inputs) ? sceneLayoutNode.inputs : [])
					.map((a: WorkflowAnchorSpec) => String(a?.id ?? ''))
					.filter(Boolean)
			)

			let connectedCount = 0
			const missing: string[] = []
			for (const group of groups) {
				const objectId = String(group.objectId ?? '').trim()
				const model3dNodeId = String(group.model3dNodeId ?? '').trim()
				if (!objectId || !model3dNodeId) continue
				const inputAnchorId = options.sceneLayoutModelInputAnchorId(objectId)
				if (!existingAnchorIds.has(inputAnchorId)) {
					missing.push(inputAnchorId)
					continue
				}

				replaceIncomingSceneLayoutModelEdge(sceneLayoutNodeId, inputAnchorId, model3dNodeId)
				connectPorts(model3dNodeId, 'out-model', sceneLayoutNodeId, inputAnchorId)
				connectedCount += 1
			}
			return { connected: connectedCount, missing }
		}

		const sceneLayoutNodeId = await ensureSceneLayoutPreviewNode()

		// onNodeRunSceneLayout已在ensureSceneLayoutPreviewNode中await完成，此时layoutItems应该已被设置
		// syncSceneLayoutNodeToEngine已在ensureSceneLayoutPreviewNode内调用（将store最新inputs推送到引擎）
		// 这里再等待并执行一次引擎→store同步，确保两边一致
		await syncSceneLayoutNodeToEngine(sceneLayoutNodeId)

		// 等待Vue响应式更新和锚点同步完成，使用重试机制连接模型
		let sceneLayoutConnections = 0
		let lastMissing: string[] = []
		const maxRetries = 8
		for (let retry = 0; retry < maxRetries; retry += 1) {
			const delay = retry === 0 ? 200 : 250 + retry * 50
			await new Promise((resolve) => setTimeout(resolve, delay))
			// 每次重试前先把store最新节点数据（含动态锚点）推送到引擎，再从引擎同步到store，确保引擎端锚点可见
			await syncSceneLayoutNodeToEngine(sceneLayoutNodeId)
			const result = autoConnectGroupsToSceneLayout(
				sceneLayoutNodeId,
				createdModelTargets
			)
			sceneLayoutConnections = result.connected
			lastMissing = result.missing
			// eslint-disable-next-line no-console
			console.info('[SCENE-LAYOUT-PREVIEW] model connect retry', {
				retry,
				connected: result.connected,
				total: createdModelTargets.length,
				missing: result.missing
			})
			// 检查是否所有目标都已连接
			if (result.connected >= createdModelTargets.length) break
		}
		if (lastMissing.length > 0) {
			console.warn('[SCENE-LAYOUT-PREVIEW] some model anchors still missing after retries:', lastMissing)
		}

		// 最终同步一次确保所有连线持久化
		if (hasEngine && options.engineApi?.forceSyncToStore) {
			try {
				await options.engineApi.forceSyncToStore()
			} catch (err) {
				console.error('[SceneDecomposeAutoExpand] final forceSyncToStore failed:', err)
			}
		}

		// [SCENE-LAYOUT-PREVIEW] 选中新建的场景布局预览节点，让其成为active节点
		if (sceneLayoutNodeId) {
			try {
				options.store.commit('setSelectedNode', { nodeId: sceneLayoutNodeId })
			} catch (err) {
				console.warn('[SCENE-LAYOUT-PREVIEW] failed to select scene layout node:', err)
			}
		}

		// eslint-disable-next-line no-console
		console.info('[SCENE-LAYOUT-PREVIEW] autoExpand complete:', {
			sceneLayoutNodeId,
			totalModelTargets: createdModelTargets.length,
			connectedModels: sceneLayoutConnections
		})

		return {
			createdNodeIds,
			sceneLayoutConnections
		}
	}

	return {
		autoExpandSceneDecomposeOutputs
	}
}
