import { BrowserWindow } from 'electron'
import { createServiceEvents, redact } from './serviceEvents.mjs'
import { createProcessManager } from './processManager.mjs'
import { normalizeProfile, probeSource, prepareSource } from './sourceManager.mjs'
import { hasCommandProcesses, stopCommandProcesses } from './commands.mjs'

const prefix = 'dweb:deepseek-harness:setup:'
const events = createServiceEvents((name, payload) => {
	for (const win of BrowserWindow.getAllWindows()) {
		try {
			if (!win.isDestroyed()) win.webContents.send(prefix + name, payload)
		} catch {
			/* Closing window. */
		}
	}
})
const runtime = createProcessManager(events)
let busy = false
let preparing = null
let disposing = null

function repo(ctx) {
	const value = ctx.localdb?.deepseekHarnessProfiles
	if (!value) throw new Error('本地数据库尚未就绪，请稍后重试')
	return value
}
function profileAt(ctx, payload) {
	const value = repo(ctx).get(payload.profileId)
	if (!value) throw new Error('请先保存并选择源码记录')
	if (value.revision !== payload.expectedRevision)
		throw new Error('配置已变更，请刷新后重试（REVISION_CONFLICT）')
	return value
}
function assertIdle() {
	if (runtime.isActive() || preparing || disposing || hasCommandProcesses())
		throw new Error('请先停止服务或等待当前操作完成（BUSY）')
}
async function exclusive(fn) {
	if (busy || disposing) throw new Error('其他窗口正在操作，请稍后重试（BUSY）')
	busy = true
	try {
		return await fn()
	} finally {
		busy = false
	}
}
function changed() {
	events.emit('config-changed', {})
}

export const listProfiles = (ctx) => repo(ctx).list()
export const getSnapshot = () => ({
	...events.snapshot(),
	status: runtime.snapshot(),
	preparing: preparing ? { operationId: preparing.id, profileId: preparing.profileId } : null
})
export const clearLogs = () => {
	events.clear()
	return getSnapshot()
}
export const probe = async (ctx, payload) => {
	const profile = payload.profileId
		? repo(ctx).get(payload.profileId)
		: await normalizeProfile(payload.profile)
	if (!profile) throw new Error('源码记录不存在')
	return probeSource(profile)
}
export const saveProfile = (ctx, payload) =>
	exclusive(async () => {
		assertIdle()
		const result = repo(ctx).save(await normalizeProfile(payload.profile), payload.expectedRevision)
		changed()
		return result
	})
export const removeProfile = (ctx, payload) =>
	exclusive(() => {
		assertIdle()
		repo(ctx).remove(payload.profileId, payload.expectedRevision)
		changed()
		return repo(ctx).list()
	})
export const activateProfile = (ctx, payload) =>
	exclusive(async () => {
		assertIdle()
		const value = repo(ctx).get(payload.profileId)
		if (!value) throw new Error('源码记录不存在')
		await probeSource(value)
		repo(ctx).activate(value.id, payload.expectedRevision)
		changed()
		return repo(ctx).list()
	})
export const startService = (ctx, payload) =>
	exclusive(() => {
		if (preparing || (!runtime.isActive() && hasCommandProcesses()))
			throw new Error('正在准备环境或清理进程（BUSY）')
		const profile = profileAt(ctx, payload)
		if (repo(ctx).list().activeProfileId !== profile.id) throw new Error('请先设为当前源码')
		return runtime.start(profile)
	})
export const stopService = (_ctx, payload) => {
	if (runtime.isActive() && payload.runId !== runtime.snapshot().runId)
		throw new Error('服务实例已变化，请刷新状态')
	return runtime.stop().then(() => runtime.snapshot())
}
export const restartService = (ctx, payload) =>
	exclusive(async () => {
		if (preparing || (!runtime.isActive() && hasCommandProcesses()))
			throw new Error('正在准备环境或清理进程（BUSY）')
		const profile = profileAt(ctx, payload)
		if (repo(ctx).list().activeProfileId !== profile.id) throw new Error('请先设为当前源码')
		await stopService(ctx, payload)
		if (disposing) throw new Error('客户端正在关闭服务')
		return runtime.start(profile)
	})
export function getOpenUrl(runId) {
	if (!runId || runId !== runtime.snapshot().runId || !runtime.url())
		throw new Error('服务尚未就绪或实例已变化')
	return runtime.url()
}

export async function* prepare(ctx, payload) {
	if (busy || disposing) throw new Error('正在操作（BUSY）')
	assertIdle()
	const profile = profileAt(ctx, payload)
	if (typeof payload.operationId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(payload.operationId))
		throw new Error('无效操作 ID')
	const controller = new AbortController()
	const op = { id: payload.operationId, profileId: profile.id, controller, task: null }
	preparing = op
	const queue = []
	let wake
	let done = false
	let failure
	const push = (value) => {
		if (queue.length < 100) queue.push(value)
		wake?.()
		wake = null
	}
	const sendPhase = (phase, message) => {
		events.log('system', message)
		push({ operationId: op.id, phase, message })
	}
	op.task = prepareSource(profile, {
		signal: controller.signal,
		onLine: (stream, line) => events.log(stream, line),
		onPhase: sendPhase
	})
		.then((report) =>
			push({
				operationId: op.id,
				phase: 'done',
				message: '环境准备完成，可以设为当前源码并启动',
				report
			})
		)
		.catch((error) => {
			failure = error
			events.log('system', error.message)
		})
		.finally(() => {
			done = true
			wake?.()
			wake = null
		})
	changed()
	try {
		yield { operationId: op.id, phase: 'started', message: '开始准备环境' }
		while (!done || queue.length) {
			if (queue.length) yield queue.shift()
			else
				await new Promise((resolve) => {
					wake = resolve
				})
		}
		if (failure)
			throw new Error(controller.signal.aborted ? '环境准备已取消' : redact(failure.message))
	} finally {
		controller.abort()
		await op.task
		if (preparing === op) preparing = null
		changed()
	}
}
export const cancelPrepare = (_ctx, payload) => {
	if (preparing && preparing.id !== payload.operationId) throw new Error('准备操作已变化')
	preparing?.controller.abort()
	return { cancelled: true }
}
export function disposeDeepSeekHarness() {
	if (disposing) return disposing
	preparing?.controller.abort()
	disposing = Promise.all([runtime.stop(), preparing?.task, stopCommandProcesses()]).finally(() => {
		events.flush()
		disposing = null
	})
	return disposing
}
