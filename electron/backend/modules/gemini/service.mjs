import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { internalError, invalidParamsError, notFoundError } from '../../core/errors.mjs'
import { getProjectRootById } from '../../projectAssetProtocol.mjs'
import { buildDwebAssetUrl, ensureProjectMediaRoot } from '../../projectStaticAssets/paths.mjs'

function getApiKey(ctx) {
	const repo = ctx.localdb?.apiKeys
	if (!repo) throw internalError('apiKeys repo not available')
	const result = repo.getPlaintext('gemini')
	if (!result.ok) throw internalError(result.error || 'failed to read gemini api key')
	const key = String(result.plaintext || '').trim()
	if (!key) throw invalidParamsError('gemini api key is not configured')
	return key
}

function generateTaskId() {
	return `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function generateImageFilename(taskId, index) {
	const timestamp = Date.now()
	const shortTaskId = String(taskId || '').replace(/^gemini-/, '')
	return `gemini-${shortTaskId}-${index}-${timestamp}.png`
}

function getTempDir() {
	const dir = path.join(os.tmpdir(), 'dvstudio-gemini-temp')
	fs.mkdirSync(dir, { recursive: true })
	return dir
}

function saveBase64ImageToTemp(base64Data, mimeType, filename) {
	const buffer = Buffer.from(base64Data, 'base64')
	const tempDir = getTempDir()
	const tempPath = path.join(tempDir, filename)
	fs.writeFileSync(tempPath, buffer)
	return {
		filename,
		tempPath,
		mimeType: mimeType || 'image/png',
		size: buffer.length
	}
}

function saveImageToProject(projectId, tempImageInfo, filename) {
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) {
		return null
	}

	const projectRoot = getProjectRootById(pid)
	if (!projectRoot) {
		console.warn(`[gemini] Project root not found for projectId=${pid}, cannot save to project directory`)
		return null
	}

	try {
		const mediaRoot = ensureProjectMediaRoot(projectRoot)
		const imagesDir = path.resolve(mediaRoot, 'images')
		fs.mkdirSync(imagesDir, { recursive: true })

		let finalFilename = filename
		let finalPath = path.resolve(imagesDir, finalFilename)
		let counter = 1
		while (fs.existsSync(finalPath)) {
			const ext = path.extname(filename)
			const base = path.basename(filename, ext)
			finalFilename = `${base}-${counter}${ext}`
			finalPath = path.resolve(imagesDir, finalFilename)
			counter++
		}

		fs.copyFileSync(tempImageInfo.tempPath, finalPath)

		try {
			fs.unlinkSync(tempImageInfo.tempPath)
		} catch {}

		const relPath = path.relative(projectRoot, finalPath).split(path.sep).join('/')
		const dwebUrl = buildDwebAssetUrl(pid, relPath)

		return {
			filename: finalFilename,
			localPath: finalPath,
			relativePath: relPath,
			dwebUrl,
			mimeType: tempImageInfo.mimeType,
			size: tempImageInfo.size
		}
	} catch (err) {
		console.error(`[gemini] Failed to save image to project:`, err)
		return null
	}
}

function serializeTask(row) {
	if (!row) return null
	return {
		id: row.id,
		taskId: row.taskId,
		model: row.model,
		modelLabel: row.modelLabel,
		status: row.status,
		progress: Number(row.progress) || 0,
		prompt: row.prompt,
		negativePrompt: row.negativePrompt,
		aspectRatio: row.aspectRatio,
		numImages: Number(row.numImages) || 1,
		resultImages: Array.isArray(row.resultImages) ? row.resultImages : [],
		thumbnailUrl: row.thumbnailUrl,
		errorMessage: row.errorMessage,
		errorCode: row.errorCode,
		statusText: row.statusText,
		projectId: row.projectId,
		nodeId: row.nodeId,
		createdAt: row.createdAt,
		startedAt: row.startedAt,
		completedAt: row.completedAt,
		updatedAt: row.updatedAt,
		requestPayload: row.requestPayload || {},
		responsePayload: row.responsePayload || {}
	}
}

export function createTaskRecord(ctx, payload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const taskId = String(payload?.taskId || generateTaskId()).trim()
	const model = String(payload?.model || '').trim()
	const modelLabel = String(payload?.modelLabel || model || '').trim()
	const prompt = String(payload?.prompt || '').trim()
	const negativePrompt = String(payload?.negativePrompt || '').trim()
	const aspectRatio = String(payload?.aspectRatio || '1:1').trim()
	const numImages = Number(payload?.numImages || 1)
	const projectId = payload?.projectId !== undefined && payload?.projectId !== null && payload?.projectId !== ''
		? Number(payload.projectId) || null
		: null
	const nodeId = String(payload?.nodeId || '').trim()

	const result = repo.upsert({
		taskId,
		model,
		modelLabel,
		status: 'submitting',
		progress: 0,
		prompt,
		negativePrompt,
		aspectRatio,
		numImages,
		resultImages: [],
		thumbnailUrl: '',
		errorMessage: '',
		errorCode: '',
		statusText: '正在提交任务到Google Gemini...',
		projectId,
		nodeId,
		requestPayload: payload || {},
		responsePayload: null,
		startedAt: new Date().toISOString(),
		completedAt: null
	})

	if (!result.ok) {
		throw internalError(result.error || 'failed to create gemini task record')
	}

	return serializeTask(result.task)
}

export function updateTaskStatus(ctx, taskId, patch) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const key = String(taskId || '').trim()
	if (!key) throw invalidParamsError('taskId is required')

	const updates = { taskId: key }
	if (patch.status !== undefined) updates.status = String(patch.status)
	if (patch.progress !== undefined) updates.progress = Math.max(0, Math.min(100, Number(patch.progress) || 0))
	if (patch.errorMessage !== undefined) updates.errorMessage = String(patch.errorMessage)
	if (patch.errorCode !== undefined) updates.errorCode = String(patch.errorCode)
	if (patch.statusText !== undefined) updates.statusText = String(patch.statusText)
	if (patch.resultImages !== undefined) updates.resultImages = Array.isArray(patch.resultImages) ? patch.resultImages : []
	if (patch.thumbnailUrl !== undefined) updates.thumbnailUrl = String(patch.thumbnailUrl)
	if (patch.responsePayload !== undefined) updates.responsePayload = patch.responsePayload
	if (patch.completedAt !== undefined) updates.completedAt = patch.completedAt || new Date().toISOString()

	const result = repo.upsert(updates)
	if (!result.ok) {
		throw internalError(result.error || 'failed to update gemini task record')
	}

	return serializeTask(result.task)
}

export function completeTask(ctx, taskId, images, responsePayload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const existingTask = repo.getByTaskId(taskId)
	const projectId = existingTask?.projectId || null

	const savedImages = []
	let thumbnailUrl = ''

	for (let i = 0; i < images.length; i++) {
		const img = images[i]
		if (!img || !img.data) continue

		const filename = generateImageFilename(taskId, i)
		const tempSaved = saveBase64ImageToTemp(img.data, img.mimeType, filename)

		let finalSaved = null
		if (projectId) {
			finalSaved = saveImageToProject(projectId, tempSaved, filename)
		}

		if (finalSaved) {
			savedImages.push(finalSaved)
			if (!thumbnailUrl) {
				thumbnailUrl = finalSaved.dwebUrl
			}
		} else {
			const fileUrl = `file://${tempSaved.tempPath.replace(/\\/g, '/')}`
			const fallbackSaved = {
				filename: tempSaved.filename,
				localPath: tempSaved.tempPath,
				mimeType: tempSaved.mimeType,
				size: tempSaved.size,
				dwebUrl: fileUrl
			}
			savedImages.push(fallbackSaved)
			if (!thumbnailUrl) {
				thumbnailUrl = fileUrl
			}
		}
	}

	const updates = {
		taskId,
		status: 'completed',
		progress: 100,
		resultImages: savedImages,
		thumbnailUrl,
		statusText: '生成完成',
		responsePayload: responsePayload || null,
		completedAt: new Date().toISOString()
	}

	const result = repo.upsert(updates)
	if (!result.ok) {
		throw internalError(result.error || 'failed to complete gemini task record')
	}

	return serializeTask(result.task)
}

