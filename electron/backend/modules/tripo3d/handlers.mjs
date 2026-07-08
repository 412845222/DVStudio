import * as service from './service.mjs'

export async function health(ctx) {
  return service.health(ctx)
}

export async function generate(ctx, payload) {
  return service.generateModel(ctx, payload)
}

export async function generateTextToImage(ctx, payload) {
  return service.generateTextToImage(ctx, payload)
}

export async function generateImageToImage(ctx, payload) {
  return service.generateImageToImage(ctx, payload)
}

export async function generateImageToMultiview(ctx, payload) {
  return service.generateImageToMultiview(ctx, payload)
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

export async function uploadFile(ctx, payload) {
  return service.uploadFile(ctx, payload)
}
