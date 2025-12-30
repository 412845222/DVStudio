import type { EditorSnapshot } from '../../editor/types'
import { cloneJsonSafe } from '../../shared/cloneJsonSafe'
import { buildManifestFromSnapshotV1 } from './assets'
import { normalizeSnapshotV1 } from './normalize'
import { parseProjectPackageV1, stringifyProjectPackageV1, exportProjectPackageV1 } from './serialize'
import { rewriteImageAssetIdsOnImportV1 } from './rewriteAssetIds'
import type { ImportProjectOptionsV1, ImportProjectResultV1, ProjectManifestV1, ProjectPackageV1 } from './types'

export const exportSnapshotToProjectPackageV1 = (snapshot: EditorSnapshot): ProjectPackageV1 => {
	const snap = normalizeSnapshotV1(cloneJsonSafe(snapshot))
	const manifest = buildManifestFromSnapshotV1(snap)
	return exportProjectPackageV1(snap, { manifest })
}

export const exportSnapshotToProjectPackageV1String = (snapshot: EditorSnapshot): string => {
	return stringifyProjectPackageV1(exportSnapshotToProjectPackageV1(snapshot))
}

const ensureManifestForSnapshotV1 = (snapshot: EditorSnapshot, manifest: ProjectManifestV1): ProjectManifestV1 => {
	if (Object.keys(manifest.assets).length) return manifest
	return buildManifestFromSnapshotV1(snapshot)
}

export const importProjectPackageV1String = (json: string, opt?: ImportProjectOptionsV1): ImportProjectResultV1 => {
	const pkg = parseProjectPackageV1(json)
	const parsedSnapshot = normalizeSnapshotV1(cloneJsonSafe(pkg.project.snapshot))
	const manifest = ensureManifestForSnapshotV1(parsedSnapshot, pkg.manifest)
	const existingIds = new Set(Object.keys(opt?.existingSnapshot?.videoScene.imageAssets ?? {}))
	const rewritten = rewriteImageAssetIdsOnImportV1({ snapshot: parsedSnapshot, manifest, existingImageAssetIds: existingIds })
	return {
		snapshot: rewritten.snapshot,
		assetIdMap: rewritten.assetIdMap,
		manifest: rewritten.manifest,
	}
}
