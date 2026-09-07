// Only sanitized, bounded lines leave the main process. Authenticated URLs stay private.
export function redact(text) {
	return String(text)
		.replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[凭证已隐藏]@')
		.replace(/(\bBearer\s+)[a-zA-Z0-9._~+\/-]+=*/gi, '$1[已隐藏]')
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
		.replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1[访问凭证已隐藏]')
		.replace(
			/((?:api[_-]?key|token|authorization|password|secret)\s*[=:]\s*)[^\s,;]+/gi,
			'$1[已隐藏]'
		)
		.replace(/\bsk-[a-zA-Z0-9_-]+/g, '[已隐藏]')
}

export function createServiceEvents(send = () => {}) {
	let seq = 0
	let epoch = 0
	let logs = []
	let pending = []
	let timer = null
	const flush = () => {
		if (timer) clearTimeout(timer)
		timer = null
		if (pending.length) {
			send('service-log', pending)
			pending = []
		}
	}
	return {
		log(stream, message, runId = null) {
			const entry = {
				seq: ++seq,
				epoch,
				ts: Date.now(),
				stream,
				message: redact(message).slice(0, 2048),
				runId
			}
			logs.push(entry)
			if (logs.length > 2000) logs.splice(0, logs.length - 2000)
			pending.push(entry)
			if (pending.length >= 100) flush()
			else if (!timer) timer = setTimeout(flush, 100)
		},
		emit(name, value) {
			flush()
			send(name, { ...value, seq: ++seq, epoch })
		},
		snapshot() {
			return { logs: logs.slice(), seq, epoch }
		},
		clear() {
			flush()
			logs = []
			epoch++
			send('service-clear', { seq: ++seq, epoch })
		},
		flush
	}
}
