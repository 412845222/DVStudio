import { diagnoseSource } from './diagnostics.mjs'
import { prepareSource } from './sourceManager.mjs'

// One-click setup orchestration: diagnose → auto-fix (install/build) → recheck.
// Yields phase events so the frontend can render progress.
export async function* autoSetupSource(profile, { signal, onLine } = {}) {
	// Phase 1: diagnose the selected source.
	yield { phase: 'diagnose', message: '正在检测源码与环境' }
	const diag = await diagnoseSource(profile, { signal })
	yield { phase: 'diagnose-result', diagnostics: diag }

	if (diag.overall === 'ready') {
		yield { phase: 'complete', message: '环境已就绪，可启动服务', diagnostics: diag }
		return diag
	}

	// Determine whether the failures are auto-fixable.
	// Auto-fixable = only warnings, OR a git source whose structure check failed
	// (empty directory that needs cloning) with no other blocking failures.
	const structureItem = diag.items.find((i) => i.key === 'source-structure')
	const blockingFails = diag.items.filter(
		(i) => i.status === 'fail' && i.key !== 'source-structure'
	)
	const canAutoFix =
		diag.overall === 'auto-fixable' ||
		(diag.overall === 'needs-action' &&
			profile.sourceKind === 'git' &&
			structureItem?.status === 'fail' &&
			blockingFails.length === 0)

	if (!canAutoFix) {
		yield { phase: 'needs-action', message: '环境存在需手动处理的问题', diagnostics: diag }
		return diag
	}

	// Phase 2: run prepare (clone / install / build) using the same queue pattern
	// as service.prepare so callback-based progress becomes yielded events.
	const queue = []
	let wake
	let done = false
	let failure
	const push = (value) => {
		if (queue.length < 100) queue.push(value)
		wake?.()
		wake = null
	}
	prepareSource(profile, {
		signal,
		onLine: (stream, line) => {
			onLine?.(stream, line)
			push({ phase: 'log', stream, line })
		},
		onPhase: (phase, message) => push({ phase, message })
	})
		.then((report) => push({ phase: 'prepared', message: '依赖安装与构建完成', report }))
		.catch((error) => {
			failure = error
		})
		.finally(() => {
			done = true
			wake?.()
			wake = null
		})

	while (!done || queue.length) {
		if (queue.length) yield queue.shift()
		else
			await new Promise((resolve) => {
				wake = resolve
			})
	}
	if (failure) throw failure

	// Phase 3: re-diagnose after prepare.
	yield { phase: 'recheck', message: '正在复检环境' }
	const recheck = await diagnoseSource(profile, { signal })
	yield { phase: 'recheck-result', diagnostics: recheck }

	if (recheck.overall === 'ready') {
		yield { phase: 'complete', message: '环境已就绪，可启动服务', diagnostics: recheck }
		return recheck
	}
	yield { phase: 'needs-action', message: '环境仍存在需手动处理的问题', diagnostics: recheck }
	return recheck
}
