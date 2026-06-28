import * as service from './service.mjs'

export async function handleListTasks(ctx, payload) {
	try {
		const p = payload || {}
		const tasks = service.listTasks(p.projectId, p.limit)
		return { ok: true, tasks }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function handleGetTaskDetail(ctx, payload) {
	try {
		const p = payload || {}
		const task = service.getTaskDetail(p.taskId)
		return { ok: true, task }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function handleDeleteTask(ctx, payload) {
	try {
		const p = payload || {}
		const result = service.deleteTask(p.taskId)
		// 同步删除 seedance 对应的 videoTasks 记录
		const taskId = String(p.taskId || '').trim()
		if (taskId.startsWith('seedance-')) {
			try {
				const remoteTaskId = taskId.replace(/^seedance-/, '')
				const videoRepo = ctx.localdb?.videoTasks
				if (videoRepo) {
					videoRepo.remove(remoteTaskId)
				}
			} catch {}
		}
		return { ok: true, ...result }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export async function handleRecordTask(ctx, payload) {
	try {
		const p = payload || {}
		const result = service.recordTask(p)
		return { ok: true, ...result }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}