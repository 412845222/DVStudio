import { vi } from 'vitest'

// 1. 模拟 Electron 桥：在 jsdom 下 window.dweb 不存在，提供桩对象
vi.stubGlobal('dweb', {
  common: {
    getBackendBaseUrl: vi.fn().mockResolvedValue('http://127.0.0.1:5800'),
    getBackendRuntimeState: vi.fn().mockResolvedValue({ status: 'ready' }),
    onBackendRuntimeStateChanged: vi.fn(() => () => {}),
    getClientSettings: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    saveClientSettings: vi.fn().mockResolvedValue({ ok: true }),
    getBackendStatus: vi.fn().mockResolvedValue({ ok: true }),
    runSetupWorkflow: vi.fn().mockResolvedValue({ ok: true }),
    cleanupOldProject: vi.fn().mockResolvedValue({ ok: true }),
    startBackend: vi.fn().mockResolvedValue({ ok: true }),
    pingBackend: vi.fn().mockResolvedValue({ ok: true }),
    restartBackend: vi.fn().mockResolvedValue({ ok: true }),
    getBackendLogs: vi.fn().mockResolvedValue([]),
    clearBackendLogs: vi.fn().mockResolvedValue({ ok: true }),
    collectDiagnostics: vi.fn().mockResolvedValue({ ok: true }),
    revealUserDataDir: vi.fn().mockResolvedValue({ ok: true }),
    openExternalUrl: vi.fn().mockResolvedValue({ ok: true }),
    openFolderForPath: vi.fn().mockResolvedValue({ ok: true }),
    runBootstrapInstaller: vi.fn().mockResolvedValue({ ok: true }),
  },
  window: {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    reload: vi.fn(),
    openDevTools: vi.fn(),
    close: vi.fn(),
  },
  aiworkflow: {
    selectMediaFiles: vi.fn().mockResolvedValue([]),
    selectProjectFolder: vi.fn().mockResolvedValue(null),
    registerProjectRoot: vi.fn().mockResolvedValue({ ok: true }),
    clearProjectRoot: vi.fn().mockResolvedValue({ ok: true }),
    getProjectRootSnapshot: vi.fn().mockResolvedValue({ assets: [] }),
    downloadUrlToProjectRoot: vi.fn().mockResolvedValue({ ok: true }),
    copyFileToProjectRoot: vi.fn().mockResolvedValue({ ok: true }),
    uploadProjectAsset: vi.fn().mockResolvedValue({ ok: true }),
    importProjectAsset: vi.fn().mockResolvedValue({ ok: true }),
  },
})
vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'web', isElectron: false })

// 2. 空 fetch 桩：由各 Service 测试自行覆盖实现
vi.stubGlobal('fetch', vi.fn())

// 3. WebGL2 桩：用于 VideoScene / engine 组件
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: (type: string) => {
    if (type === 'webgl2' || type === 'webgl') {
      return {
        getExtension: () => null,
        viewport: () => {},
        clearColor: () => {},
        clear: () => {},
        createShader: () => ({}),
        createProgram: () => ({}),
        attachShader: () => {},
        linkProgram: () => {},
        useProgram: () => {},
        getProgramParameter: () => true,
        getShaderParameter: () => true,
        shaderSource: () => {},
        compileShader: () => {},
        createBuffer: () => ({}),
        bindBuffer: () => {},
        bufferData: () => {},
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        drawArrays: () => {},
        createTexture: () => ({}),
        bindTexture: () => {},
        texImage2D: () => {},
        activeTexture: () => {},
        uniform1i: () => {},
        uniform1f: () => {},
        uniformMatrix4fv: () => {},
        getUniformLocation: () => ({}),
        getAttribLocation: () => 0,
      } as unknown as WebGL2RenderingContext
    }
    return null
  },
  configurable: true,
})

// 4. ResizeObserver 桩
vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})))

// 5. MutationObserver 桩
vi.stubGlobal('MutationObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: () => [],
})))
