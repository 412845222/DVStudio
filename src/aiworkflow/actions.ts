import type { WorkflowSelectionTarget } from './types'

export type WorkflowActionId = 'delete'

export type WorkflowAction = {
	id: WorkflowActionId
	label: string
	target: WorkflowSelectionTarget
}

export const buildDeleteAction = (target: WorkflowSelectionTarget): WorkflowAction | null => {
	if (target.kind === 'none') return null
	return {
		id: 'delete',
		label: '删除',
		target
	}
}
