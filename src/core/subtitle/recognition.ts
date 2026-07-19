export type RecognitionCue = {
	startTime?: number | null
	endTime?: number | null
	text?: string | null
}

export type SubtitleCue = {
	startMs: number
	endMs: number
	text: string
}

export const SECONDS_TO_MS = 1000

export function convertRecognitionCuesToSubtitleCues(recogCues: RecognitionCue[]): SubtitleCue[] {
	if (!Array.isArray(recogCues) || recogCues.length === 0) return []
	return recogCues
		.map((c) => {
			const startSec = Number(c?.startTime)
			const endSec = Number(c?.endTime)
			const startMs = Math.max(0, Math.round((Number.isFinite(startSec) ? startSec : 0) * SECONDS_TO_MS))
			let endMs = Math.max(0, Math.round((Number.isFinite(endSec) ? endSec : 0) * SECONDS_TO_MS))
			if (!(endMs > startMs)) {
				endMs = startMs + 1
			}
			const text = String(c?.text ?? '').trim()
			return { startMs, endMs, text }
		})
		.filter((c) => c.text.length > 0)
}

export function formatSrtTimeFromSeconds(seconds: number): string {
	const safeSec = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
	const totalMs = Math.floor(safeSec * SECONDS_TO_MS)
	const h = Math.floor(totalMs / 3600000)
	const m = Math.floor((totalMs % 3600000) / 60000)
	const s = Math.floor((totalMs % 60000) / 1000)
	const ms = totalMs % 1000
	const pad = (n: number, len = 2) => String(n).padStart(len, '0')
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

export function buildSubtitleExtractedAudioUrl(projectId: number): string | null {
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return null
	const relative = 'Content/Media/subtitle_extracted_audio.wav'
	return `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(relative)}`
}

export function parseProjectIdFromVideoUrl(videoUrl: string | null | undefined): number | null {
	if (!videoUrl || typeof videoUrl !== 'string') return null
	try {
		const url = new URL(videoUrl)
		if (url.protocol !== 'dweb:') return null
		if (url.hostname !== 'project-assets' && url.host !== 'project-assets') return null
		const pid = url.searchParams.get('projectId')
		if (!pid) return null
		const n = Number(pid)
		return Number.isFinite(n) && n > 0 ? n : null
	} catch {
		return null
	}
}
