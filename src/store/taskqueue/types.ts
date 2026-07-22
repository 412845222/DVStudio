export interface TaskResultAsset {
	type: 'image' | 'video' | 'model' | 'text' | 'file'
	url: string
	thumbnailUrl?: string
	format?: string
	[key: string]: unknown
}

export type TaskCategory = 'image' | 'video' | '3d' | 'custom'

export interface GlobalTask {
	id: string
	provider: string
	taskType?: string
	category: TaskCategory
	label?: string
	projectId: string | number | null
	nodeId: string | null
	remoteTaskId?: string
	status: 'pending' | 'submitting' | 'running' | 'completed' | 'failed' | 'cancelled'
	progress: number
	title: string
	prompt: string
	errorMessage: string
	statusText: string
	coverUrl?: string
	resultUrl?: string
	canCancel?: boolean
	resultAssets?: TaskResultAsset[]
	extraData?: Record<string, unknown>
	startedAt?: number | null
	completedAt?: number | null
	createdAt: number
	updatedAt: number
}

export interface TaskQueueSummary {
	total: number
	activeCount: number
	runningCount: number
	submittingCount: number
	completedCount: number
	failedCount: number
	cancelledCount: number
	overallProgress: number
	tasks: GlobalTask[]
}

export interface TaskQueueState {
	tasks: Map<string, GlobalTask>
	summary: TaskQueueSummary
	panelVisible: boolean
	listenerIds: {
		update?: number
		summary?: number
		deleted?: number
	}
	initialized: boolean
}
