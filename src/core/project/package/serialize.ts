import { isJsonObject } from '../../shared/json'
import type { EditorSnapshot } from '../../editor/types'
import type {
	ProjectAssetEntryV1,
	ProjectAssetsV1,
	ProjectAssetKindV1,
	ProjectJsonV1,
	ProjectManifestV1,
	ProjectPackageV1,
} from './types'

export const exportProjectJsonV1 = (snapshot: EditorSnapshot, createdAt: number = Date.now()): ProjectJsonV1 => {
	return {
		schemaVersion: 1,
		createdAt,
		snapshot,
	}
}

export const createEmptyManifestV1 = (): ProjectManifestV1 => ({ schemaVersion: 1, assets: {} })

export const exportProjectPackageV1 = (
	snapshot: EditorSnapshot,
	opt?: {
		createdAt?: number
		manifest?: ProjectManifestV1
		assets?: ProjectAssetsV1
	}
): ProjectPackageV1 => {
	return {
		project: exportProjectJsonV1(snapshot, opt?.createdAt ?? Date.now()),
		manifest: opt?.manifest ?? createEmptyManifestV1(),
		assets: opt?.assets ?? { files: {} },
	}
}

export const stringifyProjectJson = (project: ProjectJsonV1): string => {
	return JSON.stringify(project)
}

export const stringifyProjectPackageV1 = (pkg: ProjectPackageV1): string => {
	return JSON.stringify(pkg)
}

export const parseProjectJsonV1 = (json: string): ProjectJsonV1 => {
	const raw = JSON.parse(String(json)) as unknown
	if (!isJsonObject(raw) || raw.schemaVersion !== 1) {
		throw new Error('Unsupported project schemaVersion')
	}
	const snapshot = raw.snapshot
	if (!isJsonObject(snapshot)) throw new Error('Invalid project snapshot')
	if (!isJsonObject(snapshot.videoScene)) throw new Error('Invalid snapshot.videoScene')
	if (!isJsonObject(snapshot.videoStudio)) throw new Error('Invalid snapshot.videoStudio')
	if (!isJsonObject(snapshot.timeline)) throw new Error('Invalid snapshot.timeline')
	return {
		schemaVersion: 1,
		createdAt: Number(raw.createdAt ?? Date.now()),
		snapshot: snapshot as unknown as EditorSnapshot,
	}
}

export const parseProjectManifestV1 = (raw: unknown): ProjectManifestV1 => {
	if (!isJsonObject(raw) || raw.schemaVersion !== 1) throw new Error('Unsupported manifest schemaVersion')
	const assetsRaw = raw.assets
	if (assetsRaw != null && !isJsonObject(assetsRaw)) throw new Error('Invalid manifest.assets')
	const assets: Record<string, ProjectAssetEntryV1> = {}
	for (const [id, entryRaw] of Object.entries(assetsRaw ?? {})) {
		if (!isJsonObject(entryRaw)) continue
		const kind = entryRaw.kind
		if (kind !== 'image') continue
		const mime = entryRaw.mime
		if (typeof mime !== 'string') continue
		const name = entryRaw.name
		const createdAt = entryRaw.createdAt
		const width = entryRaw.width
		const height = entryRaw.height
		const url = entryRaw.url
		const fileKey = entryRaw.fileKey
		assets[id] = {
			id,
			kind: kind as ProjectAssetKindV1,
			mime,
			name: typeof name === 'string' ? name : undefined,
			createdAt: typeof createdAt === 'number' ? createdAt : undefined,
			width: typeof width === 'number' ? width : undefined,
			height: typeof height === 'number' ? height : undefined,
			url: typeof url === 'string' ? url : undefined,
			fileKey: typeof fileKey === 'string' ? fileKey : undefined,
		}
	}
	return {
		schemaVersion: 1,
		assets,
	}
}

export const parseProjectPackageV1 = (json: string): ProjectPackageV1 => {
	const raw = JSON.parse(String(json)) as unknown
	if (!isJsonObject(raw)) throw new Error('Invalid project package')
	const project = raw.project
	const manifest = raw.manifest
	const assets = raw.assets
	if (!isJsonObject(project)) throw new Error('Invalid project package.project')
	const parsedProject = parseProjectJsonV1(JSON.stringify(project))
	const parsedManifest = parseProjectManifestV1(manifest)
	if (!isJsonObject(assets)) throw new Error('Invalid project package.assets')
	const files = assets.files
	if (files != null && !isJsonObject(files)) throw new Error('Invalid project package.assets.files')
	const outFiles: Record<string, { mime: string; bytesBase64: string }> = {}
	for (const [key, fileRaw] of Object.entries(files ?? {})) {
		if (!isJsonObject(fileRaw)) continue
		const mime = fileRaw.mime
		const bytesBase64 = fileRaw.bytesBase64
		if (typeof mime !== 'string' || typeof bytesBase64 !== 'string') continue
		outFiles[key] = { mime, bytesBase64 }
	}
	return {
		project: parsedProject,
		manifest: parsedManifest,
		assets: { files: outFiles },
	}
}

