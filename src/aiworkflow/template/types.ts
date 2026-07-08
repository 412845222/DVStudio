export type TemplateSource = 'builtin' | 'user' | 'steam-user' | 'steam-workshop'

export type CloudSyncStatus = 'synced' | 'syncing' | 'local-only' | 'cloud-only' | 'error'

export type TemplateCategory =
	| 'video-generation'
	| 'image-to-video'
	| 'text-to-image'
	| 'model3d'
	| 'comfyui'
	| 'basic'
	| 'other'

export type TemplateViewMode = 'grid-large' | 'grid-small' | 'list'

export type TemplateScope = 'full' | 'selection'

export interface TemplateItem {
	id: string
	name: string
	description: string
	category: TemplateCategory
	source: TemplateSource
	thumbnail?: string
	coverUrl?: string
	coverPath?: string
	packagePath?: string
	packageData?: Blob
	filePath?: string
	createdAt?: number
	updatedAt?: number
	author?: string
	version?: string
	tags?: string[]
	nodeCount?: number
	resourceCount?: number
	steamFileId?: string
	cloudSyncStatus?: CloudSyncStatus
	lastSyncAt?: number
	workshopItemId?: string
	subscribed?: boolean
}

export interface BuiltinTemplateConfig {
	id: string
	name: string
	description: string
	category: TemplateCategory
	thumbnail?: string
	packagePath: string
	author?: string
	version?: string
	tags?: string[]
	nodeCount?: number
}

export type ApplyTarget = 'current' | 'new-project'

export interface TemplateApplyOptions {
	template: TemplateItem
	target: ApplyTarget
	newProjectName?: string
	newProjectPath?: string
}

export interface SaveTemplateOptions {
	name: string
	description?: string
	category?: TemplateCategory
	tags?: string[]
	scope: TemplateScope
	nodeIds?: string[]
	coverBlob?: Blob | null
}
