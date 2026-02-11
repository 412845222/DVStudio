export type ResourceKind = 'image' | 'video'

export type WorkflowResource = {
	id: string
	kind: ResourceKind
	name: string
	url: string
	createdAt: number
}

export type ImageResource = WorkflowResource & {
	kind: 'image'
}

export type VideoResource = WorkflowResource & {
	kind: 'video'
}
