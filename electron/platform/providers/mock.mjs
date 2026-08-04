import { EventEmitter } from 'node:events'

class MockPlatformProvider extends EventEmitter {
	constructor() {
		super()
		this._initialized = false
		this._overlayActive = false
		this._user = {
			platformId: 'mock-0',
			displayName: 'Developer',
			avatarUrl: null
		}
		this._dlcs = [
			{ appId: 481, name: 'Mock DLC 1', installed: true },
			{ appId: 482, name: 'Mock DLC 2', installed: false }
		]
		this.cloud = {
			getQuota: () => ({
				ok: true,
				totalBytes: 1024 * 1024 * 100,
				availableBytes: 1024 * 1024 * 90
			}),
			fileWrite: (_fileName, _buffer) => {
				return { ok: true }
			},
			fileRead: (_fileName) => {
				return { ok: false, errMsg: 'Mock: no file data' }
			},
			fileDelete: (_fileName) => {
				return { ok: true }
			},
			fileExists: (_fileName) => {
				return { ok: true, exists: false }
			},
			getFileSize: (_fileName) => {
				return { ok: true, size: 0 }
			},
			getFileTimestamp: (_fileName) => {
				return { ok: true, timestamp: Date.now() }
			},
			getFileCount: () => 0,
			getFileNameAndSize: (_index) => {
				return { name: '', size: 0 }
			}
		}

		this.ugc = {
			queryAll: (options = {}) => {
				const { tag } = options
				const mockItems = [
					{
						publishedFileId: 'mock-official-1',
						title: '官方视频生成模板',
						description: '一键生成高质量AI视频，支持多种风格切换',
						tags: ['official', 'video-generation'],
						fileSize: 1024 * 1024 * 5,
						createdAt: Date.now() - 86400000 * 7,
						updatedAt: Date.now(),
						previewUrl: null,
						author: 'DVStudio Team',
						isOfficial: true
					},
					{
						publishedFileId: 'mock-official-2',
						title: '官方图片生成模板',
						description: 'AI图像生成工作流，支持文生图和图生图',
						tags: ['official', 'image-generation'],
						fileSize: 1024 * 1024 * 3,
						createdAt: Date.now() - 86400000 * 5,
						updatedAt: Date.now() - 86400000 * 2,
						previewUrl: null,
						author: 'DVStudio Team',
						isOfficial: true
					},
					{
						publishedFileId: 'mock-official-3',
						title: '官方3D建模模板',
						description: '快速创建3D模型的AI工作流',
						tags: ['official', '3d-modeling'],
						fileSize: 1024 * 1024 * 8,
						createdAt: Date.now() - 86400000 * 3,
						updatedAt: Date.now() - 86400000,
						previewUrl: null,
						author: 'DVStudio Team',
						isOfficial: true
					}
				]
				let items = mockItems
				if (tag && tag !== 'official') {
					items = mockItems.filter((t) => t.tags?.includes(tag))
				}
				return {
					ok: true,
					items,
					totalResults: items.length
				}
			},
			downloadItem: (publishedFileId) => {
				return { ok: true, contentPath: `/mock-workshop/${publishedFileId}` }
			},
			getDownloadProgress: (publishedFileId) => {
				return { progress: 50, state: 'downloading' }
			},
			getItemInstallInfo: (publishedFileId) => {
				return { ok: true, installed: true, installPath: `/mock-workshop/${publishedFileId}` }
			}
		}
	}

	get id() {
		return 'mock'
	}
	get displayName() {
		return 'Mock'
	}

	preflightCheck() {
		return false
	}

	async init() {
		this._initialized = true
		return { ok: true }
	}

	shutdown() {
		this._initialized = false
		this._overlayActive = false
	}

	runCallbacks() {}

	isAvailable() {
		return true
	}
	isInitialized() {
		return this._initialized
	}
	isLoggedIn() {
		return true
	}
	isOwned() {
		return true
	}
	getUserInfo() {
		return { ...this._user }
	}

	getUserAvatarUrl() {
		return null
	}

	isOverlayEnabled() {
		return false
	}

	isOverlayActive() {
		return this._overlayActive
	}

	overlayOpenUrl(url) {
		console.log(`[platform:mock] overlayOpenUrl called with: ${url}`)
		return { ok: true }
	}

	overlayActivateGameOverlay(dialog) {
		console.log(
			`[platform:mock] overlayActivateGameOverlay called with dialog: ${dialog || 'default'}`
		)
		this._overlayActive = true
		this.emit('overlay-activated', { platformId: 'mock' })
		setTimeout(() => {
			this._overlayActive = false
			this.emit('overlay-deactivated', { platformId: 'mock' })
		}, 100)
		return { ok: true }
	}

	isDlcInstalled(dlcAppId) {
		const dlc = this._dlcs.find((d) => d.appId === dlcAppId)
		return dlc?.installed || false
	}

	getInstalledDlcs() {
		return this._dlcs.filter((d) => d.installed).map((d) => ({ ...d }))
	}
}

export function createMockProvider() {
	return new MockPlatformProvider()
}
