/**
 * Agent 模块 IPC 处理器
 */

import * as service from './service.mjs';

/**
 * Agent 流式对话
 */
export async function agentStream(ctx, payload) {
	return service.streamAgentMessage(ctx, payload);
}

/**
 * 获取 Agent 上下文
 */
export async function agentContext(ctx, payload) {
	return service.getAgentContext(ctx, payload);
}

/**
 * 中止 Agent 对话
 */
export async function agentAbort(ctx, payload) {
	return service.abortAgent(ctx, payload);
}
