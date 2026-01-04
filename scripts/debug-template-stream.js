// One-off debugging helper: verify backend SSE stream contains agentToUi/componentTemplate.
// Usage: node scripts/debug-template-stream.js

const url = process.env.DWEB_TEMPLATE_STREAM_URL || 'http://127.0.0.1:5800/api/ai/subtitle/template:stream'

/** @param {Uint8Array} _ */
const noop = (_)=>{}

async function main() {
	const body = {
		promptPreset: 'subtitle_template_preview',
		promptInput: {
			name: 'debug-preview',
			templateId: 'debug-template',
			category: '',
			description: ['结构：root 矩形 + 标题 + 正文', '配色：只使用给定 palette', '滤镜：至少一处 glow'],
			palette: ['#111111', '#FFFFFF', '#FF3B30'],
			paletteLocked: true,
			requireGlow: true,
		},
		contextPack: {
			activeLayerId: 'layer-debug',
			layers: [],
			selectedNodeIds: [],
			selectedNodes: [],
			activeLayer: null,
			lastStageOps: [],
			subtitleSummary: { style: {}, outline: {} },
		},
		viewport: { width: 1920, height: 1080, fps: 30 },
		provider: 'deepseek',
		responseMode: 'agentToUi-jsonl',
	}

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'text/event-stream',
		},
		body: JSON.stringify(body),
	})

	if (!res.ok) {
		const t = await res.text()
		throw new Error(`HTTP ${res.status}: ${t.slice(0, 2000)}`)
	}
	if (!res.body) throw new Error('Missing response body (ReadableStream)')

	const reader = res.body.getReader()
	const decoder = new TextDecoder('utf-8')

	let buffer = ''
	let eventName = ''
	/** @type {string[]} */
	let dataLines = []

	let gotComponentTemplate = false
	let agentErrorCount = 0
	let sseErrorCount = 0

	const flush = () => {
		if (!eventName && dataLines.length === 0) return
		const name = eventName || 'msg'
		const data = dataLines.join('\n')
		eventName = ''
		dataLines = []

		if (name === 'msg') {
			try {
				const v = JSON.parse(data)
				if (v?.type === 'agentToUi/componentTemplate') {
					gotComponentTemplate = true
					console.log('[msg] GOT agentToUi/componentTemplate')
				}
				if (v?.type === 'agentToUi/error') {
					agentErrorCount += 1
					console.log('[msg] GOT agentToUi/error:', v?.payload?.message || '(no message)')
				}
			} catch (e) {
				console.log('[msg] JSON.parse failed:', String(e))
				console.log(data.slice(0, 400))
			}
			return
		}

		if (name === 'error') {
			sseErrorCount += 1
			console.log('[error] SSE error event:', data.slice(0, 400))
			return
		}

		if (name === 'done') {
			console.log('[done] SSE done')
			return
		}
	}

	while (true) {
		const { value, done } = await reader.read()
		if (done) break
		noop(value)
		buffer += decoder.decode(value, { stream: true })

		let idx
		while ((idx = buffer.indexOf('\n')) >= 0) {
			const raw = buffer.slice(0, idx)
			buffer = buffer.slice(idx + 1)
			const line = raw.replace(/\r$/, '')

			if (!line) {
				flush()
				continue
			}
			if (line.startsWith('event:')) {
				eventName = line.slice('event:'.length).trim()
				continue
			}
			if (line.startsWith('data:')) {
				dataLines.push(line.slice('data:'.length).trim())
				continue
			}
		}
	}

	flush()
	console.log('SUMMARY', { gotComponentTemplate, agentErrorCount, sseErrorCount })

	if (!gotComponentTemplate) {
		process.exitCode = 2
	}
}

main().catch((e) => {
	console.error(String(e?.stack || e))
	process.exit(1)
})
