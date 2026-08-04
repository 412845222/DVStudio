import { getRepos } from '../../../localdb/index.mjs'

function internalError(msg) {
	return new Error(msg)
}

export function listTasks(projectId, limit) {
	const repos = getRepos()
	const repo = repos?.arkTasks
	if (!repo) throw internalError('arkTasks repo not available')
	if (projectId !== undefined && projectId !== null && projectId !== '') {
		return repo.list({ projectId: Number(projectId), limit })
	}
	return repo.list({ limit })
}

export function getTaskDetail(taskId) {
	const repos = getRepos()
	const repo = repos?.arkTasks
	if (!repo) throw internalError('arkTasks repo not available')
	const task = repo.getByTaskId(taskId)
	if (!task) throw internalError('Task not found')
	return task
}

export function deleteTask(taskId) {
	const repos = getRepos()
	const repo = repos?.arkTasks
	if (!repo) throw internalError('arkTasks repo not available')
	return repo.remove(taskId)
}

export function recordTask(input) {
	const repos = getRepos()
	const repo = repos?.arkTasks
	if (!repo) throw internalError('arkTasks repo not available')
	return repo.upsert(input)
}

export function recordTasksBatch(tasks) {
	const repos = getRepos()
	const repo = repos?.arkTasks
	if (!repo) throw internalError('arkTasks repo not available')
	const results = []
	for (const t of tasks) {
		results.push(repo.upsert(t))
	}
	return results
}
