/**
 * Host 层多选组合自动化运行时类型。
 * 配置权威在引擎（frame.automation），本文件只描述执行计划与迭代结果。
 */

/** 执行计划中的单个节点步骤 */
export interface FrameAutomationStep {
	nodeId: string
	/** 入度（仅统计组内边），用于拓扑排序 */
	indegree: number
}

export interface FrameAutomationPlan {
	/** 拓扑序节点 ID（同层内顺序稳定） */
	order: string[]
	/** 成环节点（无法排序）；为空表示无环 */
	cyclicNodeIds: string[]
}

export interface FrameAutomationIterationResult {
	iteration: number
	/** 成功完成的节点 ID（按拓扑序） */
	succeededNodeIds: string[]
	/** 失败节点 ID（首个即终止） */
	failedNodeId?: string
	/** 被跳过的节点 ID（无可执行入口等） */
	skippedNodeIds: string[]
	error?: string
}

export interface FrameAutomationRunResult {
	frameId: string
	totalIterations: number
	completedIterations: number
	iterations: FrameAutomationIterationResult[]
}

export interface FrameAutomationRunnerDeps {
	/** 提交单个节点执行（复用页面 onNodeChatSubmit 同款链路），resolve 为是否成功 */
	submitNode: (nodeId: string) => Promise<boolean>
	/** 节点是否可自动执行（无执行入口的节点类型跳过） */
	isNodeRunnable?: (nodeId: string) => boolean
	/** 每次状态变化（用于引擎按钮条进度） */
	onStateChange?: (state: {
		status: 'running' | 'success' | 'error'
		currentIteration: number
		totalIterations: number
		message?: string
	}) => void
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
}
