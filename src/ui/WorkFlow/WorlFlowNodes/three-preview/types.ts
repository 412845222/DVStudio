export type WorkflowThreePreviewPhase = 'masked' | 'loading' | 'interactive'

export type WorkflowThreePreviewState = {
	phase: WorkflowThreePreviewPhase
	canStart: boolean
	progress: number
	label: string
	requestId: number
}

export type WorkflowThreePreviewProgressPayload = {
	progress?: number
	label?: string
}
