import fs from 'node:fs'
import path from 'node:path'
import { ensureProjectMediaRoot } from './paths.mjs'

const MANIFEST_NAME = '.dweb-assets.json'

export function manifestPath(projectRoot) {
  const mediaRoot = ensureProjectMediaRoot(projectRoot)
  return mediaRoot ? path.resolve(mediaRoot, MANIFEST_NAME) : ''
}

export function readAssetManifest(projectRoot) {
  const filePath = manifestPath(projectRoot)
  if (!filePath || !fs.existsSync(filePath)) return { schemaVersion: 1, assets: [] }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      schemaVersion: 1,
      assets: Array.isArray(data?.assets) ? data.assets : [],
    }
  } catch {
    return { schemaVersion: 1, assets: [] }
  }
}

export function writeAssetManifest(projectRoot, manifest) {
  const filePath = manifestPath(projectRoot)
  if (!filePath) return false
  const next = {
    schemaVersion: 1,
    assets: Array.isArray(manifest?.assets) ? manifest.assets : [],
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
  return true
}

export function upsertAssetManifestEntry(projectRoot, entry) {
  const rel = String(entry?.projectRelativePath || entry?.relativePath || '').trim()
  if (!rel) return false
  const manifest = readAssetManifest(projectRoot)
  const assets = manifest.assets.filter((x) => String(x?.projectRelativePath || x?.relativePath || '') !== rel)
  assets.push({
    ...entry,
    projectRelativePath: rel,
    relativePath: rel,
    updatedAt: new Date().toISOString(),
  })
  return writeAssetManifest(projectRoot, { ...manifest, assets })
}
