import { invalidParamsError, notFoundError, internalError } from '../../core/errors.mjs'

export async function listProjects(ctx) {
  const repo = ctx.localdb?.projects
  if (!repo) throw internalError('projects repo not available')
  return { ok: true, projects: repo.list() }
}

export async function saveProject(ctx, payload) {
  const repo = ctx.localdb?.projects
  if (!repo) throw internalError('projects repo not available')
  const name = payload?.name
  const snapshot = payload?.snapshot
  const projectId = payload?.projectId
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw invalidParamsError('name is required')
  }
  if (!snapshot || typeof snapshot !== 'object') {
    throw invalidParamsError('snapshot is invalid')
  }
  const result = repo.saveProject({ name: name.trim(), snapshot, projectId })
  if (!result.ok) {
    if (result.error === 'projectId not found') throw notFoundError(result.error)
    if (result.error === 'snapshot is invalid') throw invalidParamsError(result.error)
    throw internalError(result.error || 'save project failed')
  }
  return { ok: true, project: result.project }
}

export async function loadProject(ctx, payload) {
  const repo = ctx.localdb?.projects
  if (!repo) throw internalError('projects repo not available')
  const projectId = payload?.id
  if (projectId === undefined || projectId === null || projectId === '') {
    throw invalidParamsError('id is required')
  }
  const result = repo.loadProject(projectId)
  if (!result.ok) {
    if (result.error === 'project not found') throw notFoundError(result.error)
    throw internalError(result.error || 'load project failed')
  }

  let rootRegistered = false
  const rootPath = result.project?.rootPath
  if (rootPath && typeof rootPath === 'string' && rootPath.trim()) {
    try {
      const regResult = ctx.protocol.setProjectRoot(projectId, rootPath.trim())
      rootRegistered = Boolean(regResult?.ok)
    } catch {
      rootRegistered = false
    }
  }

  return { ok: true, project: result.project, snapshot: result.snapshot, rootRegistered }
}

export async function deleteProject(ctx, payload) {
  const repo = ctx.localdb?.projects
  if (!repo) throw internalError('projects repo not available')
  const projectId = payload?.id
  if (projectId === undefined || projectId === null || projectId === '') {
    throw invalidParamsError('id is required')
  }
  const existing = repo.getById(projectId)
  if (!existing) throw notFoundError('project not found')
  const result = repo.deleteProject(projectId)
  if (!result.ok) {
    throw internalError(result.error || 'delete project failed')
  }
  return { ok: true, id: result.id }
}

export async function openProjectFolder(ctx, payload) {
  const repo = ctx.localdb?.projects
  if (!repo) throw internalError('projects repo not available')
  const rootPath = payload?.rootPath
  const name = payload?.name
  const create = payload?.create
  if (!rootPath || typeof rootPath !== 'string' || !rootPath.trim()) {
    throw invalidParamsError('rootPath is required')
  }
  const result = repo.openProjectFolder({
    rootPath: rootPath.trim(),
    name: typeof name === 'string' ? name.trim() : '',
    create: create === true || String(create || '').toLowerCase() === 'true',
  })
  if (!result.ok) {
    throw internalError(result.error || 'open project folder failed')
  }

  let rootRegistered = false
  const projectId = result.project?.id
  const registeredRoot = result.project?.rootPath || rootPath.trim()
  if (projectId && registeredRoot) {
    try {
      const regResult = ctx.protocol.setProjectRoot(projectId, registeredRoot)
      rootRegistered = Boolean(regResult?.ok)
    } catch {
      rootRegistered = false
    }
  }

  return { ok: true, project: result.project, rootRegistered }
}
