import { getLocalDb } from '../db.mjs'
import crypto from 'node:crypto'

const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted', 'submission_unknown'])
function rejectCredentials(value) {
	if (!value || typeof value !== 'object') return
	for (const [key, item] of Object.entries(value)) {
		if (
			/^(api_?key|authorization|access_?token|refresh_?token|password|secret)$/i.test(key) &&
			item
		)
			throw new Error('RECIPE_CONTAINS_CREDENTIALS')
		rejectCredentials(item)
	}
}
export function createFrameAutomationRunsRepo(database) {
	const db = () => database || getLocalDb()
	return {
		recoverInterrupted() {
			return db().transaction(() => {
				const rows = db()
					.prepare("SELECT id FROM frame_automation_runs WHERE status IN ('preparing','running')")
					.all()
				for (const row of rows) {
					const seq = db()
						.prepare(
							'SELECT COALESCE(MAX(seq),0)+1 AS n FROM frame_automation_events WHERE run_id=?'
						)
						.get(row.id).n
					db()
						.prepare(
							'INSERT INTO frame_automation_events(run_id,seq,event_id,type,payload,created_at) VALUES(?,?,?,?,?,?)'
						)
						.run(
							row.id,
							seq,
							crypto.randomUUID(),
							'RunInterrupted',
							'{"reason":"client_restart","remoteTaskCancelled":false}',
							Date.now()
						)
					db()
						.prepare("UPDATE frame_automation_runs SET status='cancelled',updated_at=? WHERE id=?")
						.run(Date.now(), row.id)
				}
				return rows.length
			})()
		},
		reconcile({ projectId, runId, confirmed }) {
			if (confirmed !== true) throw new Error('CONFIRMATION_REQUIRED')
			return db().transaction(() => {
				const row = db()
					.prepare('SELECT status FROM frame_automation_runs WHERE id=? AND project_id=?')
					.get(runId, projectId)
				if (!row || !['interrupted', 'submission_unknown'].includes(row.status))
					throw new Error('RUN_NOT_UNCERTAIN')
				const seq = db()
					.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM frame_automation_events WHERE run_id=?')
					.get(runId).n
				db()
					.prepare(
						'INSERT INTO frame_automation_events(run_id,seq,event_id,type,payload,created_at) VALUES(?,?,?,?,?,?)'
					)
					.run(runId, seq, crypto.randomUUID(), 'RunReconciled', '{"manual":true}', Date.now())
				db()
					.prepare("UPDATE frame_automation_runs SET status='failed',updated_at=? WHERE id=?")
					.run(Date.now(), runId)
				return { seq }
			})()
		},
		create({ projectId, frameId, recipe, parentRunId }) {
			if (
				!Number.isInteger(projectId) ||
				projectId <= 0 ||
				!frameId ||
				recipe?.version !== 1 ||
				!recipe?.nodes?.length ||
				!Array.isArray(recipe.order) ||
				!recipe.order.length ||
				recipe.frame?.id !== frameId
			)
				throw new Error('INVALID_RUN')
			if (
				parentRunId &&
				!db()
					.prepare('SELECT id FROM frame_automation_runs WHERE id=? AND project_id=?')
					.get(parentRunId, projectId)
			)
				throw new Error('PARENT_RUN_NOT_FOUND')
			rejectCredentials(recipe)
			const json = JSON.stringify(recipe)
			if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw new Error('RECIPE_TOO_LARGE')
			db().transaction(() => {
				const stale = db()
					.prepare(
						"SELECT id FROM frame_automation_runs WHERE project_id=? AND frame_id=? AND status IN ('preparing','running','interrupted','submission_unknown')"
					)
					.all(projectId, frameId)
				for (const row of stale) {
					const seq = db()
						.prepare(
							'SELECT COALESCE(MAX(seq),0)+1 AS n FROM frame_automation_events WHERE run_id=?'
						)
						.get(row.id).n
					db()
						.prepare(
							'INSERT INTO frame_automation_events(run_id,seq,event_id,type,payload,created_at) VALUES(?,?,?,?,?,?)'
						)
						.run(
							row.id,
							seq,
							crypto.randomUUID(),
							'RunSuperseded',
							'{"reason":"new_session","remoteTaskCancelled":false}',
							Date.now()
						)
					db()
						.prepare("UPDATE frame_automation_runs SET status='cancelled',updated_at=? WHERE id=?")
						.run(Date.now(), row.id)
				}
			})()
			const id = crypto.randomUUID(),
				hash = crypto.createHash('sha256').update(json).digest('hex')
			db()
				.prepare(
					'INSERT INTO frame_automation_runs(id,project_id,frame_id,recipe_hash,recipe,status,parent_run_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
				)
				.run(
					id,
					projectId,
					frameId,
					hash,
					json,
					'preparing',
					parentRunId || null,
					Date.now(),
					Date.now()
				)
			return { id, recipeHash: hash }
		},
		append({ projectId, runId, eventId, type, payload = {}, status }) {
			rejectCredentials(payload)
			if (!eventId || !type || typeof eventId !== 'string' || typeof type !== 'string')
				throw new Error('INVALID_EVENT')
			if (status && !['preparing', 'running', ...terminal].includes(status))
				throw new Error('INVALID_STATUS')
			const json = JSON.stringify(payload)
			if (Buffer.byteLength(json) > 2 * 1024 * 1024) throw new Error('EVENT_TOO_LARGE')
			return db().transaction(() => {
				const run = db()
					.prepare('SELECT status FROM frame_automation_runs WHERE id=? AND project_id=?')
					.get(runId, projectId)
				if (!run) throw new Error('RUN_NOT_FOUND')
				const prior = db()
					.prepare('SELECT seq FROM frame_automation_events WHERE run_id=? AND event_id=?')
					.get(runId, eventId)
				if (prior) return prior
				if (terminal.has(run.status)) throw new Error('RUN_ALREADY_TERMINAL')
				const seq = db()
					.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM frame_automation_events WHERE run_id=?')
					.get(runId).n
				db()
					.prepare(
						'INSERT INTO frame_automation_events(run_id,seq,event_id,type,payload,created_at) VALUES(?,?,?,?,?,?)'
					)
					.run(runId, seq, eventId, type, json, Date.now())
				db()
					.prepare('UPDATE frame_automation_runs SET status=?,updated_at=? WHERE id=?')
					.run(status || run.status, Date.now(), runId)
				return { seq }
			})()
		},
		list({ projectId, frameId }) {
			return db()
				.prepare(
					'SELECT id,recipe_hash AS recipeHash,status,parent_run_id AS parentRunId,created_at AS createdAt FROM frame_automation_runs WHERE project_id=? AND frame_id=? ORDER BY created_at DESC LIMIT 100'
				)
				.all(projectId, frameId)
		},
		get({ projectId, runId }) {
			const row = db()
				.prepare('SELECT * FROM frame_automation_runs WHERE id=? AND project_id=?')
				.get(runId, projectId)
			if (!row) throw new Error('RUN_NOT_FOUND')
			return {
				id: row.id,
				status: row.status,
				recipeHash: row.recipe_hash,
				recipe: JSON.parse(row.recipe),
				events: db()
					.prepare(
						'SELECT seq,event_id AS eventId,type,payload,created_at AS createdAt FROM frame_automation_events WHERE run_id=? ORDER BY seq'
					)
					.all(runId)
					.map((e) => ({ ...e, payload: JSON.parse(e.payload) }))
			}
		}
	}
}
