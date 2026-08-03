import { TaskPollScheduler } from './TaskPollScheduler'
import type { PollTaskCallbacks, PollTaskProvider, PollTaskStatus } from './types'
import type { StateUpdateBatcher } from './StateUpdateBatcher'
import { onBeforeUnmount, getCurrentInstance } from 'vue'

export type UseTaskPollSchedulerHandle = {
	startPoll: (
		nodeId: string,
		taskId: string,
		provider: PollTaskProvider,
		callbacks: PollTaskCallbacks,
		initialStatus?: PollTaskStatus,
		initialProgress?: number
	) => void
	stopPoll: (nodeId: string, taskId?: string) => void
	forceTick: (nodeId: string, taskId: string) => void
	hasActive: (nodeId: string, taskId: string) => boolean
	getBatcher: () => StateUpdateBatcher | null
	getUnderlyingScheduler: () => TaskPollScheduler
	isSchedulerEnabled: () => boolean
}

const attachCleanupOnUnmountIfNeeded = (cleanup: () => void): void => {
	try {
		const instance = getCurrentInstance()
		if (instance) {
			onBeforeUnmount(() => {
				try {
					cleanup()
				} catch (e) {
					console.error('[useTaskPollScheduler] onBeforeUnmount cleanup failed:', e)
				}
			})
		}
	} catch {
		// ignore vue lifecycle API errors
	}
}

let cachedSharedBatcher: StateUpdateBatcher | null = null
const getSharedBatcherFactory = (() => {
	let factory: (() => StateUpdateBatcher) | null = null
	return {
		set(fn: () => StateUpdateBatcher) {
			factory = fn
		},
		get(): StateUpdateBatcher | null {
			if (cachedSharedBatcher) return cachedSharedBatcher
			if (!factory) return null
			try {
				cachedSharedBatcher = factory()
			} catch (e) {
				console.error('[useTaskPollScheduler] build batcher failed:', e)
				return null
			}
			return cachedSharedBatcher
		}
	}
})()

export const registerSharedBatcherFactory = (factory: () => StateUpdateBatcher): void => {
	getSharedBatcherFactory.set(factory)
}

export const useTaskPollScheduler = (): UseTaskPollSchedulerHandle => {
	const scheduler = TaskPollScheduler.shared
	const ownedNodeIds = new Set<string>()

	const stopAllOwned = () => {
		for (const nodeId of Array.from(ownedNodeIds)) {
			scheduler.unregister(nodeId)
			ownedNodeIds.delete(nodeId)
		}
	}

	attachCleanupOnUnmountIfNeeded(() => {
		stopAllOwned()
	})

	return {
		startPoll: (
			nodeId: string,
			taskId: string,
			provider: PollTaskProvider,
			callbacks: PollTaskCallbacks,
			initialStatus: PollTaskStatus = 'pending',
			initialProgress = 0
		) => {
			ownedNodeIds.add(nodeId)
			scheduler.register(nodeId, taskId, provider, callbacks, initialStatus, initialProgress)
		},
		stopPoll: (nodeId: string, taskId?: string) => {
			scheduler.unregister(nodeId, taskId)
			if (!taskId) ownedNodeIds.delete(nodeId)
		},
		forceTick: (nodeId: string, taskId: string) => {
			scheduler.forceTickNow(nodeId, taskId)
		},
		hasActive: (nodeId: string, taskId: string) => scheduler.has(nodeId, taskId),
		getBatcher: () => getSharedBatcherFactory.get(),
		getUnderlyingScheduler: () => scheduler,
		isSchedulerEnabled: () => scheduler.isEnabled()
	}
}
