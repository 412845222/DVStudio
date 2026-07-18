// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'

const mockUserData = path.join(os.tmpdir(), 'dweb-test-userdata-' + Date.now())
const mockAppGetPath = vi.fn().mockReturnValue(mockUserData)
const mockDialog = {
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
  showErrorBox: vi.fn(),
}
const mockShell = { openPath: vi.fn() }
const mockBrowserWindow = { getAllWindows: vi.fn(() => []) }

let mockConfig: Record<string, unknown> = {}
const mockFs = {
  existsSync: vi.fn((p: string) => {
    if (String(p).endsWith('comfyui_setup.json')) return true
    return false
  }),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((p: string) => {
    if (String(p).endsWith('comfyui_setup.json')) return JSON.stringify(mockConfig)
    return '{}'
  }),
  writeFileSync: vi.fn((_p: string, data: string) => {
    try { mockConfig = JSON.parse(data) } catch { /* ignore */ }
  }),
  rmSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  readdirSync: vi.fn(() => []),
}

vi.mock('electron', () => ({
  app: { getPath: mockAppGetPath },
  dialog: mockDialog,
  shell: mockShell,
  BrowserWindow: mockBrowserWindow,
}))

vi.mock('node:fs', () => ({ default: mockFs }))

vi.mock('js-yaml', () => ({ default: { load: vi.fn() } }))
vi.mock('../../core/errors.mjs', () => ({
  internalError: (msg: string) => new Error(msg),
  invalidParamsError: (msg: string) => new Error(msg),
}))
vi.mock('./log-line-parser.mjs', () => ({
  processStreamData: vi.fn(() => []),
  createLineParserState: vi.fn(() => ({ buffer: '' })),
}))

describe('comfyui setup-service: exported venv path safety', () => {
  let setupSetVenvPath: (_ctx: unknown, payload: { path?: string }) => { ok: boolean; error?: string; venvPath?: string }
  let setupGetDefaultVenvPath: (_ctx: unknown, payload?: { installPath?: string }) => { path: string }
  let setupClearVenv: (_ctx: unknown, payload?: { venvPath?: string }) => { ok: boolean; error?: string }

  beforeEach(async () => {
    vi.resetModules()
    mockConfig = { installPath: 'C:\\ComfyUIDesktop\\ComfyUI' }
    mockAppGetPath.mockReturnValue(mockUserData)
    mockFs.existsSync.mockImplementation((p: string) => {
      if (String(p).endsWith('comfyui_setup.json')) return true
      return false
    })
    mockFs.rmSync.mockImplementation(() => undefined)
    mockFs.statSync.mockImplementation(() => ({ isDirectory: () => true }))
    mockFs.readdirSync.mockReturnValue([])

    const mod = await import('../../../electron/backend/modules/comfyui/setup-service.mjs')
    setupSetVenvPath = mod.setupSetVenvPath
    setupGetDefaultVenvPath = mod.setupGetDefaultVenvPath
    setupClearVenv = mod.setupClearVenv
  })

  it('setupGetDefaultVenvPath returns userData-based path, not installPath', () => {
    const result = setupGetDefaultVenvPath(null as any, { installPath: 'C:\\ComfyUIDesktop\\ComfyUI' })
    expect(result.path).toBe(path.join(mockUserData, 'comfyui-python'))
    expect(result.path.toLowerCase()).not.toContain('comfyuidesktop')
  })

  it('setupSetVenvPath rejects venv inside installPath and auto-corrects to safe path', () => {
    const unsafePath = 'C:\\ComfyUIDesktop\\ComfyUI\\comfyui-python\\venv'
    const result = setupSetVenvPath(null as any, { path: unsafePath })
    expect(result.ok).toBe(false)
    expect(result.venvPath).toBeDefined()
    expect(result.venvPath!.toLowerCase()).not.toContain('comfyuidesktop\\comfyui')
    expect(result.error).toContain('不能设置在 ComfyUI 安装目录下')
  })

  it('setupSetVenvPath accepts safe paths outside installPath', () => {
    const safePath = 'D:\\AI\\comfyui-venv'
    const result = setupSetVenvPath(null as any, { path: safePath })
    expect(result.ok).toBe(true)
  })

  it('setupSetVenvPath resets venvPath when path is empty/undefined', () => {
    const result = setupSetVenvPath(null as any, { path: undefined })
    expect(result.ok).toBe(true)
  })

  it('setupClearVenv returns error for venv inside installPath (safety guard)', () => {
    const unsafeVenvInInstallDir = 'C:\\ComfyUIDesktop\\ComfyUI\\venv'
    mockFs.existsSync.mockImplementation((p: string) => {
      if (String(p).endsWith('comfyui_setup.json')) return true
      if (String(p) === unsafeVenvInInstallDir) return true
      return false
    })
    mockConfig = { installPath: 'C:\\ComfyUIDesktop\\ComfyUI', venvPath: unsafeVenvInInstallDir }
    const result = setupClearVenv(null as any, { venvPath: unsafeVenvInInstallDir })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ComfyUI 安装目录下')
  })
})

