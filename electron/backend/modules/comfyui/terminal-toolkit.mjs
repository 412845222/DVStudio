import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { shell, app } from 'electron'

const COMMAND_BLACKLIST = new Set([
	'cmd.exe', 'cmd', 'powershell.exe', 'powershell', 'pwsh', 'pwsh.exe',
	'bash', 'sh', 'zsh', 'fish',
	'reg', 'reg.exe', 'regedit', 'regedt32',
	'format', 'format.com', 'deltree', 'rd', 'rmdir',
	'rundll32', 'rundll32.exe', 'mshta', 'mshta.exe',
	'wscript', 'wscript.exe', 'cscript', 'cscript.exe'
])

const MAX_OUTPUT_LINES = 2000
const MANAGED_VENV_DIRNAME = 'comfyui-python'

function createStreamQueue() {
	let buf = []
	let done = false
	let resolveWait = null
	return {
		push(v) {
			buf.push(v)
			if (resolveWait) {
				const r = resolveWait
				resolveWait = null
				r(true)
			}
		},
		finish() {
			done = true
			if (resolveWait) {
				const r = resolveWait
				resolveWait = null
				r(false)
			}
		},
		async next() {
			if (buf.length > 0) return { value: buf.shift(), done: false }
			if (done) return { done: true }
			const hasMore = await new Promise((r) => {
				resolveWait = r
			})
			if (buf.length > 0) return { value: buf.shift(), done: false }
			return { done: !hasMore }
		},
		[Symbol.asyncIterator]() {
			return this
		}
	}
}

function runCommandStream(cmd, args, options = {}) {
	const timeout = options.timeout || 300000
	let lineCount = 0
	let timedOut = false
	const queue = createStreamQueue()
	let child
	// 修复C-1（终极兜底）：默认注入 PIP_INDEX_URL=PyPI 官方源，覆盖用户 pip.ini 固定的阿里云/清华源
	// pip 优先级：CLI --index-url > env PIP_INDEX_URL > pip.ini
	const baseEnv = { ...process.env, ...(options.env || {}), PYTHONIOENCODING: 'utf-8' }
	if (baseEnv.PIP_INDEX_URL === undefined) {
		baseEnv.PIP_INDEX_URL = 'https://pypi.org/simple'
	}
	try {
		child = spawn(cmd, args, {
			cwd: options.cwd,
			encoding: 'utf-8',
			env: baseEnv,
			shell: false
		})
	} catch (err) {
		queue.push({ type: 'error', message: `启动命令失败: ${err.message || err}` })
		queue.finish()
		return queue
	}
	const timer = setTimeout(() => {
		timedOut = true
		try { child.kill() } catch {}
		queue.push({ type: 'log', stream: 'stderr', message: '命令执行超时（5分钟），已自动终止' })
	}, timeout)
	const processLine = (stream, data) => {
		const lines = String(data).split(/\r?\n/)
		for (const line of lines) {
			if (line.trim()) {
				lineCount++
				if (lineCount <= MAX_OUTPUT_LINES) {
					queue.push({ type: 'log', stream, message: line })
				}
			}
		}
	}
	child.stdout?.on('data', (d) => processLine('stdout', d))
	child.stderr?.on('data', (d) => processLine('stderr', d))
	child.on('close', (code) => {
		if (timedOut) {
			queue.finish()
			return
		}
		clearTimeout(timer)
		if (lineCount > MAX_OUTPUT_LINES) {
			queue.push({ type: 'log', stream: 'stderr', message: `输出已截断（超过${MAX_OUTPUT_LINES}行），如需查看完整输出请将结果重定向到文件` })
		}
		if (code !== 0 && code !== -1) {
			queue.push({ type: 'log', stream: 'stderr', message: `命令退出码: ${code}` })
		}
		queue.finish()
	})
	child.on('error', (err) => {
		if (timedOut) {
			queue.finish()
			return
		}
		clearTimeout(timer)
		queue.push({ type: 'log', stream: 'stderr', message: `命令执行错误: ${err.message || err}` })
		queue.finish()
	})
	return queue
}

