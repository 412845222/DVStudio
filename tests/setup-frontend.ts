import { vi } from 'vitest'

if (typeof HTMLCanvasElement !== 'undefined') {
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
			getAppInfo: vi.fn().mockResolvedValue({
				appName: 'DVStudio',
				appId: 'com.dwebstudio.dvstudio',
				appVersion: '0.1.0',
				copyright: 'Copyright (c) 2026 DwebStudio',
				license: 'MIT',
				homepage: 'https://www.dweb.club/',
				repoUrl: 'https://github.com/412845222/DVStudio',
				bilibiliUrl: 'https://space.bilibili.com/22690066',
				issuesUrl: 'https://github.com/412845222/DVStudio/issues'
			}),
			checkForUpdate: vi.fn().mockResolvedValue({
				ok: true,
				hasUpdate: false,
				currentVersion: '0.1.0',
				latestVersion: '0.1.0'
			}),
			isSteamVersion: vi.fn().mockResolvedValue({
				ok: true,
				isSteam: false
			})
		},
		window: {
			minimize: vi.fn(),
			toggleMaximize: vi.fn(),
			isMaximized: vi.fn().mockResolvedValue(false),
			reload: vi.fn(),
			openDevTools: vi.fn(),
			close: vi.fn()
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
			importProjectAsset: vi.fn().mockResolvedValue({ ok: true })
		},
		agentSkills: {
			sceneUnderstand: {
				models: vi.fn().mockResolvedValue({
					ok: true,
					models: [{ id: 'test-model', label: 'Test Model' }],
					defaultModel: 'test-model'
				}),
				run: vi.fn().mockResolvedValue({
					ok: true,
					model: 'test-model',
					outputJson: '{}',
					summary: 'Test summary'
				}),
				runStream: vi.fn().mockImplementation(() =>
					(async function* () {
						yield { type: 'done' }
					})()
				)
			},
			sceneLighting: {
				models: vi.fn().mockResolvedValue({
					ok: true,
					models: [{ id: 'lighting-model', label: 'Lighting Model' }],
					defaultModel: 'lighting-model'
				}),
				run: vi.fn().mockResolvedValue({
					ok: true,
					model: 'lighting-model',
					outputJson: '{}',
					summary: 'Lighting summary'
				}),
				runStream: vi.fn().mockImplementation(() =>
					(async function* () {
						yield { type: 'done' }
					})()
				)
			},
			sceneLayout: {
				run: vi.fn().mockResolvedValue({ ok: true, layoutItems: [] })
			},
			unreal: {
				sessions: vi.fn().mockResolvedValue([]),
				register: vi.fn().mockResolvedValue({ ok: true }),
				sessionDetail: vi.fn().mockResolvedValue({}),
				createJob: vi.fn().mockResolvedValue({ ok: true }),
				jobDetail: vi.fn().mockResolvedValue({}),
				heartbeat: vi.fn().mockResolvedValue({ ok: true }),
				pickJob: vi.fn().mockResolvedValue({ ok: true }),
				getHttpPort: vi.fn().mockResolvedValue(8080),
				detectEditor: vi.fn().mockResolvedValue({ ok: false }),
				checkPlugin: vi.fn().mockResolvedValue({ ok: true }),
				installPlugin: vi.fn().mockResolvedValue({ ok: true }),
				getPluginInfo: vi.fn().mockResolvedValue({}),
				disconnectSession: vi.fn().mockResolvedValue({ ok: true })
			}
		},
		taskQueue: {
			list: vi.fn().mockResolvedValue({ ok: true, tasks: [] }),
			listByProject: vi.fn().mockResolvedValue({ ok: true, tasks: [] }),
			listUnbackfilledCompleted: vi.fn().mockResolvedValue({ ok: true, tasks: [] }),
			reconcile: vi.fn().mockResolvedValue({ ok: true }),
			summary: vi.fn().mockResolvedValue({
				ok: true,
				summary: {
					total: 0,
					activeCount: 0,
					runningCount: 0,
					submittingCount: 0,
					completedCount: 0,
					failedCount: 0,
					cancelledCount: 0,
					overallProgress: 0,
					tasks: []
				}
			}),
			get: vi.fn().mockResolvedValue({ ok: true, task: null }),
			findByUniqueKey: vi.fn().mockResolvedValue({ ok: true, task: null }),
			findActiveByNodeId: vi.fn().mockResolvedValue({ ok: true, task: null }),
			cancel: vi.fn().mockResolvedValue({ ok: true }),
			dismiss: vi.fn().mockResolvedValue({ ok: true }),
			delete: vi.fn().mockResolvedValue({ ok: true }),
			clearCompleted: vi.fn().mockResolvedValue({ ok: true }),
			markBackfilled: vi.fn().mockResolvedValue({ ok: true }),
			submit: vi.fn().mockResolvedValue({ ok: true }),
			create: vi.fn().mockResolvedValue({ ok: true, task: null }),
			register: vi.fn().mockResolvedValue({ ok: true, task: { id: 'mock-task-id' } }),
			fail: vi.fn().mockResolvedValue({ ok: true }),
			complete: vi.fn().mockResolvedValue({ ok: true }),
			bindRemoteTask: vi.fn().mockResolvedValue({ ok: true }),
			update: vi.fn().mockResolvedValue({ ok: true }),
			onUpdate: vi.fn(() => 1),
			onSummary: vi.fn(() => 2),
			onDeleted: vi.fn(() => 3),
			onTaskCompleted: vi.fn(() => 4),
			off: vi.fn()
		}
	})
	vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
	vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'web', isElectron: false })

	vi.stubGlobal('__DWEB_REPO_URL__', 'https://github.com/412845222/DVStudio')
	vi.stubGlobal('__DWEB_APP_VERSION__', '0.1.3')
	vi.stubGlobal('__DWEB_APP_NAME__', 'DVStudio')
	vi.stubGlobal('__DWEB_APP_COPYRIGHT__', 'Copyright (c) 2026 DwebStudio')
	vi.stubGlobal('__DWEB_HOMEPAGE_URL__', 'https://www.dweb.club/')
	vi.stubGlobal('__DWEB_BILIBILI_URL__', 'https://space.bilibili.com/22690066')
	vi.stubGlobal('__DWEB_ISSUES_URL__', 'https://github.com/412845222/DVStudio/issues')

	// 2. 空 fetch 桩：由各 Service 测试自行覆盖实现
	vi.stubGlobal('fetch', vi.fn())

	// 3. WebGL2 + Canvas2D 桩：用于 VideoScene / engine 组件
	const mock2DContext = {
		canvas: { width: 1920, height: 1080 },
		save: () => {},
		restore: () => {},
		translate: () => {},
		scale: () => {},
		rotate: () => {},
		transform: () => {},
		setTransform: () => {},
		resetTransform: () => {},
		clearRect: () => {},
		fillRect: () => {},
		strokeRect: () => {},
		beginPath: () => {},
		closePath: () => {},
		moveTo: () => {},
		lineTo: () => {},
		bezierCurveTo: () => {},
		quadraticCurveTo: () => {},
		arc: () => {},
		arcTo: () => {},
		ellipse: () => {},
		rect: () => {},
		fill: () => {},
		stroke: () => {},
		drawImage: () => {},
		clip: () => {},
		isPointInPath: () => false,
		isPointInStroke: () => false,
		fillText: () => {},
		strokeText: () => {},
		measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
		createLinearGradient: () => ({ addColorStop: () => {} }),
		createRadialGradient: () => ({ addColorStop: () => {} }),
		createPattern: () => ({}),
		createImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray() }),
		getImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray() }),
		putImageData: () => {},
		setLineDash: () => {},
		getLineDash: () => [],
		drawFocusIfNeeded: () => {},
		scrollPathIntoView: () => {},
		fillStyle: '#000',
		strokeStyle: '#000',
		globalAlpha: 1,
		lineWidth: 1,
		lineCap: 'butt' as CanvasLineCap,
		lineJoin: 'miter' as CanvasLineJoin,
		miterLimit: 10,
		lineDashOffset: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		shadowBlur: 0,
		shadowColor: 'transparent',
		globalCompositeOperation: 'source-over',
		font: '12px sans-serif',
		textAlign: 'start' as CanvasTextAlign,
		textBaseline: 'alphabetic' as CanvasTextBaseline,
		direction: 'ltr' as CanvasDirection,
		imageSmoothingEnabled: true,
		imageSmoothingQuality: 'low' as ImageSmoothingQuality
	}
	Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
		value: (type: string) => {
			if (type === '2d') {
				return mock2DContext as unknown as CanvasRenderingContext2D
			}
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
					getAttribLocation: () => 0
				} as unknown as WebGL2RenderingContext
			}
			return null
		},
		configurable: true
	})

	// 4. ResizeObserver 桩
	vi.stubGlobal(
		'ResizeObserver',
		vi.fn().mockImplementation(() => ({
			observe: vi.fn(),
			unobserve: vi.fn(),
			disconnect: vi.fn()
		}))
	)

	// 5. MutationObserver 桩
	vi.stubGlobal(
		'MutationObserver',
		vi.fn().mockImplementation(() => ({
			observe: vi.fn(),
			disconnect: vi.fn(),
			takeRecords: () => []
		}))
	)
}
