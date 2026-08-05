/**
 * Agent 模块 IPC 处理器
 */

import * as service from './service.mjs'

/**
 * Agent 流式对话
 */
export async function agentStream(ctx, payload) {
	return service.streamAgentMessage(ctx, payload)
}

/**
 * 获取 Agent 上下文
 */
export async function agentContext(ctx, payload) {
	return service.getAgentContext(ctx, payload)
}

/**
 * 中止 Agent 对话
 */
export async function agentAbort(ctx, payload) {
	return service.abortAgent(ctx, payload)
}

/**
 * 获取 Agent 会话列表
 */
export async function agentListConversations(ctx, payload) {
	return service.listAgentConversations(ctx, payload)
}

/**
 * 创建 Agent 会话
 */
export async function agentCreateConversation(ctx, payload) {
	return service.createAgentConversation(ctx, payload)
}

/**
 * 删除 Agent 会话
 */
export async function agentDeleteConversation(ctx, payload) {
	return service.deleteAgentConversation(ctx, payload)
}

/**
 * 获取 Agent 会话消息
 */
export async function agentGetConversationMessages(ctx, payload) {
	return service.getAgentConversationMessages(ctx, payload)
}

/**
 * 添加 Agent 会话消息
 */
export async function agentAddConversationMessage(ctx, payload) {
	return service.addAgentConversationMessage(ctx, payload)
}

/**
 * 重命名 Agent 会话
 */
export async function agentRenameConversation(ctx, payload) {
	return service.renameAgentConversation(ctx, payload)
}
