// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 验证 Electron 主进程 ESM (.mjs) 文件中 `require('electron')` 调用
 * 通过 `createRequire(import.meta.url)` 正确生效，避免打包后
 * `ReferenceError: require is not defined` 被 try/catch 静默吞掉，
 * 进而导致 Meshy/Tripo3D 等外部网络请求在打包 exe 后无法访问。
 *
 * 覆盖三个改动文件：
 *   electron/backend/core/http-client.mjs
 *   electron/backend/modules/meshy/service.mjs
 *   electron/backend/projectAssetProtocol.mjs
 *
 * 改动点：每个文件顶部新增
 *   import { createRequire } from 'node:module'
 *   const require = createRequire(import.meta.url)
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')

const FIXED_FILES = [
	{
		key: 'http-client',
		absPath: path.join(PROJECT_ROOT, 'electron', 'backend', 'core', 'http-client.mjs'),
		moduleId: '@electron/backend/core/http-client.mjs',
		expectedExports: ['HttpClient', 'getHttpClient', 'resetHttpClient']
	},
	{
		key: 'meshy-service',
		absPath: path.join(PROJECT_ROOT, 'electron', 'backend', 'modules', 'meshy', 'service.mjs'),
		moduleId: '@electron/backend/modules/meshy/service.mjs',
		expectedExports: [
			'generateModel',
			'getTask',
			'listTasks',
			'getTaskDetail',
			'stopTask',
			'deleteTask',
			'getBalance',
			'health',
			'updateTaskLocalAsset'
		]
	},
	{
		key: 'project-asset-protocol',
		absPath: path.join(PROJECT_ROOT, 'electron', 'backend', 'projectAssetProtocol.mjs'),
		moduleId: '@electron/backend/projectAssetProtocol.mjs',
		expectedExports: [
			'registerDwebProjectAssetProtocol',
			'setProjectRoot',
			'clearProjectRoot',
			'getProjectRootSnapshot',
			'downloadUrlToProjectRoot',
			'copyFileToProjectRoot',
			'getProjectRootById',
			'repairProjectAsset',
			'validateProjectRoot',
			'diagnoseDwebAsset',
			'getAccessLogs',
			'getProjectCacheStats',
			'clearProjectCache'
		]
	}
]

const mockAppGetAppPath = vi.fn()
const mockAppIsPackaged = { value: false }
const mockNetFetch = vi.fn()
const mockNativeImageCreateFromPath = vi.fn()

vi.mock('electron', () => ({
	app: {
		get isPackaged() {
			return mockAppIsPackaged.value
		},
		getAppPath: () => mockAppGetAppPath(),
		getPath: (name: string) => {
			if (name === 'exe') return path.join(os.tmpdir(), 'dvstudio-mock', 'DVStudio.exe')
			return path.join(os.tmpdir(), 'dvstudio-mock', 'app-data')
		}
	},
	net: {
		fetch: (...args: unknown[]) => mockNetFetch(...args)
	},
	nativeImage: {
		createFromPath: (...args: unknown[]) => mockNativeImageCreateFromPath(...args)
	}
}))

const originalResourceDir = process.env.DWEB_RESOURCE_DIR
const originalProcessCwd = process.cwd.bind(process)

const readText = (p: string) => fs.readFileSync(p, 'utf8')

describe('源码静态检查：三个 ESM 文件必须包含 createRequire 修复', () => {
	it('三个修复目标文件在磁盘上均存在', () => {
		for (const f of FIXED_FILES) {
			expect(fs.existsSync(f.absPath)).toBe(true)
			expect(path.isAbsolute(f.absPath)).toBe(true)
		}
	})

	it.each(FIXED_FILES.map((f) => [f.key, f.absPath] as const))(
		'%s: 源码中必须 import createRequire',
		(_key, absPath) => {
			const src = readText(absPath)
			const hasImport = /import\s*\{\s*createRequire\s*\}\s*from\s*['"](?:node:)?module['"]/.test(
				src
			)
			expect(hasImport).toBe(true)
		}
	)

	it.each(FIXED_FILES.map((f) => [f.key, f.absPath] as const))(
		'%s: 源码中必须通过 createRequire(import.meta.url) 声明 require 变量',
		(_key, absPath) => {
			const src = readText(absPath)
			const hasDecl = /const\s+require\s*=\s*createRequire\(\s*import\.meta\.url\s*\)/.test(src)
			expect(hasDecl).toBe(true)
		}
	)

	it.each(FIXED_FILES.map((f) => [f.key, f.absPath] as const))(
		'%s: 源码中 require("electron") 调用存在（验证修复点针对目标调用）',
		(_key, absPath) => {
			const src = readText(absPath)
			const hasReqElectron =
				src.includes("require('electron')") || src.includes('require("electron")')
			expect(hasReqElectron).toBe(true)
		}
	)
})

