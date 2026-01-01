import type { EditorSavePayload } from '../editor/types'

export const DVS_EVENTS = {
	TimelineNav: 'dvs:timeline/nav',
	EditorStateRestored: 'dvs:editor/state-restored',
	EditorSaved: 'dvs:editor/saved',
	EditorNodePatched: 'dvs:editor/node/patched',
	EditorNodeDeleted: 'dvs:editor/node/deleted',
} as const

export type DvsTimelineNavDetail = {
	dir: -1 | 1
	direction: 'back' | 'forward'
	reason?: 'browser' | 'keyboard' | 'ui' | 'program'
}

export type DvsEditorStateRestoredDetail = {
	at: number
	reason?: 'undo' | 'redo' | 'load' | 'replace'
}

export type DvsEditorSavedDetail = EditorSavePayload

export type DvsEditorNodePatchDetail = {
	/** 舞台 nodeId */
	nodeId: string
	/** 可选：指定 layerId；不传则由接收方自行查找 */
	layerId?: string
	/**
	 * 允许的最小 patch：按需填写。
	 * - transform: 仅修改给出的字段
	 * - props: 仅修改给出的字段
	 */
	patch: {
		name?: string
		userType?: string
		transform?: Record<string, unknown>
		props?: Record<string, unknown>
	}
}

export type DvsEditorNodeDeleteDetail = {
	/** 舞台 nodeId */
	nodeId: string
	/** 可选：指定 layerId；不传则由接收方自行查找 */
	layerId?: string
}
