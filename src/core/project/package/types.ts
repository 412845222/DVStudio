import type { EditorSnapshot } from '../../editor/types'

export type ProjectSchemaVersion = 1

export type ProjectJsonV1 = {
	schemaVersion: 1
	createdAt: number
	snapshot: EditorSnapshot
}

export type ProjectPackageV1 = {
	project: ProjectJsonV1
	assets: ProjectAssetsV1
}

export type ProjectAssetFileV1 = {
	mime: string
	bytesBase64: string
}

export type ProjectAssetsV1 = {
	files: Record<string, ProjectAssetFileV1>
}