describe('comfyui setup-service: requirements.txt parsing (pure logic)', () => {
  function parseRequirementLines(reqContent: string): string[] {
    return reqContent.split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('-r') && !l.startsWith('-e') && !l.startsWith('--'))
  }

  function extractPackageName(line: string): string | null {
    const m = line.match(/^([a-zA-Z0-9_][a-zA-Z0-9._-]*)/)
    return m ? m[1] : null
  }

  function toPipName(name: string): string {
    return name.replace(/_/g, '-')
  }

  it('filters out comments, blank lines, and pip options', () => {
    const content = [
      '# ComfyUI requirements',
      '',
      'requests>=2.20.0',
      'numpy',
      '-r extra.txt',
      'Pillow>=9.0.0',
      '-e .',
      '--extra-index-url https://example.com',
      'torch>=2.0.0',
      'comfy-aimdo==0.3.0',
    ].join('\n')

    const lines = parseRequirementLines(content)
    expect(lines).toEqual(['requests>=2.20.0', 'numpy', 'Pillow>=9.0.0', 'torch>=2.0.0', 'comfy-aimdo==0.3.0'])
    expect(lines).not.toContain('')
    expect(lines.find((l) => l.startsWith('-'))).toBeUndefined()
    expect(lines.find((l) => l.startsWith('#'))).toBeUndefined()
  })

  it('extracts package names from requirement specifiers', () => {
    expect(extractPackageName('comfy-aimdo==0.3.0')).toBe('comfy-aimdo')
    expect(extractPackageName('torch>=2.0.0')).toBe('torch')
    expect(extractPackageName('numpy')).toBe('numpy')
    expect(extractPackageName('Pillow>=9.0.0')).toBe('Pillow')
    expect(extractPackageName('jsonschema>=4.0')).toBe('jsonschema')
  })

  it('converts underscore package names to pip hyphen names', () => {
    expect(toPipName('comfy_aimdo')).toBe('comfy-aimdo')
    expect(toPipName('comfy-kitchen')).toBe('comfy-kitchen')
    expect(toPipName('foo_bar_baz')).toBe('foo-bar-baz')
  })

  it('round-trip: missing module name from ModuleNotFoundError can be used to pip install', () => {
    const errMsg = "ModuleNotFoundError: No module named 'comfy_aimdo'"
    const match = errMsg.match(/ModuleNotFoundError: No module named '([^']+)'/)
    expect(match).not.toBeNull()
    const pipName = toPipName(match![1])
    expect(pipName).toBe('comfy-aimdo')
  })
})

describe('comfyui setup-service: CUDA suffix detection (pure logic replication)', () => {
  const TORCH_CUDA_MAP = [
    { minCuda: 12.4, suffix: 'cu124' },
    { minCuda: 12.1, suffix: 'cu121' },
    { minCuda: 11.8, suffix: 'cu118' },
  ]

  function getTorchCuSuffix(cudaVersionStr?: string, hasNvidiaGpu?: boolean): string {
    if (!hasNvidiaGpu || !cudaVersionStr) return 'cpu'
    const v = parseFloat(cudaVersionStr)
    if (isNaN(v)) return 'cpu'
    for (const entry of TORCH_CUDA_MAP) {
      if (v >= entry.minCuda) return entry.suffix
    }
    return 'cpu'
  }

  it('maps CUDA versions to correct wheel suffix', () => {
    expect(getTorchCuSuffix('12.6', true)).toBe('cu124')
    expect(getTorchCuSuffix('12.4', true)).toBe('cu124')
    expect(getTorchCuSuffix('12.1', true)).toBe('cu121')
    expect(getTorchCuSuffix('11.8', true)).toBe('cu118')
  })

  it('returns cpu for no GPU or old CUDA', () => {
    expect(getTorchCuSuffix('', false)).toBe('cpu')
    expect(getTorchCuSuffix('11.0', true)).toBe('cpu')
    expect(getTorchCuSuffix(undefined, true)).toBe('cpu')
  })
})