export function failTask(ctx, taskId, errorMessage, errorCode) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const result = repo.upsert({
		taskId,
		status: 'failed',
		progress: 0,
		errorMessage: String(errorMessage || '未知错误'),
		errorCode: String(errorCode || ''),
		statusText: `生成失败: ${String(errorMessage || '未知错误')}`,
		completedAt: new Date().toISOString()
	})

	if (!result.ok) {
		throw internalError(result.error || 'failed to mark gemini task as failed')
	}

	return serializeTask(result.task)
}

export function cancelTask(ctx, taskId) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const existing = repo.getByTaskId(taskId)
	if (!existing) throw notFoundError('gemini task not found')

	const result = repo.upsert({
		taskId,
		status: 'cancelled',
		statusText: '已取消',
		completedAt: new Date().toISOString()
	})

	if (!result.ok) {
		throw internalError(result.error || 'failed to cancel gemini task')
	}

	return serializeTask(result.task)
}

export function getTask(ctx, payload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const taskId = String(payload?.taskId || payload?.id || '').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const task = repo.getByTaskId(taskId)
	if (!task) throw notFoundError('gemini task not found')

	return { ok: true, task: serializeTask(task) }
}

export function listTasks(ctx, payload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const tasks = repo.list({
		projectId: payload?.projectId,
		status: payload?.status,
		limit: payload?.limit || 100
	})

	return {
		ok: true,
		items: tasks.map(serializeTask).filter(Boolean)
	}
}

