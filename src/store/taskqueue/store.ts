import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'
import type { GlobalTask, TaskQueueState, TaskQueueSummary } from './types'

function createDefaultSummary(): TaskQueueSummary {
	return {
		total: 0,
		activeCount: 0,
		runningCount: 0,
		submittingCount: 0,
		completedCount: 0,
		failedCount: 0,
		cancelledCount: 0,
		overallProgress: 0,
		tasks: []
	}
}

function createDefaultState(): TaskQueueState {
	return {
		tasks: new Map(),
		summary: createDefaultSummary(),
		panelVisible: false,
		listenerIds: {},
		initialized: false
	}
}

export const TaskQueueKey: InjectionKey<Store<TaskQueueState>> = Symbol('TaskQueueStore')

export const TaskQueueStore = createStore<TaskQueueState>({
	state: createDefaultState,

	mutations: {
		setTask(state, task: GlobalTask) {
			state.tasks.set(task.id, task)
		},
		removeTask(state, taskId: string) {
			state.tasks.delete(taskId)
		},
		setSummary(state, summary: TaskQueueSummary) {
			state.summary = summary
			if (Array.isArray(summary.tasks)) {
				for (const t of summary.tasks) {
					state.tasks.set(t.id, t)
				}
			}
		},
		setPanelVisible(state, visible: boolean) {
			state.panelVisible = visible
		},
		togglePanel(state) {
			state.panelVisible = !state.panelVisible
		},
		setListenerIds(state, ids: TaskQueueState['listenerIds']) {
			state.listenerIds = { ...state.listenerIds, ...ids }
		},
		setInitialized(state, value: boolean) {
			state.initialized = value
		},
		clearCompleted(state) {
			for (const [id, task] of state.tasks) {
				if (['completed', 'failed', 'cancelled'].includes(task.status)) {
					state.tasks.delete(id)
				}
			}
		}
	},

	getters: {
		activeTasks(state): GlobalTask[] {
			const list: GlobalTask[] = []
			for (const task of state.tasks.values()) {
				if (['pending', 'submitting', 'running'].includes(task.status)) {
					list.push(task)
				}
			}
			return list.sort((a, b) => b.createdAt - a.createdAt)
		},
		completedTasks(state): GlobalTask[] {
			const list: GlobalTask[] = []
			for (const task of state.tasks.values()) {
				if (['completed', 'failed', 'cancelled'].includes(task.status)) {
					list.push(task)
				}
			}
			return list.sort((a, b) => b.updatedAt - a.updatedAt)
		},
		allTasks(state): GlobalTask[] {
			return Array.from(state.tasks.values()).sort((a, b) => b.createdAt - a.createdAt)
		},
		hasActiveTasks(_state, getters): boolean {
			return getters.activeTasks.length > 0
		},
		overallProgress(state): number {
			return state.summary.overallProgress || 0
		}
	},

	actions: {
		async init({ commit, state, dispatch }) {
			if (state.initialized) return

			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) {
				commit('setInitialized', true)
				return
			}

			try {
				const summaryResult = await bridge.summary()
				if (summaryResult?.ok && summaryResult.summary) {
					commit('setSummary', summaryResult.summary)
				}
			} catch (err) {
				console.warn('[TaskQueueStore] Failed to fetch initial summary:', err)
			}

			const updateId = bridge.onUpdate?.((task: GlobalTask) => {
				commit('setTask', task)
				dispatch('refreshSummary')
			})

			const summaryId = bridge.onSummary?.((summary: TaskQueueSummary) => {
				commit('setSummary', summary)
			})

			const deletedId = bridge.onDeleted?.((payload: { id: string }) => {
				commit('removeTask', payload.id)
			})

			commit('setListenerIds', { update: updateId, summary: summaryId, deleted: deletedId })
			commit('setInitialized', true)
		},

		async refreshSummary({ commit }) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return
			try {
				const result = await bridge.summary()
				if (result?.ok && result.summary) {
					commit('setSummary', result.summary)
				}
			} catch (err) {
				console.warn('[TaskQueueStore] Failed to refresh summary:', err)
			}
		},

		async cancelTask(_, payload: { id: string }) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			return bridge.cancel(payload)
		},

		async deleteTask(_, payload: { id: string }) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			return bridge.delete(payload)
		},

		async clearCompletedTasks({ commit }) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			const result = await bridge.clearCompleted()
			if (result?.ok) {
				commit('clearCompleted')
			}
			return result
		},

		togglePanel({ commit }) {
			commit('togglePanel')
		},

		showPanel({ commit }) {
			commit('setPanelVisible', true)
		},

		hidePanel({ commit }) {
			commit('setPanelVisible', false)
		},

		async submitMeshyTask({ dispatch }, payload: Record<string, unknown>) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			const result = await bridge.submit({ provider: 'meshy', ...payload })
			if (result?.ok) {
				dispatch('refreshSummary')
			}
			return result
		},

		async submitTripo3DTask({ dispatch }, payload: Record<string, unknown>) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			const result = await bridge.submit({ provider: 'tripo3d', ...payload })
			if (result?.ok) {
				dispatch('refreshSummary')
			}
			return result
		},

		async createTask({ commit, dispatch }, payload: Record<string, unknown>) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			const result = await bridge.create(payload)
			if (result?.ok && result.task) {
				commit('setTask', result.task)
				dispatch('refreshSummary')
			}
			return result
		},

		async updateTask({ commit, dispatch }, payload: Record<string, unknown>) {
			const bridge = (window as any)?.dweb?.taskQueue
			if (!bridge) return { ok: false, error: 'Not in electron environment' }
			const result = await bridge.update(payload)
			if (result?.ok && result.task) {
				commit('setTask', result.task)
			}
			return result
		}
	}
})