function loadComfyConfig() {
	const configPath = path.join(app.getPath('userData'), 'comfyui_setup.json')
	try {
		if (fs.existsSync(configPath)) {
			return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
		}
	} catch {}
	return {}
}

function resolvePythonForCommand(installPath) {
	const config = loadComfyConfig()
	const targetInstallPath = installPath || config.installPath

	// 1. 优先使用配置的托管虚拟环境（venvPath对应的）
	try {
		let venvRoot = null
		if (config.venvPath) {
			const normalized = path.resolve(config.venvPath)
			const normalizedInstall = targetInstallPath ? path.resolve(targetInstallPath) : null
			const isVenvInsideInstall = normalizedInstall &&
				(normalized.toLowerCase().startsWith(normalizedInstall.toLowerCase() + path.sep) ||
					normalized.toLowerCase() === normalizedInstall.toLowerCase())
			if (isVenvInsideInstall) {
				venvRoot = path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
			} else {
				venvRoot = config.venvPath
			}
		} else {
			venvRoot = path.join(app.getPath('userData'), MANAGED_VENV_DIRNAME)
		}
		const managedPy = process.platform === 'win32'
			? path.join(venvRoot, 'venv', 'Scripts', 'python.exe')
			: path.join(venvRoot, 'venv', 'bin', 'python')
		if (fs.existsSync(managedPy)) {
			return {
				ok: true,
				pythonPath: managedPy,
				type: 'managed_venv',
				typeLabel: config.venvPath ? '自定义虚拟环境' : 'DVStudio托管虚拟环境',
				venvRoot
			}
		}
	} catch {}

	// 2. 便携版
	if (targetInstallPath && process.platform === 'win32') {
		try {
			const portablePy = path.join(targetInstallPath, 'python_embeded', 'python.exe')
			if (fs.existsSync(portablePy)) {
				return { ok: true, pythonPath: portablePy, type: 'portable', typeLabel: '便携版Python', venvRoot: null }
			}
		} catch {}
	}

	// 3. 项目内venv
	if (targetInstallPath) {
		try {
			const venvPy = process.platform === 'win32'
				? path.join(targetInstallPath, 'venv', 'Scripts', 'python.exe')
				: path.join(targetInstallPath, 'venv', 'bin', 'python')
			if (fs.existsSync(venvPy)) {
				return { ok: true, pythonPath: venvPy, type: 'venv', typeLabel: '项目内虚拟环境', venvRoot: path.join(targetInstallPath, 'venv') }
			}
		} catch {}
	}

	// 4. 找不到，返回错误，不回退系统Python
	return {
		ok: false,
		error: '未找到可用的Python虚拟环境。\n请先在ComfyUI配置中完成环境配置（一键配置或手动选择虚拟环境位置），\n或确保ComfyUI源码目录下存在venv或python_embeded目录。'
	}
}

