import { getLocalDb } from './db.mjs'

const TARGET_VERSION = 1

function readUserVersion(db) {
	const row = db.prepare('PRAGMA user_version').get()
	return Number(row?.user_version ?? row ?? 0)
}

function writeUserVersion(db, version) {
	db.exec(`PRAGMA user_version = ${Number(version) || 0}`)
}

function runV1(db) {
	// projects：Django comfyui_blueprint_project 等价
	db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '',
      project_uuid TEXT NOT NULL DEFAULT '',
      root_path TEXT NOT NULL DEFAULT '',
      manifest_path TEXT NOT NULL DEFAULT '',
      storage_version INTEGER NOT NULL DEFAULT 1,
      last_opened_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_project_uuid ON projects(project_uuid);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_root_path ON projects(root_path);`)

	// third_party_meshy_task_mirror 等价
	db.exec(`
    CREATE TABLE IF NOT EXISTS meshy_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT '',
      task_target TEXT NOT NULL DEFAULT '',
      task_family TEXT NOT NULL DEFAULT '',
      relation_kind TEXT NOT NULL DEFAULT '',
      root_task_id TEXT NOT NULL DEFAULT '',
      parent_task_id TEXT NOT NULL DEFAULT '',
      capabilities TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      progress INTEGER NOT NULL DEFAULT 0,
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      image_count INTEGER NOT NULL DEFAULT 0,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      preferred_model_url TEXT NOT NULL DEFAULT '',
      local_asset_url TEXT NOT NULL DEFAULT '',
      local_asset_path TEXT NOT NULL DEFAULT '',
      source_model_url TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      status_text TEXT NOT NULL DEFAULT '',
      request_payload TEXT,
      response_payload TEXT,
      project_id INTEGER,
      last_node_id TEXT NOT NULL DEFAULT '',
      remote_created_at TEXT NOT NULL DEFAULT '',
      remote_finished_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_meshy_tasks_task_id ON meshy_tasks(task_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_meshy_tasks_project_id ON meshy_tasks(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_meshy_tasks_relation_kind ON meshy_tasks(relation_kind);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_meshy_tasks_root_task_id ON meshy_tasks(root_task_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_meshy_tasks_updated_at ON meshy_tasks(updated_at DESC);`)

	// third_party_video_generation_task_mirror 等价
	db.exec(`
    CREATE TABLE IF NOT EXISTS video_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_task_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'seedance',
      model TEXT NOT NULL DEFAULT '',
      task_type TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'bottom-chat',
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL DEFAULT '',
      ratio TEXT NOT NULL DEFAULT '',
      resolution TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 0,
      seed INTEGER,
      generate_audio INTEGER NOT NULL DEFAULT 0,
      watermark INTEGER NOT NULL DEFAULT 0,
      camera_fixed INTEGER NOT NULL DEFAULT 0,
      service_tier TEXT NOT NULL DEFAULT '',
      tools TEXT,
      usage TEXT,
      request_payload TEXT,
      response_payload TEXT,
      video_url_remote TEXT NOT NULL DEFAULT '',
      video_url_local TEXT NOT NULL DEFAULT '',
      video_source_path_local TEXT NOT NULL DEFAULT '',
      last_frame_url_remote TEXT NOT NULL DEFAULT '',
      last_frame_url_local TEXT NOT NULL DEFAULT '',
      last_frame_source_path_local TEXT NOT NULL DEFAULT '',
      download_status TEXT NOT NULL DEFAULT 'idle',
      download_progress INTEGER NOT NULL DEFAULT 0,
      download_error TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      status_text TEXT NOT NULL DEFAULT '',
      project_id INTEGER,
      remote_created_at INTEGER,
      remote_updated_at INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_video_tasks_remote_task_id ON video_tasks(remote_task_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_video_tasks_project_id ON video_tasks(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks(status);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_video_tasks_updated_at ON video_tasks(updated_at DESC);`)

	// dweb_api_key_secret 等价：key_ciphertext 存 base64；key_fingerprint 存 plaintext sha256 hex
	db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      key_ciphertext TEXT NOT NULL DEFAULT '',
      key_fingerprint TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);`)
}

const MIGRATIONS = [runV1]

export function ensureSchema(db) {
	const current = readUserVersion(db)
	let applied = 0
	for (let i = current; i < TARGET_VERSION; i += 1) {
		const fn = MIGRATIONS[i]
		if (!fn) break
		const run = db.transaction(() => fn(db))
		run()
		applied += 1
	}
	if (applied > 0) writeUserVersion(db, TARGET_VERSION)
	return { currentVersion: readUserVersion(db), targetVersion: TARGET_VERSION, applied }
}

export function ensureLocalDbSchema() {
	return ensureSchema(getLocalDb())
}
