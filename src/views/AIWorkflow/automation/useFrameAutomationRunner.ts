import type {
	FrameAutomationRunnerDeps,
	FrameAutomationRunResult,
	FrameAutomationIterationResult
} from './frameAutomationTypes'
import { buildSubgraphPlan, type SubgraphEdge } from './subgraphTopology'
import { t } from '../../../i18n'

export interface FrameAutomationRuntimeConfig {
	frameId: string
	nodeIds: string[]
	loopCount: number
	edges: SubgraphEdge[]
}

export type RunFrameAutomation = (
	config: FrameAutomationRuntimeConfig
) => Promise<FrameAutomationRunResult>

/**
 * 多选组合循环执行编排：
 * 1. 组内节点按拓扑序执行（Kahn）；成环即终止并报错；
 * 2. 外层按 loopCount 迭代，每轮独立收集产出结果；
 * 3. 单节点失败即终止整个单元运行，保留已完成结果；
 * 4. 执行完全复用页面既有的单节点提交链路（submitNode 回调），不新增后端通道。
 */
export function useFrameAutomationRunner(deps: FrameAutomationRunnerDeps): {
	runFrameAutomation: RunFrameAutomation
} {
	const runFrameAutomation: RunFrameAutomation = async (config) => {
		const { frameId, nodeIds, loopCount, edges } = config
		const result: FrameAutomationRunResult = {
			frameId,
			totalIterations: Math.max(1, loopCount || 1),
			completedIterations: 0,
			iterations: []
		}

		const plan = buildSubgraphPlan(nodeIds, edges)
		if (plan.cyclicNodeIds.length > 0) {
			deps.pushToast?.(
				t('aiworkflow.runtime.frameAutomation.cyclic', {
					nodes: plan.cyclicNodeIds.join(', ')
				}),
				'error'
			)
			deps.onStateChange?.({
				status: 'error',
				currentIteration: 0,
				totalIterations: result.totalIterations,
				message: 'cyclic'
			})
			return result
		}

		for (let iteration = 1; iteration <= result.totalIterations; iteration++) {
			const iterResult: FrameAutomationIterationResult = {
				iteration,
				succeededNodeIds: [],
				skippedNodeIds: []
			}

			for (const nodeId of plan.order) {
				deps.onStateChange?.({
					status: 'running',
					currentIteration: iteration,
					totalIterations: result.totalIterations
				})

				if (deps.isNodeRunnable && !deps.isNodeRunnable(nodeId)) {
					iterResult.skippedNodeIds.push(nodeId)
					continue
				}

				let ok: boolean
				try {
					ok = await deps.submitNode(nodeId)
				} catch (err) {
					ok = false
					iterResult.error = err instanceof Error ? err.message : String(err)
				}

				if (!ok) {
					iterResult.failedNodeId = nodeId
					iterResult.error = iterResult.error ?? 'node execution failed'
					result.iterations.push(iterResult)
					deps.onStateChange?.({
						status: 'error',
						currentIteration: iteration,
						totalIterations: result.totalIterations,
						message: nodeId
					})
					deps.pushToast?.(
						t('aiworkflow.runtime.frameAutomation.abortedAtNode', {
							iteration,
							total: result.totalIterations,
							nodeId
						}),
						'error'
					)
					return result
				}
				iterResult.succeededNodeIds.push(nodeId)
			}

			result.iterations.push(iterResult)
			result.completedIterations = iteration
		}

		deps.onStateChange?.({
			status: 'success',
			currentIteration: result.totalIterations,
			totalIterations: result.totalIterations
		})
		return result
	}

	return { runFrameAutomation }
}
