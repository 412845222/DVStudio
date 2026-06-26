#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
	const args = {
		trace: 'aidoc/优化方案/Trace-20260327T194051.json',
		har: 'aidoc/优化方案/127.0.0.1.har',
		outDir: 'aidoc/优化方案'
	}

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i]
		if (token === '--trace' && argv[i + 1]) {
			args.trace = argv[i + 1]
			i += 1
		} else if (token === '--har' && argv[i + 1]) {
			args.har = argv[i + 1]
			i += 1
		} else if (token === '--outDir' && argv[i + 1]) {
			args.outDir = argv[i + 1]
			i += 1
		}
	}

	return args
}

function toAbs(p) {
	return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

function readJson(filePath) {
	const absPath = toAbs(filePath)
	const raw = fs.readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '')
	return JSON.parse(raw)
}

function asNumber(v, fallback = 0) {
	return Number.isFinite(v) ? v : fallback
}

function median(values) {
	if (!values.length) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function topNByMap(map, n = 20) {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([key, value]) => ({ key, value }))
}

function topNByRecords(records, field, n = 20) {
	return [...records].sort((a, b) => asNumber(b[field]) - asNumber(a[field])).slice(0, n)
}

function analyzeHar(har) {
	const entries = har?.log?.entries || []
	const summary = {
		totalEntries: entries.length,
		totalTransferBytes: 0,
		totalBodyBytes: 0,
		totalTimeMs: 0,
		packageSchemeRequests: 0,
		errors: [],
		topSlowRequests: [],
		pollingHints: []
	}

	const byPathCount = new Map()
	const byPathTime = new Map()
	const sessionPollTimes = []

	for (const e of entries) {
		const request = e.request || {}
		const response = e.response || {}
		const url = String(request.url || '')
		const timeMs = asNumber(e.time)

		summary.totalTimeMs += timeMs
		summary.totalTransferBytes += asNumber(response._transferSize)
		summary.totalBodyBytes += asNumber(response.bodySize)

		if (url.startsWith('package://')) {
			summary.packageSchemeRequests += 1
		}

		let key = url
		try {
			const parsed = new URL(url)
			key = parsed.pathname || parsed.origin
		} catch {
			// Keep original url if parse fails.
		}

		byPathCount.set(key, (byPathCount.get(key) || 0) + 1)
		byPathTime.set(key, (byPathTime.get(key) || 0) + timeMs)

		if ((response.status || 0) >= 400 || response._error) {
			summary.errors.push({
				status: response.status,
				error: response._error || '',
				method: request.method || '',
				url,
				timeMs
			})
		}

		if (url.includes('/api/agent-skills/unreal-export/sessions')) {
			const started = Date.parse(e.startedDateTime || '')
			if (Number.isFinite(started)) {
				sessionPollTimes.push(started)
			}
		}
	}

	const topCount = topNByMap(byPathCount, 20).map((r) => ({ path: r.key, count: r.value }))
	const topTime = topNByMap(byPathTime, 20).map((r) => ({
		path: r.key,
		totalTimeMs: Number(r.value.toFixed(2))
	}))

	summary.topPathsByCount = topCount
	summary.topPathsByTime = topTime
	summary.topSlowRequests = topNByRecords(
		entries.map((e) => ({
			url: e?.request?.url || '',
			method: e?.request?.method || '',
			status: e?.response?.status || 0,
			timeMs: asNumber(e?.time),
			startedDateTime: e?.startedDateTime || ''
		})),
		'timeMs',
		20
	)

	sessionPollTimes.sort((a, b) => a - b)
	const pollIntervals = []
	for (let i = 1; i < sessionPollTimes.length; i += 1) {
		pollIntervals.push(sessionPollTimes[i] - sessionPollTimes[i - 1])
	}

	if (sessionPollTimes.length > 1) {
		summary.pollingHints.push({
			endpoint: '/api/agent-skills/unreal-export/sessions',
			count: sessionPollTimes.length,
			medianIntervalMs: Math.round(median(pollIntervals)),
			minIntervalMs: Math.round(Math.min(...pollIntervals)),
			maxIntervalMs: Math.round(Math.max(...pollIntervals))
		})
	}

	summary.avgEntryTimeMs = entries.length
		? Number((summary.totalTimeMs / entries.length).toFixed(2))
		: 0
	summary.errorCount = summary.errors.length

	return summary
}

