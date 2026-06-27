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
