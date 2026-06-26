import type { Store } from 'vuex'
import type { WorkflowState } from '../aiworkflow/types'
import { AIWorkflowStore } from '../store/aiworkflow/store'
import { cloneJsonSafe } from '../core/shared/cloneJsonSafe'

// 给 AIWorkflow 建立独立的撤销/重做栈，承载 ctrl+z / ctrl+shift+z。
// 策略：订阅 Vuex 的每次 mutation；200ms 合并一次快照。触发撤销/重做
// 时调用 `replaceWorkflowState` 把快照写回，恢复到历史的某个中间态。

export type AIWorkflowHistoryOptions = {
	maxHistory?: number
	debounceMs?: number
}

const createCore = (options: AIWorkflowHistoryOptions = {}) => {
	const maxHistory =
		typeof options.maxHistory === 'number' && options.maxHistory > 0 ? options.maxHistory : 60
	const debounceMs =
		typeof options.debounceMs === 'number' && options.debounceMs >= 0 ? options.debounceMs : 200

	const past: unknown[] = []
	const future: unknown[] = []
	let isRestoring = false
	let captureTimer: number | null = null
	let lastCommitted: unknown = null

	const captureNow = (getSnapshot: () => unknown) => {
		if (isRestoring) return
		const snap = cloneJsonSafe(getSnapshot())
		// 与上次记录内容一致则忽略，避免无意义入栈。
		if (lastCommitted !== null && JSON.stringify(lastCommitted) === JSON.stringify(snap)) {
			return
		}
		past.push(snap)
		if (past.length > maxHistory) past.splice(0, past.length - maxHistory)
		future.length = 0
		lastCommitted = snap
	}

	const schedule = (getSnapshot: () => unknown) => {
		if (isRestoring) return
		if (captureTimer !== null) return
		const id = window.setTimeout(() => {
			captureTimer = null
			captureNow(getSnapshot)
		}, debounceMs)
		;(captureTimer as unknown as number | null) = id
	}

	const flush = (getSnapshot: () => unknown) => {
		if (captureTimer === null) return
		window.clearTimeout(captureTimer)
		captureTimer = null
		captureNow(getSnapshot)
	}

	const apply = (
		fromStack: unknown[],
		toStack: unknown[],
		getSnapshot: () => unknown,
		applySnapshot: (snap: unknown) => void
	) => {
		if (fromStack.length === 0) return false
		// 先把"当前"状态入栈（压到 toStack），再把 fromStack 的最后一个恢复出来。
		isRestoring = true
		try {
			const current = cloneJsonSafe(getSnapshot())
			toStack.push(current)
			const snap = fromStack.pop()!
			lastCommitted = snap
			applySnapshot(cloneJsonSafe(snap))
		} finally {
			// 恢复操作本身会触发 mutation，不能把它也当成"用户编辑"入栈。
			// 但 Vuex subscribe 是在 mutation 之后同步触发的；标记 isRestoring
			// 可以在 schedule 阶段直接忽略。
			isRestoring = false
		}
		return true
	}

	return {
		canUndo: () => past.length > 0,
		canRedo: () => future.length > 0,
		schedule,
		commitCaptureNow: (getSnapshot: () => unknown) => captureNow(getSnapshot),
		flush,
		undo: (getSnapshot: () => unknown, applySnapshot: (snap: unknown) => void) =>
			apply(past, future, getSnapshot, applySnapshot),
		redo: (getSnapshot: () => unknown, applySnapshot: (snap: unknown) => void) =>
			apply(future, past, getSnapshot, applySnapshot)
	}
}

type Core = ReturnType<typeof createCore>

const attach = (store: Store<WorkflowState>, options: AIWorkflowHistoryOptions = {}) => {
	const core = createCore(options)
	const getSnapshot = () => store.state
	const applySnapshot = (snap: unknown) => {
		store.commit('replaceWorkflowState', { snapshot: snap })
	}
	store.subscribe(() => core.schedule(getSnapshot))
	return {
		canUndo: () => core.canUndo(),
		canRedo: () => core.canRedo(),
		undo: () => {
			core.flush(getSnapshot)
			return core.undo(getSnapshot, applySnapshot)
		},
		redo: () => {
			core.flush(getSnapshot)
			return core.redo(getSnapshot, applySnapshot)
		},
		commitCaptureNow: () => core.commitCaptureNow(getSnapshot)
	}
}

// 单例：绑定到默认的 AIWorkflowStore，给页面级快捷键使用。
const shared: { api: ReturnType<typeof attach> | null } = { api: null }

export const ensureAIWorkflowHistory = (options: AIWorkflowHistoryOptions = {}) => {
	if (shared.api) return shared.api
	shared.api = attach(AIWorkflowStore, options)
	return shared.api
}

export const aiWorkflowHistory = {
	canUndo: () => {
		const api = ensureAIWorkflowHistory()
		return api.canUndo()
	},
	canRedo: () => {
		const api = ensureAIWorkflowHistory()
		return api.canRedo()
	},
	undo: () => {
		const api = ensureAIWorkflowHistory()
		return api.undo()
	},
	redo: () => {
		const api = ensureAIWorkflowHistory()
		return api.redo()
	},
	commitCaptureNow: () => {
		const api = ensureAIWorkflowHistory()
		return api.commitCaptureNow()
	}
}

// 兼容外部调用（传入任意 store 实例）。
export const createAIWorkflowHistoryForStore = (
	store: Store<WorkflowState>,
	options: AIWorkflowHistoryOptions = {}
) => attach(store, options)

// 导出 core 构造函数的类型，方便单元测试单独覆盖它。
export type { Core as AIWorkflowHistoryCore }
