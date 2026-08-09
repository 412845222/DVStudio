// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'

const mockUserData = path.join(os.tmpdir(), 'dweb-test-triton-' + Date.now())
const mockAppGetPath = vi.fn().mockReturnValue(mockUserData)
const mockDialog = {
	showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
	showErrorBox: vi.fn()
}
const mockShell = { openPath: vi.fn() }
const mockBrowserWindow = { getAllWindows: vi.fn(() => []) }

let mockConfig: Record<string, unknown> = {}

// 模拟 triton windows_utils.py 的原始内容片段
const TRITON_ORIGINAL = `def check_msvc(msvc_base_path: Path, version: str) -> bool:
    return all(x.exists() for x in [
        msvc_base_path / version / "bin" / "Hostx64" / "x64" / "cl.exe",
    ])


def find_msvc_env() -> tuple[Optional[Path], Optional[str]]:
    msvc_base_path = os.getenv("VCINSTALLDIR")
    if msvc_base_path is None:
        return None, None
    msvc_base_path = Path(msvc_base_path) / "Tools" / "MSVC"

    version = os.getenv("VCToolsVersion")
    if not check_msvc(msvc_base_path, version):
        return None, None
    return msvc_base_path, version
`

const PATCH_MARKER = '# DVStudio-patch: triton-windows None-guard for check_msvc'

// 可控的 fs 状态
let mockFsState: {
	files: Map<string, string>
	dirs: Set<string>
} = {
	files: new Map(),
	dirs: new Set()
}

const mockFs = {
	existsSync: vi.fn((p: string) => {
		const s = String(p)
		if (s.endsWith('comfyui_setup.json')) return true
		if (mockFsState.files.has(s)) return true
		if (mockFsState.dirs.has(s)) return true
		return false
	}),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn((p: string) => {
		const s = String(p)
		if (s.endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
		if (mockFsState.files.has(s)) return mockFsState.files.get(s)!
		return ''
	}),
	writeFileSync: vi.fn((p: string, data: string) => {
		mockFsState.files.set(String(p), data)
	}),
	rmSync: vi.fn(),
	statSync: vi.fn(() => ({ isDirectory: () => true })),
	readdirSync: vi.fn(() => [])
}

// 可控的 spawnSync 返回值
let mockSpawnSyncResult: { status: number | null; stdout: string; error?: Error } = {
	status: 0,
	stdout: '/fake/site-packages'
}

const mockSpawnSync = vi.fn(() => mockSpawnSyncResult)

vi.mock('electron', () => ({
	app: { getPath: mockAppGetPath },
	dialog: mockDialog,
	shell: mockShell,
	BrowserWindow: mockBrowserWindow
}))

vi.mock('node:fs', () => ({ default: mockFs }))

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	spawnSync: (...args: unknown[]) => mockSpawnSync(...args)
}))

vi.mock('js-yaml', () => ({ default: { load: vi.fn() } }))
vi.mock('../../../core/errors.mjs', () => ({
	internalError: (msg: string) => new Error(msg),
	invalidParamsError: (msg: string) => new Error(msg)
}))
vi.mock('../../../backend/modules/comfyui/log-line-parser.mjs', () => ({
	processStreamData: vi.fn(() => []),
	createLineParserState: vi.fn(() => ({ buffer: '' }))
}))

