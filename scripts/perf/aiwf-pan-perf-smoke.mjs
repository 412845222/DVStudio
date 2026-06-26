#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SCENARIO_CONFIGS = {
	S0: { scenario: 'S0-50-nodes', nodeCount: 50, description: '基线 50 节点' },
	S1: { scenario: 'S1-200-nodes', nodeCount: 200, description: '常规压力 200 节点' },
	S2: { scenario: 'S2-500-nodes', nodeCount: 500, description: '大图压力 500 节点' },
	S3: { scenario: 'S3-1000-nodes', nodeCount: 1000, description: '极限观察 1000 节点' }
}

const parseArgs = (argv) => {
	const args = {
		diagnostics: '',
		trace: '',
		har: '',
		outDir: '.tmp-perf',
		scenario: 'S2-500-image-nodes',
		runChromeAnalyze: true,
		runPreviewAudit: true,
		batch: '',
		batchConfigs: null
	}

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i]
		const next = argv[i + 1]
		if (token === '--diagnostics' && next) {
			args.diagnostics = next
			i += 1
			continue
		}
		if (token === '--trace' && next) {
			args.trace = next
			i += 1
			continue
		}
		if (token === '--har' && next) {
			args.har = next
			i += 1
			continue
		}
		if (token === '--outDir' && next) {
			args.outDir = next
			i += 1
			continue
		}
		if (token === '--scenario' && next) {
			args.scenario = next
			i += 1
			continue
		}
		if (token === '--no-chrome-analyze') {
			args.runChromeAnalyze = false
			continue
		}
		if (token === '--no-preview-audit') {
			args.runPreviewAudit = false
			continue
		}
		if (token === '--batch' && next) {
			args.batch = next
			const tiers = next
				.split(',')
				.map((s) => s.trim().toUpperCase())
				.filter(Boolean)
			args.batchConfigs = tiers.map((tier) => SCENARIO_CONFIGS[tier] || null).filter(Boolean)
			i += 1
			continue
		}
	}

	return args
}

const toAbs = (p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))

const copyIfExists = (srcPath, outDir) => {
	if (!srcPath) return null
	const abs = toAbs(srcPath)
	if (!fs.existsSync(abs)) return null
	const target = path.join(outDir, path.basename(abs))
	fs.copyFileSync(abs, target)
	return target
}

const runNodeScript = (scriptPath, args) => {
	const result = spawnSync(process.execPath, [scriptPath, ...args], {
		cwd: process.cwd(),
		stdio: 'inherit'
	})
	return result.status === 0
}

const summarizeDiagnostics = (diagnosticsPath) => {
	if (!diagnosticsPath) return null
	const abs = toAbs(diagnosticsPath)
	if (!fs.existsSync(abs)) return null
	const payload = readJson(abs)
	const current = payload?.current || {}
	const samples = Array.isArray(payload?.diagnostics?.samples) ? payload.diagnostics.samples : []

	const avgFps = samples.length
		? samples.reduce((sum, s) => sum + Number(s.fps || 0), 0) / samples.length
		: Number(current.fps || 0)
	const maxWorstFrameMs = samples.length
		? Math.max(...samples.map((s) => Number(s.worstFrameMs || 0)))
		: Number(current.worstFrameMs || 0)
	const totalSlowFrames = samples.reduce
		? samples.reduce((sum, s) => sum + Number(s.slowFrames || 0), 0)
		: Number(current.slowFrames || 0)
	const edgeInputCount = Number(current.edgeInputCount || 0)
	const edgeCulledCount = Number(current.edgeCulledCount || 0)
	const edgeCullHitRate = edgeInputCount > 0 ? edgeCulledCount / edgeInputCount : 0

	return {
		avgFps: Number(avgFps.toFixed(2)),
		maxWorstFrameMs: Number(maxWorstFrameMs.toFixed(2)),
		totalSlowFrames,
		edgeComputeMs: Number(current.edgeComputeMs || 0),
		edgeInputCount,
		edgeRenderedCount: Number(current.edgeRenderedCount || 0),
		edgeCulledCount,
		edgeCullHitRate: Number(edgeCullHitRate.toFixed(4)),
		sampleCount: samples.length,
		fps: Number(current.fps || 0),
		worstFrameMs: Number(current.worstFrameMs || 0)
	}
}

