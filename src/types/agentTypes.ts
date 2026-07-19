export const DVSAgentType = {
	WORKFLOW: 'workflow',
	BLENDER: 'blender',
	VIDEO_EDITOR: 'video_editor',
	NODE_CHAT: 'node_chat',
	GENERAL: 'general'
} as const

export type DVSAgentTypeValue = typeof DVSAgentType[keyof typeof DVSAgentType]
