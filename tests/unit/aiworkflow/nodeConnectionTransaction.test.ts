import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeNodeConnectionTransaction } from '@/views/AIWorkflow/node-business/presentation/useAIWorkflowNodeConnectionTransaction'

describe('executeNodeConnectionTransaction', () => {
	let createTargetNode: ReturnType<typeof vi.fn>
	let connectNodes: ReturnType<typeof vi.fn>
	let forceSyncToStore: ReturnType<typeof vi.fn>
	let beginBulkUpdate: ReturnType<typeof vi.fn>
	let endBulkUpdate: ReturnType<typeof vi.fn>
	let clearPendingChanges: ReturnType<typeof vi.fn>
	let validate: ReturnType<typeof vi.fn>

	beforeEach(() => {
		createTargetNode = vi.fn().mockReturnValue('node-123')
		connectNodes = vi.fn().mockReturnValue(true)
		forceSyncToStore = vi.fn().mockResolvedValue(true)
		beginBulkUpdate = vi.fn()
		endBulkUpdate = vi.fn()
		clearPendingChanges = vi.fn()
		validate = vi.fn().mockReturnValue(true)

		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	it('successfully completes a full transaction lifecycle', async () => {
		const result = await executeNodeConnectionTransaction({
			logPrefix: '[Test]',
			createTargetNode,
			connectNodes,
			forceSyncToStore,
			beginBulkUpdate,
			endBulkUpdate,
			clearPendingChanges,
			validate
		})

		expect(result.success).toBe(true)
		expect(result.targetNodeId).toBe('node-123')
		expect(result.error).toBeUndefined()

		// Verify lifecycle hooks are called
		expect(beginBulkUpdate).toHaveBeenCalledTimes(1)
		expect(createTargetNode).toHaveBeenCalledTimes(1)
		expect(connectNodes).toHaveBeenCalledWith('node-123')
		expect(endBulkUpdate).toHaveBeenCalled()
		expect(forceSyncToStore).toHaveBeenCalledTimes(1)
		expect(validate).toHaveBeenCalledWith('node-123')

		// Verify call order using mock.invocationCallOrder
		const callOrder = [
			beginBulkUpdate.mock.invocationCallOrder[0],
			createTargetNode.mock.invocationCallOrder[0],
			connectNodes.mock.invocationCallOrder[0],
			endBulkUpdate.mock.invocationCallOrder[0],
			forceSyncToStore.mock.invocationCallOrder[0],
			validate.mock.invocationCallOrder[0]
		]
		// Each call should have increasing invocation order (called in sequence)
		for (let i = 1; i < callOrder.length; i++) {
			expect(callOrder[i]).toBeGreaterThan(callOrder[i - 1])
		}
	})

	it('calls clearPendingChanges multiple times for race condition protection', async () => {
		await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore,
			beginBulkUpdate,
			endBulkUpdate,
			clearPendingChanges
		})

		// Should be called: after beginBulkUpdate, after createTargetNode, after connectNodes, before forceSyncToStore, in finally
		expect(clearPendingChanges.mock.calls.length).toBeGreaterThanOrEqual(3)
	})

	it('returns failure when createTargetNode returns null', async () => {
		createTargetNode.mockReturnValue(null)

		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore
		})

		expect(result.success).toBe(false)
		expect(result.targetNodeId).toBeNull()
		expect(result.error).toContain('Failed to create target node')
		expect(connectNodes).not.toHaveBeenCalled()
		expect(forceSyncToStore).not.toHaveBeenCalled()
	})

	it('returns failure when connectNodes returns false', async () => {
		connectNodes.mockReturnValue(false)

		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore
		})

		expect(result.success).toBe(false)
		expect(result.targetNodeId).toBe('node-123')
		expect(result.error).toContain('Failed to connect nodes')
		expect(forceSyncToStore).not.toHaveBeenCalled()
	})

	it('handles exceptions thrown during transaction', async () => {
		const testError = new Error('Test error during connect')
		connectNodes.mockImplementation(() => {
			throw testError
		})

		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore,
			beginBulkUpdate,
			endBulkUpdate
		})

		expect(result.success).toBe(false)
		expect(result.targetNodeId).toBeNull()
		expect(result.error).toBe('Test error during connect')

		// endBulkUpdate should still be called in finally block
		expect(endBulkUpdate).toHaveBeenCalled()
	})

	it('calls endBulkUpdate even if beginBulkUpdate was not provided (safe no-op)', async () => {
		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore,
			endBulkUpdate
		})

		expect(result.success).toBe(true)
	})

	it('returns warning when validation fails but node was created', async () => {
		validate.mockReturnValue(false)

		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore,
			validate
		})

		expect(result.success).toBe(true)
		expect(result.warning).toBeDefined()
		expect(result.warning).toContain('Validation warning')
	})

	it('proceeds when forceSyncToStore returns false but does not fail', async () => {
		forceSyncToStore.mockResolvedValue(false)

		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore,
			validate
		})

		// Should still succeed (warning only)
		expect(result.success).toBe(true)
		expect(validate).toHaveBeenCalled()
	})

	it('works with minimal required options (no bulk update or validation)', async () => {
		const result = await executeNodeConnectionTransaction({
			createTargetNode,
			connectNodes,
			forceSyncToStore
		})

		expect(result.success).toBe(true)
		expect(result.targetNodeId).toBe('node-123')
	})
})