const runSingleScenario = (scenarioConfig, sharedInputs, outDir, stamp, args) => {
	const { scenario, description } = scenarioConfig
	const scenarioDir = path.join(outDir, `${scenario}-${stamp}`)
	fs.mkdirSync(scenarioDir, { recursive: true })

	const scenarioInputs = {
		diagnostics: copyIfExists(sharedInputs.diagnostics, scenarioDir),
		trace: copyIfExists(sharedInputs.trace, scenarioDir),
		har: copyIfExists(sharedInputs.har, scenarioDir)
	}

	let chromeAnalyzeOk = false
	if (args.runChromeAnalyze && scenarioInputs.trace && scenarioInputs.har) {
		chromeAnalyzeOk = runNodeScript(
			path.resolve(process.cwd(), 'scripts/perf/analyze-chrome-perf.mjs'),
			['--trace', scenarioInputs.trace, '--har', scenarioInputs.har, '--outDir', scenarioDir]
		)
	}

	let previewAuditOk = false
	if (args.runPreviewAudit && scenarioInputs.har) {
		const outAudit = path.join(scenarioDir, `aiwf-preview-audit-${stamp}.json`)
		previewAuditOk = runNodeScript(
			path.resolve(process.cwd(), 'scripts/perf/aiwf-asset-preview-audit.mjs'),
			['--har', scenarioInputs.har, '--out', outAudit]
		)
	}

	const diagnosticsSummary = summarizeDiagnostics(scenarioInputs.diagnostics)

	const summary = {
		schemaVersion: 1,
		generatedAt: Date.now(),
		scenario,
		description,
		runDir: scenarioDir,
		inputs: scenarioInputs,
		diagnosticsSummary,
		postProcess: {
			chromeAnalyzeOk,
			previewAuditOk
		}
	}

	const summaryPath = path.join(scenarioDir, 'aiwf-pan-smoke-summary.json')
	fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
	console.log(`[aiwf-pan-perf-smoke] ${scenario}: wrote ${summaryPath}`)

	return summary
}

const generateBatchSummary = (batchResults, outDir, stamp) => {
	const rows = batchResults.map((r) => {
		const diag = r.diagnosticsSummary || {}
		const thresholdFps = r.scenario.startsWith('S0')
			? 55
			: r.scenario.startsWith('S1')
				? 50
				: r.scenario.startsWith('S2')
					? 40
					: 30
		const fpsPass = diag.avgFps >= thresholdFps
		const framePass = diag.maxWorstFrameMs < 50
		const edgeCullPass = diag.edgeCullHitRate > 0.6

		return {
			scenario: r.scenario,
			description: r.description,
			avgFps: diag.avgFps ?? '--',
			maxWorstFrameMs: diag.maxWorstFrameMs ?? '--',
			totalSlowFrames: diag.totalSlowFrames ?? '--',
			edgeComputeMs: diag.edgeComputeMs ?? '--',
			edgeInputCount: diag.edgeInputCount ?? '--',
			edgeRenderedCount: diag.edgeRenderedCount ?? '--',
			edgeCulledCount: diag.edgeCulledCount ?? '--',
			edgeCullHitRate: diag.edgeCullHitRate ?? '--',
			edgeCullHitRateDisplay:
				diag.edgeCullHitRate != null ? `${(diag.edgeCullHitRate * 100).toFixed(1)}%` : '--',
			fpsPass,
			framePass,
			edgeCullPass,
			allPass: fpsPass && framePass && edgeCullPass
		}
	})

	const summary = {
		schemaVersion: 1,
		generatedAt: Date.now(),
		batchStamp: stamp,
		scenarios: rows.map((r) => ({
			scenario: r.scenario,
			description: r.description,
			avgFps: r.avgFps,
			maxWorstFrameMs: r.maxWorstFrameMs,
			totalSlowFrames: r.totalSlowFrames,
			edgeComputeMs: r.edgeComputeMs,
			edgeCullHitRate: r.edgeCullHitRate,
			edgeCullHitRateDisplay: r.edgeCullHitRateDisplay,
			fpsPass: r.fpsPass,
			framePass: r.framePass,
			edgeCullPass: r.edgeCullPass,
			allPass: r.allPass
		}))
	}

	const summaryPath = path.join(outDir, `batch-summary-${stamp}.json`)
	fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
	console.log(`[aiwf-pan-perf-smoke] batch: wrote ${summaryPath}`)

	// 生成 Markdown 报告
	const mdLines = [
		'# Batch 2 第二段验收报告',
		'',
		`生成时间：${new Date().toLocaleString('zh-CN')}`,
		'',
		'## 场景配置',
		'',
		'| 档位 | 节点数 | 边策略 | avgFPS | worst帧 | 慢帧数 | 边计算耗时 | 裁剪率 | FPS达标 | 帧达标 | 裁剪达标 |',
		'|------|--------|--------|--------|---------|--------|-----------|--------|---------|--------|---------|'
	]

	for (const row of rows) {
		mdLines.push(
			`| ${row.scenario} | ${row.description} | ${row.edgeInputCount}输入/${row.edgeRenderedCount}渲染 | ` +
				`${row.avgFps} | ${row.maxWorstFrameMs}ms | ${row.totalSlowFrames} | ${row.edgeComputeMs}ms | ${row.edgeCullHitRateDisplay} | ` +
				`${row.fpsPass ? '✅' : '❌'} | ${row.framePass ? '✅' : '❌'} | ${row.edgeCullPass ? '✅' : '❌'} |`
		)
	}

	mdLines.push('', '## 结论')

	for (const row of rows) {
		const status = row.allPass ? '✅ 通过' : '❌ 未通过'
		mdLines.push(`- ${row.scenario} (${row.description}): ${status}`)
	}

	const mdPath = path.join(outDir, 'batch-report.md')
	fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8')
	console.log(`[aiwf-pan-perf-smoke] batch: wrote ${mdPath}`)

	return summary
}

