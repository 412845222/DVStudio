export type TemplateSource = 'builtin' | 'user'

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
}
