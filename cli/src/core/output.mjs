export function isJsonFlag(argv) {
	return argv.includes('--json')
}

export function printText(lines) {
	const arr = Array.isArray(lines) ? lines : [String(lines)]
	for (const line of arr) process.stdout.write(String(line) + '\n')
}

export function printJson(data, pretty = true) {
	const str = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
	process.stdout.write(str + '\n')
}

export function printErrorText(message, code) {
	const prefix = code ? `[${code}] ` : ''
	process.stderr.write(`${prefix}${String(message)}\n`)
}

export function formatDuration(ms) {
	if (ms < 1000) return `${ms}ms`
	const sec = Math.floor(ms / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.floor(sec / 60)
	return `${min}m${sec % 60}s`
}