export function listPresetCommands() {
	return [
		{ id: 'step1-open-customnodes-dir', category: 'manager-guide', label: '步骤1: 打开 custom_nodes 目录', description: '在文件管理器中打开 custom_nodes 目录，确认位置', dangerous: false, icon: 'folder', requiresGit: false, requiresPython: false, step: 1 },
		{ id: 'step2-install-manager-github', category: 'manager-guide', label: '步骤2: 克隆 Manager (GitHub官方)', description: '从 GitHub 官方源克隆 ComfyUI-Manager 到 custom_nodes 目录', dangerous: false, icon: 'download', requiresGit: true, requiresPython: false, step: 2 },
		{ id: 'step2-install-manager-gitee', category: 'manager-guide', label: '步骤2备选: 克隆 Manager (Gitee镜像)', description: 'GitHub 访问慢时使用国内 Gitee 镜像源', dangerous: false, icon: 'download', requiresGit: true, requiresPython: false, step: 2 },
		{ id: 'step2-install-manager-ghproxy', category: 'manager-guide', label: '步骤2备选: 克隆 Manager (代理加速)', description: 'GitHub 官方源通过代理加速克隆', dangerous: false, icon: 'download', requiresGit: true, requiresPython: false, step: 2 },
		{ id: 'step3-install-manager-deps', category: 'manager-guide', label: '步骤3: 安装 Manager Python 依赖', description: '执行 pip install -r requirements.txt 安装 Manager 所需依赖', dangerous: false, icon: 'package', requiresGit: false, requiresPython: true, step: 3 },
		{ id: 'step3.5-upgrade-manager-pip', category: 'manager-guide', label: '步骤3.5: 升级 comfyui-manager 包', description: '执行 pip install -U comfyui-manager 升级到最新版本（解决版本过低报错）', dangerous: false, icon: 'package-up', requiresGit: false, requiresPython: true, step: 3.5 },
		{ id: 'step4-check-manager-installed', category: 'manager-guide', label: '步骤4: 验证安装完成', description: '检查 ComfyUI-Manager 目录是否存在，确认安装成功', dangerous: false, icon: 'check', requiresGit: false, requiresPython: false, step: 4 },
		{ id: 'diagnose-env', category: 'diagnose', label: '诊断: Python/PyTorch 环境速查', description: '输出 Python 版本、PyTorch 版本、CUDA 可用性信息', dangerous: false, icon: 'info', requiresGit: false, requiresPython: true },
		{ id: 'check-custom-nodes-list', category: 'diagnose', label: '诊断: 列出已安装自定义节点', description: '列出 custom_nodes 目录下所有已安装的自定义节点', dangerous: false, icon: 'list', requiresGit: false, requiresPython: false },
		{ id: 'pip-install-missing', category: 'dependency', label: '修复: 补装缺失依赖包', description: '升级 pip 工具', dangerous: false, icon: 'wrench', requiresGit: false, requiresPython: true },
		{ id: 'git-status', category: 'git', label: 'Git: 查看本地修改状态', description: '执行 git status 查看 ComfyUI 源码本地修改情况', dangerous: false, icon: 'git', requiresGit: true, requiresPython: false },
		{ id: 'git-log-10', category: 'git', label: 'Git: 查看最近10次提交', description: '执行 git log --oneline -10 查看最近提交记录', dangerous: false, icon: 'git', requiresGit: true, requiresPython: false },
		{ id: 'git-remote-v', category: 'git', label: 'Git: 查看远程仓库地址', description: '执行 git remote -v 查看当前配置的远程仓库 URL', dangerous: false, icon: 'git', requiresGit: true, requiresPython: false }
	]
}

function normalizeAndValidateCwd(installPath, requestedCwd) {
	const normalizedInstall = path.resolve(installPath).toLowerCase()
	let targetCwd = requestedCwd ? path.resolve(requestedCwd) : normalizedInstall
	const normalizedTarget = targetCwd.toLowerCase()
	if (!normalizedTarget.startsWith(normalizedInstall)) {
		targetCwd = installPath
	}
	if (!fs.existsSync(targetCwd) || !fs.statSync(targetCwd).isDirectory()) {
		return { ok: false, error: `工作目录不存在或不是目录: ${targetCwd}` }
	}
	return { ok: true, cwd: targetCwd }
}

function getPipMirrorArgs(config) {
	const pypiMirror = config?.pypiMirror
	// 修复C-2：默认镜像必须是 PyPI 官方源（之前默认清华，导致 Templates 最新包拿不到）
	// 用户 pip.ini 即使配置了阿里云/清华也被上层 env.PIP_INDEX_URL 兜底覆盖
	let mirrorUrl = 'https://pypi.org/simple'
	if (pypiMirror === 'tuna') {
		mirrorUrl = 'https://pypi.tuna.tsinghua.edu.cn/simple'
	} else if (pypiMirror === 'aliyun') {
		mirrorUrl = 'https://mirrors.aliyun.com/pypi/simple'
	} else if (pypiMirror === 'ustc') {
		mirrorUrl = 'https://pypi.mirrors.ustc.edu.cn/simple'
	} else if (pypiMirror === 'tencent') {
		mirrorUrl = 'https://mirrors.cloud.tencent.com/pypi/simple'
	} else if (config?.customPypiMirrorUrl) {
		mirrorUrl = config.customPypiMirrorUrl
	}
	return ['-i', mirrorUrl, '--timeout', '15', '--retries', '2']
}

