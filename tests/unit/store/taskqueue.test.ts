import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TaskQueueStore } from '../../../src/store/taskqueue/store'
import type { GlobalTask } from '../../../src/store/taskqueue/types'

function makeTask(overrides: Partial<GlobalTask> = {}): GlobalTask {
	const now = Date.now()
	return {
		id: 'task-' + Math.random().toString(36).slice(2, 8),
		provider: 'test-provider',
		category: 'image',
		projectId: 1,
		nodeId: 'node-1',
		status: 'running',
		progress: 50,
		title: 'Test Task',
		prompt: 'a test prompt',
		errorMessage: '',
		statusText: 'Generating...',
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

describe('TaskQueueStore', () => {
	beforeEach(() => {
		TaskQueueStore.replaceState({
			tasks: new Map(),
			summary: {
				total: 0,
				activeCount: 0,
				runningCount: 0,
				submittingCount: 0,
				completedCount: 0,
				failedCount: 0,
				cancelledCount: 0,
				overallProgress: 0,
				tasks: [],
			},
			panelVisible: false,
			listenerIds: {},
			initialized: false,
		})
		vi.clearAllMocks()
	})

	describe('mutations', () => {
		it('setTask adds task to state', () => {
			const task = makeTask({ id: 't1' })
			TaskQueueStore.commit('setTask', task)
			expect(TaskQueueStore.state.tasks.get('t1')).toEqual(task)
		})

		it('removeTask deletes task from state', () => {
			const task = makeTask({ id: 't1' })
			TaskQueueStore.commit('setTask', task)
			TaskQueueStore.commit('removeTask', 't1')
			expect(TaskQueueStore.state.tasks.has('t1')).toBe(false)
		})

		it('setSummary replaces summary and merges tasks', () => {
			const task = makeTask({ id: 's1' })
			TaskQueueStore.commit('setSummary', {
				total: 1,
				activeCount: 1,
				runningCount: 1,
				submittingCount: 0,
				completedCount: 0,
				failedCount: 0,
				cancelledCount: 0,
				overallProgress: 50,
				tasks: [task],
			})
			expect(TaskQueueStore.state.summary.total).toBe(1)
			expect(TaskQueueStore.state.tasks.get('s1')).toEqual(task)
		})

		it('togglePanel flips visibility', () => {
			expect(TaskQueueStore.state.panelVisible).toBe(false)
			TaskQueueStore.commit('togglePanel')
			expect(TaskQueueStore.state.panelVisible).toBe(true)
			TaskQueueStore.commit('togglePanel')
			expect(TaskQueueStore.state.panelVisible).toBe(false)
		})

		it('clearCompleted removes only terminal tasks', () => {
			const running = makeTask({ id: 'r1', status: 'running' })
			const completed = makeTask({ id: 'c1', status: 'completed' })
			const failed = makeTask({ id: 'f1', status: 'failed' })
			const cancelled = makeTask({ id: 'x1', status: 'cancelled' })
			TaskQueueStore.commit('setTask', running)
			TaskQueueStore.commit('setTask', completed)
			TaskQueueStore.commit('setTask', failed)
			TaskQueueStore.commit('setTask', cancelled)
			TaskQueueStore.commit('clearCompleted')
			expect(TaskQueueStore.state.tasks.has('r1')).toBe(true)
			expect(TaskQueueStore.state.tasks.has('c1')).toBe(false)
			expect(TaskQueueStore.state.tasks.has('f1')).toBe(false)
			expect(TaskQueueStore.state.tasks.has('x1')).toBe(false)
		})
	})

	describe('getters', () => {
		it('activeTasks filters running/submitting/pending tasks sorted by createdAt desc', () => {
			const t1 = makeTask({ id: 'a1', status: 'running', createdAt: 100 })
			const t2 = makeTask({ id: 'a2', status: 'submitting', createdAt: 300 })
			const t3 = makeTask({ id: 'a3', status: 'completed', createdAt: 200 })
			const t4 = makeTask({ id: 'a4', status: 'pending', createdAt: 50 })
			TaskQueueStore.commit('setTask', t1)
			TaskQueueStore.commit('setTask', t2)
			TaskQueueStore.commit('setTask', t3)
			TaskQueueStore.commit('setTask', t4)
			const active = TaskQueueStore.getters.activeTasks
			expect(active.map((t: GlobalTask) => t.id)).toEqual(['a2', 'a1', 'a4'])
		})

		it('completedTasks filters terminal tasks sorted by updatedAt desc', () => {
			const t1 = makeTask({ id: 'd1', status: 'completed', updatedAt: 100 })
			const t2 = makeTask({ id: 'd2', status: 'failed', updatedAt: 300 })
			const t3 = makeTask({ id: 'd3', status: 'running', updatedAt: 400 })
			TaskQueueStore.commit('setTask', t1)
			TaskQueueStore.commit('setTask', t2)
			TaskQueueStore.commit('setTask', t3)
			const done = TaskQueueStore.getters.completedTasks
			expect(done.map((t: GlobalTask) => t.id)).toEqual(['d2', 'd1'])
		})

		it('hasActiveTasks reflects active task presence', () => {
			expect(TaskQueueStore.getters.hasActiveTasks).toBe(false)
			TaskQueueStore.commit('setTask', makeTask({ id: 'h1', status: 'running' }))
			expect(TaskQueueStore.getters.hasActiveTasks).toBe(true)
		})

		it('allTasks returns all tasks sorted by createdAt desc', () => {
			const t1 = makeTask({ id: 'all1', createdAt: 1 })
			const t2 = makeTask({ id: 'all2', createdAt: 3 })
			const t3 = makeTask({ id: 'all3', createdAt: 2 })
			TaskQueueStore.commit('setTask', t1)
			TaskQueueStore.commit('setTask', t2)
			TaskQueueStore.commit('setTask', t3)
			const all = TaskQueueStore.getters.allTasks
			expect(all.map((t: GlobalTask) => t.id)).toEqual(['all2', 'all3', 'all1'])
		})
	})
})