const main = () => {
	const args = parseArgs(process.argv.slice(2))
	const outDir = toAbs(args.outDir)
	fs.mkdirSync(outDir, { recursive: true })

	const stamp = new Date().toISOString().replace(/[:.]/g, '-')

	// 批次模式
	if (args.batchConfigs && args.batchConfigs.length > 0) {
		const batchDir = path.join(outDir, `aiwf-batch-${stamp}`)
		fs.mkdirSync(batchDir, { recursive: true })

		const sharedInputs = {
			diagnostics: toAbs(args.diagnostics),
			trace: toAbs(args.trace),
			har: toAbs(args.har)
		}

		const batchResults = []
		for (const config of args.batchConfigs) {
			try {
				const result = runSingleScenario(config, sharedInputs, batchDir, stamp, args)
				batchResults.push(result)
			} catch (err) {
				console.error(`[aiwf-pan-perf-smoke] ${config.scenario} failed:`, err?.message || err)
			}
		}

		const batchSummary = generateBatchSummary(batchResults, batchDir, stamp)
		console.log(
			`[aiwf-pan-perf-smoke] batch complete: ${batchResults.length}/${args.batchConfigs.length} scenarios`
		)
		return
	}

	// 单场景模式（原有逻辑）
	const runDir = path.join(outDir, `aiwf-pan-smoke-${stamp}`)
	fs.mkdirSync(runDir, { recursive: true })

	const copiedDiagnostics = copyIfExists(args.diagnostics, runDir)
	const copiedTrace = copyIfExists(args.trace, runDir)
	const copiedHar = copyIfExists(args.har, runDir)

	let chromeAnalyzeOk = false
	if (args.runChromeAnalyze && copiedTrace && copiedHar) {
		chromeAnalyzeOk = runNodeScript(
			path.resolve(process.cwd(), 'scripts/perf/analyze-chrome-perf.mjs'),
			['--trace', copiedTrace, '--har', copiedHar, '--outDir', runDir]
		)
	}

	let previewAuditOk = false
	if (args.runPreviewAudit && copiedHar) {
		const outAudit = path.join(runDir, `aiwf-preview-audit-${stamp}.json`)
		previewAuditOk = runNodeScript(
			path.resolve(process.cwd(), 'scripts/perf/aiwf-asset-preview-audit.mjs'),
			['--har', copiedHar, '--out', outAudit]
		)
	}

	const diagnosticsSummary = summarizeDiagnostics(copiedDiagnostics)

	const summary = {
		schemaVersion: 1,
		generatedAt: Date.now(),
		scenario: String(args.scenario || 'unknown'),
		runDir,
		inputs: {
			diagnostics: copiedDiagnostics,
			trace: copiedTrace,
			har: copiedHar
		},
		diagnosticsSummary,
		postProcess: {
			chromeAnalyzeOk,
			previewAuditOk
		}
	}

	const summaryPath = path.join(runDir, 'aiwf-pan-smoke-summary.json')
	fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

	console.log(`[aiwf-pan-perf-smoke] wrote ${summaryPath}`)
}

try {
	main()
} catch (error) {
	console.error('[aiwf-pan-perf-smoke] Failed:', error?.message || error)
	process.exit(1)
}