describe('comfyui setup-service: buildComfySpawnEnv (方案B 环境清理)', () => {
	let buildComfySpawnEnv: () => Record<string, string | undefined>

	let originalPlatform: NodeJS.Platform

	beforeEach(async () => {
		// 与方案A describe 的 beforeEach 保持完全一致：强制 win32 才能让 buildComfySpawnEnv
		// 内部 `if (process.platform === 'win32')` 分支在 Linux CI runner 下也真实执行，
		// 否则 L166 的 guard 直接跳过，VCINSTALLDIR / VCToolsVersion 不完整检测的 delete 逻辑
		// 永远不跑，导致 PR #254 Frontend Tests (All) Ubuntu runner 抛：
		//   expected 'C:\Program Files\Microsoft Visual Studio' / '14.42.34433' to be undefined
		// （本地 Windows 环境因为 platform 本身是 win32，所以 2239 tests 全过，看不到该 bug）
		originalPlatform = process.platform
		Object.defineProperty(process, 'platform', {
			value: 'win32',
			writable: true,
			configurable: true
		})

		vi.resetModules()
		mockConfig = {}
		mockFsState = { files: new Map(), dirs: new Set() }

		const mod = await import('../../../electron/backend/modules/comfyui/setup-service.mjs')
		buildComfySpawnEnv = mod.buildComfySpawnEnv
	})

	afterEach(() => {
		delete process.env.VCINSTALLDIR
		delete process.env.VCToolsVersion
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
			configurable: true
		})
	})

	it('always sets PYTHONIOENCODING to utf-8', () => {
		const env = buildComfySpawnEnv()
		expect(env.PYTHONIOENCODING).toBe('utf-8')
	})

	it('preserves both VCINSTALLDIR and VCToolsVersion when both are set (complete VS env)', () => {
		process.env.VCINSTALLDIR = 'C:\\Program Files\\Microsoft Visual Studio'
		process.env.VCToolsVersion = '14.42.34433'
		const env = buildComfySpawnEnv()
		expect(env.VCINSTALLDIR).toBe('C:\\Program Files\\Microsoft Visual Studio')
		expect(env.VCToolsVersion).toBe('14.42.34433')
	})

	it('deletes both when only VCINSTALLDIR is set (incomplete VS env)', () => {
		process.env.VCINSTALLDIR = 'C:\\Program Files\\Microsoft Visual Studio'
		delete process.env.VCToolsVersion
		const env = buildComfySpawnEnv()
		expect(env.VCINSTALLDIR).toBeUndefined()
		expect(env.VCToolsVersion).toBeUndefined()
	})

	it('deletes both when only VCToolsVersion is set (incomplete VS env)', () => {
		delete process.env.VCINSTALLDIR
		process.env.VCToolsVersion = '14.42.34433'
		const env = buildComfySpawnEnv()
		expect(env.VCINSTALLDIR).toBeUndefined()
		expect(env.VCToolsVersion).toBeUndefined()
	})

	it('does not add VCINSTALLDIR/VCToolsVersion when neither is set', () => {
		delete process.env.VCINSTALLDIR
		delete process.env.VCToolsVersion
		const env = buildComfySpawnEnv()
		expect(env.VCINSTALLDIR).toBeUndefined()
		expect(env.VCToolsVersion).toBeUndefined()
	})

	it('returns a new object (does not mutate process.env)', () => {
		process.env.VCINSTALLDIR = 'C:\\VS'
		const env = buildComfySpawnEnv()
		expect(env).not.toBe(process.env)
		// process.env 本身不应被修改
		expect(process.env.VCINSTALLDIR).toBe('C:\\VS')
	})
})

