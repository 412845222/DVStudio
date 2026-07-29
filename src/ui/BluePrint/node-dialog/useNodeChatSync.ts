import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { useNodeChatApi } from './useNodeChatApi'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'
import type { InputParamPreviewRef } from './index'
import { getDefaultParamsForType } from './nodeChatConfig'

interface NodeChatDialogProps {
	visible: boolean
	nodeId: string | null
	nodeType: WorkflowNodeChatType | null
	draft?: string
	submitting: boolean
	params?: Record<string, any>
	selectedReferences?: any[]
	nodeWidth?: number
	inputParamPreviewRefs?: InputParamPreviewRef[]
}

export function useNodeChatSync(props: NodeChatDialogProps) {
	const chatApi = useNodeChatApi()

	const inputRef = ref<{ focus: () => void } | null>(null)

	const mergeWithDefaultParams = (
		nodeType: WorkflowNodeChatType | null,
		params: Record<string, any> | undefined
	): Record<string, any> => {
		if (!nodeType) return { ...(params ?? {}) }
		const defaultParams = getDefaultParamsForType(nodeType)
		return { ...defaultParams, ...(params ?? {}) }
	}

	const localDraft = ref(props.draft ?? '')
	const localParams = ref<Record<string, any>>(mergeWithDefaultParams(props.nodeType, props.params))
	const localSelectedRefs = ref<any[]>(
		props.selectedReferences ? [...props.selectedReferences] : []
	)
	const showParams = ref(false)
	let isInternalUpdate = false
	let isReady = false
	let initGuardToken = 0

	const currentParams = computed(() => {
		return localParams.value || {}
	})

	const selectedRefsForInput = computed<any[]>(() => {
		const map: any = { image: 'image', video: 'video', model3d: 'model3d', blender: 'model3d' }
		const type = props.nodeType
		const allowedType = type && map[type as keyof typeof map]
		if (!allowedType) return []
		const refs = localSelectedRefs.value || []
		const inputRefs = props.inputParamPreviewRefs || []
		// 构建inputParamPreviewRefs的索引，用于补全@引用的previewUrl
		// 优先级：edgeId精确匹配 > fromNodeId:fromAnchorId匹配
		const inputRefsByEdgeId = new Map<string, any>()
		const inputRefsBySource = new Map<string, any>()
		for (const ir of inputRefs) {
			if (ir.edgeId) {
				inputRefsByEdgeId.set(ir.edgeId, ir)
			}
			if (ir.fromNodeId && ir.fromAnchorId) {
				inputRefsBySource.set(`${ir.fromNodeId}:${ir.fromAnchorId}`, ir)
			}
		}
		// @引用chips和输入边预览是两个独立的展示区域，不需要互斥过滤
		// 输入边显示在对话框顶部的inputParamPreviewRefs区域
		// @引用显示在输入框内作为chips
		return refs
			.filter((r: any) => {
				if (!r) return false
				const rKind = r.kind || r.type
				return rKind === allowedType
			})
			.map((r: any) => {
				// 尝试从当前连接的边引用中补全previewUrl和label
				// 解决：1) 保存时previewUrl(blob:)失效；2) 边断开重连后预览更新；3) 首次保存时字段丢失
				let matchedInputRef: any = null
				if (r.edgeId && inputRefsByEdgeId.has(r.edgeId)) {
					matchedInputRef = inputRefsByEdgeId.get(r.edgeId)
				} else if (r.fromNodeId && r.fromAnchorId) {
					matchedInputRef = inputRefsBySource.get(`${r.fromNodeId}:${r.fromAnchorId}`)
				}
				const resolvedPreviewUrl = r.previewUrl || matchedInputRef?.previewUrl || undefined
				const resolvedLabel =
					r.label || r.name || matchedInputRef?.label || matchedInputRef?.name || ''
				return {
					edgeId: r.edgeId || matchedInputRef?.edgeId,
					fromNodeId: r.fromNodeId,
					fromAnchorId: r.fromAnchorId,
					kind: r.kind || r.type || allowedType,
					name: r.name || resolvedLabel,
					label: resolvedLabel,
					previewUrl: resolvedPreviewUrl
				}
			})
	})

	const showInputParamRefs = computed(() => {
		return (
			!!props.nodeType && ['text', 'image', 'video', 'model3d', 'blender'].includes(props.nodeType)
		)
	})

	const isTripo3D = computed(() => {
		return props.nodeType === 'model3d' || props.nodeType === 'blender'
	})

	const submitDisabled = computed(() => {
		const draft = localDraft.value.trim()
		const hasInputParamRefs = (props.inputParamPreviewRefs?.length ?? 0) > 0
		const hasSelectedRefs = selectedRefsForInput.value.length > 0
		const hasTextInput = draft.length > 0
		return props.submitting || (!hasTextInput && !hasInputParamRefs && !hasSelectedRefs)
	})

	const syncFromProps = () => {
		if (props.draft !== undefined) {
			localDraft.value = props.draft
		}
		if (props.params !== undefined) {
			localParams.value = mergeWithDefaultParams(props.nodeType, props.params)
		}
		if (props.selectedReferences !== undefined) {
			localSelectedRefs.value = props.selectedReferences ? [...props.selectedReferences] : []
		}
	}

	const syncFromEngine = (nodeId: string) => {
		const state = chatApi.getState(nodeId)
		if (props.draft === undefined || props.draft === '') {
			localDraft.value = state.draft
		} else {
			localDraft.value = props.draft
		}
		if (!props.params || Object.keys(props.params).length === 0) {
			localParams.value = mergeWithDefaultParams(props.nodeType, state.params)
		} else {
			localParams.value = mergeWithDefaultParams(props.nodeType, props.params)
		}
		if (!props.selectedReferences || props.selectedReferences.length === 0) {
			localSelectedRefs.value = state.selectedRefs ? [...state.selectedRefs] : []
		} else {
			localSelectedRefs.value = [...props.selectedReferences]
		}
	}

	const focusInput = () => {
		requestAnimationFrame(() => {
			nextTick(() => {
				inputRef.value?.focus()
			})
		})
	}

	const initializeForVisible = () => {
		const nid = props.nodeId
		if (!nid) return
		const myToken = ++initGuardToken
		isInternalUpdate = true
		isReady = false
		syncFromProps()
		syncFromEngine(nid)
		nextTick(() => {
			if (myToken !== initGuardToken) return
			requestAnimationFrame(() => {
				if (myToken !== initGuardToken) return
				nextTick(() => {
					if (myToken !== initGuardToken) return
					// Re-sync from props after all DOM updates to ensure we have the latest
					// state (props may have updated during the async initialization above).
					syncFromProps()
					isInternalUpdate = false
					isReady = true
					inputRef.value?.focus()
				})
			})
		})
	}

	onMounted(() => {
		if (props.visible && props.nodeId) {
			initializeForVisible()
		}
	})

	watch(
		() => props.visible,
		(newVal, oldVal) => {
			if (newVal && (oldVal === false || oldVal === undefined)) {
				initializeForVisible()
			} else if (!newVal && oldVal) {
				initGuardToken++
				isReady = false
				isInternalUpdate = false
			}
		}
	)

	watch(
		() => props.nodeType,
		() => {
			showParams.value = false
		}
	)

	watch(
		() => props.draft,
		(newVal) => {
			if (newVal !== undefined) {
				localDraft.value = newVal
			}
		},
		{ immediate: true }
	)

	watch(
		() => props.params,
		(newVal) => {
			if (newVal !== undefined) {
				localParams.value = mergeWithDefaultParams(props.nodeType, newVal)
			}
		},
		{ deep: true, immediate: true }
	)

	watch(
		() => props.selectedReferences,
		(newVal) => {
			if (newVal !== undefined) {
				localSelectedRefs.value = newVal ? [...newVal] : []
			}
		},
		{ deep: true, immediate: true }
	)

	const onDraftInput = (value: string) => {
		const wasInternalUpdate = isInternalUpdate
		// 总是更新localDraft
		localDraft.value = value
		if (!isReady) {
			return
		}
		const nid = props.nodeId
		if (nid) {
			if (!wasInternalUpdate) {
				isInternalUpdate = true
			}
			chatApi.saveDraft(nid, value)
			if (!wasInternalUpdate) {
				nextTick(() => {
					isInternalUpdate = false
				})
			}
		}
	}

	const onParamsChange = (params: Record<string, any>) => {
		const wasInternalUpdate = isInternalUpdate
		// 总是更新localParams
		localParams.value = { ...params }
		if (!isReady) {
			return
		}
		const nid = props.nodeId
		if (nid) {
			if (!wasInternalUpdate) {
				isInternalUpdate = true
			}
			chatApi.saveParams(nid, params)
			if (!wasInternalUpdate) {
				nextTick(() => {
					isInternalUpdate = false
				})
			}
		}
	}

	const onSelectedRefsChange = (refs: any[]) => {
		const refsForNode: any[] = refs.map((r: any) => ({
			id: r.id,
			kind: r.kind || r.type || 'image',
			type: r.kind || r.type || 'image',
			fromNodeId: r.fromNodeId,
			fromAnchorId: r.fromAnchorId,
			edgeId: r.edgeId,
			fromContent: r.fromContent,
			label: r.name || r.label || '',
			name: r.name || r.label || '',
			previewUrl: r.previewUrl
		}))

		// 总是更新localSelectedRefs，因为这是子组件从DOM中读取的真实chip状态
		// isInternalUpdate只是防止props变化触发的回环，不能阻止用户主动操作的状态更新
		const wasInternalUpdate = isInternalUpdate
		localSelectedRefs.value = refsForNode

		if (!isReady) {
			console.log('[NodeChatSync#onSelectedRefsChange] QUEUE before ready', {
				nodeId: props.nodeId,
				refsLen: refsForNode.length
			})
			return
		}

		const nid = props.nodeId
		if (nid) {
			// 只有当isInternalUpdate原本是false时，才设置它并在nextTick重置
			// 如果已经是true（比如onDraftInput先设置了），不重置，让外层负责重置
			if (!wasInternalUpdate) {
				isInternalUpdate = true
			}
			console.log('[NodeChatSync#onSelectedRefsChange] SAVE to store', {
				nodeId: nid,
				refsLen: refsForNode.length,
				wasInternalUpdate,
				firstRefHasPreviewUrl: !!(refsForNode.length > 0 && refsForNode[0].previewUrl),
				firstRefEdgeId: refsForNode.length > 0 ? refsForNode[0].edgeId : null
			})
			chatApi.saveSelectedRefs(nid, refsForNode)
			if (!wasInternalUpdate) {
				nextTick(() => {
					isInternalUpdate = false
				})
			}
		}
	}

	const handleSubmit = () => {
		if (submitDisabled.value) return
		const nid = props.nodeId
		const nType = props.nodeType
		if (!nid || !nType) return

		const paramKeyMap: Record<string, string> = {
			text: 'aiText',
			image: 'aiImage',
			video: 'aiVideo',
			model3d: 'aiModel3d',
			blender: 'aiBlender'
		}
		const payload: any = {
			nodeId: nid,
			nodeType: nType,
			prompt: localDraft.value.trim(),
			params: { ...currentParams.value },
			paramKey: paramKeyMap[nType] || 'aiText',
			selectedReferences: localSelectedRefs.value,
			inputParamRefs: props.inputParamPreviewRefs || []
		}
		console.log('[NodeChatSync#handleSubmit] SUBMIT PAYLOAD:', {
			nodeId: nid,
			nodeType: nType,
			promptLen: payload.prompt.length,
			paramsKeys: Object.keys(payload.params),
			paramsModel: payload.params.model,
			paramsProvider: payload.params.provider,
			paramsTextModelVersion: payload.params.textModelVersion,
			paramsGeminiTextModelVersion: payload.params.geminiTextModelVersion
		})
		chatApi.submit(nid, payload)
	}

	const handleStop = () => {
		const nid = props.nodeId
		if (nid) {
			chatApi.stop(nid)
		}
	}

	const handleClose = () => {
		if (props.submitting) return
		const nid = props.nodeId
		if (nid) {
			chatApi.close(nid)
		}
	}

	const handleRemoveParamRef = (item: InputParamPreviewRef) => {
		const nid = props.nodeId
		if (nid) {
			chatApi.removeParamRef(nid, item as any)
		}
	}

	const toggleParams = () => {
		showParams.value = !showParams.value
	}

	return {
		inputRef,
		localDraft,
		localParams,
		localSelectedRefs,
		showParams,
		currentParams,
		selectedRefsForInput,
		showInputParamRefs,
		isTripo3D,
		submitDisabled,
		onDraftInput,
		onParamsChange,
		onSelectedRefsChange,
		handleSubmit,
		handleStop,
		handleClose,
		handleRemoveParamRef,
		toggleParams
	}
}