export function deleteTask(ctx, payload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const taskId = String(payload?.taskId || '').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const existing = repo.getByTaskId(taskId)
	if (!existing) throw notFoundError('gemini task not found')

	if (Array.isArray(existing.resultImages) && existing.resultImages.length > 0) {
		for (const img of existing.resultImages) {
			if (img.localPath && fs.existsSync(img.localPath)) {
				try {
					fs.unlinkSync(img.localPath)
				} catch {
				}
			}
		}
	}

	repo.remove(taskId)
	return { ok: true, taskId, deleted: true }
}

export function clearCompleted(ctx, payload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const tasks = repo.list({
		projectId: payload?.projectId,
		status: 'completed'
	})
	const failedTasks = repo.list({
		projectId: payload?.projectId,
		status: 'failed'
	})

	const allToDelete = [...tasks, ...failedTasks]
	for (const task of allToDelete) {
		if (Array.isArray(task.resultImages) && task.resultImages.length > 0) {
			for (const img of task.resultImages) {
				if (img.localPath && fs.existsSync(img.localPath)) {
					try {
						fs.unlinkSync(img.localPath)
					} catch {
					}
				}
			}
		}
	}

	repo.clearCompleted(payload?.projectId)
	return { ok: true, deletedCount: allToDelete.length }
}

export async function health(ctx) {
	const repo = ctx.localdb?.apiKeys
	if (!repo) return { ok: true, configured: false }
	const keyResult = repo.getPlaintext('gemini')
	return { ok: true, configured: !!(keyResult.ok && keyResult.plaintext) }
}

export function getImagePath(ctx, payload) {
	const repo = ctx.localdb?.geminiTasks
	if (!repo) throw internalError('geminiTasks repo not available')

	const taskId = String(payload?.taskId || '').trim()
	const imageIndex = Number(payload?.imageIndex || 0)
	if (!taskId) throw invalidParamsError('taskId is required')

	const task = repo.getByTaskId(taskId)
	if (!task) throw notFoundError('gemini task not found')

	const images = Array.isArray(task.resultImages) ? task.resultImages : []
	const img = images[imageIndex]
	if (!img) throw notFoundError('image not found')

	return {
		ok: true,
		path: img.localPath,
		filename: img.filename,
		mimeType: img.mimeType
	}
}
