import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandEnv, resolveExecutable, resolvePnpm, runCommand } from './commands.mjs'
import { inspectSource, satisfiesNode } from './runtimeAdapter.mjs'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
export async function canonicalPath(value) {
	if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0'))
		throw new Error('请选择源码目录的绝对路径')
	const absolute = path.resolve(value)
	let real
	try {
		real = await fs.realpath(absolute)
	} catch (error) {
		if (error.code !== 'ENOENT') throw error
		const parent = path.dirname(absolute)
		if (parent === absolute) throw error
		real = path.join(await canonicalPath(parent), path.basename(absolute))
	}
	return process.platform === 'win32' ? real.toLowerCase() : real
}

export function validateRepoUrl(value) {
	try {
		const url = new URL(value)
		if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
			throw new Error()
		return url.href
	} catch {
		throw new Error('请输入不含凭证、查询参数的 HTTPS Git 源码地址')
	}
}

export async function normalizeProfile(value = {}) {
	const name = String(value.name || '').trim()
	if (!name || name.length > 100) throw new Error('名称必填，最多 100 字符')
	const localPath = path.resolve(String(value.localPath || ''))
	const canonical = await canonicalPath(value.localPath)
	const ownRoot = await canonicalPath(appRoot)
	if (canonical === ownRoot || canonical.startsWith(ownRoot + path.sep))
		throw new Error('请选择 DVStudio 安装/源码目录以外的 Harness 目录')
	const port = Number(value.port)
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error('端口应在 1024–65535 之间')
	const sourceKind = value.sourceKind === 'git' ? 'git' : 'existing'
	const requestedRef = String(value.requestedRef || '').trim()
	if (
		requestedRef &&
		(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,180}$/.test(requestedRef) || requestedRef.includes('..'))
	)
		throw new Error('Git ref 格式无效')
	const executable = (v) => {
		const text = String(v || '').trim()
		if (text && (!path.isAbsolute(text) || text.includes('\0')))
			throw new Error('运行工具路径必须为绝对路径')
		return text
	}
	return {
		id: value.id || undefined,
		name,
		localPath,
		canonicalPath: canonical,
		port,
		sourceKind,
		repoUrl: sourceKind === 'git' ? validateRepoUrl(value.repoUrl) : '',
		requestedRef,
		nodePath: executable(value.nodePath),
		pnpmPath: executable(value.pnpmPath)
	}
}

export async function probeSource(profile, signal) {
	const report = await inspectSource(profile.localPath)
	const nodePath = await resolveExecutable(profile.nodePath, 'node')
	const nodeVersion = await runCommand(nodePath, ['--version'], {
		signal,
		env: commandEnv(nodePath)
	})
	if (!satisfiesNode(nodeVersion, report.nodeRange))
		throw new Error(`Node ${nodeVersion} 不满足源码要求 ${report.nodeRange}（ENV_UNAVAILABLE）`)
	let pnpmVersion = ''
	let pnpmError = ''
	try {
		const pnpm = await resolvePnpm(profile.pnpmPath, nodePath)
		pnpmVersion = await runCommand(pnpm.command, [...pnpm.prefix, '--version'], {
			signal,
			env: commandEnv(nodePath)
		})
	} catch (error) {
		pnpmError = error.message
	}
	return { ...report, nodePath, nodeVersion, pnpmVersion, pnpmError, validatedAt: Date.now() }
}

export async function prepareSource(profile, { signal, onLine, onPhase }) {
	const opts = { cwd: profile.localPath, signal, onLine, timeout: 20 * 60 * 1000 }
	const exists = await fs
		.stat(profile.localPath)
		.then((s) => s.isDirectory())
		.catch(() => false)
	const entries = exists ? await fs.readdir(profile.localPath) : []
	if (profile.sourceKind === 'git' && entries.length === 0) {
		onPhase('clone', '正在获取源码')
		const git = await resolveExecutable('', 'git')
		await fs.mkdir(path.dirname(profile.localPath), { recursive: true })
		await runCommand(git, ['clone', '--', profile.repoUrl, profile.localPath], {
			...opts,
			cwd: path.dirname(profile.localPath),
			env: commandEnv()
		})
		if (profile.requestedRef)
			await runCommand(git, ['checkout', '--detach', profile.requestedRef], {
				...opts,
				env: commandEnv()
			})
	} else if (!exists) throw new Error('已有源码目录不存在（SOURCE_MISSING）')
	// Never fetch/reset an existing checkout. A ref mismatch must be resolved in another directory.
	if (profile.sourceKind === 'git') {
		const git = await resolveExecutable('', 'git')
		const remote = await runCommand(git, ['remote', 'get-url', 'origin'], {
			...opts,
			env: commandEnv()
		})
		if (
			remote.replace(/\.git\/?$/, '').replace(/\/$/, '') !==
			profile.repoUrl.replace(/\.git\/?$/, '').replace(/\/$/, '')
		)
			throw new Error('目录中的 Git 来源与配置不符，请选择新空目录')
		if (profile.requestedRef) {
			const head = await runCommand(git, ['rev-parse', 'HEAD'], opts)
			const target = await runCommand(
				git,
				['rev-parse', '--verify', `${profile.requestedRef}^{commit}`],
				opts
			)
			if (head !== target) throw new Error('已有目录版本与指定 ref 不符，请选择新空目录')
		}
	}
	const report = await probeSource(profile, signal)
	const requiredPnpm = /^pnpm@(\d+\.\d+\.\d+)/.exec(report.packageManager || '')?.[1]
	if (!requiredPnpm || report.pnpmVersion !== requiredPnpm)
		throw new Error(
			`请安装源码要求的 ${report.packageManager}；当前 ${report.pnpmVersion || report.pnpmError}`
		)
	const pnpm = await resolvePnpm(profile.pnpmPath, report.nodePath)
	const env = commandEnv(report.nodePath)
	onPhase('install', '正在安装 Harness 依赖')
	await runCommand(pnpm.command, [...pnpm.prefix, 'install', '--frozen-lockfile'], { ...opts, env })
	onPhase('build', '正在构建 Harness')
	await runCommand(pnpm.command, [...pnpm.prefix, 'run', 'build'], { ...opts, env })
	const finalReport = await probeSource(profile, signal)
	if (!finalReport.built) throw new Error('构建结束但缺少 CLI 产物')
	return finalReport
}
