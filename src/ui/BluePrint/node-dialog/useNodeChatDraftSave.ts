import { ref, onBeforeUnmount } from 'vue'
import { useNodeChatApi } from './useNodeChatApi'
import { areSelectedRefsEqual, areParamsEqual } from './chatStateUtils'

/**
 * 草稿脏标记 + flush 保存统一封装
 * - 输入/改参/加引用时只打脏标记，不同步到 store/引擎
 * - 保存时机：Ctrl+S / blur / 关闭对话框 / 切换节点 / 页面卸载 / 显式调用
 * - flushSave 做幂等：深比较无变化则跳过，避免虚假重渲染
 */

export interface NodeChatDraftSaveState {
	draftDirty: boolean
	paramsDirty: boolean
	refsDirty: boolean
	lastSavedDraft: string
	lastSavedParams: Record<string, any>
	lastSavedRefs: any[]
}

export function useNodeChatDraftSave(props: { nodeId: string | null }) {
	const chatApi = useNodeChatApi()

	const draftDirty = ref(false)
	const paramsDirty = ref(false)
	const refsDirty = ref(false)

	// 最近一次 flush 成功保存到引擎的值，用于幂等比较
	const lastSavedDraft = ref('')
	const lastSavedParams = ref<Record<string, any>>({})
	const lastSavedRefs = ref<any[]>([])

	// 最近一次用户输入/修改的值（local 状态的当前快照），用于 flush 时取最新
	const pendingDraft = ref('')
	const pendingParams = ref<Record<string, any>>({})
	const pendingRefs = ref<any[]>([])

	/**
	 * 用户刚打了字 —— 打脏标记，写 pending，不触发引擎/store 同步
	 */
	const markDraftDirty = (value: string) => {
		pendingDraft.value = value
		if (value !== lastSavedDraft.value) {
			draftDirty.value = true
		}
	}

	/**
	 * 参数面板改了 —— 打脏标记，写 pending
	 */
	const markParamsDirty = (params: Record<string, any>) => {
		pendingParams.value = params ? { ...params } : {}
		if (!areParamsEqual(pendingParams.value, lastSavedParams.value)) {
			paramsDirty.value = true
		}
	}

	/**
	 * @引用 增删 —— 打脏标记，写 pending
	 */
	const markRefsDirty = (refs: any[]) => {
		pendingRefs.value = refs ? [...refs] : []
		if (!areSelectedRefsEqual(pendingRefs.value, lastSavedRefs.value)) {
			refsDirty.value = true
		}
	}

	/**
	 * 用 props/引擎初始化本地基准值 —— 打开对话框时调用，避免首次 flush 误判有脏
	 */
	const resetSaveBaseline = (opts: { draft: string; params: Record<string, any>; refs: any[] }) => {
		lastSavedDraft.value = opts.draft ?? ''
		lastSavedParams.value = opts.params ? { ...opts.params } : {}
		lastSavedRefs.value = opts.refs ? [...opts.refs] : []
		pendingDraft.value = lastSavedDraft.value
		pendingParams.value = { ...lastSavedParams.value }
		pendingRefs.value = [...lastSavedRefs.value]
		draftDirty.value = false
		paramsDirty.value = false
		refsDirty.value = false
	}

	/**
	 * 检查是否有任何未保存的修改
	 */
	const hasAnyDirty = () => draftDirty.value || paramsDirty.value || refsDirty.value

	/**
	 * 执行一次 flush 保存：
	 * 1. 深比较 pending vs lastSaved，跳过没变的字段
	 * 2. 调用 chatApi.flush（只存一次）+ 记录 lastSaved
	 * 3. 清理脏标记
	 * 返回：是否真的发生了保存（用于上层判断是否需要额外操作）
	 */
	const flushSave = (): {
		saved: boolean
		savedDraft: boolean
		savedParams: boolean
		savedRefs: boolean
	} => {
		const nid = props.nodeId
		if (!nid) {
			return { saved: false, savedDraft: false, savedParams: false, savedRefs: false }
		}

		const needsSaveDraft = draftDirty.value && pendingDraft.value !== lastSavedDraft.value
		const needsSaveParams =
			paramsDirty.value && !areParamsEqual(pendingParams.value, lastSavedParams.value)
		const needsSaveRefs =
			refsDirty.value && !areSelectedRefsEqual(pendingRefs.value, lastSavedRefs.value)

		const savedAnything = needsSaveDraft || needsSaveParams || needsSaveRefs

		if (!savedAnything) {
			// 无变化：把脏标记清掉，避免下次仍判脏
			draftDirty.value = false
			paramsDirty.value = false
			refsDirty.value = false
			return { saved: false, savedDraft: false, savedParams: false, savedRefs: false }
		}

		// 构建 flush payload —— 只传有变化的字段，减少不必要的引擎 diff
		const payload: {
			draft?: string
			params?: Record<string, any>
			selectedRefs?: any[]
		} = {}

		if (needsSaveDraft) payload.draft = pendingDraft.value
		if (needsSaveParams) payload.params = { ...pendingParams.value }
		if (needsSaveRefs) payload.selectedRefs = [...pendingRefs.value]

		chatApi.flush(nid, payload)

		// 更新 lastSaved 快照
		if (needsSaveDraft) lastSavedDraft.value = pendingDraft.value
		if (needsSaveParams) lastSavedParams.value = { ...pendingParams.value }
		if (needsSaveRefs) lastSavedRefs.value = [...pendingRefs.value]

		// 清理脏标记
		draftDirty.value = false
		paramsDirty.value = false
		refsDirty.value = false

		return {
			saved: true,
			savedDraft: needsSaveDraft,
			savedParams: needsSaveParams,
			savedRefs: needsSaveRefs
		}
	}

	/**
	 * 组件卸载兜底 —— 组件销毁前保存一次
	 */
	onBeforeUnmount(() => {
		if (hasAnyDirty()) {
			try {
				flushSave()
			} catch (e) {
				// 忽略卸载时的异常
			}
		}
	})

	return {
		// 脏状态（可用于 UI 显示"未保存"指示，当前未用但保留）
		draftDirty,
		paramsDirty,
		refsDirty,
		// 打脏 API —— 输入框/参数面板/引用变更时调用
		markDraftDirty,
		markParamsDirty,
		markRefsDirty,
		// 初始化基准值 —— 对话框打开初始化完成时调用
		resetSaveBaseline,
		// 检查是否脏
		hasAnyDirty,
		// 执行保存 —— Ctrl+S / blur / 关闭 / 切换节点 / 提交前调用
		flushSave
	}
}
