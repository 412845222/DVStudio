import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { useNodeChatApi } from './useNodeChatApi'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'
import type { InputParamPreviewRef } from './index'
import { getDefaultParamsForType } from './nodeChatConfig'
import { useNodeChatDraftSave } from './useNodeChatDraftSave'
import {
	areSelectedRefsEqual,
	areParamsEqual,
	simplifySelectedRefsForSubmit,
	matchSelectedRefsWithSerializedDraft,
	normalizeRefsForStorage
} from './chatStateUtils'

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

	// ========== 接入脏标记 + flushSave ==========
	const {
		markDraftDirty,
		markParamsDirty,
		markRefsDirty,
		resetSaveBaseline,
		hasAnyDirty,
		flushSave
	} = useNodeChatDraftSave({ nodeId: computed(() => props.nodeId).value as string | null })

	const currentParams = computed(() => {
		return localParams.value || {}
	})

	const selectedRefsForInput = computed<any[]>(() => {
		const refs = localSelectedRefs.value || []
		const inputRefs = props.inputParamPreviewRefs || []
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
		// 关键修复：不再基于 nodeType 做 kind 过滤；否则 text node 引用 image/video 会被 filter 掉，
		// 传入 NodeChatInput 的 props.selectedReferences 变空，导致 CHIP_MARKER 找不到对应 ref → 全部 fallback "引用丢失"。
		return refs.map((r: any) => {
			if (!r) return r
			let matchedInputRef: any = null
			if (r.edgeId && inputRefsByEdgeId.has(r.edgeId)) {
				matchedInputRef = inputRefsByEdgeId.get(r.edgeId)
			} else if (r.fromNodeId && r.fromAnchorId) {
				const key = `${r.fromNodeId}:${r.fromAnchorId}`
				if (inputRefsBySource.has(key)) matchedInputRef = inputRefsBySource.get(key)
			}
			const rAny = r as unknown as { refKey?: string }
			const resolvedPreviewUrl = r.previewUrl || matchedInputRef?.previewUrl || undefined
			const resolvedLabel =
				r.label || r.name || matchedInputRef?.label || matchedInputRef?.name || ''
			const core: any = {
				edgeId: r.edgeId || matchedInputRef?.edgeId,
				fromNodeId: r.fromNodeId,
				fromAnchorId: r.fromAnchorId,
				kind: r.kind || r.type || matchedInputRef?.kind || matchedInputRef?.type || 'text',
				name: r.name || resolvedLabel,
				label: resolvedLabel,
				previewUrl: resolvedPreviewUrl
			}
			if (rAny?.refKey) core.refKey = rAny.refKey
			return core
		})
	})

	const showInputParamRefs = computed(() => {
		return (
			!!props.nodeType && ['text', 'image', 'video', 'model3d', 'blender'].includes(props.nodeType)
		)
	})

	const isTripo3D = computed(() => {
		return props.nodeType === 'blender'
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
			// 关键修复：把 props 里可能“被 sort/去冗余字段”的 selectedReferences，
			// 对齐到当前 localDraft（含 CHIP_MARKER）的 chip 顺序，确保二次渲染不会错位/消失。
			const aligned = matchSelectedRefsWithSerializedDraft(
				localDraft.value,
				props.selectedReferences
			)
			localSelectedRefs.value = aligned ? [...(aligned as any[])] : []
		}
	}

	const syncFromEngine = (nodeId: string) => {
		const state = chatApi.getState(nodeId)
		const draftSrc = props.draft === undefined || props.draft === '' ? state.draft : props.draft
		const refsSrc = !props.selectedReferences || props.selectedReferences.length === 0
			? state.selectedRefs
			: props.selectedReferences
		// 对齐：保证读取到的 refs 顺序与 draft 中 CHIP_MARKER 一致（二次打开/回读场景）
		const alignedRefs = matchSelectedRefsWithSerializedDraft(draftSrc, refsSrc)
		localDraft.value = draftSrc
		if (!props.params || Object.keys(props.params).length === 0) {
			localParams.value = mergeWithDefaultParams(props.nodeType, state.params)
		} else {
			localParams.value = mergeWithDefaultParams(props.nodeType, props.params)
		}
		localSelectedRefs.value = alignedRefs ? [...(alignedRefs as any[])] : []
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
					// 注意：这里不再调用 syncFromProps 覆盖 syncFromEngine 的结果；
					// syncFromEngine 已经把 props.selectedReferences 与 engine.selectedRefs
					// 与 draft 的 CHIP_MARKER 顺序对齐，避免再次被 props.selectedReferences（可能被排序）
					// 覆盖导致二次渲染 chip 消失。
					resetSaveBaseline({
						draft: localDraft.value,
						params: { ...localParams.value },
						refs: normalizeRefsForStorage(localSelectedRefs.value) as any[]
					})
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

	// ========== 注意：props 的 watch 改为浅比较，无变化不触发 ==========
	// draft 纯字符串，直接 === 比较，不需要 deep
	watch(
		() => props.draft,
		(newVal, oldVal) => {
			if (newVal === undefined) return
			if (newVal === oldVal) return
			if (newVal === localDraft.value) return
			if (isInternalUpdate) return
			localDraft.value = newVal
		}
	)

	// params：深比较，内容一致不更新 localParams，避免反复触发 watcher
	watch(
		() => props.params,
		(newVal, oldVal) => {
			if (newVal === undefined) return
			if (isInternalUpdate) return
			if (oldVal !== undefined && areParamsEqual(newVal, oldVal)) return
			const merged = mergeWithDefaultParams(props.nodeType, newVal)
			if (areParamsEqual(merged, localParams.value)) return
			localParams.value = merged
		}
	)

	// selectedReferences：深比较，内容一致不更新 localSelectedRefs
	watch(
		() => props.selectedReferences,
		(newVal, oldVal) => {
			if (newVal === undefined) return
			if (isInternalUpdate) return
			if (oldVal !== undefined && areSelectedRefsEqual(newVal, oldVal)) return
			const newArr = newVal ? [...newVal] : []
			// 关键修复：对齐到当前 localDraft（CHIP_MARKER 顺序），避免 watcher 把正确的 refs 覆盖成排序后的
			const aligned = matchSelectedRefsWithSerializedDraft(localDraft.value, newArr)
			if (areSelectedRefsEqual(aligned, localSelectedRefs.value)) return
			localSelectedRefs.value = aligned ? [...(aligned as any[])] : []
		}
	)

	// ========== 输入：打脏标记，不再实时同步到 store/引擎 ==========
	const onDraftInput = (value: string) => {
		// 总是更新 localDraft —— 保持 UI 响应
		localDraft.value = value
		if (!isReady) {
			return
		}
		markDraftDirty(value)
	}

	// ========== 参数变化：打脏标记 ==========
	const onParamsChange = (params: Record<string, any>) => {
		// 总是更新 localParams
		localParams.value = { ...params }
		if (!isReady) {
			return
		}
		markParamsDirty(params)
	}

	// ========== @引用变化：打脏标记 ==========
	const onSelectedRefsChange = (refs: any[]) => {
		const refsForNode: any[] = refs.map((r: any) => {
			// 保留来自 NodeChatInput.syncFromDOM 的 refKey（edgeId 或 fromNodeId:fromAnchorId），
			// 供存储 / 回读时对齐 CHIP_MARKER 顺序，避免二次打开 chip 消失
			const rAny = r as unknown as { refKey?: string }
			const core = {
				kind: r.kind || r.type || 'image',
				type: r.kind || r.type || 'image',
				fromNodeId: r.fromNodeId,
				fromAnchorId: r.fromAnchorId,
				edgeId: r.edgeId,
				fromContent: r.fromContent,
				label: r.name || r.label || '',
				name: r.name || r.label || '',
				previewUrl: r.previewUrl,
				// id 仅内部使用，不参与存储比对
				id: r.id
			}
			if (rAny?.refKey) {
				;(core as unknown as { refKey: string }).refKey = rAny.refKey
			}
			return core
		})

		// 总是更新 localSelectedRefs —— 子组件从 DOM 读的真实 chip 状态
		localSelectedRefs.value = refsForNode

		if (!isReady) {
			return
		}
		markRefsDirty(refsForNode)
	}

	const handleSubmit = () => {
		if (submitDisabled.value) return
		const nid = props.nodeId
		const nType = props.nodeType
		if (!nid || !nType) return

		// ========== 提交前先 flush 保存一次，确保引擎有最新草稿 ==========
		flushSave()

		// ========== 提交文本简化：把 chip 位置替换为「（参考图N）/（参考视频N）/（参考模型N）」==========
		// 并精简 selectedReferences，仅保留锚点定位所需最小字段，不携带冗余的节点详情、fromContent、id、type 等。
		const simplified = simplifySelectedRefsForSubmit(localDraft.value, localSelectedRefs.value)

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
			prompt: simplified.prompt.trim(),
			params: { ...currentParams.value },
			paramKey: paramKeyMap[nType] || 'aiText',
			selectedReferences: simplified.selectedReferences,
			inputParamRefs: props.inputParamPreviewRefs || []
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
		// ========== 关闭前先 flushSave ==========
		flushSave()
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
		// 新增：暴露给 Dialog 层用于 blur / Ctrl+S / 页面事件等时机调用
		flushSave,
		hasAnyDirty
	}
}
