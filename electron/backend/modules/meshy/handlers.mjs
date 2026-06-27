import * as service from './service.mjs'

export async function health(ctx) {
  return service.health(ctx)
}

export async function generate(ctx, payload) {
  return service.generateModel(ctx, payload)
}

export async function getTask(ctx, payload) {
  return service.getTask(ctx, payload)
}

export async function listTasks(ctx, payload) {
  return service.listTasks(ctx, payload)
}

export async function taskDetail(ctx, payload) {
  return service.getTaskDetail(ctx, payload)
}

export async function stop(ctx, payload) {
  return service.stopTask(ctx, payload)
}

export async function deleteTask(ctx, payload) {
  return service.deleteTask(ctx, payload)
}

export async function balance(ctx) {
  return service.getBalance(ctx)
}