function analyzeTrace(trace) {
	const traceEvents = trace?.traceEvents || []

	const summary = {
		totalEvents: traceEvents.length,
		phaseCounts: {},
		topDurationByName: [],
		topDurationByThread: [],
		longTasksOver50ms: [],
		packageSchemeSignals: [],
		unknownUrlSchemeSignals: []
	}

	const phaseCounts = new Map()
	const durByNameUs = new Map()
	const durByThreadUs = new Map()
	const longTasks = []
	const packageSignals = []
	const unknownSignals = []

	for (const ev of traceEvents) {
		const ph = String(ev?.ph || '')
		phaseCounts.set(ph, (phaseCounts.get(ph) || 0) + 1)

		const dur = asNumber(ev?.dur, 0)
		if (ph === 'X' && dur > 0) {
			const name = String(ev?.name || '(unnamed)')
			durByNameUs.set(name, (durByNameUs.get(name) || 0) + dur)

			const threadKey = `${ev?.pid ?? 'p?'}:${ev?.tid ?? 't?'}`
			durByThreadUs.set(threadKey, (durByThreadUs.get(threadKey) || 0) + dur)

			if (dur >= 50_000) {
				longTasks.push({
					name,
					cat: String(ev?.cat || ''),
					durMs: Number((dur / 1000).toFixed(2)),
					tsMs: Number((asNumber(ev?.ts, 0) / 1000).toFixed(2)),
					pid: ev?.pid,
					tid: ev?.tid
				})
			}
		}

		const args = ev?.args || {}
		const directUrl = String(args?.data?.url || args?.url || '')
		if (directUrl.startsWith('package://')) {
			packageSignals.push({ name: String(ev?.name || ''), url: directUrl, ph })
		}

		const directError = String(args?.data?.error || args?.errorText || args?.message || '')
		if (directError.includes('ERR_UNKNOWN_URL_SCHEME')) {
			unknownSignals.push({ name: String(ev?.name || ''), error: directError, ph })
		}
	}

	summary.phaseCounts = Object.fromEntries(phaseCounts.entries())
	summary.topDurationByName = topNByMap(durByNameUs, 20).map((r) => ({
		name: r.key,
		totalDurMs: Number((r.value / 1000).toFixed(2))
	}))
	summary.topDurationByThread = topNByMap(durByThreadUs, 20).map((r) => ({
		thread: r.key,
		totalDurMs: Number((r.value / 1000).toFixed(2))
	}))
	summary.longTasksOver50ms = topNByRecords(longTasks, 'durMs', 50)
	summary.packageSchemeSignals = packageSignals.slice(0, 50)
	summary.unknownUrlSchemeSignals = unknownSignals.slice(0, 50)

	return summary
}

