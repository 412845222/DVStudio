export type SubtitleOutlineItem = {
	title: string
	startCue: number
	endCue: number
	startTimeMs?: number | null
	endTimeMs?: number | null
}

export type SubtitleSegments = {
	items: SubtitleOutlineItem[]
}

export type SubtitleStyle = {
	palette: Record<string, string>
	notes?: string[]
}

export type SubtitleUnderstanding = {
	/** overall understanding summary of all subtitles */
	summary: string
	/** optional bullet points */
	points?: string[]
}

export type SubtitleTemplateSuggestion = {
	templateId: string
	name: string
	category?: string
	description?: string[]
	template?: unknown
}

export type SubtitlePlanItem = {
	id: string
	title: string
	templateRef: string
	start: { cueIndex: number }
	end: { cueIndex: number }
	confirmRequired?: boolean
	previewable?: boolean
}

export type SubtitleSummaryState = {
	meta: {
		layerId?: string
		generatedAt?: string
	}
	understanding: SubtitleUnderstanding
	segments: SubtitleSegments
	outline: {
		items: SubtitleOutlineItem[]
	}
	style: SubtitleStyle
	templates: SubtitleTemplateSuggestion[]
	plans: SubtitlePlanItem[]
}

export const createEmptySubtitleSummaryState = (): SubtitleSummaryState => ({
	meta: {},
	understanding: { summary: '', points: [] },
	segments: { items: [] },
	outline: { items: [] },
	style: { palette: {}, notes: [] },
	templates: [],
	plans: []
})

const isRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)

const safeGetArray = <T>(obj: unknown, key: string, fallback: T[]): T[] => {
	if (!isRecord(obj) || !Array.isArray(obj[key])) return fallback
	return obj[key] as T[]
}

const safeGetString = (obj: unknown, key: string, fallback: string): string => {
	if (!isRecord(obj) || typeof obj[key] !== 'string') return fallback
	return obj[key] as string
}

const safeGetRecord = (obj: unknown, key: string): Record<string, unknown> | undefined => {
	if (!isRecord(obj) || typeof obj[key] !== 'object' || obj[key] === null || Array.isArray(obj[key]))
		return undefined
	return obj[key] as Record<string, unknown>
}

const normalizeOutline = (v: unknown): SubtitleSummaryState['outline'] => {
	if (!isRecord(v)) return { items: [] }
	return {
		...v,
		items: safeGetArray<SubtitleOutlineItem>(v, 'items', [])
	}
}

const normalizeSegments = (v: unknown): SubtitleSegments => {
	if (!isRecord(v)) return { items: [] }
	return {
		...v,
		items: safeGetArray<SubtitleOutlineItem>(v, 'items', [])
	}
}

const normalizeStyle = (v: unknown): SubtitleStyle => {
	if (!isRecord(v)) return { palette: {}, notes: [] }
	const paletteRecord = safeGetRecord(v, 'palette')
	const palette: Record<string, string> = {}
	if (paletteRecord) {
		for (const [k, val] of Object.entries(paletteRecord)) {
			if (typeof val === 'string') palette[k] = val
		}
	}
	const notes = safeGetArray<string>(v, 'notes', [])
	return {
		...v,
		palette,
		notes
	}
}

const normalizeUnderstanding = (v: unknown): SubtitleUnderstanding => {
	if (!isRecord(v)) return { summary: '', points: [] }
	const summary = safeGetString(v, 'summary', '')
	const points = safeGetArray<string>(v, 'points', [])
	return { ...v, summary, points }
}

export const applySubtitleSummaryDelta = (
	state: SubtitleSummaryState,
	payload: { section: string; data: unknown }
): SubtitleSummaryState => {
	const section = String(payload.section || '').trim()
	const data = payload.data
	if (!section) return state

	if (section === 'all' && isRecord(data)) {
		return {
			meta: safeGetRecord(data, 'meta') ?? state.meta,
			understanding: normalizeUnderstanding(safeGetRecord(data, 'understanding') ?? {}),
			segments: normalizeSegments(safeGetRecord(data, 'segments') ?? {}),
			outline: normalizeOutline(safeGetRecord(data, 'outline') ?? {}),
			style: normalizeStyle(safeGetRecord(data, 'style') ?? {}),
			templates: safeGetArray<SubtitleTemplateSuggestion>(data, 'templates', state.templates),
			plans: safeGetArray<SubtitlePlanItem>(data, 'plans', state.plans)
		}
	}

	if (section === 'meta' && isRecord(data)) {
		const metaRecord = safeGetRecord(data, 'meta')
		return { ...state, meta: { ...state.meta, ...(metaRecord ?? {}) } }
	}
	if (section === 'understanding' && isRecord(data)) {
		const deltaRecord = safeGetRecord(data, 'understanding')
		return {
			...state,
			understanding: normalizeUnderstanding({ ...state.understanding, ...(deltaRecord ?? {}) })
		}
	}
	if (section === 'segments' && isRecord(data)) {
		const deltaRecord = safeGetRecord(data, 'segments')
		return { ...state, segments: normalizeSegments({ ...state.segments, ...(deltaRecord ?? {}) }) }
	}
	if (section === 'outline' && isRecord(data)) {
		const deltaRecord = safeGetRecord(data, 'outline')
		return { ...state, outline: normalizeOutline({ ...state.outline, ...(deltaRecord ?? {}) }) }
	}
	if (section === 'style' && isRecord(data)) {
		const deltaRecord = safeGetRecord(data, 'style')
		return { ...state, style: normalizeStyle({ ...state.style, ...(deltaRecord ?? {}) }) }
	}
	if (section === 'templates' && Array.isArray(data))
		return { ...state, templates: data as SubtitleTemplateSuggestion[] }
	if (section === 'plans' && Array.isArray(data)) return { ...state, plans: data as SubtitlePlanItem[] }

	return state
}
