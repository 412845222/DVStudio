export type SubtitleOutlineItem = {
	title: string
	startCue: number
	endCue: number
	startTimeMs?: number | null
	endTimeMs?: number | null
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
	outline: { items: [] },
	style: { palette: {}, notes: [] },
	templates: [],
	plans: [],
})

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

const normalizeOutline = (v: unknown): SubtitleSummaryState['outline'] => {
	if (!isRecord(v)) return { items: [] }
	return {
		...v,
		items: Array.isArray((v as any).items) ? (v as any).items : [],
	}
}

const normalizeStyle = (v: unknown): SubtitleStyle => {
	if (!isRecord(v)) return { palette: {}, notes: [] }
	const palette = isRecord((v as any).palette) ? (v as any).palette : {}
	const notes = Array.isArray((v as any).notes) ? (v as any).notes : []
	return {
		...v,
		palette,
		notes,
	}
}

const normalizeUnderstanding = (v: unknown): SubtitleUnderstanding => {
	if (!isRecord(v)) return { summary: '', points: [] }
	const summary = typeof (v as any).summary === 'string' ? (v as any).summary : ''
	const points = Array.isArray((v as any).points) ? (v as any).points : []
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
			meta: isRecord((data as any).meta) ? (data as any).meta : state.meta,
			understanding: (data as any).understanding ? normalizeUnderstanding((data as any).understanding) : state.understanding,
			outline: (data as any).outline ? normalizeOutline((data as any).outline) : state.outline,
			style: (data as any).style ? normalizeStyle((data as any).style) : state.style,
			templates: Array.isArray((data as any).templates) ? (data as any).templates : state.templates,
			plans: Array.isArray((data as any).plans) ? (data as any).plans : state.plans,
		}
	}

	if (section === 'meta' && isRecord(data)) return { ...state, meta: { ...state.meta, ...(data as any) } }
	if (section === 'understanding' && isRecord(data))
		return { ...state, understanding: normalizeUnderstanding({ ...state.understanding, ...(data as any) }) }
	if (section === 'outline' && isRecord(data)) return { ...state, outline: normalizeOutline({ ...state.outline, ...(data as any) }) }
	if (section === 'style' && isRecord(data)) return { ...state, style: normalizeStyle({ ...state.style, ...(data as any) }) }
	if (section === 'templates' && Array.isArray(data)) return { ...state, templates: data as any }
	if (section === 'plans' && Array.isArray(data)) return { ...state, plans: data as any }

	return state
}
