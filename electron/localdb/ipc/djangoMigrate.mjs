import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

import { getRepos } from '../index.mjs'
import { parseOptionalJson } from '../json.mjs'

function openLegacyDb(legacyDbPath) {
	const Database = require('better-sqlite3')
	const db = new Database(legacyDbPath, { readonly: true, fileMustExist: true })
	return db
}

function tableExists(db, name) {
	const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name)
	return Boolean(row)
}

function readProjects(db) {
	if (!tableExists(db, 'comfyui_blueprint_project')) return []
	return db
		.prepare(
			`SELECT id, name, data,
      COALESCE(project_uuid, '') AS project_uuid,
      COALESCE(root_path, '') AS root_path,
      COALESCE(manifest_path, '') AS manifest_path,
      COALESCE(storage_version, 1) AS storage_version,
      last_opened_at, created_at, updated_at
      FROM comfyui_blueprint_project ORDER BY updated_at DESC`,
		)
		.all()
}

function readMeshyTasks(db) {
	if (!tableExists(db, 'third_party_meshy_task_mirror')) return []
	const cols = [
		'id',
		'task_id',
		'mode',
		'task_target',
		'task_family',
		'relation_kind',
		'root_task_id',
		'parent_task_id',
		'capabilities',
		'status',
		'progress',
		'prompt',
		'negative_prompt',
		'image_count',
		'thumbnail_url',
		'preferred_model_url',
		'local_asset_url',
		'local_asset_path',
		'source_model_url',
		'error_message',
		'status_text',
		'request_payload',
		'response_payload',
		'project_id',
		'last_node_id',
		'remote_created_at',
		'remote_finished_at',
		'created_at',
		'updated_at',
	].join(', ')
	return db.prepare(`SELECT ${cols} FROM third_party_meshy_task_mirror`).all()
}

function readVideoTasks(db) {
	if (!tableExists(db, 'third_party_video_generation_task_mirror')) return []
	const cols = [
		'id',
		'remote_task_id',
		'provider',
		'model',
		'task_type',
		'source',
		'status',
		'prompt',
		'ratio',
		'resolution',
		'duration',
		'seed',
		'generate_audio',
		'watermark',
		'camera_fixed',
		'service_tier',
		'tools',
		'usage',
		'request_payload',
		'response_payload',
		'video_url_remote',
		'video_url_local',
		'video_source_path_local',
		'last_frame_url_remote',
		'last_frame_url_local',
		'last_frame_source_path_local',
		'download_status',
		'download_progress',
		'download_error',
		'error_message',
		'status_text',
		'project_id',
		'remote_created_at',
		'remote_updated_at',
		'synced_at',
		'created_at',
		'updated_at',
	].join(', ')
	return db.prepare(`SELECT ${cols} FROM third_party_video_generation_task_mirror`).all()
}

function readApiKeys(db) {
	if (!tableExists(db, 'dweb_api_key_secret')) return []
	return db
		.prepare('SELECT id, provider, key_encrypted, key_fingerprint, updated_at, created_at FROM dweb_api_key_secret')
		.all()
}

/**
 * 把从 Django SQLite 读到的 key 迁移到新的 api_keys 表。
 * 注意：由于 Django 使用 cryptography.Fernet + Django SECRET_KEY，
 * 我们无法在 Node 端以稳定方式解密（依赖特定 pbkdf2/salt 约定）。
 * 这里保留密文/指纹字段用于 UI 判断是否存在 key；
 * 若调用方提供可选的 decryptFn（可自行实现），则以明文重新入本地库。
 */
function importApiKeys(rows, { decryptFn, apiKeysRepo } = {}) {
	const stats = { total: rows.length, ok: 0, skipped: 0, failed: 0 }
	for (const row of rows) {
		try {
			const provider = String(row.provider || '').trim()
			if (!provider) {
				stats.skipped += 1
				continue
			}
			let plaintext = ''
			if (typeof decryptFn === 'function') {
				try {
					plaintext = String(decryptFn({ provider, ciphertext: row.key_encrypted }) || '')
				} catch (_) {
					plaintext = ''
				}
			}
			const res = apiKeysRepo.setPlaintext(provider, plaintext)
			if (res?.ok) stats.ok += 1
			else stats.failed += 1
		} catch (_) {
			stats.failed += 1
		}
	}
	return stats
}

