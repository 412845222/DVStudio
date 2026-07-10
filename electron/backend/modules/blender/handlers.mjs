import blenderMcpService, {
  connectBlenderMcp,
  disconnectBlenderMcp,
  getBlenderMcpStatus,
} from './service.mjs'

export async function checkStatus(ctx, payload) {
  return blenderMcpService.checkStatus(ctx, payload);
}

export async function connectMcp(ctx, payload) {
  const port = payload?.port ?? payload?.mcpPort ?? 9876;
  const host = payload?.host ?? payload?.mcpHost ?? 'localhost';
  return connectBlenderMcp(port, host);
}

export async function disconnectMcp(ctx, payload) {
  return disconnectBlenderMcp();
}

export async function getMcpStatus(ctx, payload) {
  return blenderMcpService.getMcpStatus(ctx, payload);
}

export async function callTool(ctx, payload) {
  return blenderMcpService.callTool(ctx, payload);
}

export async function importModel(ctx, payload) {
  return blenderMcpService.importModel(ctx, payload);
}