describe('comfyui setup-service: ensureTritonWindowsNoneGuard (方案A 备援 patch)', () => {
	let ensureTritonWindowsNoneGuard: (venvPython: string) => {
		ok: boolean
		skipped: boolean
		reason?: string
		appliedChecks?: number
		targetFile?: string
		backupFile?: string
		error?: string
	}

	const fakeVenvPython = 'C:\\fake\\venv\\Scripts\\python.exe'
	const fakeSitePackages = 'C:\\fake\\site-packages'
	const targetFile = path.join(fakeSitePackages, 'triton', 'windows_utils.py')
	const backupFile = targetFile + '.dvs-bak'

	let originalPlatform: NodeJS.Platform

	beforeEach(async () => {
		originalPlatform = process.platform
		// Force win32 so the platform guard does not short-circuit on Linux CI
		Object.defineProperty(process, 'platform', {
			value: 'win32',
			writable: true,
			configurable: true
		})

		vi.resetModules()
		mockConfig = {}
		mockFsState = { files: new Map(), dirs: new Set() }
		mockSpawnSyncResult = { status: 0, stdout: fakeSitePackages }
		// mockReset clears both call history AND implementation, then re-set default impl
		mockSpawnSync.mockReset()
		mockSpawnSync.mockImplementation(() => mockSpawnSyncResult)
		mockFs.existsSync.mockClear()
		mockFs.readFileSync.mockClear()
		mockFs.writeFileSync.mockClear()

		const mod = await import('../../../electron/backend/modules/comfyui/setup-service.mjs')
		ensureTritonWindowsNoneGuard = mod.ensureTritonWindowsNoneGuard
	})

	afterEach(() => {
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
			configurable: true
		})
	})

	it('returns skip when not on Windows (process.platform !== win32)', () => {
		// Temporarily restore non-windows platform to exercise the guard path
		Object.defineProperty(process, 'platform', {
			value: 'linux',
			writable: true,
			configurable: true
		})
		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('not_windows')
		expect(result.ok).toBe(true)
	})

	it('returns skip when venv python path does not exist', () => {
		// fs.existsSync returns false for everything except comfyui_setup.json
		const result = ensureTritonWindowsNoneGuard('C:\\nonexistent\\python.exe')
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('venv_python_not_found')
		expect(result.ok).toBe(false)
	})

	it('returns skip when spawnSync fails (non-zero exit, empty site-packages)', () => {
		// Make venv python exist
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			return false
		})
		mockSpawnSyncResult = { status: 1, stdout: '' }

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('site_packages_empty')
		expect(result.ok).toBe(false)
	})

	it('returns skip when spawnSync throws an error', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			return false
		})
		mockSpawnSync.mockImplementation(() => {
			throw new Error('spawn failed')
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('site_packages_resolve_failed')
		expect(result.ok).toBe(false)
		expect(result.error).toContain('spawn failed')
	})

	it('returns skip when triton is not installed (target file does not exist)', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			// targetFile does NOT exist
			return false
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('triton_not_installed')
		expect(result.ok).toBe(true)
	})

	it('returns skip when already patched (PATCH_MARKER present in file)', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			if (String(p) === targetFile) return true
			return false
		})
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
			if (String(p) === targetFile) return TRITON_ORIGINAL + '\n' + PATCH_MARKER
			return ''
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('already_patched')
		expect(result.ok).toBe(true)
		// Should not write anything
		expect(mockFs.writeFileSync).not.toHaveBeenCalled()
	})

	it('returns skip when pattern does not match (triton version changed)', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			if (String(p) === targetFile) return true
			return false
		})
		// Content with completely different function signature
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
			if (String(p) === targetFile) return 'def totally_different_function():\n    pass\n'
			return ''
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('pattern_not_matched')
		expect(result.ok).toBe(true)
		expect(result.targetFile).toBe(targetFile)
		// Should not write the target file
		expect(mockFs.writeFileSync).not.toHaveBeenCalled()
	})

	it('successfully patches when both patterns match (appliedChecks=2)', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			if (String(p) === targetFile) return true
			return false
		})
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
			if (String(p) === targetFile) return TRITON_ORIGINAL
			return ''
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(false)
		expect(result.ok).toBe(true)
		expect(result.appliedChecks).toBe(2)
		expect(result.targetFile).toBe(targetFile)
		expect(result.backupFile).toBe(backupFile)

		// Should write backup first, then patched file
		expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2)
		// First call: backup
		expect(mockFs.writeFileSync.mock.calls[0][0]).toBe(backupFile)
		expect(String(mockFs.writeFileSync.mock.calls[0][1])).toBe(TRITON_ORIGINAL)
		// Second call: patched file
		expect(mockFs.writeFileSync.mock.calls[1][0]).toBe(targetFile)
		const patchedContent = String(mockFs.writeFileSync.mock.calls[1][1])
		expect(patchedContent).toContain(PATCH_MARKER)
		expect(patchedContent).toContain('if version is None:')
		expect(patchedContent).toContain('if version is None or not check_msvc')
	})

	it('successfully patches when only check_msvc pattern matches (appliedChecks=1)', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			if (String(p) === targetFile) return true
			return false
		})
		// Content with only check_msvc but different find_msvc_env
		const partialContent = `def check_msvc(msvc_base_path: Path, version: str) -> bool:
    return all(x.exists() for x in [])

def find_msvc_env():
    return None, None
`
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
			if (String(p) === targetFile) return partialContent
			return ''
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(false)
		expect(result.ok).toBe(true)
		expect(result.appliedChecks).toBe(1)
	})

	it('returns error when writeFileSync fails', () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			if (String(p) === targetFile) return true
			return false
		})
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
			if (String(p) === targetFile) return TRITON_ORIGINAL
			return ''
		})
		// First write (backup) succeeds, second write (patch) fails
		mockFs.writeFileSync.mockImplementationOnce(vi.fn())
		mockFs.writeFileSync.mockImplementationOnce(() => {
			throw new Error('disk full')
		})

		const result = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(result.skipped).toBe(false)
		expect(result.ok).toBe(false)
		expect(result.reason).toBe('write_failed')
		expect(result.error).toContain('disk full')
	})

	it('is idempotent: second call on patched content returns already_patched', () => {
		// Simulate first patch
		mockFs.existsSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return true
			if (String(p) === fakeVenvPython) return true
			if (String(p) === targetFile) return true
			return false
		})
		// Start with original content
		let currentContent = TRITON_ORIGINAL
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
			if (String(p) === targetFile) return currentContent
			return ''
		})
		mockFs.writeFileSync.mockImplementation((p: string, data: string) => {
			if (String(p) === targetFile) {
				currentContent = data
			}
		})

		// First call: should patch
		const r1 = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(r1.skipped).toBe(false)
		expect(r1.appliedChecks).toBe(2)

		// Second call: should detect already patched
		const r2 = ensureTritonWindowsNoneGuard(fakeVenvPython)
		expect(r2.skipped).toBe(true)
		expect(r2.reason).toBe('already_patched')
	})
})
