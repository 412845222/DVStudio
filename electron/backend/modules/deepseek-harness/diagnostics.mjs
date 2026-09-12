import fs from 'node:fs/promises'
import path from 'node:path'
import { inspectSource, satisfiesNode, CLI_ENTRY } from './runtimeAdapter.mjs'
import { resolveExecutable, resolvePnpm, runCommand, commandEnv } from './commands.mjs'
import { probeSupportedFlags } from './startupProbe.mjs'

// Structured diagnostic item consumed by the frontend.
// key: stable identifier for i18n / branching
// status: pass | warn | fail
// actions: optional user-facing remediation steps
export function makeItem(key, status, title, detail, actions) {
	return { key, status, title, detail, actions: actions || [] }
}

export function overallFrom(items) {
	if (items.every((i) => i.status === 'pass')) return 'ready'
	if (items.some((i) => i.status === 'fail')) return 'needs-action'
	return 'auto-fixable'
}

// 1. Source structure (package names + bin entry).
async function checkSourceStructure(localPath) {
	try {
		await inspectSource(localPath)
		return makeItem('source-structure', 'pass', '源码结构', '已识别为 DeepSeek-Harness 源码')
	} catch (e) {
		return makeItem('source-structure', 'fail', '源码结构', String(e?.message || e), [
			{ label: '确认目录为 Harness 根目录（含 package.json 与 apps/cli）', kind: 'manual' }
		])
	}
}

// 2. Build artifacts presence (or dev-mode tsx entry).
async function checkBuildArtifacts(localPath, info) {
	const hasBuild = await fs
		.stat(path.join(localPath, CLI_ENTRY))
		.then((s) => s.isFile())
		.catch(() => false)
	if (hasBuild) return makeItem('build-artifacts', 'pass', '构建产物', `已检测到 ${CLI_ENTRY}`)
	if (info?.devMode)
		return makeItem(
			'build-artifacts',
			'pass',
			'启动入口',
			'缺少构建产物，但支持开发模式（tsx 加载器），可直接启动'
		)
	return makeItem(
		'build-artifacts',
		'warn',
		'构建产物',
		'缺少构建产物且不支持开发模式，需执行 pnpm install 与 pnpm run build',
		[{ label: '一键安装依赖并构建', kind: 'command', value: 'auto-build' }]
	)
}

// 3. Node.js version against engines.node.
async function checkNodeVersion(profile, nodeRange) {
	let nodePath = profile.nodePath
	if (!nodePath) {
		try {
			nodePath = await resolveExecutable('', 'node')
		} catch {
			return makeItem('node-version', 'fail', 'Node.js 版本', '未找到 Node.js，请安装或指定路径', [
				{ label: '前往 nodejs.org 下载安装', kind: 'link', value: 'https://nodejs.org' }
			])
		}
	}
	try {
		const raw = await runCommand(nodePath, ['--version'], { env: commandEnv(nodePath) })
		const versionMatch = /(v?\d+\.\d+\.\d+)/.exec(raw)
		const version = versionMatch ? versionMatch[1] : raw.trim()
		if (!nodeRange)
			return makeItem('node-version', 'pass', 'Node.js 版本', `当前 ${version}（源码未声明范围）`)
		const ok = satisfiesNode(version, nodeRange)
		if (ok)
			return makeItem('node-version', 'pass', 'Node.js 版本', `当前 ${version}，要求 ${nodeRange}`)
		return makeItem('node-version', 'fail', 'Node.js 版本', `当前 ${version}，要求 ${nodeRange}`, [
			{
				label: '升级 Node.js 到符合范围的版本',
				kind: 'link',
				value: 'https://nodejs.org'
			}
		])
	} catch (e) {
		return makeItem('node-version', 'fail', 'Node.js 版本', String(e?.message || e))
	}
}

// 4. pnpm version against packageManager field.
async function checkPnpmVersion(profile, packageManager) {
	let nodePath = profile.nodePath
	if (!nodePath) {
		try {
			nodePath = await resolveExecutable('', 'node')
		} catch {
			return makeItem('pnpm-version', 'fail', 'pnpm 版本', '未找到 Node.js，无法检测 pnpm', [
				{ label: '请先安装 Node.js', kind: 'link', value: 'https://nodejs.org' }
			])
		}
	}
	let pnpm
	try {
		pnpm = await resolvePnpm(profile.pnpmPath, nodePath)
	} catch (e) {
		return makeItem('pnpm-version', 'fail', 'pnpm 版本', String(e?.message || e), [
			{ label: '执行 npm i -g pnpm 安装', kind: 'command', value: 'npm i -g pnpm' },
			{ label: '或在高级配置中指定 pnpm.cjs 绝对路径', kind: 'manual' }
		])
	}
	try {
		const raw = await runCommand(pnpm.command, [...pnpm.prefix, '--version'], {
			env: commandEnv(nodePath)
		})
		const versionMatch = /(\d+\.\d+\.\d+)/.exec(raw)
		const version = versionMatch ? versionMatch[1] : raw.trim()
		if (!packageManager)
			return makeItem('pnpm-version', 'pass', 'pnpm 版本', `当前 ${version}（源码未声明）`)
		const required = /pnpm@([\d.]+)/.exec(packageManager)?.[1]
		if (!required)
			return makeItem(
				'pnpm-version',
				'pass',
				'pnpm 版本',
				`当前 ${version}，声明 ${packageManager}`
			)
		const ok = version === required
		if (ok)
			return makeItem('pnpm-version', 'pass', 'pnpm 版本', `当前 ${version}，要求 ${required}`)
		return makeItem('pnpm-version', 'fail', 'pnpm 版本', `当前 ${version}，要求 ${required}`, [
			{
				label: `执行 npm i -g pnpm@${required}`,
				kind: 'command',
				value: `npm i -g pnpm@${required}`
			}
		])
	} catch (e) {
		return makeItem('pnpm-version', 'fail', 'pnpm 版本', String(e?.message || e))
	}
}