function getInstallPathFromPayload(payload) {
	const config = loadComfyConfig()
	const installPath = payload?.installPath || config.installPath
	if (!installPath || !fs.existsSync(installPath)) {
		return { ok: false, error: 'ComfyUI 安装路径无效，请先在设置中配置安装路径' }
	}
	return { ok: true, installPath, config }
}

function prefixPythonForPip(command, pythonPath) {
	const trimmed = command.trim()
	// 检测用户命令中是否已显式指定镜像源（-i 或 --index-url）
	// 如果已经指定，就不要再叠加官方源参数（让用户的选择生效）
	const hasExplicitMirror = /(?:^|\s)(?:-i\s|--index-url(?:\s|=))/.test(trimmed)
	const hasExplicitTimeout = /(?:^|\s)(?:--timeout(?:\s|=))/.test(trimmed)
	const hasExplicitRetries = /(?:^|\s)(?:--retries(?:\s|=))/.test(trimmed)
	// 组装要追加的参数（默认官方源 + 短 timeout/retries）
	const extraArgs = []
	if (!hasExplicitMirror) {
		extraArgs.push('--index-url', 'https://pypi.org/simple', '--trusted-host', 'pypi.org')
	}
	if (!hasExplicitTimeout) {
		extraArgs.push('--timeout', '15')
	}
	if (!hasExplicitRetries) {
		extraArgs.push('--retries', '2')
	}
	const extraStr = extraArgs.length > 0 ? ' ' + extraArgs.join(' ') : ''
	if (/^(pip|pip3)(\s|$)/.test(trimmed)) {
		// 修复C-3：对 pip 开头命令自动补官方源 + 超时参数（覆盖 pip.ini 阿里云默认）
		// pip install --help 显示：位置参数最后是 [options]，所以追加参数总是安全的
		return `"${pythonPath}" -m ${trimmed}${extraStr}`
	}
	if (/^(python|python3)(\s+-m\s+pip\s)/.test(trimmed)) {
		// 修复C-3：对 python -m pip 开头的命令同样补官方源参数
		const rest = trimmed.replace(/^(python|python3)\s+-m\s+pip\s*/, '')
		return `"${pythonPath}" -m pip ${rest}${extraStr}`
	}
	return command
}

function parseCommandLine(commandText) {
	const tokens = []
	let current = ''
	let inQuote = false
	let quoteChar = ''
	for (let i = 0; i < commandText.length; i++) {
		const c = commandText[i]
		if (inQuote) {
			if (c === quoteChar) {
				inQuote = false
			} else {
				current += c
			}
		} else {
			if (c === '"' || c === "'") {
				inQuote = true
				quoteChar = c
			} else if (c === ' ' || c === '\t') {
				if (current) {
					tokens.push(current)
					current = ''
				}
			} else {
				current += c
			}
		}
	}
	if (current) tokens.push(current)
	return tokens
}