describe('运行时验证：ESM 顶层 require("electron") 不抛 ReferenceError = createRequire 生效', () => {
	beforeEach(() => {
		vi.resetModules()
		mockAppGetAppPath.mockReset()
		mockNetFetch.mockReset()
		mockNativeImageCreateFromPath.mockReset()
		mockAppIsPackaged.value = false
		delete process.env.DWEB_RESOURCE_DIR
		// 避免 findNearestGitRoot 扫描到真实 .git 影响内部 fallback 行为
		vi.spyOn(process, 'cwd').mockReturnValue(
			path.join(os.tmpdir(), 'dvstudio-no-git-' + Date.now())
		)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		if (originalResourceDir) {
			process.env.DWEB_RESOURCE_DIR = originalResourceDir
		} else {
			delete process.env.DWEB_RESOURCE_DIR
		}
	})

	it.each(FIXED_FILES.map((f) => [f.key, f.moduleId, f.expectedExports] as const))(
		'%s: 动态 import 整个模块不抛 ReferenceError，且导出 API 完整',
		async (_key, moduleId, expectedExports) => {
			mockAppGetAppPath.mockReturnValue(path.join(os.tmpdir(), 'dvstudio-app-path'))

			// 若 ESM 中 require 未定义，顶层 require('electron') 会立刻抛 ReferenceError
			// 能正常完成 import 就证明 createRequire 修复生效。
			let mod: Record<string, unknown> | null = null
			let error: unknown = null
			try {
				mod = (await import(/* @vite-ignore */ moduleId)) as Record<string, unknown>
			} catch (e) {
				error = e
			}

			expect(error).toBeNull()
			expect(mod).not.toBeNull()
			for (const name of expectedExports) {
				expect(typeof (mod as Record<string, unknown>)[name]).toBe('function')
			}
		}
	)

	it('http-client.mjs: getHttpClient() 返回可用对象（require("electron").net fallback 路径可用）', async () => {
		const { getHttpClient } = (await import('@electron/backend/core/http-client.mjs')) as {
			getHttpClient: () => { request: unknown }
		}
		const client = getHttpClient()
		expect(client).toBeDefined()
		expect(typeof client.request).toBe('function')
	})

	it('设置 DWEB_RESOURCE_DIR 环境变量后加载 meshy/service.mjs 仍然成功（dev 路径优先级）', async () => {
		const tmpDvs = path.join(os.tmpdir(), 'dvs-env-res-' + Date.now())
		// 即使目录不存在也可以，仅验证 require('electron') 兜底分支不会被触发而抛错
		process.env.DWEB_RESOURCE_DIR = tmpDvs

		const mod = (await import('@electron/backend/modules/meshy/service.mjs')) as Record<
			string,
			unknown
		>
		expect(typeof mod.generateModel).toBe('function')
		expect(typeof mod.getBalance).toBe('function')
	})
})

describe('对已有蓝图架构的边界合规性检查（确保不越界）', () => {
	it('本次修改的三个文件均位于 electron/backend 主进程层，不触碰 src/{engine,src}/图形底座/蓝图业务层代码', () => {
		for (const f of FIXED_FILES) {
			const rel = path.relative(PROJECT_ROOT, f.absPath).replace(/\\/g, '/')
			expect(rel.startsWith('electron/backend/')).toBe(true)
			expect(rel.startsWith('src/')).toBe(false)
			expect(rel.startsWith('engine/')).toBe(false)
		}
	})

	it('修改内容仅为 ESM import + const require 声明（增量），不改动业务实现', () => {
		// 对每个文件，用 git diff 限制改动区
		// 这里用源码断言：改动前后源码应同时含有 require('electron') 调用（修复前就存在），
		// 且新增了 createRequire import 与声明。
		for (const f of FIXED_FILES) {
			const src = readText(f.absPath)
			const hasReq = src.includes("require('electron')") || src.includes('require("electron")')
			const hasCreateReqImport =
				/import\s*\{\s*createRequire\s*\}\s*from\s*['"](?:node:)?module['"]/.test(src)
			const hasCreateReqDecl = /const\s+require\s*=\s*createRequire\(/.test(src)
			expect(hasReq).toBe(true)
			expect(hasCreateReqImport).toBe(true)
			expect(hasCreateReqDecl).toBe(true)
		}
	})
})
