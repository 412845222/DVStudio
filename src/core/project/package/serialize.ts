import type { EditorSnapshot } from '../../editor/types'
import { isJsonObject } from '../../shared/json'
import type { ProjectAssetsV1, ProjectJsonV1, ProjectPackageV1 } from './types'

export const exportProjectJsonV1 = (snapshot: EditorSnapshot, createdAt: number = Date.now()): ProjectJsonV1 => {
	return {
		schemaVersion: 1,
		createdAt,
		snapshot,
	}
}

export const exportProjectPackageV1 = (
	snapshot: EditorSnapshot,
	opt?: {
		createdAt?: number
		assets?: ProjectAssetsV1
	}
): ProjectPackageV1 => {
	return {
		project: exportProjectJsonV1(snapshot, opt?.createdAt ?? Date.now()),
		assets: opt?.assets ?? { files: {} },
	}
}

export const stringifyProjectJson = (project: ProjectJsonV1): string => {
	return JSON.stringify(project)
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
