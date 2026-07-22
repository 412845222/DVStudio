import { getLocalDb } from './db.mjs'

const TARGET_VERSION = 12

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
	db.exec(
		`CREATE INDEX IF NOT EXISTS idx_video_tasks_remote_task_id ON video_tasks(remote_task_id);`
	)
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

function runV2(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT,
      system_prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON chat_conversations(updated_at DESC);`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      tokens_used INTEGER,
      created_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at);`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      config TEXT NOT NULL,
      progress REAL DEFAULT 0,
      error TEXT,
      output_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_export_jobs_project ON export_jobs(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS export_frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
      frame_index INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_export_frames_job ON export_frames(job_id, frame_index);`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS editor_components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      thumbnail_path TEXT,
      data TEXT NOT NULL,
      tags TEXT,
      source TEXT NOT NULL DEFAULT 'builtin',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

	db.exec(`
    CREATE TABLE IF NOT EXISTS comfyui_workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

	db.exec(`
    CREATE TABLE IF NOT EXISTS comfyui_jobs (
      id TEXT PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL DEFAULT 0,
      outputs TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_comfyui_jobs_project ON comfyui_jobs(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_comfyui_jobs_status ON comfyui_jobs(status);`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS codex_sessions (
      id TEXT PRIMARY KEY,
      cwd TEXT,
      model TEXT,
      agent_mode TEXT,
      permission_profile TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

	db.exec(`
    CREATE TABLE IF NOT EXISTS codex_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES codex_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_codex_messages_session ON codex_messages(session_id, created_at);`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS ref_image_cache (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      original_path TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(provider, cache_key)
    );
  `)

	db.exec(`
    CREATE TABLE IF NOT EXISTS unreal_export_sessions (
      id TEXT PRIMARY KEY,
      client_info TEXT,
      last_heartbeat INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

	db.exec(`
    CREATE TABLE IF NOT EXISTS unreal_export_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES unreal_export_sessions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL,
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_unreal_jobs_session ON unreal_export_jobs(session_id, status);`)
}

function runV3(db) {
	db.exec(`ALTER TABLE editor_components ADD COLUMN template_id TEXT`)
	db.exec(`ALTER TABLE editor_components ADD COLUMN thumb_asset_id TEXT`)
	db.exec(`ALTER TABLE editor_components ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`)
	db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_editor_components_template_id ON editor_components(template_id)`)
}

function runV4(db) {
	// 统一火山方舟任务记录表：覆盖 seedream / seedance / jimeng / chat
	db.exec(`
    CREATE TABLE IF NOT EXISTS ark_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'bytedance',
      api_type TEXT NOT NULL DEFAULT '',
      api_action TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      result_urls TEXT,
      result_text TEXT NOT NULL DEFAULT '',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      status_text TEXT NOT NULL DEFAULT '',
      request_payload TEXT,
      response_payload TEXT,
      project_id INTEGER,
      node_id TEXT NOT NULL DEFAULT '',
      remote_task_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_ark_tasks_task_id ON ark_tasks(task_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_ark_tasks_project_id ON ark_tasks(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_ark_tasks_api_type ON ark_tasks(api_type);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_ark_tasks_status ON ark_tasks(status);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_ark_tasks_updated_at ON ark_tasks(updated_at DESC);`)
}

function runV5(db) {
	// 为 chat_conversations 添加 project_path 字段，支持按项目路径存储会话
	db.exec(`ALTER TABLE chat_conversations ADD COLUMN project_path TEXT NOT NULL DEFAULT ''`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_project_path ON chat_conversations(project_path)`)
}

function runV6(db) {
	// Gemini 图片生成任务表
	db.exec(`
    CREATE TABLE IF NOT EXISTS gemini_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      model TEXT NOT NULL DEFAULT '',
      model_label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitting',
      progress INTEGER NOT NULL DEFAULT 0,
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      aspect_ratio TEXT NOT NULL DEFAULT '1:1',
      num_images INTEGER NOT NULL DEFAULT 1,
      result_images TEXT,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      error_code TEXT NOT NULL DEFAULT '',
      status_text TEXT NOT NULL DEFAULT '',
      request_payload TEXT,
      response_payload TEXT,
      project_id INTEGER,
      node_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_gemini_tasks_task_id ON gemini_tasks(task_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_gemini_tasks_project_id ON gemini_tasks(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_gemini_tasks_status ON gemini_tasks(status);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_gemini_tasks_updated_at ON gemini_tasks(updated_at DESC);`)
}

function runV7(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS aiworkflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      tags TEXT NOT NULL DEFAULT '[]',
      node_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'user',
      file_path TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_aiworkflow_templates_updated_at ON aiworkflow_templates(updated_at DESC);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_aiworkflow_templates_category ON aiworkflow_templates(category);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_aiworkflow_templates_source ON aiworkflow_templates(source);`)
}

function runV8(db) {
	db.exec(`ALTER TABLE aiworkflow_templates ADD COLUMN cover_path TEXT NOT NULL DEFAULT '';`)
}

function runV9(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS tripo3d_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'text_to_model',
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      model_version TEXT NOT NULL DEFAULT '',
      face_limit INTEGER NOT NULL DEFAULT 0,
      texture INTEGER NOT NULL DEFAULT 1,
      pbr INTEGER NOT NULL DEFAULT 1,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      model_url TEXT NOT NULL DEFAULT '',
      local_asset_url TEXT NOT NULL DEFAULT '',
      local_asset_path TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      status_text TEXT NOT NULL DEFAULT '',
      request_payload TEXT,
      response_payload TEXT,
      project_id INTEGER,
      node_id TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_tripo3d_tasks_task_id ON tripo3d_tasks(task_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_tripo3d_tasks_project_id ON tripo3d_tasks(project_id);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_tripo3d_tasks_status ON tripo3d_tasks(status);`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_tripo3d_tasks_updated_at ON tripo3d_tasks(updated_at DESC);`)
}

function runV10(db) {
	db.exec(`ALTER TABLE video_tasks ADD COLUMN ref_image_urls TEXT NOT NULL DEFAULT '[]'`)
	db.exec(`ALTER TABLE video_tasks ADD COLUMN ref_video_urls TEXT NOT NULL DEFAULT '[]'`)
	db.exec(`ALTER TABLE video_tasks ADD COLUMN ref_audio_urls TEXT NOT NULL DEFAULT '[]'`)
}

function runV11(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_storage_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL DEFAULT '',
      config_encrypted TEXT NOT NULL DEFAULT '',
      config_fingerprint TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0,
      last_tested_at TEXT,
      last_test_ok INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
	db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_storage_active ON cloud_storage_config(is_active) WHERE is_active = 1`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_cloud_storage_provider ON cloud_storage_config(provider_id)`)
}

function runV12(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_storage_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL REFERENCES cloud_storage_config(id) ON DELETE CASCADE,
      bucket_name TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT '',
      endpoint TEXT NOT NULL DEFAULT '',
      acl_status TEXT NOT NULL DEFAULT 'unknown',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(config_id, bucket_name)
    );
  `)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_cloud_buckets_config ON cloud_storage_buckets(config_id)`)
	db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_buckets_active ON cloud_storage_buckets(is_active) WHERE is_active = 1`)
}

const MIGRATIONS = [runV1, runV2, runV3, runV4, runV5, runV6, runV7, runV8, runV9, runV10, runV11, runV12]

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