// 5. Startup flag compatibility via --help probe.
async function checkStartupArgs(profile, info) {
	let nodePath = profile.nodePath
	if (!nodePath) {
		try {
			nodePath = await resolveExecutable('', 'node')
		} catch {
			return makeItem('startup-args', 'warn', '启动参数', '未找到 Node.js，跳过启动参数探测')
		}
	}
	try {
		const supported = await probeSupportedFlags(nodePath, { ...info, localPath: profile.localPath })
		const missing = []
		if (!supported.host) missing.push('--host')
		if (!supported.port) missing.push('--port')
		if (missing.length)
			return makeItem(
				'startup-args',
				'fail',
				'启动参数',
				`源码不支持 ${missing.join('、')}，无法以指定端口启动`,
				[{ label: '确认源码版本包含 web 服务的 host/port 参数', kind: 'manual' }]
			)
		return makeItem(
			'startup-args',
			'pass',
			'启动参数',
			supported.noOpen
				? '支持 host、port、no-open，系统将附加 no-open'
				: '支持 host、port，系统已自动适配启动参数'
		)
	} catch (e) {
		return makeItem(
			'startup-args',
			'warn',
			'启动参数',
			`启动参数探测失败：${String(e?.message || e)}，将使用默认参数`
		)
	}
}

// 6. TypeScript plugin compatibility (packages whose main points to .ts source).
// In dev mode (tsx loader), parameter property syntax is supported and not an issue.
async function checkTsPluginCompat(localPath, info) {
	if (info?.devMode)
		return makeItem(
			'ts-plugin-compat',
			'pass',
			'TypeScript 插件兼容性',
			'开发模式（tsx 加载器）下 TypeScript 参数属性语法不会导致启动失败'
		)
	try {
		const pkgsDir = path.join(localPath, 'packages')
		const entries = await fs.readdir(pkgsDir).catch(() => [])
		const offenders = []
		for (const name of entries) {
			const pkgJson = path.join(pkgsDir, name, 'package.json')
			let main
			try {
				const pkg = JSON.parse(await fs.readFile(pkgJson, 'utf8'))
				main = pkg.main
			} catch {
				continue
			}
			if (typeof main !== 'string' || !main.endsWith('.ts')) continue
			// Scan all .ts files under the package for parameter property syntax,
			// not just the main entry.
			const hasParamProps = await dirHasParamProps(path.join(pkgsDir, name))
			if (hasParamProps) offenders.push(name)
		}
		if (!offenders.length)
			return makeItem(
				'ts-plugin-compat',
				'pass',
				'TypeScript 插件兼容性',
				'未发现使用参数属性语法的 TypeScript 源码插件'
			)
		return makeItem(
			'ts-plugin-compat',
			'warn',
			'TypeScript 插件兼容性',
			`以下插件以 TypeScript 源码直接加载且使用了 Node v22 strip 模式不支持的参数属性：${offenders.join('、')}`,
			[
				{
					label: '升级到 Node.js 24+（原生支持参数属性）',
					kind: 'link',
					value: 'https://nodejs.org'
				},
				{ label: '构建这些插件为 JavaScript 产物', kind: 'manual' },
				{ label: '修改源码移除参数属性语法', kind: 'manual' }
			]
		)
	} catch {
		return makeItem(
			'ts-plugin-compat',
			'warn',
			'TypeScript 插件兼容性',
			'跳过检查（无法读取 packages 目录）'
		)
	}
}

async function dirHasParamProps(dir) {
	const stack = [dir]
	const re = /constructor\s*\(\s*(?:private|protected|public|readonly)\s/
	while (stack.length) {
		const current = stack.pop()
		let entries
		try {
			entries = await fs.readdir(current, { withFileTypes: true })
		} catch {
			continue
		}
		for (const entry of entries) {
			if (entry.name === 'node_modules') continue
			const full = path.join(current, entry.name)
			if (entry.isDirectory()) {
				stack.push(full)
			} else if (entry.isFile() && entry.name.endsWith('.ts')) {
				let src
				try {
					src = await fs.readFile(full, 'utf8')
				} catch {
					continue
				}
				if (re.test(src)) return true
			}
		}
	}
	return false
}

// Run all checks and return a structured diagnostic result.
export async function diagnoseSource(profile, { signal } = {}) {
	const localPath = profile.localPath
	let info = null
	try {
		info = await inspectSource(localPath)
	} catch {
		info = null
	}
	const items = []
	items.push(await checkSourceStructure(localPath))
	if (info) {
		items.push(await checkBuildArtifacts(localPath, info))
		items.push(await checkNodeVersion(profile, info.nodeRange))
		items.push(await checkPnpmVersion(profile, info.packageManager))
		items.push(await checkStartupArgs(profile, info))
		if (info.built || info.devMode) items.push(await checkTsPluginCompat(localPath, info))
	}
	return {
		profile,
		info,
		items,
		overall: overallFrom(items),
		validatedAt: Date.now()
	}
}
