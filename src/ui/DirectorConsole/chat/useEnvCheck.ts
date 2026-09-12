import { ref, computed } from 'vue'
import { hasDeepSeekHarness, deepseekHarness } from '../../../electronBridge'

type StepStatus = 'pending' | 'checking' | 'ok' | 'fail'

interface StepState {
	status: StepStatus
	detail: string
}

/**
 * 导演控制台 Agent 环境检查 composable。
 *
 * 三步检查流程：
 * 1. 检查 DSH 服务是否运行
 * 2. 检查 DSH 插件是否已安装到 DSH 仓库
 * 3. 检查 DSH 已配置模型是否支持图片输入（多模态）
 *
 * 关键设计：
 * - 移除版本号检查逻辑，每次进入都允许重新安装
 * - Step 2 即使检查通过也始终显示"安装插件"按钮（用于重新安装/更新）
 * - Step 3 检查 settings.yaml 中所有模型是否有 input: [text, image]，缺失时一键修复
 * - allReady 只控制是否显示"进入聊天"按钮，不自动关闭弹窗
 */
export function useEnvCheck() {
	const step1 = ref<StepState>({ status: 'pending', detail: '' })
	const step2 = ref<StepState>({ status: 'pending', detail: '' })
	const step3 = ref<StepState>({ status: 'pending', detail: '' })

	const allReady = computed(
		() => step1.value.status === 'ok' && step2.value.status === 'ok' && step3.value.status === 'ok'
	)

	const dshProfile = ref<{
		id?: string
		localPath: string
		port: number
		revision?: number
	} | null>(null)

	/** 获取 DSH profile（通过已有的 deepseekHarness API） */
	async function fetchDshProfile(): Promise<{
		id?: string
		localPath: string
		port: number
		revision?: number
	} | null> {
		if (!hasDeepSeekHarness()) {
			console.warn('[DirectorConsole:envCheck] fetchDshProfile: hasDeepSeekHarness=false')
			return null
		}
		try {
			const profiles = await deepseekHarness.listProfiles()
			const list = Array.isArray(profiles?.records) ? profiles.records : []
			if (list.length === 0) {
				console.warn('[DirectorConsole:envCheck] fetchDshProfile: 无 profile')
				return null
			}
			const profile = list.find((p) => p.localPath) || list[0]
			dshProfile.value = profile
			console.log('[DirectorConsole:envCheck] fetchDshProfile ok:', profile)
			return profile
		} catch (err) {
			console.error('[DirectorConsole:envCheck] fetchDshProfile 异常', err)
			return null
		}
	}

	/** Step 1: 检查 DSH 服务是否运行 */
	async function checkStep1(): Promise<boolean> {
		step1.value = { status: 'checking', detail: '正在检查…' }
		if (!hasDeepSeekHarness()) {
			step1.value = {
				status: 'fail',
				detail: 'DeepSeek-Harness 未安装'
			}
			return false
		}
		try {
			const snap = await deepseekHarness.snapshot()
			console.log('[DirectorConsole:envCheck] checkStep1 snapshot=', snap?.status)
			const st = snap?.status
			if (st?.ready && st.lifecycle === 'running' && st.runId) {
				step1.value = {
					status: 'ok',
					detail: `运行中 · 127.0.0.1:${dshProfile.value?.port || st?.port || '—'}`
				}
				return true
			}
			step1.value = {
				status: 'fail',
				detail: 'DSH 服务未运行，点击右侧按钮启动'
			}
			return false
		} catch (err) {
			console.error('[DirectorConsole:envCheck] checkStep1 异常', err)
			step1.value = { status: 'fail', detail: '检查失败' }
			return false
		}
	}

	/** Step 1 解决方案：启动 DSH 服务 */
	async function startDshService(): Promise<boolean> {
		const profile = dshProfile.value || (await fetchDshProfile())
		if (!profile) {
			step1.value = {
				status: 'fail',
				detail: '未找到 DSH profile，请先在服务页创建'
			}
			return false
		}
		step1.value = { status: 'checking', detail: '正在启动 DSH 服务…' }
		try {
			console.log('[DirectorConsole:envCheck] startDshService 调用 start, profile=', profile)
			const result = await deepseekHarness.start({
				profileId: profile.id || '',
				expectedRevision: profile.revision || 0
			})
			console.log('[DirectorConsole:envCheck] startDshService start 返回', result)
			// 轮询等待服务就绪（最多 30 秒）
			for (let i = 0; i < 30; i++) {
				await new Promise((r) => setTimeout(r, 1000))
				const snap = await deepseekHarness.snapshot()
				const st = snap?.status
				if (st?.ready && st.lifecycle === 'running' && st.runId) {
					step1.value = {
						status: 'ok',
						detail: `运行中 · 127.0.0.1:${profile.port || st?.port || '—'}`
					}
					return true
				}
				if (st?.lifecycle === 'error') {
					step1.value = {
						status: 'fail',
						detail: `启动失败：${st.lastError || '未知错误'}`
					}
					return false
				}
			}
			step1.value = {
				status: 'fail',
				detail: '启动超时，请检查 DSH profile 配置'
			}
			return false
		} catch (err: any) {
			console.error('[DirectorConsole:envCheck] startDshService 异常', err)
			step1.value = {
				status: 'fail',
				detail: `启动失败：${err?.message || '未知错误'}`
			}
			return false
		}
	}

	/** Step 2: 检查 DSH 插件是否已安装（不检查版本号） */
	async function checkStep2(): Promise<boolean> {
		step2.value = { status: 'checking', detail: '正在检查…' }
		const profile = dshProfile.value || (await fetchDshProfile())
		if (!profile?.localPath) {
			step2.value = {
				status: 'fail',
				detail: '无法获取 DSH profile 路径，请先创建 profile'
			}
			return false
		}
		const checkFn = (window as any).dweb?.window?.directorConsoleCheckDshConfig
		if (typeof checkFn !== 'function') {
			console.error('[DirectorConsole:envCheck] directorConsoleCheckDshConfig 不可用')
			step2.value = {
				status: 'fail',
				detail: '插件检查 API 不可用（preload 未注入）'
			}
			return false
		}
		try {
			const result = await checkFn({ localPath: profile.localPath })
			console.log('[DirectorConsole:envCheck] checkStep2 返回', result)
			if (result?.installed) {
				step2.value = {
					status: 'ok',
					detail: '插件已安装（可点击"重新安装"更新）'
				}
				return true
			}
			step2.value = {
				status: 'fail',
				detail: '插件未安装，点击右侧按钮安装'
			}
			return false
		} catch (err: any) {
			console.error('[DirectorConsole:envCheck] checkStep2 异常', err)
			step2.value = { status: 'fail', detail: err?.message || '检查失败' }
			return false
		}
	}

	/** Step 2: 安装/重新安装插件，安装后自动重启 DSH */
	async function installPlugin(): Promise<boolean> {
		const profile = dshProfile.value || (await fetchDshProfile())
		if (!profile?.localPath) return false

		const writeFn = (window as any).dweb?.window?.directorConsoleWriteDshConfig
		if (typeof writeFn !== 'function') {
			console.error('[DirectorConsole:envCheck] directorConsoleWriteDshConfig 不可用')
			step2.value = {
				status: 'fail',
				detail: '插件安装 API 不可用（preload 未注入）'
			}
			return false
		}

		step2.value = { status: 'checking', detail: '正在安装插件…' }
		try {
			const result = await writeFn({ localPath: profile.localPath })
			console.log('[DirectorConsole:envCheck] installPlugin 返回', result)
			if (!result?.ok) {
				step2.value = {
					status: 'fail',
					detail: result?.error || '安装失败'
				}
				return false
			}

			// 安装成功，自动重启 DSH 服务
			step2.value = { status: 'checking', detail: '插件已安装，正在重启 DSH 服务…' }
			try {
				// 先获取当前快照，拿到 runId
				const snap = await deepseekHarness.snapshot()
				const runId = snap?.status?.runId || null
				console.log('[DirectorConsole:envCheck] restart DSH, runId=', runId)
				await deepseekHarness.restart({
					profileId: profile.id || '',
					expectedRevision: profile.revision || 0,
					runId
				})
				// 轮询等待服务就绪（最多 30 秒）
				for (let i = 0; i < 30; i++) {
					await new Promise((r) => setTimeout(r, 1000))
					const snap2 = await deepseekHarness.snapshot()
					const st = snap2?.status
					if (st?.ready && st.lifecycle === 'running' && st.runId) {
						step1.value = {
							status: 'ok',
							detail: `运行中 · 127.0.0.1:${profile.port || st?.port || '—'}`
						}
						step2.value = {
							status: 'ok',
							detail: '插件已安装，DSH 已重启'
						}
						return true
					}
					if (st?.lifecycle === 'error') {
						step1.value = { status: 'fail', detail: 'DSH 重启失败' }
						step2.value = {
							status: 'fail',
							detail: `DSH 重启失败：${st.lastError || '未知错误'}`
						}
						return false
					}
				}
				step2.value = {
					status: 'ok',
					detail: '插件已安装，DSH 重启超时（请手动检查）'
				}
				return true
			} catch (restartErr: any) {
				console.error('[DirectorConsole:envCheck] DSH 重启异常', restartErr)
				step2.value = {
					status: 'ok',
					detail: '插件已安装，但 DSH 重启失败，请手动重启'
				}
				return true
			}
		} catch (err: any) {
			console.error('[DirectorConsole:envCheck] installPlugin 异常', err)
			step2.value = {
				status: 'fail',
				detail: err?.message || '安装失败'
			}
			return false
		}
	}

	/** Step 3: 检查 DSH 已配置模型是否支持图片输入 */
	async function checkStep3(): Promise<boolean> {
		step3.value = { status: 'checking', detail: '正在检查…' }
		const checkFn = (window as any).dweb?.window?.directorConsoleCheckModelVision
		if (typeof checkFn !== 'function') {
			step3.value = {
				status: 'fail',
				detail: '模型检查 API 不可用（preload 未注入）'
			}
			return false
		}
		try {
			const result = await checkFn()
			console.log('[DirectorConsole:envCheck] checkStep3 返回', result)
			if (!result?.ok) {
				step3.value = {
					status: 'fail',
					detail: result?.error || '检查失败'
				}
				return false
			}
			if (result.allHaveVision) {
				step3.value = {
					status: 'ok',
					detail: `${result.totalModels} 个模型均支持图片输入`
				}
				return true
			}
			const missing = result.missingVision?.map((m: any) => m.id).join(', ') || ''
			step3.value = {
				status: 'fail',
				detail: `${result.missingVision?.length || 0}/${result.totalModels} 个模型缺少图片输入支持（${missing}），点击右侧按钮修复`
			}
			return false
		} catch (err: any) {
			console.error('[DirectorConsole:envCheck] checkStep3 异常', err)
			step3.value = { status: 'fail', detail: err?.message || '检查失败' }
			return false
		}
	}

	/** Step 3: 一键修复——为所有缺少 input: [text, image] 的模型添加该声明 */
	async function fixModelVision(): Promise<boolean> {
		const fixFn = (window as any).dweb?.window?.directorConsoleFixModelVision
		if (typeof fixFn !== 'function') {
			step3.value = {
				status: 'fail',
				detail: '修复 API 不可用（preload 未注入）'
			}
			return false
		}
		step3.value = { status: 'checking', detail: '正在修复模型配置…' }
		try {
			const result = await fixFn()
			console.log('[DirectorConsole:envCheck] fixModelVision 返回', result)
			if (!result?.ok) {
				step3.value = {
					status: 'fail',
					detail: result?.error || '修复失败'
				}
				return false
			}
			if (result.action === 'noop') {
				step3.value = {
					status: 'ok',
					detail: '所有模型已支持图片输入'
				}
				return true
			}
			step3.value = {
				status: 'ok',
				detail: result.message || `已修复 ${result.fixedCount} 个模型`
			}
			return true
		} catch (err: any) {
			console.error('[DirectorConsole:envCheck] fixModelVision 异常', err)
			step3.value = { status: 'fail', detail: err?.message || '修复失败' }
			return false
		}
	}

	/** 重新检查指定步骤 */
	async function recheckStep(step: 1 | 2 | 3): Promise<void> {
		if (step === 1) await checkStep1()
		else if (step === 2) await checkStep2()
		else if (step === 3) await checkStep3()
	}

	/** 重置所有步骤状态（用于二次进入时强制重新检查） */
	function resetChecks() {
		step1.value = { status: 'pending', detail: '' }
		step2.value = { status: 'pending', detail: '' }
		step3.value = { status: 'pending', detail: '' }
	}

	/** 按顺序执行所有检查步骤 */
	async function runAllChecks(): Promise<void> {
		await fetchDshProfile()
		await checkStep1()
		await checkStep2()
		await checkStep3()
	}

	return {
		step1,
		step2,
		step3,
		allReady,
		dshProfile,
		checkStep1,
		checkStep2,
		checkStep3,
		startDshService,
		installPlugin,
		fixModelVision,
		recheckStep,
		resetChecks,
		runAllChecks
	}
}
