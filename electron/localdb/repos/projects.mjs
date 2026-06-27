import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { getLocalDb } from '../db.mjs'
import { isoToMs, parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

const PROJECT_MARKER_DIR = '.aiworkflow'
const PROJECT_MANIFEST_REL = `${PROJECT_MARKER_DIR}/manifest.json`
const PROJECT_BLUEPRINT_REL = 'Blueprints/main.blueprint.json'
const PROJECT_STORAGE_VERSION = 1
const PROJECT_REQUIRED_DIRS = [
	'Content/Media/images',
	'Content/Media/videos',
	'Content/Media/audio',
	'Content/Media/models',
	'Content/Media/thumbnails',
	'Content/Generated/comfy',
	'Content/Generated/meshy',
	'Content/Generated/dreammaker',
	'Content/Generated/fal',
	'Content/Generated/unreal',
	'Saved/autosaves',
	'Saved/logs',
	'Saved/task-cache',
	'Intermediate/imports',
	'Intermediate/tmp',
	'Intermediate/previews'
]

function nowIso() {
	return new Date().toISOString()
}

function randomUuid() {
	if (crypto.randomUUID) return crypto.randomUUID()
	const bytes = crypto.randomBytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function serializeProjectRow(row) {
	if (!row) return null
	return {
		id: row.id,
		name: row.name,
		data: row.data || '',
		projectUuid: row.project_uuid || '',
		rootPath: row.root_path || '',
		manifestPath: row.manifest_path || '',
		storageVersion: Number(row.storage_version) || 1,
		folderBacked: Boolean(row.root_path && String(row.root_path).trim()),
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
		lastOpenedAt: isoToMs(row.last_opened_at)
	}
}

function mediaRootFromBackendDir(backendDataDir) {
	return path.resolve(String(backendDataDir || ''), 'media', 'blueprint_projects')
}

function resolveFolderLayout(rootPath) {
	const root = String(rootPath || '').trim()
	if (!root) return null
	return {
		root,
		manifest: path.resolve(root, PROJECT_MANIFEST_REL),
		blueprint: path.resolve(root, PROJECT_BLUEPRINT_REL)
	}
}

function writeAtomicText(filePath, text) {
	const parent = path.dirname(filePath)
	fs.mkdirSync(parent, { recursive: true })
	const tmp = path.resolve(parent, `.${path.basename(filePath)}.${process.pid}.tmp`)
	fs.writeFileSync(tmp, text, 'utf-8')
	fs.renameSync(tmp, filePath)
}

function writeAtomicJson(filePath, payload) {
	writeAtomicText(filePath, JSON.stringify(payload, null, 2))
}

function readJsonIfExists(filePath) {
	if (!fs.existsSync(filePath)) return null
	try {
		const raw = fs.readFileSync(filePath, 'utf-8')
		return JSON.parse(raw)
	} catch (_) {
		return null
	}
}

function emptyBlueprintSnapshot() {
	return {
		schemaVersion: 1,
		savedAt: Date.now(),
		viewport: { zoom: 1, panX: 0, panY: 0 },
		nodesById: {},
		nodeOrder: [],
		edgesById: {},
		edgeOrder: [],
		resourcesById: {},
		resourceOrder: [],
		selectedNodeId: null,
		selectedNodeIds: []
	}
}

function validateBlueprintSnapshot(snapshot) {
	if (!snapshot || typeof snapshot !== 'object') return null
	if (Number(snapshot.schemaVersion) !== 1) return null
	const required = [
		'viewport',
		'nodesById',
		'nodeOrder',
		'edgesById',
		'edgeOrder',
		'resourcesById',
		'resourceOrder'
	]
	for (const key of required) {
		if (!(key in snapshot)) return null
	}
	return snapshot
}

function ensureFolderLayout({ project, rootPath, snapshot, create }) {
	const layout = resolveFolderLayout(rootPath)
	if (!layout) return { ok: false, error: 'rootPath is invalid' }
	if (!fs.existsSync(layout.root)) {
		if (!create) return { ok: false, error: 'project folder not found' }
		fs.mkdirSync(layout.root, { recursive: true })
	}
	for (const rel of PROJECT_REQUIRED_DIRS) {
		fs.mkdirSync(path.resolve(layout.root, rel), { recursive: true })
	}
	if (!fs.existsSync(layout.blueprint)) {
		if (!create) return { ok: false, error: 'project blueprint file not found' }
		writeAtomicJson(layout.blueprint, snapshot || emptyBlueprintSnapshot())
	}
	const manifest = {
		schemaVersion: 1,
		kind: 'aiworkflow-blueprint-project',
		storageVersion: PROJECT_STORAGE_VERSION,
		projectId: project?.id || null,
		projectUuid: project?.project_uuid || randomUuid(),
		name: project?.name || path.basename(layout.root),
		blueprint: PROJECT_BLUEPRINT_REL,
		configPath: 'Config/user.json',
		assetRoots: {
			images: 'Content/Media/images',
			videos: 'Content/Media/videos',
			audio: 'Content/Media/audio',
			models: 'Content/Media/models',
			thumbnails: 'Content/Media/thumbnails'
		},
		generatedRoots: {
			comfy: 'Content/Generated/comfy',
			meshy: 'Content/Generated/meshy',
			dreammaker: 'Content/Generated/dreammaker',
			fal: 'Content/Generated/fal',
			unreal: 'Content/Generated/unreal'
		},
		createdAt: Date.now(),
		updatedAt: Date.now()
	}
	writeAtomicJson(layout.manifest, manifest)
	return { ok: true, layout, manifest }
}

// ---------- 公共仓库 API ----------

export function createProjectsRepo({ backendDataDir }) {
	const mediaRoot = mediaRootFromBackendDir(backendDataDir)
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC, id DESC')
	const getByIdStmt = db.prepare('SELECT * FROM projects WHERE id = ?')
	const getByRootPathStmt = db.prepare(
		"SELECT * FROM projects WHERE root_path = ? AND root_path <> '' LIMIT 1"
	)
	const insertStmt = db.prepare(
		'INSERT INTO projects (name, data, project_uuid, root_path, manifest_path, storage_version, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	)
	const updateStmt = db.prepare(
		"UPDATE projects SET name = ?, data = ?, project_uuid = ?, root_path = ?, manifest_path = ?, storage_version = ?, last_opened_at = ?, updated_at = datetime('now') WHERE id = ?"
	)
	const touchOpenedStmt = db.prepare(
		"UPDATE projects SET last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
	)
	const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?')

	function list() {
		const rows = listStmt.all()
		return rows.map(serializeProjectRow)
	}

	function getById(id) {
		const n = Number(id)
		if (!Number.isFinite(n) || n <= 0) return null
		const row = getByIdStmt.get(n)
		return serializeProjectRow(row)
	}

	function resolveSnapshotPath(project) {
		if (project?.rootPath) {
			const layout = resolveFolderLayout(project.rootPath)
			return layout ? layout.blueprint : null
		}
		const idDir = path.resolve(mediaRoot, String(project.id))
		fs.mkdirSync(idDir, { recursive: true })
		return path.resolve(idDir, 'blueprint.json')
	}

	function readSnapshot(project) {
		if (!project) return { ok: false, error: 'project not found' }
		const filePath = resolveSnapshotPath(project)
		if (!filePath || !fs.existsSync(filePath))
			return { ok: false, error: 'project snapshot not found' }
		const parsed = readJsonIfExists(filePath)
		const validated = validateBlueprintSnapshot(parsed)
		if (!validated) return { ok: false, error: 'project snapshot is invalid' }
		return { ok: true, snapshot: validated }
	}

	function writeSnapshot(project, snapshot) {
		const validated = validateBlueprintSnapshot(snapshot)
		if (!validated) return { ok: false, error: 'snapshot is invalid' }
		validated.savedAt = Date.now()
		if (project?.rootPath) {
			const layout = ensureFolderLayout({
				project,
				rootPath: project.rootPath,
				snapshot: validated,
				create: true
			})
			if (!layout.ok) return { ok: false, error: layout.error }
			writeAtomicJson(layout.layout.blueprint, validated)
			return { ok: true, dataPath: PROJECT_BLUEPRINT_REL, manifestPath: layout.layout.manifest }
		}
		const filePath = resolveSnapshotPath(project)
		writeAtomicJson(filePath, validated)
		return { ok: true, dataPath: filePath, manifestPath: '' }
	}

	function saveProject({ name, snapshot, projectId }) {
		const nameText = String(name || '').trim()
		if (!nameText) return { ok: false, error: 'name is required' }
		if (projectId !== undefined && projectId !== null && projectId !== 0) {
			const existing = getById(projectId)
			if (!existing) return { ok: false, error: 'projectId not found' }
			const write = writeSnapshot(existing, snapshot)
			if (!write.ok) return { ok: false, error: write.error }
			const projectUuid = existing.projectUuid || randomUuid()
			updateStmt.run(
				nameText,
				write.dataPath || existing.data || '',
				projectUuid,
				existing.rootPath || '',
				write.manifestPath || existing.manifestPath || '',
				PROJECT_STORAGE_VERSION,
				nowIso(),
				existing.id
			)
			return { ok: true, project: getById(existing.id) }
		}
		const info = db.transaction(() => {
			const insertResult = insertStmt.run(
				nameText,
				'',
				randomUuid(),
				'',
				'',
				PROJECT_STORAGE_VERSION,
				nowIso()
			)
			const newId = Number(insertResult?.lastInsertRowid ?? 0)
			const newProject = getById(newId)
			const write = writeSnapshot(newProject, snapshot)
			if (!write.ok) throw new Error(write.error || 'write snapshot failed')
			updateStmt.run(
				nameText,
				write.dataPath || '',
				newProject.projectUuid || randomUuid(),
				newProject.rootPath || '',
				write.manifestPath || '',
				PROJECT_STORAGE_VERSION,
				nowIso(),
				newId
			)
			return getById(newId)
		})()
		return { ok: true, project: info }
	}

	function loadProject(projectId) {
		const project = getById(projectId)
		if (!project) return { ok: false, error: 'project not found' }
		const read = readSnapshot(project)
		if (!read.ok) return { ok: false, error: read.error }
		if (project.rootPath) touchOpenedStmt.run(project.id)
		return { ok: true, project: getById(project.id), snapshot: read.snapshot }
	}

	function openProjectFolder({ rootPath, name, create }) {
		const root = String(rootPath || '').trim()
		if (!root) return { ok: false, error: 'rootPath is required' }
		const createBool = create === true || String(create || '').toLowerCase() === 'true'
		const displayName = String(name || '').trim() || path.basename(root) || '未命名项目'
		const existingRow = getByRootPathStmt.get(root)

		const run = db.transaction(() => {
			let projectRow
			if (existingRow) {
				updateStmt.run(
					displayName,
					PROJECT_BLUEPRINT_REL,
					existingRow.project_uuid || randomUuid(),
					root,
					path.resolve(root, PROJECT_MANIFEST_REL),
					PROJECT_STORAGE_VERSION,
					nowIso(),
					existingRow.id
				)
				projectRow = getById(existingRow.id)
			} else {
				const uuid = randomUuid()
				const insertResult = insertStmt.run(
					displayName,
					PROJECT_BLUEPRINT_REL,
					uuid,
					root,
					path.resolve(root, PROJECT_MANIFEST_REL),
					PROJECT_STORAGE_VERSION,
					nowIso()
				)
				projectRow = getById(Number(insertResult?.lastInsertRowid ?? 0))
			}
			const layout = ensureFolderLayout({ project: projectRow, rootPath: root, create: createBool })
			if (!layout.ok) throw new Error(layout.error || 'ensure folder layout failed')
			return projectRow
		})
		try {
			const project = run()
			return { ok: true, project }
		} catch (e) {
			return { ok: false, error: String(e?.message || e) }
		}
	}

	function deleteProject(projectId) {
		const n = Number(projectId)
		if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'id is required' }
		const row = getByIdStmt.get(n)
		if (!row) return { ok: false, error: 'project not found' }
		const isFolderBacked = Boolean(row.root_path && String(row.root_path).trim())
		const run = db.transaction(() => {
			try {
				db.prepare('UPDATE meshy_tasks SET project_id = NULL WHERE project_id = ?').run(n)
			} catch (_) {}
			try {
				db.prepare('UPDATE video_tasks SET project_id = NULL WHERE project_id = ?').run(n)
			} catch (_) {}
			deleteStmt.run(n)
		})
		run()
		if (!isFolderBacked) {
			try {
				const legacyDir = path.resolve(mediaRoot, String(n))
				if (fs.existsSync(legacyDir)) fs.rmSync(legacyDir, { recursive: true, force: true })
			} catch (_) {
				/* ignore */
			}
		}
		return { ok: true, id: n }
	}

	return {
		list,
		getById,
		openProjectFolder,
		saveProject,
		loadProject,
		deleteProject,
		_internal: {
			mediaRoot,
			PROJECT_BLUEPRINT_REL,
			PROJECT_MANIFEST_REL,
			PROJECT_STORAGE_VERSION
		}
	}
}
