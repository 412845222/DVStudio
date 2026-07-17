import { ref, nextTick } from 'vue'
import type {
	ComfyInstallMode,
	ComfyInstallType,
	ComfyPathValidation,
	ComfyInstallProbeResult,
	ComfyEnvCheckResult,
	ComfySetupConfig,
	ComfyCheckItem,
	ComfyMirrorPingResult,
	ComfyMirrorSource,
	ComfyMirrorListResult,
	PythonEnvSetupEvent,
} from '../electronBridge/types'

const dweb = (window as any).dweb

function cloneValue<T>(v: T): T {
	if (v === null || v === undefined) return v
	return JSON.parse(JSON.stringify(v))
}

function getDefaultConfig(): ComfySetupConfig {
	return {
		installMode: 'existing',
		installPath: '',
		port: 8188,
		autoStart: false,
		mirror: 'github',
		extraArgs: [],
	}
}

export function useComfyUISetup() {
	const installPath = ref<string>('')
	const defaultInstallPath = ref<string>('')
	const pathValidation = ref<ComfyPathValidation | null>(null)
	const probeResult = ref<ComfyInstallProbeResult | null>(null)
	const probing = ref(false)
	const pathChanging = ref(false)

	const checking = ref(false)
	const envResult = ref<ComfyEnvCheckResult | null>(null)

	const logs = ref<string[]>([])
	const installing = ref(false)

	const serviceRunning = ref(false)
	const serviceStarting = ref(false)
	const serviceStartingError = ref('')

	const config = ref<ComfySetupConfig>(getDefaultConfig())
	const saving = ref(false)
	const customModelPaths = ref<string[]>([])

	const pingingMirrors = ref(false)
	const mirrorPingResults = ref<ComfyMirrorPingResult[]>([])
	const pypiMirrorList = ref<ComfyMirrorSource[]>([])
	const torchMirrorList = ref<ComfyMirrorSource[]>([])
	const selectedPypiMirror = ref<string>('auto')
	const selectedTorchMirror = ref<string>('auto')
	const customPypiUrl = ref<string>('')
	const customTorchUrl = ref<string>('')
	const mirrorSaving = ref(false)
	const mirrorSaveMessage = ref('')

	const fixingPython = ref(false)
	const pythonFixStep = ref<string>('')
	const pythonFixMessage = ref<string>('')
	const pythonFixLogs = ref<Array<{ id: number; stream: string; message: string; overwrite?: boolean }>>([])
	const pythonProgressLine = ref<{ id: number; stream: string; message: string } | null>(null)
	const pythonFixError = ref<string>('')
	const pythonFixDone = ref(false)
	const logsUpdated = ref(0)
	let logIdCounter = 0

	const venvPath = ref<string>('')
	const defaultVenvPath = ref<string>('')
	const selectingVenvPath = ref(false)

	async function loadDefaultPath() {
		try {
			const r = await dweb.comfyui.setup.getDefaultInstallPath()
			if (r?.path) {
				defaultInstallPath.value = r.path
				if (!installPath.value) {
					installPath.value = r.path
				}
			}
		} catch (e) {
			console.warn('[ComfySetup] loadDefaultPath failed:', e)
		}
	}

	async function loadDefaultVenvPath() {
		try {
			const r = await dweb.comfyui.setup.getDefaultVenvPath()
			if (r?.ok) {
				defaultVenvPath.value = r.path
				venvPath.value = r.currentPath || r.path
			}
		} catch (e) {
			console.warn('[ComfySetup] loadDefaultVenvPath failed:', e)
		}
	}

	async function selectVenvPath() {
		selectingVenvPath.value = true
		try {
			const r = await dweb.comfyui.setup.selectVenvPath({
				defaultPath: venvPath.value || defaultVenvPath.value,
			})
			if (!r.canceled && r.path) {
				venvPath.value = r.path
				await dweb.comfyui.setup.setVenvPath({ path: r.path })
			}
		} finally {
			selectingVenvPath.value = false
		}
	}

	async function resetVenvPath() {
		venvPath.value = defaultVenvPath.value
		await dweb.comfyui.setup.setVenvPath({ path: '' })
	}

	async function selectPath() {
		pathChanging.value = true
		try {
			const r = await dweb.comfyui.setup.selectInstallPath({
				title: '选择 ComfyUI 目录',
				defaultPath: defaultInstallPath.value,
			})
			if (!r.canceled && r.path) {
				await setInstallPath(r.path)
			}
		} finally {
			pathChanging.value = false
		}
	}

	async function setInstallPath(p: string) {
		installPath.value = p
		probeResult.value = null
		pathValidation.value = null

		try {
			const v = await dweb.comfyui.setup.validatePath({ path: p })
			pathValidation.value = v
		} catch {}

		await probePath(p)
		await checkEnv()
		saveConfig()
	}

	async function probePath(p: string) {
		probing.value = true
		probeResult.value = null
		try {
			const r = await dweb.comfyui.setup.probeExistingInstall({ path: p })
			probeResult.value = r
			return r
		} catch (e) {
			console.warn('[ComfySetup] probe failed:', e)
			return null
		} finally {
			probing.value = false
		}
	}

	function resetToDefaultPath() {
		installPath.value = defaultInstallPath.value
		probeResult.value = null
		pathValidation.value = null
		setInstallPath(installPath.value)
	}

	async function checkEnv() {
		checking.value = true
		try {
			const r = await dweb.comfyui.setup.checkEnv({ installPath: installPath.value || undefined })
			envResult.value = r
			serviceRunning.value = !!r?.serviceRunning
		} catch (e) {
			console.warn('[ComfySetup] checkEnv failed:', e)
		} finally {
			checking.value = false
		}
	}

	async function openInstallFolder() {
		if (installPath.value) {
			await dweb.comfyui.setup.openFolder({ path: installPath.value })
		}
	}

	async function loadConfig() {
		try {
			const r = await dweb.comfyui.setup.getConfig()
			if (r) {
				config.value = { ...getDefaultConfig(), ...r }
				installPath.value = r.installPath || ''
				customModelPaths.value = Array.isArray(r.customModelPaths) ? r.customModelPaths : []
				selectedPypiMirror.value = r.pypiMirror || 'auto'
				selectedTorchMirror.value = r.torchMirror || 'auto'
				customPypiUrl.value = r.customPypiMirrorUrl || ''
				customTorchUrl.value = r.customTorchMirrorUrl || ''
				if (r.venvPath) {
					venvPath.value = r.venvPath
				}
			}
		} catch (e) {
			console.warn('[ComfySetup] loadConfig failed:', e)
		}
	}

	async function loadMirrorList() {
		try {
			const r = await dweb.comfyui.setup.getMirrorList() as ComfyMirrorListResult
			if (r?.ok) {
				pypiMirrorList.value = r.pypiMirrors || []
				torchMirrorList.value = r.torchMirrors || []
			}
		} catch (e) {
			console.warn('[ComfySetup] loadMirrorList failed:', e)
		}
	}

	async function addCustomModelPath() {
		try {
			const r = await dweb.comfyui.setup.selectModelPath()
			if (r?.canceled || !r?.path) return
			const addRes = await dweb.comfyui.setup.addCustomModelPath({ path: r.path })
			if (addRes?.ok && Array.isArray(addRes.customModelPaths)) {
				customModelPaths.value = addRes.customModelPaths
				if (installPath.value) {
					await probePath(installPath.value)
				}
			}
		} catch (e) {
			console.warn('[ComfySetup] addCustomModelPath failed:', e)
		}
	}

	async function removeCustomModelPath(modelPath: string) {
		try {
			const r = await dweb.comfyui.setup.removeCustomModelPath({ path: modelPath })
			if (r?.ok && Array.isArray(r.customModelPaths)) {
				customModelPaths.value = r.customModelPaths
				if (installPath.value) {
					await probePath(installPath.value)
				}
			}
		} catch (e) {
			console.warn('[ComfySetup] removeCustomModelPath failed:', e)
		}
	}

	async function saveConfig() {
		saving.value = true
		try {
			await dweb.comfyui.setup.saveConfig({
				installPath: installPath.value,
			})
		} finally {
			saving.value = false
		}
	}

	async function startService() {
		serviceStarting.value = true
		serviceStartingError.value = ''
		try {
			const payload = cloneValue({
				installPath: installPath.value,
				port: config.value.port,
				extraArgs: config.value.extraArgs,
			})
			const r = await dweb.comfyui.setup.startService(payload)
			if (r?.ok) {
				serviceRunning.value = true
			} else {
				serviceStartingError.value = r?.error || '启动失败'
			}
			return r
		} catch (e: any) {
			serviceStartingError.value = e?.message || String(e)
			console.warn('[ComfySetup] startService failed:', e)
			return { ok: false, error: serviceStartingError.value }
		} finally {
			serviceStarting.value = false
		}
	}

	async function stopService() {
		try {
			await dweb.comfyui.setup.stopService()
			serviceRunning.value = false
		} catch (e) {
			console.warn('[ComfySetup] stopService failed:', e)
		}
	}

	async function pingMirrors() {
		pingingMirrors.value = true
		mirrorPingResults.value = []
		try {
			const r = await dweb.comfyui.setup.pingMirrors()
			if (r?.ok && Array.isArray(r.results)) {
				mirrorPingResults.value = r.results
			}
		} catch (e) {
			console.warn('[ComfySetup] pingMirrors failed:', e)
		} finally {
			pingingMirrors.value = false
		}
	}

	async function saveMirrorConfig() {
		mirrorSaving.value = true
		mirrorSaveMessage.value = ''
		try {
			const r = await dweb.comfyui.setup.setMirror(cloneValue({
				pypiMirror: selectedPypiMirror.value,
				torchMirror: selectedTorchMirror.value,
				customPypiMirrorUrl: selectedPypiMirror.value === 'custom' ? customPypiUrl.value : undefined,
				customTorchMirrorUrl: selectedTorchMirror.value === 'custom' ? customTorchUrl.value : undefined,
			}))
			if (r?.ok) {
				mirrorSaveMessage.value = 'ok'
				setTimeout(() => { mirrorSaveMessage.value = '' }, 2000)
			} else {
				mirrorSaveMessage.value = r?.error || '保存失败'
			}
		} catch (e: any) {
			mirrorSaveMessage.value = e?.message || String(e)
		} finally {
			mirrorSaving.value = false
		}
	}

	async function fixPythonEnv(forceRecreate = false) {
		fixingPython.value = true
		pythonFixStep.value = 'preparing'
		pythonFixMessage.value = '准备配置...'
		pythonFixLogs.value = []
		pythonProgressLine.value = null
		pythonFixError.value = ''
		pythonFixDone.value = false
		logIdCounter = 0
		try {
			const gen = dweb.comfyui.setup.fixPythonEnv(cloneValue({
				installPath: installPath.value,
				forceRecreate,
				venvPath: venvPath.value || undefined,
			}))
			for await (const event of gen as AsyncIterable<PythonEnvSetupEvent>) {
				if (event.type === 'step') {
					pythonFixStep.value = event.step || ''
					pythonFixMessage.value = event.message || ''
					if (pythonProgressLine.value) {
						pythonFixLogs.value.push({ ...pythonProgressLine.value })
						pythonProgressLine.value = null
					}
				} else if (event.type === 'log') {
					const entry = { id: ++logIdCounter, stream: event.stream || 'stdout', message: event.message || '' }
					if (event.overwrite) {
						pythonProgressLine.value = entry
					} else {
						if (pythonProgressLine.value) {
							pythonFixLogs.value.push({ ...pythonProgressLine.value })
							pythonProgressLine.value = null
						}
						pythonFixLogs.value.push(entry)
					}
					logsUpdated.value++
				} else if (event.type === 'error') {
					if (pythonProgressLine.value) {
						pythonFixLogs.value.push({ ...pythonProgressLine.value })
						pythonProgressLine.value = null
					}
					pythonFixError.value = event.message || '配置失败'
					break
				} else if (event.type === 'done') {
					if (pythonProgressLine.value) {
						pythonFixLogs.value.push({ ...pythonProgressLine.value })
						pythonProgressLine.value = null
					}
					pythonFixStep.value = 'done'
					pythonFixMessage.value = event.message || '配置完成'
					pythonFixDone.value = true
				}
			}
		} catch (e: any) {
			pythonFixError.value = e?.message || String(e)
		} finally {
			fixingPython.value = false
			await checkEnv()
			if (installPath.value) {
				await new Promise(r => setTimeout(r, 500))
				await probePath(installPath.value)
			}
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'ok': return '✓'
			case 'warn': return '⚠'
			case 'error': return '✗'
			case 'checking': return '⋯'
			default: return '?'
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'ok': return '#4ade80'
			case 'warn': return '#facc15'
			case 'error': return '#f87171'
			case 'checking': return '#60a5fa'
			default: return '#6b7280'
		}
	}

	return {
		installPath, defaultInstallPath, pathValidation,
		probeResult, probing, pathChanging,
		checking, envResult,
		logs, installing,
		serviceRunning, serviceStarting, serviceStartingError,
		config, saving,
		customModelPaths,
		pingingMirrors, mirrorPingResults, pypiMirrorList, torchMirrorList,
		selectedPypiMirror, selectedTorchMirror,
		customPypiUrl, customTorchUrl, mirrorSaving, mirrorSaveMessage,
		fixingPython, pythonFixStep, pythonFixMessage, pythonFixLogs, pythonProgressLine, pythonFixError, pythonFixDone, logsUpdated,
		venvPath, defaultVenvPath, selectingVenvPath,
		loadDefaultPath, loadDefaultVenvPath, selectPath, selectVenvPath, resetVenvPath, setInstallPath, probePath, resetToDefaultPath,
		checkEnv, openInstallFolder, loadConfig, loadMirrorList, saveConfig,
		addCustomModelPath, removeCustomModelPath,
		startService, stopService,
		pingMirrors, saveMirrorConfig, fixPythonEnv,
		getStatusIcon, getStatusColor,
	}
}
