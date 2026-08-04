import { computed, reactive, ref } from 'vue'
import type { BlueprintStartupState, StartupStep, StartupStepKey, StartupStepStatus } from './types'
import { STARTUP_STEP_KEYS } from './types'

export interface StartupStepConfig {
	key: StartupStepKey
	label: string
	weight: number
}

const DEFAULT_STEP_WEIGHTS: StartupStepConfig[] = [
	{ key: STARTUP_STEP_KEYS.INIT, label: '初始化启动环境', weight: 3 },
	{ key: STARTUP_STEP_KEYS.FETCH_PROJECT, label: '读取项目数据', weight: 12 },
	{ key: STARTUP_STEP_KEYS.VALIDATE_SNAPSHOT, label: '验证快照结构', weight: 5 },
	{ key: STARTUP_STEP_KEYS.REPAIR_ASSETS, label: '修复项目资源', weight: 22 },
	{ key: STARTUP_STEP_KEYS.HYDRATE_STATE, label: '加载蓝图数据', weight: 12 },
	{ key: STARTUP_STEP_KEYS.RESOLVE_RESOURCES, label: '解析资源链接', weight: 25 },
	{ key: STARTUP_STEP_KEYS.RECOVER_HANDLES, label: '恢复本地文件权限', weight: 6 },
	{ key: STARTUP_STEP_KEYS.MIGRATE_RESOURCES, label: '迁移资源到项目', weight: 5 },
	{ key: STARTUP_STEP_KEYS.RESTORE_TASKS, label: '恢复任务状态', weight: 7 },
	{ key: STARTUP_STEP_KEYS.READY, label: '启动完成', weight: 3 }
]

function buildSteps(configs: StartupStepConfig[]): StartupStep[] {
	return configs.map((c) => ({
		key: c.key,
		label: c.label,
		status: 'idle' as StartupStepStatus,
		subProgress: undefined,
		detail: undefined,
		error: undefined
	}))
}

function calcTotalWeight(configs: StartupStepConfig[]): number {
	return configs.reduce((s, c) => s + c.weight, 0)
}

function calcBaseProgress(configs: StartupStepConfig[], completedKeys: Set<string>): number {
	let acc = 0
	for (const c of configs) {
		if (completedKeys.has(c.key)) {
			acc += c.weight
		}
	}
	return acc
}

export function useBlueprintStartupProgress(
	stepConfigs: StartupStepConfig[] = DEFAULT_STEP_WEIGHTS
) {
	const steps = ref<StartupStep[]>(buildSteps(stepConfigs))
	const currentStepKey = ref<string | null>(null)
	const phase = ref<BlueprintStartupState['phase']>('idle')
	const title = ref('正在加载蓝图项目')
	const error = ref<string | null>(null)
	const canSkipError = ref(false)

	const totalWeight = calcTotalWeight(stepConfigs)
	const completedKeys = new Set<string>()

	const findStepIndex = (key: string): number => {
		return steps.value.findIndex((s) => s.key === key)
	}

	const overallProgress = computed(() => {
		if (phase.value === 'ready') return 100
		if (phase.value === 'idle') return 0

		const base = calcBaseProgress(stepConfigs, completedKeys)
		let subContrib = 0

		if (currentStepKey.value) {
			const idx = findStepIndex(currentStepKey.value)
			if (idx >= 0) {
				const step = steps.value[idx]
				const cfg = stepConfigs[idx]
				if (cfg) {
					const running = cfg.weight
					if (step.subProgress && step.subProgress.total > 0) {
						subContrib = running * (step.subProgress.current / step.subProgress.total)
					} else if (step.status === 'running') {
						subContrib = running * 0.3
					}
				}
			}
		}

		const weighted = (base + subContrib) / totalWeight
		return Math.min(99, Math.round(weighted * 100))
	})

	const isVisible = computed(() => phase.value === 'loading' || phase.value === 'error')

	const reset = () => {
		steps.value = buildSteps(stepConfigs)
		currentStepKey.value = null
		phase.value = 'idle'
		title.value = '正在加载蓝图项目'
		error.value = null
		canSkipError.value = false
		completedKeys.clear()
	}

	const start = (customTitle?: string) => {
		reset()
		phase.value = 'loading'
		if (customTitle) title.value = customTitle
	}

	const beginStep = (key: StartupStepKey, detail?: string) => {
		const idx = findStepIndex(key)
		if (idx < 0) return
		steps.value[idx].status = 'running'
		steps.value[idx].detail = detail
		steps.value[idx].subProgress = undefined
		steps.value[idx].error = undefined
		currentStepKey.value = key
	}

	const updateSubProgress = (
		key: StartupStepKey,
		current: number,
		total: number,
		detail?: string
	) => {
		const idx = findStepIndex(key)
		if (idx < 0) return
		steps.value[idx].subProgress = { current, total }
		if (detail !== undefined) {
			steps.value[idx].detail = detail
		}
	}

	const completeStep = (key: StartupStepKey) => {
		const idx = findStepIndex(key)
		if (idx < 0) return
		steps.value[idx].status = 'ok'
		steps.value[idx].subProgress = undefined
		completedKeys.add(key)
		if (currentStepKey.value === key) {
			currentStepKey.value = null
		}
	}

	const warnStep = (key: StartupStepKey, warnMsg: string) => {
		const idx = findStepIndex(key)
		if (idx < 0) return
		steps.value[idx].status = 'warn'
		steps.value[idx].error = warnMsg
		completedKeys.add(key)
	}

	const failStep = (key: StartupStepKey, errMsg: string) => {
		const idx = findStepIndex(key)
		if (idx < 0) return
		steps.value[idx].status = 'error'
		steps.value[idx].error = errMsg
	}

	const fail = (errMsg: string, skippable = false) => {
		phase.value = 'error'
		error.value = errMsg
		canSkipError.value = skippable
	}

	const skipError = () => {
		if (currentStepKey.value) {
			warnStep(currentStepKey.value as StartupStepKey, error.value || '已跳过')
		}
		error.value = null
		canSkipError.value = false
		finish()
	}

	const finish = () => {
		phase.value = 'ready'
		if (currentStepKey.value) {
			completeStep(currentStepKey.value as StartupStepKey)
		}
	}

	return reactive({
		steps,
		phase,
		title,
		error,
		canSkipError,
		overallProgress,
		isVisible,
		currentStepKey,
		reset,
		start,
		beginStep,
		updateSubProgress,
		completeStep,
		warnStep,
		failStep,
		fail,
		skipError,
		finish
	})
}

export { DEFAULT_STEP_WEIGHTS, STARTUP_STEP_KEYS }
