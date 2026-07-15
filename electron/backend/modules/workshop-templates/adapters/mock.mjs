import { UgcAdapter } from './base.mjs'

export class MockUgcAdapter extends UgcAdapter {
	constructor(options = {}) {
		super(options)
		this._templates = [
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
				isOfficial: true,
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
				isOfficial: true,
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
				isOfficial: true,
			},
			{
				publishedFileId: 'mock-official-4',
				title: '官方动画制作模板',
				description: 'AI驱动的动画制作工作流',
				tags: ['official', 'animation'],
				fileSize: 1024 * 1024 * 6,
				createdAt: Date.now() - 86400000 * 2,
				updatedAt: Date.now() - 86400000 * 1,
				previewUrl: null,
				author: 'DVStudio Team',
				isOfficial: true,
			},
		]
	}

	getPlatformId() { return 'mock' }

	getPlatformName() { return 'Mock Workshop' }

	isAvailable() { return true }

	async queryAll(options = {}) {
		const { tag } = options
		let items = this._templates
		if (tag && tag !== 'official') {
			items = this._templates.filter(t => t.tags?.includes(tag))
		}
		return {
			ok: true,
			items,
			totalResults: items.length,
		}
	}

	async downloadItem(publishedFileId) {
		await new Promise(r => setTimeout(r, 1500))
		return { ok: true, contentPath: `/mock-workshop/${publishedFileId}` }
	}

	getDownloadProgress(publishedFileId) {
		return { progress: 50, state: 'downloading' }
	}

	getItemInstallInfo(publishedFileId) {
		return { ok: true, installed: true, installPath: `/mock-workshop/${publishedFileId}` }
	}
}

export function createMockUgcAdapter(options = {}) {
	return new MockUgcAdapter(options)
}