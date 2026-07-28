import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { useNodeChatApi } from './useNodeChatApi'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'
import type { InputParamPreviewRef } from './index'

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
	const localDraft = ref(props.draft ?? '')
	const localParams = ref<Record<string, any>>({ ...(props.params ?? {}) })
	const localSelectedRefs = ref<any[]>(props.selectedReferences ? [...props.selectedReferences] : [])
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
		const inputEdgeKeys = new Set(inputRefs.map((r: any) => `${r.fromNodeId}:${r.fromAnchorId}`))
		return refs.filter((r: any) => {
			if (!r) return false
			const rKind = r.kind || r.type
			if (rKind !== allowedType) return false
			if (r.fromNodeId && r.fromAnchorId && inputEdgeKeys.has(`${r.fromNodeId}:${r.fromAnchorId}`)) return false
			return true
		}).map((r: any) => ({
			edgeId: r.edgeId,
			fromNodeId: r.fromNodeId,
			fromAnchorId: r.fromAnchorId,
			kind: r.kind || r.type || allowedType,
			name: r.name || r.label || '',
			label: r.label || r.name || '',
			previewUrl: r.previewUrl,
		}))
	})

	const showInputParamRefs = computed(() => {
		return !!props.nodeType && ['image', 'video', 'model3d', 'blender'].includes(props.nodeType)
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
			localParams.value = { ...(props.params || {}) }
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
			localParams.value = { ...(state.params || {}) }
		} else {
			localParams.value = { ...(props.params || {}) }
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

	watch(() => props.visible, (newVal, oldVal) => {
		if (newVal && (oldVal === false || oldVal === undefined)) {
			initializeForVisible()
		} else if (!newVal && oldVal) {
			initGuardToken++
			isReady = false
			isInternalUpdate = false
		}
	})

	watch(() => props.nodeType, () => {
		showParams.value = false
	})

	watch(() => props.draft, (newVal) => {
		if (isInternalUpdate) return
		if (newVal !== undefined) {
			localDraft.value = newVal
		}
	}, { immediate: true })

	watch(() => props.params, (newVal) => {
		if (isInternalUpdate) return
		if (newVal !== undefined) {
			localParams.value = { ...(newVal || {}) }
		}
	}, { deep: true, immediate: true })

	watch(() => props.selectedReferences, (newVal) => {
		if (isInternalUpdate) return
		if (newVal !== undefined) {
			localSelectedRefs.value = newVal ? [...newVal] : []
		}
	}, { deep: true, immediate: true })

	const onDraftInput = (value: string) => {
		if (isInternalUpdate) return
		if (!isReady) {
			return
		}
		localDraft.value = value
		const nid = props.nodeId
		if (nid) {
			isInternalUpdate = true
			chatApi.saveDraft(nid, value)
			nextTick(() => {
				isInternalUpdate = false
			})
		}
	}

	const onParamsChange = (params: Record<string, any>) => {
		if (isInternalUpdate) return
		if (!isReady) {
			localParams.value = { ...params }
			return
		}
		localParams.value = { ...params }
		const nid = props.nodeId
		if (nid) {
			isInternalUpdate = true
			chatApi.saveParams(nid, params)
			nextTick(() => {
				isInternalUpdate = false
			})
		}
	}

	const onSelectedRefsChange = (refs: any[]) => {
		const refsForNode: any[] = refs.map((r: any) => ({
			id: r.id,
			kind: r.kind || r.type || 'image',
			type: r.kind || r.type || 'image',
			fromNodeId: r.fromNodeId,
			fromAnchorId: r.fromAnchorId,
			fromContent: r.fromContent,
			label: r.name || r.label || '',
			name: r.name || r.label || '',
		}))
		if (!isReady) {
			localSelectedRefs.value = refsForNode
			return
		}
		localSelectedRefs.value = refsForNode
		const nid = props.nodeId
		if (nid) {
			isInternalUpdate = true
			chatApi.saveSelectedRefs(nid, refsForNode)
			nextTick(() => {
				isInternalUpdate = false
			})
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
			inputParamRefs: props.inputParamPreviewRefs || [],
		}
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
		toggleParams,
	}
}
