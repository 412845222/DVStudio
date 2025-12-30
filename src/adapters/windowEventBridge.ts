import { DVS_EVENTS, type DvsEditorSavedDetail, type DvsEditorStateRestoredDetail, type DvsTimelineNavDetail } from '../core/events/dvsEvents'

export const dispatchDvsTimelineNav = (dir: -1 | 1, reason: DvsTimelineNavDetail['reason'] = 'program') => {
	const detail: DvsTimelineNavDetail = {
		dir,
		direction: dir === -1 ? 'back' : 'forward',
		reason,
	}
	window.dispatchEvent(new CustomEvent(DVS_EVENTS.TimelineNav, { detail }))
}

export const dispatchDvsEditorStateRestored = (reason: DvsEditorStateRestoredDetail['reason'] = 'replace') => {
	const detail: DvsEditorStateRestoredDetail = { at: Date.now(), reason }
	window.dispatchEvent(new CustomEvent(DVS_EVENTS.EditorStateRestored, { detail }))
}

export const dispatchDvsEditorSaved = (payload: DvsEditorSavedDetail) => {
	window.dispatchEvent(new CustomEvent(DVS_EVENTS.EditorSaved, { detail: payload }))
}
