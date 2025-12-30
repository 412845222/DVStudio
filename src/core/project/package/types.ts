import type { EditorSnapshot } from '../../editor/types'

export type ProjectSchemaVersion = 1

export type ProjectJsonV1 = {
	schemaVersion: 1
	createdAt: number
	snapshot: EditorSnapshot
}

export type ProjectAssetKindV1 = 'image'

export type ProjectAssetEntryV1 = {
	id: string
	kind: ProjectAssetKindV1
	mime: string
	name?: string
	createdAt?: number
	width?: number
	height?: number

	// 资源来源：
	// - url：引用外部 URL（当前项目普遍使用这种方式）
	// - fileKey：引用包内二进制文件（未来支持从 File/Blob 导入后写入 bytesBase64）
	url?: string
	fileKey?: string
}

export type ProjectManifestV1 = {
	schemaVersion: 1
	assets: Record<string, ProjectAssetEntryV1>
}

export type ProjectPackageV1 = {
	project: ProjectJsonV1
	manifest: ProjectManifestV1
	assets: ProjectAssetsV1
}

export type ProjectAssetFileV1 = {
	mime: string
	bytesBase64: string
}

export type ProjectAssetsV1 = {
	files: Record<string, ProjectAssetFileV1>
}

export type ImportProjectOptionsV1 = {
	// 用于在导入时做 asset id 去重重写（避免与现有项目冲突）
	existingSnapshot?: EditorSnapshot
}

export type ImportProjectResultV1 = {
	snapshot: EditorSnapshot
	assetIdMap: Record<string, string>
	manifest: ProjectManifestV1
}