export function runLegacyDbMigration({ legacyDbPath, backendDataDir, force = false } = {}) {
	const dbFilePath = String(legacyDbPath || '').trim()
	if (!dbFilePath || !fs.existsSync(dbFilePath)) {
		return { ok: false, error: `Django 数据库文件不存在: ${dbFilePath}` }
	}

	const repos = getRepos()
	const legacy = openLegacyDb(dbFilePath)
	try {
		const stats = { projects: 0, meshyTasks: 0, videoTasks: 0, apiKeys: { total: 0, ok: 0, skipped: 0, failed: 0 } }

		// ---- projects ----
		const legacyProjects = readProjects(legacy)
		const existingProjectIds = new Set(repos.projects.list().map((p) => String(p.name) + '::' + String(p.rootPath)))
		for (const lp of legacyProjects) {
			try {
				const key = String(lp.name || '') + '::' + String(lp.root_path || '')
				if (!force && existingProjectIds.has(key)) continue
				const snapshotPath = String(lp.data || '').trim()
				let snapshot = null
				if (snapshotPath && path.isAbsolute(snapshotPath) && fs.existsSync(snapshotPath)) {
					snapshot = parseOptionalJson(fs.readFileSync(snapshotPath, 'utf-8'))
				} else if (snapshotPath && backendDataDir) {
					const candidate = path.resolve(String(backendDataDir), snapshotPath)
					if (fs.existsSync(candidate)) snapshot = parseOptionalJson(fs.readFileSync(candidate, 'utf-8'))
				}
				if (lp.root_path) {
					// 先 openProjectFolder；若已存在则走后续 saveProject
					repos.projects.openProjectFolder({ rootPath: lp.root_path, name: lp.name, create: true })
				}
				const existingFolder = lp.root_path && repos.projects.list().find(
					(p) => String(p.rootPath || '').trim() === String(lp.root_path || '').trim(),
				)
				const projectIdToSave = existingFolder ? existingFolder.id : undefined
				repos.projects.saveProject({
					name: lp.name || '(未命名项目)',
					snapshot: snapshot || {
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
						selectedNodeIds: [],
					},
					projectId: projectIdToSave,
				})
				stats.projects += 1
			} catch (e) {
				console.warn('[migration] project failed:', e?.message || e, ' id=', lp.id)
			}
		}

		// 建立 old_project_id → new_project_id 的映射（用于 task 关联）
		const byRowId = new Map()
		for (const p of repos.projects.list()) byRowId.set(String(p.name) + '::' + String(p.rootPath), p.id)

		// ---- meshy tasks ----
		const projectByName = new Map(repos.projects.list().map((p) => [String(p.name), p.id]))
		for (const lt of readMeshyTasks(legacy)) {
			try {
				if (!lt.task_id) continue
				const projectId = lt.project_id && projectByName.size
					? (projectByName.get(String(legacyProjects.find((p) => p.id === lt.project_id)?.name || '')) || null)
					: null
				repos.meshyTasks.upsert({
					taskId: lt.task_id,
					mode: lt.mode,
					taskTarget: lt.task_target,
					taskFamily: lt.task_family,
					relationKind: lt.relation_kind,
					rootTaskId: lt.root_task_id,
					parentTaskId: lt.parent_task_id,
					capabilities: parseOptionalJson(lt.capabilities),
					status: lt.status,
					progress: lt.progress,
					prompt: lt.prompt,
					negativePrompt: lt.negative_prompt,
					imageCount: lt.image_count,
					thumbnailUrl: lt.thumbnail_url,
					preferredModelUrl: lt.preferred_model_url,
					localAssetUrl: lt.local_asset_url,
					localAssetPath: lt.local_asset_path,
					sourceModelUrl: lt.source_model_url,
					errorMessage: lt.error_message,
					statusText: lt.status_text,
					requestPayload: parseOptionalJson(lt.request_payload),
					responsePayload: parseOptionalJson(lt.response_payload),
					projectId,
					lastNodeId: lt.last_node_id,
					remoteCreatedAt: lt.remote_created_at,
					remoteFinishedAt: lt.remote_finished_at,
				})
				stats.meshyTasks += 1
			} catch (_) {
				// ignore
			}
		}

		// ---- video tasks ----
		for (const lt of readVideoTasks(legacy)) {
			try {
				if (!lt.remote_task_id) continue
				const projectName = legacyProjects.find((p) => p.id === lt.project_id)?.name
				const projectId = projectName ? projectByName.get(String(projectName)) || null : null
				repos.videoTasks.upsert({
					remoteTaskId: lt.remote_task_id,
					provider: lt.provider,
					model: lt.model,
					taskType: lt.task_type,
					source: lt.source,
					status: lt.status,
					prompt: lt.prompt,
					ratio: lt.ratio,
					resolution: lt.resolution,
					duration: lt.duration,
					seed: lt.seed,
					generateAudio: lt.generate_audio,
					watermark: lt.watermark,
					cameraFixed: lt.camera_fixed,
					serviceTier: lt.service_tier,
					tools: parseOptionalJson(lt.tools),
					usage: parseOptionalJson(lt.usage),
					requestPayload: parseOptionalJson(lt.request_payload),
					responsePayload: parseOptionalJson(lt.response_payload),
					videoUrlRemote: lt.video_url_remote,
					videoUrlLocal: lt.video_url_local,
					videoSourcePathLocal: lt.video_source_path_local,
					lastFrameUrlRemote: lt.last_frame_url_remote,
					lastFrameUrlLocal: lt.last_frame_url_local,
					lastFrameSourcePathLocal: lt.last_frame_source_path_local,
					downloadStatus: lt.download_status,
					downloadProgress: lt.download_progress,
					downloadError: lt.download_error,
					errorMessage: lt.error_message,
					statusText: lt.status_text,
					projectId,
					remoteCreatedAt: lt.remote_created_at,
					remoteUpdatedAt: lt.remote_updated_at,
				})
				stats.videoTasks += 1
			} catch (_) {
				// ignore
			}
		}

		// ---- api keys ----
		stats.apiKeys = importApiKeys(readApiKeys(legacy), { apiKeysRepo: repos.apiKeys })

		return { ok: true, stats }
	} finally {
		try { legacy.close() } catch (_) { /* ignore */ }
	}
}
