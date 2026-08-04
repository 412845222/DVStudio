export interface SeedanceContentItem {
	type: 'text' | 'image_url' | 'video_url' | 'audio_url'
	data: string
}

export interface SeedanceGenerationRequest {
	actionId: string
	model: string
	content: SeedanceContentItem[]
	ratio?: string
	resolution?: string
	duration?: number
	generateAudio?: boolean
	cameraFixed?: boolean
	enableWebSearch?: boolean
	priority?: number
}

export interface SeedanceTaskResult {
	taskId: string
	status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
	statusText?: string
	errorMessage?: string
	videoUrl?: string
	lastFrameUrl?: string
	refImageUrls?: string[]
	refVideoUrls?: string[]
	refAudioUrls?: string[]
	updatedAt: string
}

export interface SeedanceTaskQuery {
	status?: string
	model?: string
	limit?: number
}

export interface SeedanceTaskDetail {
	taskId: string
	model: string
	status: string
	prompt: string
	ratio?: string
	resolution?: string
	duration?: number
	generateAudio?: boolean
	cameraFixed?: boolean
	enableWebSearch?: boolean
	priority?: number
	statusText?: string
	errorMessage?: string
	videoUrlLocal?: string
	videoUrlRemote?: string
	lastFrameUrlLocal?: string
	lastFrameUrlRemote?: string
	refImageUrls?: string[]
	refVideoUrls?: string[]
	refAudioUrls?: string[]
	updatedAt: string
	syncedAt?: string
}

export interface SeedanceSyncOptions {
	taskId?: string
	pageNum?: number
	pageSize?: number
	projectId?: number
	saveMedia?: boolean
}

export interface SeedanceApiClient {
	generateVideo(
		request: SeedanceGenerationRequest
	): Promise<{ ok: boolean; error?: string; taskId?: string }>
	getTasks(
		query?: SeedanceTaskQuery
	): Promise<{ ok: boolean; error?: string; items?: SeedanceTaskDetail[] }>
	getTaskDetail(taskId: string): Promise<{ ok: boolean; error?: string; item?: SeedanceTaskDetail }>
	syncTasks(
		options?: SeedanceSyncOptions
	): Promise<{ ok: boolean; error?: string; item?: SeedanceTaskDetail }>
}

export function buildSeedanceContent(
	prompt: string,
	refImageUrls: string[] = [],
	refVideoUrls: string[] = [],
	refAudioUrls: string[] = []
): SeedanceContentItem[] {
	const content: SeedanceContentItem[] = []

	if (prompt.trim()) {
		content.push({ type: 'text', data: prompt.trim() })
	}

	for (const url of refImageUrls) {
		if (url.trim()) {
			content.push({ type: 'image_url', data: url.trim() })
		}
	}

	for (const url of refVideoUrls) {
		if (url.trim()) {
			content.push({ type: 'video_url', data: url.trim() })
		}
	}

	for (const url of refAudioUrls) {
		if (url.trim()) {
			content.push({ type: 'audio_url', data: url.trim() })
		}
	}

	return content
}

export function getSeedanceStatusText(status: string): string {
	const statusMap: Record<string, string> = {
		pending: '等待中',
		running: '运行中',
		succeeded: '成功',
		failed: '失败',
		cancelled: '已取消'
	}
	return statusMap[status.toLowerCase()] || status
}

export function isSeedanceTaskSucceeded(status: string): boolean {
	const s = status.toLowerCase()
	return s === 'succeeded' || s === 'success'
}