export async function* runPresetCommand(_ctx, payload) {
	const { presetId } = payload || {}
	const pathResult = getInstallPathFromPayload(payload)
	if (!pathResult.ok) {
		yield { type: 'error', message: pathResult.error }
		return
	}
	const { installPath, config } = pathResult
	const customNodesDir = path.join(installPath, 'custom_nodes')
	yield { type: 'log', stream: 'system', message: `[终端] 执行预设命令: ${presetId}` }

	// 对于需要Python的命令，先解析Python环境并输出环境信息
	let pyResult = null
	const preset = listPresetCommands().find(p => p.id === presetId)
	if (preset?.requiresPython) {
		pyResult = resolvePythonForCommand(installPath)
		if (!pyResult.ok) {
			yield { type: 'error', message: pyResult.error }
			return
		}
		yield { type: 'log', stream: 'system', message: `[环境] Python 解释器: ${pyResult.pythonPath}` }
		yield { type: 'log', stream: 'system', message: `[环境] 环境类型: ${pyResult.typeLabel}` }
		if (pyResult.venvRoot) {
			yield { type: 'log', stream: 'system', message: `[环境] 虚拟环境根目录: ${pyResult.venvRoot}` }
		}
	}

	switch (presetId) {
		case 'step1-open-customnodes-dir': {
			try {
				if (!fs.existsSync(customNodesDir)) {
					fs.mkdirSync(customNodesDir, { recursive: true })
					yield { type: 'log', stream: 'stdout', message: 'custom_nodes 目录不存在，已自动创建' }
				}
				await shell.openPath(customNodesDir)
				yield { type: 'log', stream: 'stdout', message: `已在文件管理器中打开: ${customNodesDir}` }
				yield { type: 'done', message: '步骤1完成: 已打开 custom_nodes 目录，请继续步骤2克隆 Manager' }
			} catch (err) {
				yield { type: 'error', message: `打开目录失败: ${err.message || err}` }
			}
			return
		}
		case 'step2-install-manager-github':
		case 'step2-install-manager-gitee':
		case 'step2-install-manager-ghproxy': {
			const managerDir = path.join(customNodesDir, 'ComfyUI-Manager')
			if (fs.existsSync(managerDir) && fs.existsSync(path.join(managerDir, '__init__.py'))) {
				yield { type: 'log', stream: 'stdout', message: '检测到 ComfyUI-Manager 已安装，无需重复克隆' }
				yield { type: 'done', message: 'Manager 已存在，请继续步骤3安装依赖' }
				return
			}
			let repoUrl = 'https://github.com/Comfy-Org/ComfyUI-Manager.git'
			if (presetId === 'step2-install-manager-gitee') {
				repoUrl = 'https://gitee.com/Comfy-Org/ComfyUI-Manager.git'
			} else if (presetId === 'step2-install-manager-ghproxy') {
				repoUrl = 'https://ghfast.top/https://github.com/Comfy-Org/ComfyUI-Manager.git'
			}
			if (!fs.existsSync(customNodesDir)) {
				fs.mkdirSync(customNodesDir, { recursive: true })
			}
			yield { type: 'log', stream: 'stdout', message: `正在克隆仓库: ${repoUrl}` }
			yield* runCommandStream('git', ['clone', repoUrl, 'ComfyUI-Manager'], { cwd: customNodesDir })
			yield { type: 'log', stream: 'system', message: '克隆命令执行完成，请检查上方输出确认成功' }
			if (fs.existsSync(path.join(managerDir, '__init__.py'))) {
				yield { type: 'done', message: '步骤2完成: Manager 源码克隆成功，请继续步骤3安装依赖' }
			} else {
				yield { type: 'log', stream: 'stderr', message: '警告: 未检测到 ComfyUI-Manager 目录，请检查 clone 输出是否有错误' }
			}
			return
		}
		case 'step3-install-manager-deps': {
			const managerDir = path.join(customNodesDir, 'ComfyUI-Manager')
			const reqFile = path.join(managerDir, 'requirements.txt')
			if (!fs.existsSync(managerDir)) {
				yield { type: 'error', message: 'ComfyUI-Manager 目录不存在，请先完成步骤2' }
				return
			}
			if (!fs.existsSync(reqFile)) {
				yield { type: 'log', stream: 'stdout', message: '未找到 requirements.txt，跳过依赖安装（可能无需额外依赖）' }
				yield { type: 'done', message: '步骤3完成' }
				return
			}
			const pipArgs = ['-m', 'pip', 'install', '-r', 'requirements.txt', ...getPipMirrorArgs(config)]
			yield { type: 'log', stream: 'stdout', message: `执行: "${pyResult.pythonPath}" ${pipArgs.join(' ')}` }
			yield* runCommandStream(pyResult.pythonPath, pipArgs, { cwd: managerDir })
			yield { type: 'log', stream: 'system', message: '依赖安装命令执行完成，请检查上方输出确认成功' }
			yield { type: 'done', message: '步骤3完成: 依赖安装完成，请继续步骤3.5升级comfyui-manager包' }
			return
		}
		case 'step3.5-upgrade-manager-pip': {
			const pipArgs = ['-m', 'pip', 'install', '-U', 'comfyui-manager', ...getPipMirrorArgs(config)]
			yield { type: 'log', stream: 'stdout', message: `执行: "${pyResult.pythonPath}" ${pipArgs.join(' ')}` }
			yield { type: 'log', stream: 'stdout', message: '正在升级 comfyui-manager 到最新版本...' }
			yield* runCommandStream(pyResult.pythonPath, pipArgs, { cwd: installPath, timeout: 300000 })
			yield { type: 'log', stream: 'system', message: '升级命令执行完成，请检查上方输出确认成功' }
			yield { type: 'done', message: '步骤3.5完成: comfyui-manager 升级完成，请继续步骤4验证' }
			return
		}
		case 'step4-check-manager-installed': {
			const managerDir = path.join(customNodesDir, 'ComfyUI-Manager')
			const initPy = path.join(managerDir, '__init__.py')
			if (fs.existsSync(initPy)) {
				yield { type: 'log', stream: 'stdout', message: '✅ ComfyUI-Manager 安装成功！' }
				yield { type: 'log', stream: 'system', message: '重要提示: 请前往「启动参数」Tab，点击左侧【☆ 启用 Manager 菜单 (--enable-manager)】快捷标签添加参数，然后重启 ComfyUI 服务即可生效。' }
				yield { type: 'done', message: '步骤4完成: Manager 安装验证通过' }
			} else {
				yield { type: 'error', message: '❌ 未检测到 ComfyUI-Manager，请重新执行步骤2和步骤3' }
			}
			return
		}
		case 'diagnose-env': {
			const code = 'import sys; print(f"Python版本: {sys.version}"); import torch; print(f"PyTorch版本: {torch.__version__}"); print(f"CUDA可用: {torch.cuda.is_available()}"); print(f"CUDA版本: {torch.version.cuda if torch.cuda.is_available() else \\"N/A\\"}")'
			yield* runCommandStream(pyResult.pythonPath, ['-c', code], { cwd: installPath })
			yield { type: 'done', message: '环境诊断完成' }
			return
		}
		case 'check-custom-nodes-list': {
			if (!fs.existsSync(customNodesDir)) {
				yield { type: 'log', stream: 'stdout', message: 'custom_nodes 目录不存在' }
				yield { type: 'done', message: '检查完成' }
				return
			}
			const entries = fs.readdirSync(customNodesDir, { withFileTypes: true })
			const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__pycache__')
			yield { type: 'log', stream: 'stdout', message: `已安装 ${dirs.length} 个自定义节点:` }
			for (const dir of dirs) {
				const hasReq = fs.existsSync(path.join(customNodesDir, dir.name, 'requirements.txt'))
				const hasInit = fs.existsSync(path.join(customNodesDir, dir.name, '__init__.py'))
				yield { type: 'log', stream: 'stdout', message: `  - ${dir.name} ${hasInit ? '✅' : '❓'} ${hasReq ? '(有requirements.txt)' : ''}` }
			}
			yield { type: 'done', message: '节点列表检查完成' }
			return
		}
		case 'pip-install-missing': {
			const pipArgs = ['-m', 'pip', 'install', '--upgrade', 'pip', ...getPipMirrorArgs(config)]
			yield { type: 'log', stream: 'stdout', message: '尝试升级 pip...' }
			yield* runCommandStream(pyResult.pythonPath, pipArgs, { cwd: installPath })
			yield { type: 'log', stream: 'stdout', message: 'pip 升级完成，如需安装特定缺失包，请在自定义命令中手动执行 pip install <包名>' }
			yield { type: 'done', message: '修复命令执行完成' }
			return
		}
		case 'git-status': {
			yield* runCommandStream('git', ['status', '--short'], { cwd: installPath })
			yield { type: 'done', message: 'git status 完成' }
			return
		}
		case 'git-log-10': {
			yield* runCommandStream('git', ['log', '--oneline', '-10'], { cwd: installPath })
			yield { type: 'done', message: 'git log 完成' }
			return
		}
		case 'git-remote-v': {
			yield* runCommandStream('git', ['remote', '-v'], { cwd: installPath })
			yield { type: 'done', message: 'git remote -v 完成' }
			return
		}
		default:
			yield { type: 'error', message: `未知预设命令: ${presetId}` }
	}
}

