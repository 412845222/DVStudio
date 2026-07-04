import * as service from './service.mjs'

export async function health(ctx) {
  return service.health(ctx)
}

export function generate(ctx, payload) {
  return service.generateVideoStream(ctx, payload)
}

export async function list(ctx, payload) {
  return service.listTasks(ctx, payload)
}

export async function taskDetail(ctx, payload) {
  return service.getTaskDetail(ctx, payload)
}

export async function sync(ctx, payload) {
  return service.syncTasks(ctx, payload)
}

export async function taskDetailRemote(ctx, payload) {
  try {
    const result = await service.getTaskDetailRemote(ctx, payload)
    return result
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

export async function downloadAsset(ctx, payload) {
  try {
    const result = await service.downloadAssetToProject(ctx, payload)
    return result
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

export async function listAllRemote(ctx, payload) {
  try {
    const result = await service.listAllTasksRemote(ctx, payload)
    return result
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}
