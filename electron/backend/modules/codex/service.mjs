import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { internalError, invalidParamsError } from '../../core/errors.mjs'
import logger from '../../core/logger.mjs'

const sessions = new Map()
const messages = new Map()
const processes = new Map()
const approvals = new Map()

const SESSION_TTL = 24 * 60 * 60 * 1000

function generateId(prefix) {
	return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function cleanupStaleSessions() {
	const now = Date.now()
	for (const [id, session] of sessions) {
		if (now - (session.updatedAt || session.createdAt) > SESSION_TTL) {
			sessions.delete(id)
			messages.delete(id)
			approvals.delete(id)
			const proc = processes.get(id)
			if (proc) {
				try { proc.kill() } catch {}
				processes.delete(id)
			}
		}
	}
}

function toSessionDto(session) {
	return {
		id: session.id,
		title: session.title || 'New Conversation',
		status: 'active',
		model_name: session.model,
		cwd: session.cwd,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt
	}
}

function toMessageDto(msg) {
	return {
		id: msg.id,
		role: msg.role,
		content: msg.role === 'user' ? msg.content : (msg.streaming ? msg.content : msg.content),
		createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : undefined
	}
}

export function codexHealth() {
	return { ok: true, status: 'ok', configured: true, mode: 'memory' }
}

export function codexListSessions(_ctx, payload) {
	cleanupStaleSessions()
	const p = payload || {}
	const projectId = p.projectId
	const items = []
	for (const [id, session] of sessions) {
		if (projectId !== undefined && projectId !== null && session.projectId !== projectId) continue
		items.push(toSessionDto(session))
	}
	items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
	return { items }
}

export function codexCreateSession(_ctx, payload) {
	const p = payload || {}
	const sessionId = generateId('codex')
	const now = Date.now()
	const session = {
		id: sessionId,
		title: p.title || 'New Conversation',
		cwd: p.cwd || process.cwd(),
		model: p.model || 'copilot',
		projectId: p.projectId || null,
		createdAt: now,
		updatedAt: now
	}
	sessions.set(sessionId, session)
	messages.set(sessionId, [])
	approvals.set(sessionId, new Map())
	return toSessionDto(session)
}

export function codexListMessages(_ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	if (!sessionId) return { error: 'sessionId is required' }
	const session = sessions.get(sessionId)
	if (!session) return { error: 'session not found' }
	const sessionMessages = messages.get(sessionId) || []
	return {
		items: sessionMessages.map(toMessageDto)
	}
}

export function codexUpdateSession(_ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	if (!sessionId) return { error: 'sessionId is required' }
	const session = sessions.get(sessionId)
	if (!session) return { error: 'session not found' }
	if (p.title !== undefined) session.title = String(p.title)
	if (p.projectId !== undefined) session.projectId = p.projectId
	session.updatedAt = Date.now()
	return toSessionDto(session)
}

export function codexDeleteSession(_ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	if (!sessionId) return { error: 'sessionId is required' }
	sessions.delete(sessionId)
	messages.delete(sessionId)
	approvals.delete(sessionId)
	const proc = processes.get(sessionId)
	if (proc) {
		try { proc.kill() } catch {}
		processes.delete(sessionId)
	}
	return { ok: true }
}

export function codexSubmitApproval(_ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	const messageId = String(p.message_id || p.messageId || '').trim()
	const decision = String(p.decision || '').trim()
	if (!sessionId) return { error: 'sessionId is required' }
	if (!messageId) return { error: 'messageId is required' }
	if (!['accept', 'decline'].includes(decision)) {
		return { error: 'decision must be accept or decline' }
	}
	const sessionApprovals = approvals.get(sessionId)
	if (!sessionApprovals) return { error: 'session not found' }
	sessionApprovals.set(messageId, { decision, submittedAt: Date.now() })
	return { ok: true, decision, message_id: messageId }
}

export async function* codexSendMessageStream(_ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	const content = String(p.content || '').trim()
	if (!sessionId) {
		yield JSON.stringify({ type: 'error', error: { message: 'sessionId is required' } })
		return
	}
	if (!content) {
		yield JSON.stringify({ type: 'error', error: { message: 'content is required' } })
		return
	}

	const session = sessions.get(sessionId)
	if (!session) {
		yield JSON.stringify({ type: 'error', error: { message: 'session not found' } })
		return
	}

	const userMsgId = generateId('msg')
	const assistantMsgId = generateId('msg')
	const now = Date.now()
	const sessionMessages = messages.get(sessionId) || []

	const userMessage = {
		id: userMsgId,
		role: 'user',
		content,
		createdAt: now,
		sessionId
	}
	sessionMessages.push(userMessage)

	yield JSON.stringify({
		event: 'message',
		data: {
			id: userMsgId,
			role: 'user',
			content: [{ type: 'text', text: content }],
			createdAt: new Date(now).toISOString()
		}
	})

	session.updatedAt = now

	const assistantMessage = {
		id: assistantMsgId,
		role: 'assistant',
		content: '',
		createdAt: now,
		sessionId,
		streaming: true
	}
	sessionMessages.push(assistantMessage)

	const mockResponse = `Codex CLI integration is currently in development. Your message: "${content}"\n\nThis is a placeholder response until the full CLI subprocess management is implemented.`

	yield JSON.stringify({
		event: 'message-start',
		data: { id: assistantMsgId, role: 'assistant' }
	})

	let accumulated = ''
	const chunks = mockResponse.split(/(\s+)/)
	for (const chunk of chunks) {
		accumulated += chunk
		assistantMessage.content = accumulated
		yield JSON.stringify({
			event: 'message-delta',
			data: { messageId: assistantMsgId, delta: { type: 'text', text: chunk } }
		})
		await new Promise(resolve => setTimeout(resolve, 20))
	}

	assistantMessage.streaming = false
	yield JSON.stringify({
		event: 'message-stop',
		data: { messageId: assistantMsgId }
	})
	yield JSON.stringify({ event: 'done', data: {} })
}

export function codexCancel(_ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	if (!sessionId) return { error: 'sessionId is required' }
	const proc = processes.get(sessionId)
	if (proc) {
		try { proc.kill() } catch {}
		processes.delete(sessionId)
	}
	return { ok: true }
}
