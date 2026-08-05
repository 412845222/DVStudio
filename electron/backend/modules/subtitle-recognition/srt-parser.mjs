function parseSrtTime(timeStr) {
	const match = timeStr.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
	if (!match) return 0
	const hours = parseInt(match[1], 10)
	const minutes = parseInt(match[2], 10)
	const seconds = parseInt(match[3], 10)
	const ms = parseInt(match[4].padEnd(3, '0').slice(0, 3), 10)
	return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms
}

export function parseSrt(content) {
	const cues = []
	const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/)

	for (const block of blocks) {
		const lines = block
			.trim()
			.split('\n')
			.filter((l) => l.trim())
		if (lines.length < 2) continue

		let timeLineIndex = 0
		let startTime = 0
		let endTime = 0
		let textLines = []

		if (/^\d+$/.test(lines[0].trim())) {
			timeLineIndex = 1
		}

		if (timeLineIndex < lines.length) {
			const timeMatch = lines[timeLineIndex].match(
				/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/
			)
			if (timeMatch) {
				startTime = parseSrtTime(timeMatch[1])
				endTime = parseSrtTime(timeMatch[2])
				textLines = lines.slice(timeLineIndex + 1)
			} else {
				textLines = lines.slice(timeLineIndex)
			}
		}

		if (textLines.length > 0) {
			cues.push({
				startTime,
				endTime,
				text: textLines.join(' ').trim()
			})
		}
	}

	return cues
}

export function cuesToSrt(cues) {
	return cues
		.map((cue, index) => {
			const seq = index + 1
			const start = formatSrtTime(cue.startTime)
			const end = formatSrtTime(cue.endTime)
			return `${seq}\n${start} --> ${end}\n${cue.text}\n`
		})
		.join('\n')
}

function formatSrtTime(ms) {
	const totalSeconds = Math.floor(ms / 1000)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	const millis = ms % 1000
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}