function renderMarkdown(data) {
	const { meta, har, trace } = data

	const lines = []
	lines.push('# Chrome Performance Summary')
	lines.push('')
	lines.push(`- Generated At: ${meta.generatedAt}`)
	lines.push(`- Trace File: ${meta.traceFile}`)
	lines.push(`- HAR File: ${meta.harFile}`)
	lines.push('')

	lines.push('## HAR Overview')
	lines.push(`- Total Entries: ${har.totalEntries}`)
	lines.push(`- Avg Entry Time (ms): ${har.avgEntryTimeMs}`)
	lines.push(`- Error Count: ${har.errorCount}`)
	lines.push(`- package:// Requests: ${har.packageSchemeRequests}`)
	lines.push('')

	lines.push('### HAR Polling Hints')
	if (har.pollingHints.length === 0) {
		lines.push('- None detected')
	} else {
		for (const p of har.pollingHints) {
			lines.push(
				`- ${p.endpoint}: count=${p.count}, median=${p.medianIntervalMs}ms, min=${p.minIntervalMs}ms, max=${p.maxIntervalMs}ms`
			)
		}
	}
	lines.push('')

	lines.push('### HAR Top Slow Requests (Top 10)')
	for (const r of har.topSlowRequests.slice(0, 10)) {
		lines.push(`- ${r.timeMs.toFixed(2)}ms | ${r.status} | ${r.method} ${r.url}`)
	}
	lines.push('')

	lines.push('## Trace Overview')
	lines.push(`- Total Events: ${trace.totalEvents}`)
	lines.push(`- Long Tasks >= 50ms: ${trace.longTasksOver50ms.length}`)
	lines.push(`- package:// Signals: ${trace.packageSchemeSignals.length}`)
	lines.push(`- ERR_UNKNOWN_URL_SCHEME Signals: ${trace.unknownUrlSchemeSignals.length}`)
	lines.push('')

	lines.push('### Trace Top Duration By Name (Top 10)')
	for (const item of trace.topDurationByName.slice(0, 10)) {
		lines.push(`- ${item.totalDurMs.toFixed(2)}ms | ${item.name}`)
	}
	lines.push('')

	lines.push('### Trace Worst Long Tasks (Top 10)')
	for (const task of trace.longTasksOver50ms.slice(0, 10)) {
		lines.push(`- ${task.durMs.toFixed(2)}ms | ${task.name} | cat=${task.cat} | ts=${task.tsMs}`)
	}
	lines.push('')

	lines.push('### Immediate Next Focus')
	lines.push(
		'- If polling median interval is low (<1000ms), throttle or pause endpoint polling during heavy interaction.'
	)
	lines.push(
		'- If package:// or ERR_UNKNOWN_URL_SCHEME appears, trace caller stack in renderer path that constructs snapshot URLs.'
	)
	lines.push('- Use this compact report for AI review instead of sharing raw 200MB trace.')

	return lines.join('\n')
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	const tracePath = toAbs(args.trace)
	const harPath = toAbs(args.har)
	const outDir = toAbs(args.outDir)

	if (!fs.existsSync(tracePath)) {
		throw new Error(`Trace file not found: ${tracePath}`)
	}
	if (!fs.existsSync(harPath)) {
		throw new Error(`HAR file not found: ${harPath}`)
	}
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true })
	}

	const trace = readJson(tracePath)
	const har = readJson(harPath)

	const traceSummary = analyzeTrace(trace)
	const harSummary = analyzeHar(har)

	const generatedAt = new Date().toISOString()
	const stamp = generatedAt.replace(/[:.]/g, '-')

	const result = {
		meta: {
			generatedAt,
			traceFile: path.relative(process.cwd(), tracePath),
			harFile: path.relative(process.cwd(), harPath)
		},
		har: harSummary,
		trace: traceSummary
	}

	const summaryJsonPath = path.join(outDir, `chrome-perf-summary-${stamp}.json`)
	const summaryMdPath = path.join(outDir, `chrome-perf-summary-${stamp}.md`)

	fs.writeFileSync(summaryJsonPath, JSON.stringify(result, null, 2), 'utf8')
	fs.writeFileSync(summaryMdPath, renderMarkdown(result), 'utf8')

	console.log(`Summary JSON: ${summaryJsonPath}`)
	console.log(`Summary MD:   ${summaryMdPath}`)
	console.log(`Trace events: ${traceSummary.totalEvents}`)
	console.log(`HAR entries:  ${harSummary.totalEntries}`)
}

try {
	main()
} catch (error) {
	console.error('[analyze-chrome-perf] Failed:', error?.message || error)
	process.exit(1)
}
