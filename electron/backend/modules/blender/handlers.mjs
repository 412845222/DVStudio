import blenderMcpService, {
	connectBlenderMcp,
	disconnectBlenderMcp,
	getBlenderMcpStatus,
	setBlenderWorkspaceContext,
	saveBlenderReferenceImages,
	getBlenderNodeWorkspacePath
} from './service.mjs'
import { getBlenderWorkspace } from './workspace.mjs'
import { shell } from 'electron'
import path from 'path'

function getProjectRoot(ctx, projectId) {
	try {
		const roots = ctx.protocol?.getProjectRootSnapshot?.() || {}
		const projectIdStr = projectId != null ? String(projectId) : null
		if (projectIdStr && roots[projectIdStr]) {
			return roots[projectIdStr]
		}
		const rootIds = Object.keys(roots)
		if (rootIds.length === 1) {
			return roots[rootIds[0]]
		}
		if (rootIds.length > 0) {
			return roots[rootIds[0]]
		}
	} catch (err) {
		ctx.logger?.warn?.(`[BlenderHandlers] Failed to get project root: ${err.message}`)
	}
	return null
}

export async function checkStatus(ctx, payload) {
	return blenderMcpService.checkStatus(ctx, payload)
}

export async function connectMcp(ctx, payload) {
	const port = payload?.port ?? payload?.mcpPort ?? 9876
	const host = payload?.host ?? payload?.mcpHost ?? 'localhost'
	return connectBlenderMcp(port, host)
}

export async function disconnectMcp(ctx, payload) {
	return disconnectBlenderMcp()
}

export async function getMcpStatus(ctx, payload) {
	return blenderMcpService.getMcpStatus(ctx, payload)
}

export async function callTool(ctx, payload) {
	return blenderMcpService.callTool(ctx, payload)
}

export async function importModel(ctx, payload) {
	return blenderMcpService.importModel(ctx, payload)
}

export async function checkToolsReady(ctx, payload) {
	return blenderMcpService.checkToolsReady()
}

export async function mountTools(ctx, payload) {
	return blenderMcpService.mountTools()
}

export async function workspaceInit(ctx, payload) {
	const { nodeId, projectId, references } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const workspace = getBlenderWorkspace()
	const result = await workspace.initWorkspace(projectRoot, nodeId)
	if (result.ok) {
		setBlenderWorkspaceContext(projectRoot, nodeId)
	}

	let savedRefs = []
	if (result.ok && Array.isArray(references) && references.length > 0) {
		try {
			const saveResult = await saveBlenderReferenceImages(references)
			if (saveResult && saveResult.ok) {
				savedRefs = saveResult.saved || []
			}
		} catch (err) {
			ctx.logger?.warn?.(`[BlenderHandlers] Failed to save reference images: ${err.message}`)
		}
	}

	const workspacePath = getBlenderNodeWorkspacePath() || result.workspacePath
	return {
		...result,
		workspacePath,
		references: savedRefs,
		screenshotsDir: workspacePath ? path.join(workspacePath, 'screenshots') : null,
		referencesDir: workspacePath ? path.join(workspacePath, 'references') : null
	}
}

export async function workspaceSaveScript(ctx, payload) {
	const { nodeId, projectId, code, summary } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const workspace = getBlenderWorkspace()
	return workspace.saveScript(projectRoot, nodeId, code, summary)
}

export async function workspaceSaveScreenshot(ctx, payload) {
	const { nodeId, projectId, base64Data, mimeType } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const workspace = getBlenderWorkspace()
	return workspace.saveScreenshot(projectRoot, nodeId, base64Data, mimeType)
}

export async function workspaceClear(ctx, payload) {
	const { nodeId, projectId } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const workspace = getBlenderWorkspace()
	return workspace.clearWorkspace(projectRoot, nodeId)
}

export async function workspaceListScripts(ctx, payload) {
	const { nodeId, projectId } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found', scripts: [] }
	}
	const workspace = getBlenderWorkspace()
	return workspace.listScripts(projectRoot, nodeId)
}

export async function workspaceGetStats(ctx, payload) {
	const { nodeId, projectId } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const workspace = getBlenderWorkspace()
	return workspace.getStats(projectRoot, nodeId)
}

export async function workspaceOpenFolder(ctx, payload) {
	const { nodeId, projectId } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const safeNodeId = nodeId?.replace(/[^a-zA-Z0-9_-]/g, '_')
	if (!safeNodeId) {
		return { ok: false, error: 'Invalid nodeId' }
	}
	const workspacePath = path.resolve(projectRoot, 'Content', 'agent', safeNodeId)
	try {
		const fs = await import('fs')
		if (!fs.existsSync(workspacePath)) {
			fs.mkdirSync(workspacePath, { recursive: true })
			for (const subdir of ['scripts', 'screenshots', 'sessions', 'cache', 'references']) {
				fs.mkdirSync(path.join(workspacePath, subdir), { recursive: true })
			}
		}
		shell.openPath(workspacePath)
		return { ok: true, path: workspacePath }
	} catch (err) {
		return { ok: false, error: err.message }
	}
}

export async function workspaceGetPath(ctx, payload) {
	const { nodeId, projectId } = payload || {}
	const projectRoot = getProjectRoot(ctx, projectId)
	if (!projectRoot) {
		return { ok: false, error: 'No active project found' }
	}
	const safeNodeId = nodeId?.replace(/[^a-zA-Z0-9_-]/g, '_')
	if (!safeNodeId) {
		return { ok: false, error: 'Invalid nodeId' }
	}
	const workspacePath = path.resolve(projectRoot, 'Content', 'agent', safeNodeId)
	const fs = await import('fs')
	return {
		ok: true,
		path: workspacePath,
		exists: fs.existsSync(workspacePath)
	}
}
