import crypto from 'node:crypto'

import { getLocalDb } from '../db.mjs'

function randomId() {
	if (crypto.randomUUID) return crypto.randomUUID()
	const bytes = crypto.randomBytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return bytes.toString('hex')
}

function nowMs() {
	return Date.now()
}

function serializeConversation(row) {
	if (!row) return null
	return {
		id: row.id,
		title: row.title || '',
		model: row.model || '',
		systemPrompt: row.system_prompt || '',
		projectPath: row.project_path || '',
		createdAt: Number(row.created_at) || nowMs(),
		updatedAt: Number(row.updated_at) || nowMs()
	}
}

function serializeMessage(row) {
	if (!row) return null
	return {
		id: row.id,
		conversationId: row.conversation_id,
		role: row.role || '',
		content: row.content || '',
		model: row.model || '',
		tokensUsed: Number(row.tokens_used) || 0,
		createdAt: Number(row.created_at) || nowMs()
	}
}

export function createChatConversationsRepo() {
	const db = getLocalDb()

	const listConvsStmt = db.prepare(
		'SELECT * FROM chat_conversations ORDER BY updated_at DESC, created_at DESC'
	)
	const listConvsByProjectStmt = db.prepare(
		'SELECT * FROM chat_conversations WHERE project_path = ? ORDER BY updated_at DESC, created_at DESC'
	)
	const getConvStmt = db.prepare('SELECT * FROM chat_conversations WHERE id = ?')
	const insertConvStmt = db.prepare(
		'INSERT INTO chat_conversations (id, title, model, system_prompt, project_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	)
	const updateConvTitleStmt = db.prepare(
		'UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?'
	)
	const deleteConvStmt = db.prepare('DELETE FROM chat_conversations WHERE id = ?')

	const listMsgsStmt = db.prepare(
		'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC'
	)
	const insertMsgStmt = db.prepare(
		'INSERT INTO chat_messages (id, conversation_id, role, content, model, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	)
	const deleteMsgsByConvStmt = db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?')

	function list({ limit, projectPath } = {}) {
		let rows
		if (projectPath) {
			rows = listConvsByProjectStmt.all(projectPath)
		} else {
			rows = listConvsStmt.all()
		}
		const n = Number(limit)
		if (Number.isFinite(n) && n > 0) rows = rows.slice(0, n)
		return rows.map(serializeConversation)
	}

	function get(id) {
		const cid = String(id || '').trim()
		if (!cid) return null
		return serializeConversation(getConvStmt.get(cid))
	}

	function create({ id, title, model, systemPrompt, projectPath } = {}) {
		const cid = String(id || '').trim() || randomId()
		const now = nowMs()
		const titleText = String(title || '新对话').trim() || '新对话'
		const modelText = String(model || '').trim()
		const sysPrompt = String(systemPrompt || '').trim()
		const projPath = String(projectPath || '').trim()
		if (getConvStmt.get(cid)) return { ok: false, error: 'conversation already exists' }
		insertConvStmt.run(cid, titleText, modelText, sysPrompt, projPath, now, now)
		return { ok: true, conversation: serializeConversation(getConvStmt.get(cid)) }
	}

	function updateTitle(id, title) {
		const cid = String(id || '').trim()
		if (!cid) return { ok: false, error: 'id is required' }
		const titleText = String(title || '').trim()
		if (!titleText) return { ok: false, error: 'title is required' }
		const exists = getConvStmt.get(cid)
		if (!exists) return { ok: false, error: 'conversation not found' }
		updateConvTitleStmt.run(titleText, nowMs(), cid)
		return { ok: true, conversation: serializeConversation(getConvStmt.get(cid)) }
	}

	function remove(id) {
		const cid = String(id || '').trim()
		if (!cid) return { ok: false, error: 'id is required' }
		if (!getConvStmt.get(cid)) return { ok: false, error: 'conversation not found' }
		const run = db.transaction(() => {
			deleteMsgsByConvStmt.run(cid)
			deleteConvStmt.run(cid)
		})
		run()
		return { ok: true, id: cid }
	}

	function addMessage({ id, conversationId, role, content, model, tokensUsed } = {}) {
		const cid = String(conversationId || '').trim()
		if (!cid) return { ok: false, error: 'conversationId is required' }
		if (!getConvStmt.get(cid)) return { ok: false, error: 'conversation not found' }
		const mid = String(id || '').trim() || randomId()
		const roleText = String(role || 'user').trim() || 'user'
		const contentText = String(content || '')
		const modelText = String(model || '').trim()
		const tokens = Number(tokensUsed) || 0
		const now = nowMs()
		insertMsgStmt.run(mid, cid, roleText, contentText, modelText, tokens, now)
		db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').run(now, cid)
		return {
			ok: true,
			message: serializeMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(mid))
		}
	}

	function getMessages(conversationId, { limit } = {}) {
		const cid = String(conversationId || '').trim()
		if (!cid) return []
		let rows = listMsgsStmt.all(cid)
		const n = Number(limit)
		if (Number.isFinite(n) && n > 0) rows = rows.slice(-n)
		return rows.map(serializeMessage)
	}

	return { list, get, create, updateTitle, remove, addMessage, getMessages }
}
