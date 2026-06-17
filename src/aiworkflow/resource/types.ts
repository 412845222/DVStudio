export type ResourceKind = 'image' | 'video' | 'model3d'

export type WorkflowResource = {
	id: string
	kind: ResourceKind
	name: string
	url: string
	/** optional project-relative path under project root (e.g. Content/Media/images/...) */
	projectRelativePath?: string
	/** optional preview image url for UI display (must not be used for final output) */
	previewUrl?: string
	/** optional project-relative preview path under project root */
	previewProjectRelativePath?: string
	/** optional preview cache version/hash for immutable query param */
	previewVersion?: string
	/** optional thumbnail/poster url (e.g. blob:) for preview */
	posterUrl?: string
	/** optional project-relative poster path under project root */
	posterProjectRelativePath?: string
	/** optional absolute path for persisted thumbnail/poster */
	posterSourcePath?: string
	/** optional absolute path on host OS for local assets (desktop/dev usage) */
	sourcePath?: string
	/** optional stable fingerprint for source file-based dedupe */
	sourceFingerprint?: string
	/** optional source filename for fallback dedupe */
	sourceName?: string
	/** optional source byte size for fallback dedupe */
	sourceSize?: number
	/** optional source mtime for fallback dedupe */
	sourceLastModified?: number
	/** optional key to recover local file via File System Access API (IndexedDB handle) */
	localFileKey?: string
	createdAt: number
}

export type ImageResource = WorkflowResource & {
	kind: 'image'
}

export type VideoResource = WorkflowResource & {
	kind: 'video'
}

export type Model3DResource = WorkflowResource & {
	kind: 'model3d'
}
