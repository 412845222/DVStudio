import type { AIWorkflowState } from '../../../store/aiworkflow/store'
import { STARTUP_STEP_KEYS } from './types'
import type { useBlueprintStartupProgress } from './useBlueprintStartupProgress'

interface BlueprintStartupLoaderOptions {
	store: { state: AIWorkflowState }
	t: (key: string, params?: Record<string, string | number>) => string
	progress: ReturnType<typeof useBlueprintStartupProgress>
	loadProjectById: (
		projectId: number,
		opts?: {
			silent?: boolean
			suppressErrorToast?: boolean
			onProgress?: (current: number, total: number) => void
		}
	) => Promise<boolean>
	recoverComfyUIRunStates: (opts: { silent: boolean }) => Promise<void>
	recoverMeshyTaskStates: (opts: { silent: boolean }) => Promise<void>
}

const yieldToMain = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

export function createBlueprintStartupLoader(options: BlueprintStartupLoaderOptions) {
	const { t, progress, loadProjectById, recoverComfyUIRunStates, recoverMeshyTaskStates } = options

	const stepKey = STARTUP_STEP_KEYS

	const loadProject = async (projectId: number): Promise<boolean> => {
		progress.start(t('aiworkflow.page.startupLoadingTitle'))

		try {
			progress.beginStep(stepKey.INIT, t('aiworkflow.page.startup.step.init'))
			await yieldToMain()
			progress.completeStep(stepKey.INIT)

			progress.beginStep(stepKey.FETCH_PROJECT, t('aiworkflow.page.startup.step.fetchProject'))
			await yieldToMain()

			const loadOk = await loadProjectById(projectId, {
				silent: true,
				suppressErrorToast: true,
				onProgress: (current, total) => {
					if (total <= 0) return
					const ratio = current / total
					if (ratio < 0.15) {
						progress.beginStep(
							stepKey.FETCH_PROJECT,
							t('aiworkflow.page.startup.step.fetchProject')
						)
					} else if (ratio < 0.3) {
						progress.beginStep(
							stepKey.VALIDATE_SNAPSHOT,
							t('aiworkflow.page.startup.step.validateSnapshot')
						)
					} else if (ratio < 0.5) {
						progress.beginStep(
							stepKey.REPAIR_ASSETS,
							t('aiworkflow.page.startup.step.repairAssets')
						)
					} else if (ratio < 0.7) {
						progress.beginStep(
							stepKey.HYDRATE_STATE,
							t('aiworkflow.page.startup.step.hydrateState')
						)
					} else if (ratio < 0.85) {
						progress.beginStep(
							stepKey.RESOLVE_RESOURCES,
							t('aiworkflow.page.startup.step.resolveResources')
						)
						progress.updateSubProgress(stepKey.RESOLVE_RESOURCES, current, total)
					} else {
						progress.beginStep(
							stepKey.RECOVER_HANDLES,
							t('aiworkflow.page.startup.step.recoverHandles')
						)
					}
				}
			})

			if (!loadOk) {
				const errMsg = t('aiworkflow.runtime.loadProjectFailed', { error: 'unknown' })
				progress.fail(errMsg, true)
				return false
			}

			progress.completeStep(stepKey.FETCH_PROJECT)
			progress.completeStep(stepKey.VALIDATE_SNAPSHOT)
			progress.completeStep(stepKey.REPAIR_ASSETS)
			progress.completeStep(stepKey.HYDRATE_STATE)
			progress.completeStep(stepKey.RESOLVE_RESOURCES)
			progress.completeStep(stepKey.RECOVER_HANDLES)
			await yieldToMain()

			progress.beginStep(
				stepKey.MIGRATE_RESOURCES,
				t('aiworkflow.page.startup.step.migrateResources')
			)
			await yieldToMain()
			progress.completeStep(stepKey.MIGRATE_RESOURCES)

			progress.beginStep(stepKey.RESTORE_TASKS, t('aiworkflow.page.startup.step.restoreTasks'))
			await Promise.allSettled([
				recoverComfyUIRunStates({ silent: true }),
				recoverMeshyTaskStates({ silent: true })
			])
			await yieldToMain()
			progress.completeStep(stepKey.RESTORE_TASKS)

			progress.beginStep(stepKey.READY, t('aiworkflow.page.startup.step.ready'))
			await yieldToMain()
			progress.completeStep(stepKey.READY)
			progress.finish()

			return true
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err)
			progress.fail(errMsg, true)
			return false
		}
	}

	return { loadProject }
}