export async function* runCustomCommand(_ctx, payload) {
	const { commandText, cwd: reqCwd } = payload || {}
	if (!commandText || typeof commandText !== 'string' || !commandText.trim()) {
		yield { type: 'error', message: '请输入要执行的命令' }
		return
	}
	const pathResult = getInstallPathFromPayload(payload)
	if (!pathResult.ok) {
		yield { type: 'error', message: pathResult.error }
		return
	}
	const { installPath, config } = pathResult
	const cwdCheck = normalizeAndValidateCwd(installPath, reqCwd)
	if (!cwdCheck.ok) {
		yield { type: 'error', message: cwdCheck.error }
		return
	}
	const targetCwd = cwdCheck.cwd

	// 检测是否是pip/python命令，如果是需要使用正确的虚拟环境Python
	const trimmedCmd = commandText.trim()
	const isPipCommand = /^(pip|pip3|python|python3)(\s|$)/.test(trimmedCmd)
	let pyResult = null
	let finalCommand = commandText
	if (isPipCommand) {
		pyResult = resolvePythonForCommand(installPath)
		if (!pyResult.ok) {
			yield { type: 'error', message: pyResult.error }
			yield { type: 'log', stream: 'stderr', message: '提示: pip/python命令必须使用配置的虚拟环境执行，以避免污染系统环境。' }
			return
		}
		yield { type: 'log', stream: 'system', message: `[环境] Python 解释器: ${pyResult.pythonPath}` }
		yield { type: 'log', stream: 'system', message: `[环境] 环境类型: ${pyResult.typeLabel}` }
		finalCommand = prefixPythonForPip(trimmedCmd, pyResult.pythonPath)
	}

	const tokens = parseCommandLine(finalCommand.trim())
	if (tokens.length === 0) {
		yield { type: 'error', message: '命令为空' }
		return
	}
	const cmd = tokens[0].toLowerCase()
	const baseCmdName = path.basename(cmd).replace('.exe', '').toLowerCase()
	if (COMMAND_BLACKLIST.has(baseCmdName)) {
		yield { type: 'error', message: `安全限制: 禁止执行命令 "${cmd}"，该命令可能带来系统风险` }
		return
	}
	yield { type: 'log', stream: 'system', message: `[自定义命令] 在 ${targetCwd} 执行: ${finalCommand}` }
	yield* runCommandStream(tokens[0], tokens.slice(1), { cwd: targetCwd })
	yield { type: 'done', message: '自定义命令执行完成' }
}

export function checkTerminalMode() {
	return {
		ok: true,
		customCommandEnabled: true,
		maxOutputLines: MAX_OUTPUT_LINES,
		warning: '自定义命令执行受目录限制（仅允许 ComfyUI 安装目录及其子目录），pip命令将自动使用配置的虚拟环境执行'
	}
}

export function getActivePythonInfoSync(installPath) {
	return resolvePythonForCommand(installPath)
}
