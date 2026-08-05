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
	PythonEnvSetupEvent
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
		extraArgs: []
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
	const pythonFixLogs = ref<
		Array<{ id: number; stream: string; message: string; overwrite?: boolean }>
	>([])
	const pythonProgressLine = ref<{ id: number; stream: string; message: string } | null>(null)
	const pythonFixError = ref<string>('')
	const pythonFixDone = ref(false)
	const pythonNeedsManualInstall = ref(false)
	const pythonManualDownloadUrl = ref('')
	const pythonOfficialDownloadUrl = ref('')
	const pythonCudaVersion = ref('')
	const pythonDetectedVersion = ref('')
	const pythonPlatformTag = ref('')
	const pythonAbiTag = ref('')
	const pythonTorchVersion = ref('')
	const pythonTorchWheel = ref('')
	const pythonTorchvisionWheel = ref('')
	const pythonTorchaudioWheel = ref('')
	const pythonAliyunTorchUrl = ref('')
	const pythonAliyunTorchvisionUrl = ref('')
	const pythonAliyunTorchaudioUrl = ref('')
	const pythonOfficialTorchUrl = ref('')
	const pythonOfficialTorchvisionUrl = ref('')
	const pythonOfficialTorchaudioUrl = ref('')
	const pythonVenvPythonPath = ref('')
	const pythonOneClickInstallCmd = ref('')
	const pythonManualInstallCmd = ref('')
	const pythonInstallDepsCmd = ref('')
	const pythonAliyunDirUrl = ref('')
	const pythonOfficialDirUrl = ref('')
	const pythonAutoInstallAvailable = ref(false)
	const autoInstallingTorch = ref(false)
	const clearingVenv = ref(false)
	const logsUpdated = ref(0)
	let logIdCounter = 0

	const venvPath = ref<string>('')
	const defaultVenvPath = ref<string>('')
	const selectingVenvPath = ref(false)

	const cloningComfyUI = ref(false)
	const cloneStep = ref<string>('')
	const cloneMessage = ref<string>('')
	const cloneLogs = ref<Array<{ id: number; stream: string; message: string }>>([])
	const cloneError = ref<string>('')
	const cloneDone = ref(false)

	const updatingComfyUI = ref(false)
	const updateStep = ref<string>('')
	const updateMessage = ref<string>('')
	const updateLogs = ref<Array<{ id: number; stream: string; message: string }>>([])
	const updateError = ref<string>('')
	const updateDone = ref(false)
	const updateNeedDepUpdate = ref(false)

	const versionChecking = ref(false)
	const versionUpdateInfo = ref<{
		currentVersion?: string
		currentCommit?: string
		latestTag?: string
		upstreamCommit?: string
		updateAvailable: boolean
		isGitRepo: boolean
		error?: string
		releaseUrl?: string
	} | null>(null)

	const freshInstallMode = ref(false)

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
			const r = await dweb.comfyui.setup.getDefaultVenvPath({
				installPath: installPath.value
			})
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
				installPath: installPath.value,
				defaultPath: venvPath.value || defaultVenvPath.value
			})
			if (!r.canceled && r.path) {
				const setR = await dweb.comfyui.setup.setVenvPath({ path: r.path })
				if (setR?.ok === false && setR.venvPath) {
					venvPath.value = setR.venvPath
				} else {
					venvPath.value = r.path
				}
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
			const selectOptions: any = {
				title: freshInstallMode.value ? '选择 ComfyUI 安装目录' : '选择 ComfyUI 目录'
			}
			if (!freshInstallMode.value && defaultInstallPath.value) {
				selectOptions.defaultPath = defaultInstallPath.value
			}
			const r = await dweb.comfyui.setup.selectInstallPath(selectOptions)
			if (!r.canceled && r.path) {
				if (freshInstallMode.value) {
					await setFreshInstallPath(r.path)
				} else {
					await setInstallPath(r.path)
				}
			}
		} finally {
			pathChanging.value = false
		}
	}

	async function setFreshInstallPath(p: string) {
		installPath.value = p
		probeResult.value = null
		pathValidation.value = null
		versionUpdateInfo.value = null

		try {
			const v = await dweb.comfyui.setup.validatePath({ path: p })
			pathValidation.value = v
		} catch {}

		const probe = await probePath(p)
		if (probe?.isComfyUI) {
			checkVersionUpdate()
		}
		await checkEnv()
	}

	async function setInstallPath(p: string) {
		installPath.value = p
		probeResult.value = null
		pathValidation.value = null
		versionUpdateInfo.value = null
		freshInstallMode.value = false

		await loadDefaultVenvPath()

		try {
			const v = await dweb.comfyui.setup.validatePath({ path: p })
			pathValidation.value = v
		} catch {}

		const probe = await probePath(p)
		if (probe?.isComfyUI) {
			checkVersionUpdate()
		}
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

	async function checkVersionUpdate() {
		if (!installPath.value) return
		versionChecking.value = true
		versionUpdateInfo.value = null
		try {
			const r = await dweb.comfyui.setup.checkVersion({ installPath: installPath.value })
			if (r?.ok) {
				versionUpdateInfo.value = r
			} else {
				versionUpdateInfo.value = {
					updateAvailable: false,
					isGitRepo: false,
					error: r?.error || '检查失败'
				}
			}
		} catch (e) {
			versionUpdateInfo.value = { updateAvailable: false, isGitRepo: false, error: '检查更新失败' }
		} finally {
			versionChecking.value = false
		}
	}

	async function resetForFreshInstall() {
		try {
			await dweb.comfyui.setup.resetFresh()
		} catch {}
		freshInstallMode.value = true
		installPath.value = ''
		probeResult.value = null
		pathValidation.value = null
		envResult.value = null
		customModelPaths.value = []
		versionUpdateInfo.value = null
		selectedPypiMirror.value = 'auto'
		selectedTorchMirror.value = 'auto'
		customPypiUrl.value = ''
		customTorchUrl.value = ''
		serviceRunning.value = false
	}

	function exitFreshInstallMode() {
		freshInstallMode.value = false
		loadConfig()
	}

	async function confirmFreshInstall() {
		if (!installPath.value) return
		await dweb.comfyui.setup.saveConfig({
			installPath: installPath.value
		})
		freshInstallMode.value = false
		await saveConfig()
		await setInstallPath(installPath.value)
	}

	async function checkEnv() {
		checking.value = true
		try {
			const r = await dweb.comfyui.setup.checkEnv({ installPath: installPath.value || undefined })
			envResult.value = r
			serviceRunning.value = !!r?.serviceRunning
		} catch (e) {
			console.warn('[ComfySetup] checkEnv failed:', e)
		}
		try {
			if (installPath.value) {
				await probePath(installPath.value)
			}
		} catch (e) {
			console.warn('[ComfySetup] probePath after checkEnv failed:', e)
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
				if (!installPath.value) {
					freshInstallMode.value = true
				} else {
					freshInstallMode.value = false
				}
			}
		} catch (e) {
			console.warn('[ComfySetup] loadConfig failed:', e)
		}
	}

	async function loadMirrorList() {
		try {
			const r = (await dweb.comfyui.setup.getMirrorList()) as ComfyMirrorListResult
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
				installPath: installPath.value
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
				extraArgs: config.value.extraArgs
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
			const r = await dweb.comfyui.setup.setMirror(
				cloneValue({
					pypiMirror: selectedPypiMirror.value,
					torchMirror: selectedTorchMirror.value,
					customPypiMirrorUrl:
						selectedPypiMirror.value === 'custom' ? customPypiUrl.value : undefined,
					customTorchMirrorUrl:
						selectedTorchMirror.value === 'custom' ? customTorchUrl.value : undefined
				})
			)
			if (r?.ok) {
				mirrorSaveMessage.value = 'ok'
				setTimeout(() => {
					mirrorSaveMessage.value = ''
				}, 2000)
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
		pythonNeedsManualInstall.value = false
		pythonAutoInstallAvailable.value = false
		pythonManualDownloadUrl.value = ''
		pythonOfficialDownloadUrl.value = ''
		pythonCudaVersion.value = ''
		pythonDetectedVersion.value = ''
		pythonPlatformTag.value = ''
		pythonAbiTag.value = ''
		pythonTorchVersion.value = ''
		pythonTorchWheel.value = ''
		pythonTorchvisionWheel.value = ''
		pythonTorchaudioWheel.value = ''
		pythonAliyunTorchUrl.value = ''
		pythonAliyunTorchvisionUrl.value = ''
		pythonAliyunTorchaudioUrl.value = ''
		pythonOfficialTorchUrl.value = ''
		pythonOfficialTorchvisionUrl.value = ''
		pythonOfficialTorchaudioUrl.value = ''
		pythonVenvPythonPath.value = ''
		pythonOneClickInstallCmd.value = ''
		pythonManualInstallCmd.value = ''
		pythonInstallDepsCmd.value = ''
		pythonAliyunDirUrl.value = ''
		pythonOfficialDirUrl.value = ''
		logIdCounter = 0
		try {
			const gen = dweb.comfyui.setup.fixPythonEnv(
				cloneValue({
					installPath: installPath.value,
					forceRecreate,
					venvPath: venvPath.value || undefined
				})
			)
			for await (const event of gen as AsyncIterable<PythonEnvSetupEvent>) {
				if (event.type === 'step') {
					pythonFixStep.value = event.step || ''
					pythonFixMessage.value = event.message || ''
					if (pythonProgressLine.value) {
						pythonFixLogs.value.push({ ...pythonProgressLine.value })
						pythonProgressLine.value = null
					}
				} else if (event.type === 'log') {
					const entry = {
						id: ++logIdCounter,
						stream: event.stream || 'stdout',
						message: event.message || ''
					}
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
					pythonNeedsManualInstall.value = !!event.needsManualInstall
					pythonAutoInstallAvailable.value =
						event.autoInstallAvailable !== false && !!event.needsManualInstall
					pythonManualDownloadUrl.value = event.manualDownloadUrl || ''
					pythonOfficialDownloadUrl.value = event.officialDownloadUrl || ''
					pythonCudaVersion.value = event.cudaVersion || ''
					pythonDetectedVersion.value = event.pythonVersion || ''
					pythonPlatformTag.value = event.platformTag || ''
					pythonAbiTag.value = event.abiTag || ''
					pythonTorchVersion.value = event.torchVersion || ''
					pythonTorchWheel.value = event.torchWheel || ''
					pythonTorchvisionWheel.value = event.torchvisionWheel || ''
					pythonTorchaudioWheel.value = event.torchaudioWheel || ''
					pythonAliyunTorchUrl.value = event.aliyunTorchUrl || ''
					pythonAliyunTorchvisionUrl.value = event.aliyunTorchvisionUrl || ''
					pythonAliyunTorchaudioUrl.value = event.aliyunTorchaudioUrl || ''
					pythonOfficialTorchUrl.value = event.officialTorchUrl || ''
					pythonOfficialTorchvisionUrl.value = event.officialTorchvisionUrl || ''
					pythonOfficialTorchaudioUrl.value = event.officialTorchaudioUrl || ''
					pythonVenvPythonPath.value = event.venvPythonPath || ''
					pythonOneClickInstallCmd.value = event.oneClickInstallCmd || ''
					pythonManualInstallCmd.value = event.manualInstallCmd || ''
					pythonInstallDepsCmd.value = event.installDepsCmd || ''
					pythonAliyunDirUrl.value = event.aliyunDirUrl || ''
					pythonOfficialDirUrl.value = event.officialDirUrl || ''
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
				await new Promise((r) => setTimeout(r, 500))
				await probePath(installPath.value)
			}
		}
	}

	async function cloneComfyUI() {
		if (cloningComfyUI.value) return
		cloningComfyUI.value = true
		cloneStep.value = 'preparing'
		cloneMessage.value = '准备安装...'
		cloneLogs.value = []
		cloneError.value = ''
		cloneDone.value = false
		logIdCounter = 0
		try {
			const gen = dweb.comfyui.setup.cloneComfyUI({
				installPath: installPath.value
			})
			for await (const event of gen as AsyncIterable<{
				type: string
				step?: string
				message?: string
				stream?: string
				error?: string
			}>) {
				if (event.type === 'step') {
					cloneStep.value = event.step || ''
					cloneMessage.value = event.message || ''
				} else if (event.type === 'log') {
					cloneLogs.value.push({
						id: ++logIdCounter,
						stream: event.stream || 'stdout',
						message: event.message || ''
					})
					logsUpdated.value++
				} else if (event.type === 'error') {
					cloneError.value = event.message || '安装失败'
					break
				} else if (event.type === 'done') {
					cloneStep.value = 'done'
					cloneMessage.value = event.message || '安装完成'
					cloneDone.value = true
				}
			}
		} catch (e: any) {
			cloneError.value = e?.message || String(e)
		} finally {
			cloningComfyUI.value = false
			await loadConfig()
			await checkEnv()
			if (installPath.value) {
				await new Promise((r) => setTimeout(r, 500))
				await probePath(installPath.value)
				if (envResult.value?.comfyUIFound) {
					await checkVersionUpdate()
					if (!cloneError.value) {
						await fixPythonEnv(false)
					}
				}
			}
		}
	}

	async function updateComfyUI() {
		if (updatingComfyUI.value) return
		updatingComfyUI.value = true
		updateStep.value = 'preparing'
		updateMessage.value = '准备更新...'
		updateLogs.value = []
		updateError.value = ''
		updateDone.value = false
		updateNeedDepUpdate.value = false
		logIdCounter = 0
		try {
			const gen = dweb.comfyui.setup.updateComfyUI({
				installPath: installPath.value
			})
			for await (const event of gen as AsyncIterable<{
				type: string
				step?: string
				message?: string
				stream?: string
				error?: string
				needDepUpdate?: boolean
			}>) {
				if (event.type === 'step') {
					updateStep.value = event.step || ''
					updateMessage.value = event.message || ''
				} else if (event.type === 'log') {
					updateLogs.value.push({
						id: ++logIdCounter,
						stream: event.stream || 'stdout',
						message: event.message || ''
					})
					logsUpdated.value++
				} else if (event.type === 'error') {
					updateError.value = event.message || '更新失败'
					break
				} else if (event.type === 'done') {
					updateStep.value = 'done'
					updateMessage.value = event.message || '更新完成'
					updateDone.value = true
					updateNeedDepUpdate.value = !!event.needDepUpdate
				}
			}
		} catch (e: any) {
			updateError.value = e?.message || String(e)
		} finally {
			updatingComfyUI.value = false
			await loadConfig()
			await checkEnv()
			if (installPath.value) {
				await new Promise((r) => setTimeout(r, 500))
				await probePath(installPath.value)
				await checkVersionUpdate()
				if (updateNeedDepUpdate.value && !updateError.value) {
					await fixPythonEnv(false)
				}
			}
		}
	}

	async function autoInstallTorch() {
		if (autoInstallingTorch.value) return
		autoInstallingTorch.value = true
		pythonFixLogs.value = []
		pythonProgressLine.value = null
		pythonFixError.value = ''
		pythonFixDone.value = false
		pythonNeedsManualInstall.value = false
		pythonAutoInstallAvailable.value = false
		logIdCounter = pythonFixLogs.value.length
		try {
			const gen = dweb.comfyui.setup.autoInstallTorch({
				installPath: installPath.value
			})
			for await (const event of gen as AsyncIterable<{
				type: string
				step?: string
				message?: string
				stream?: string
				error?: string
				overwrite?: boolean
				needsManualInstall?: boolean
				autoInstallAvailable?: boolean
				oneClickInstallCmd?: string
			}>) {
				if (event.type === 'step') {
					pythonFixStep.value = event.step || ''
					pythonFixMessage.value = event.message || ''
					if (pythonProgressLine.value) {
						pythonFixLogs.value.push({ ...pythonProgressLine.value })
						pythonProgressLine.value = null
					}
				} else if (event.type === 'log') {
					const entry = {
						id: ++logIdCounter,
						stream: event.stream || 'stdout',
						message: event.message || ''
					}
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
					pythonFixError.value = event.message || '安装失败'
					pythonNeedsManualInstall.value = !!event.needsManualInstall
					pythonAutoInstallAvailable.value = false
					if (event.oneClickInstallCmd) {
						pythonOneClickInstallCmd.value = event.oneClickInstallCmd
					}
				} else if (event.type === 'done') {
					if (pythonProgressLine.value) {
						pythonFixLogs.value.push({ ...pythonProgressLine.value })
						pythonProgressLine.value = null
					}
					pythonFixStep.value = 'done'
					pythonFixMessage.value = event.message || '安装完成'
					pythonFixDone.value = true
					pythonNeedsManualInstall.value = false
					pythonAutoInstallAvailable.value = false
				}
			}
		} catch (e: any) {
			pythonFixError.value = e?.message || String(e)
		} finally {
			autoInstallingTorch.value = false
			await checkEnv()
			if (installPath.value) {
				await new Promise((r) => setTimeout(r, 500))
				await probePath(installPath.value)
			}
		}
	}

	async function clearVenv(resetToDefault = true) {
		if (clearingVenv.value) return
		clearingVenv.value = true
		try {
			const r = await dweb.comfyui.setup.clearVenv({
				venvPath: venvPath.value,
				resetToDefault
			})
			if (r?.ok) {
				if (r.venvPath) {
					venvPath.value = r.venvPath
				}
				await loadConfig()
				await checkEnv()
				if (installPath.value) {
					await probePath(installPath.value)
				}
			} else {
				pythonFixError.value = r?.error || '清空虚拟环境失败'
			}
		} catch (e: any) {
			pythonFixError.value = e?.message || String(e)
		} finally {
			clearingVenv.value = false
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'ok':
				return '✓'
			case 'warn':
				return '⚠'
			case 'error':
				return '✗'
			case 'checking':
				return '⋯'
			default:
				return '?'
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'ok':
				return '#4ade80'
			case 'warn':
				return '#facc15'
			case 'error':
				return '#f87171'
			case 'checking':
				return '#60a5fa'
			default:
				return '#6b7280'
		}
	}

	return {
		installPath,
		defaultInstallPath,
		pathValidation,
		probeResult,
		probing,
		pathChanging,
		checking,
		envResult,
		logs,
		installing,
		serviceRunning,
		serviceStarting,
		serviceStartingError,
		config,
		saving,
		customModelPaths,
		pingingMirrors,
		mirrorPingResults,
		pypiMirrorList,
		torchMirrorList,
		selectedPypiMirror,
		selectedTorchMirror,
		customPypiUrl,
		customTorchUrl,
		mirrorSaving,
		mirrorSaveMessage,
		fixingPython,
		pythonFixStep,
		pythonFixMessage,
		pythonFixLogs,
		pythonProgressLine,
		pythonFixError,
		pythonFixDone,
		pythonNeedsManualInstall,
		pythonAutoInstallAvailable,
		pythonManualDownloadUrl,
		pythonOfficialDownloadUrl,
		pythonCudaVersion,
		pythonDetectedVersion,
		pythonPlatformTag,
		pythonAbiTag,
		pythonTorchVersion,
		pythonTorchWheel,
		pythonTorchvisionWheel,
		pythonTorchaudioWheel,
		pythonAliyunTorchUrl,
		pythonAliyunTorchvisionUrl,
		pythonAliyunTorchaudioUrl,
		pythonOfficialTorchUrl,
		pythonOfficialTorchvisionUrl,
		pythonOfficialTorchaudioUrl,
		pythonVenvPythonPath,
		pythonOneClickInstallCmd,
		pythonManualInstallCmd,
		pythonInstallDepsCmd,
		pythonAliyunDirUrl,
		pythonOfficialDirUrl,
		autoInstallingTorch,
		clearingVenv,
		logsUpdated,
		venvPath,
		defaultVenvPath,
		selectingVenvPath,
		cloningComfyUI,
		cloneStep,
		cloneMessage,
		cloneLogs,
		cloneError,
		cloneDone,
		updatingComfyUI,
		updateStep,
		updateMessage,
		updateLogs,
		updateError,
		updateDone,
		updateNeedDepUpdate,
		versionChecking,
		versionUpdateInfo,
		freshInstallMode,
		loadDefaultPath,
		loadDefaultVenvPath,
		selectPath,
		selectVenvPath,
		resetVenvPath,
		setInstallPath,
		setFreshInstallPath,
		probePath,
		checkVersionUpdate,
		resetForFreshInstall,
		exitFreshInstallMode,
		confirmFreshInstall,
		checkEnv,
		openInstallFolder,
		loadConfig,
		loadMirrorList,
		saveConfig,
		addCustomModelPath,
		removeCustomModelPath,
		startService,
		stopService,
		pingMirrors,
		saveMirrorConfig,
		fixPythonEnv,
		cloneComfyUI,
		updateComfyUI,
		autoInstallTorch,
		clearVenv,
		getStatusIcon,
		getStatusColor
	}
}
