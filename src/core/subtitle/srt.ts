export type SrtCue = {
	startMs: number
	endMs: number
	text: string
}

const toInt = (s: string) => {
	const n = Math.floor(Number(s))
	return Number.isFinite(n) ? n : 0
}

const parseTimestampToMs = (raw: string): number | null => {
	// Format: HH:MM:SS,mmm
	const t = raw.trim()
	const m = t.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/)
	if (!m) return null
	const hh = toInt(m[1])
	const mm = toInt(m[2])
	const ss = toInt(m[3])
	let ms = toInt(m[4])
	if (m[4].length === 1) ms = ms * 100
	else if (m[4].length === 2) ms = ms * 10
	if ([hh, mm, ss, ms].some((v) => !Number.isFinite(v))) return null
	return ((hh * 60 + mm) * 60 + ss) * 1000 + ms
}

const normalizeText = (lines: string[]) => {
	// Keep minimal: join lines with \n, trim outer spaces.
	return lines
		.map((l) => l.replace(/\r/g, ''))
		.join('\n')
		.trim()
}

export const parseSrt = (text: string): SrtCue[] => {
	const src = String(text ?? '')
	// Normalize line endings and split by blank lines.
	const blocks = src
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split(/\n{2,}/g)
		.map((b) => b.trim())
		.filter(Boolean)

	const cues: SrtCue[] = []

	for (const block of blocks) {
		const lines = block
			.split('\n')
			.map((l) => l.trimEnd())
			.filter((l) => l.length > 0)
		if (lines.length < 2) continue

		// Optional index line.
		let idx = 0
		if (/^\d+$/.test(lines[0].trim())) idx = 1
		if (idx >= lines.length) continue

		const timeLine = lines[idx]
		const timeMatch = timeLine.match(
			/^(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})/
		)
		if (!timeMatch) continue

		const startMs = parseTimestampToMs(timeMatch[1])
		const endMs = parseTimestampToMs(timeMatch[2])
		if (startMs == null || endMs == null) continue
		if (!(endMs > startMs)) continue

		const textLines = lines.slice(idx + 1)
		const cueText = normalizeText(textLines)
		if (!cueText) continue

		cues.push({ startMs, endMs, text: cueText })
	}

	// Sort and de-overlap (minimal): keep chronological order.
	cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
	return cues
}

export const msToFrameRangeInclusive = (startMs: number, endMs: number, fps: number) => {
	const safeFps = Math.max(1, Math.min(240, Math.floor(Number(fps) || 30)))
	const startSec = Math.max(0, Number(startMs) / 1000)
	const endSec = Math.max(0, Number(endMs) / 1000)
	const startFrame = Math.floor(startSec * safeFps)
	// end is exclusive in time, so use ceil - 1 for inclusive frames
	const endFrame = Math.max(startFrame, Math.ceil(endSec * safeFps) - 1)
	return { startFrame, endFrame, fps: safeFps }
}
