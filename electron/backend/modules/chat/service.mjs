import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'

// 适配器
import { DeepSeekAdapter } from './adapters/deepseek.mjs';
import { BytedanceAdapter } from './adapters/bytedance.mjs';
import { GeminiAdapter } from './adapters/gemini.mjs';

/**
 * 获取 API 适配器
 * @param {string} apiSource - API 来源
 * @param {object} config - 配置
 * @returns {BaseAdapter}
 */
function getAdapter(apiSource, config = {}) {
  switch (apiSource) {
    case 'deepseek':
      return new DeepSeekAdapter(config);
    case 'bytedance':
      return new BytedanceAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    case 'openai':
      // OpenAI 兼容 DeepSeek 格式
      return new DeepSeekAdapter({ ...config, baseUrl: 'https://api.openai.com/v1' });
    default:
      return new DeepSeekAdapter(config);
  }
}

function getConversationsRepo(ctx) {
	const repo = ctx.localdb?.chatConversations
	if (!repo) throw internalError('chatConversations repo not available')
	return repo
}

function getApiKeyRepo(ctx) {
	const repo = ctx.localdb?.apiKeys
	if (!repo) throw internalError('apiKeys repo not available')
	return repo
}

function getProviderConfig(provider, apiKey) {
	const p = String(provider || 'deepseek').trim().toLowerCase()
	if (p === 'openai') {
		return {
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4o-mini',
			apiKey: String(apiKey || '').trim()
		}
	}
	if (p === 'gemini') {
		return {
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
			model: 'gemini-3.5-flash',
			apiKey: String(apiKey || '').trim()
		}
	}
	if (p === 'bytedance') {
		return {
			baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
			model: 'doubao-seed-2-0-pro-260215',
			apiKey: String(apiKey || '').trim()
		}
	}
	return {
		baseUrl: 'https://api.deepseek.com/v1',
		model: 'deepseek-chat',
		apiKey: String(apiKey || '').trim()
	}
}

function resolveProviderAndKey(ctx, requestedModel) {
	const keyRepo = getApiKeyRepo(ctx)
	let provider = 'deepseek'
	let apiKey = ''

	const modelStr = String(requestedModel || '').trim().toLowerCase()
	if (modelStr.startsWith('gpt-')) provider = 'openai'
	else if (modelStr.startsWith('gemini-')) provider = 'gemini'
	else if (modelStr.startsWith('doubao-') || modelStr.startsWith('glm-') || modelStr.startsWith('deepseek-') || modelStr.startsWith('kimi-') || modelStr.startsWith('qwen-')) provider = 'bytedance'

	const providers = ['gemini', 'bytedance', 'deepseek', 'openai']
	for (const prov of providers) {
		const result = keyRepo.getPlaintext(prov)
		if (result.ok && result.plaintext && String(result.plaintext).trim()) {
			apiKey = String(result.plaintext).trim()
			provider = prov
			if (modelStr) {
				if (modelStr.startsWith('gpt-') && prov === 'openai') break
				if (modelStr.startsWith('gemini-') && prov === 'gemini') break
				if ((modelStr.startsWith('doubao-') || modelStr.startsWith('glm-') || modelStr.startsWith('deepseek-') || modelStr.startsWith('kimi-') || modelStr.startsWith('qwen-')) && prov === 'bytedance') break
				if (modelStr.startsWith('deepseek-') && prov === 'deepseek') break
			}
			if (!modelStr && prov === 'deepseek') break
		}
	}
	return { provider, apiKey }
}

export function listConversations(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const limit = Number(payload?.limit) || 50
	return { items: repo.list({ limit }) }
}

export function getConversation(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const conv = repo.get(id)
	if (!conv) throw notFoundError('conversation not found')
	const messages = repo.getMessages(id)
	return { conversation: conv, messages }
}

export function createConversation(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const p = payload || {}
	const title = String(p.title || '新对话').trim() || '新对话'
	const model = String(p.model || '').trim()
	const systemPrompt = String(p.systemPrompt || '').trim()
	const result = repo.create({ title, model, systemPrompt })
	if (!result.ok) throw internalError(result.error || 'failed to create conversation')
	return { conversation: result.conversation }
}

export function updateConversationTitle(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const id = String(payload?.id || '').trim()
	const title = String(payload?.title || '').trim()
	if (!id) throw invalidParamsError('id is required')
	if (!title) throw invalidParamsError('title is required')
	const result = repo.updateTitle(id, title)
	if (!result.ok) {
		if (result.error === 'conversation not found') throw notFoundError('conversation not found')
		throw internalError(result.error || 'failed to update title')
	}
	return { conversation: result.conversation }
}

export function deleteConversation(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const result = repo.remove(id)
	if (!result.ok) {
		if (result.error === 'conversation not found') throw notFoundError('conversation not found')
		throw internalError(result.error || 'failed to delete conversation')
	}
	return { ok: true, id }
}

export async function sendMessage(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const client = ctx.httpClient
	const p = payload || {}
	const conversationId = String(p.conversationId || '').trim()
	const content = String(p.content || '').trim()
	const model = String(p.model || '').trim()
	if (!conversationId) throw invalidParamsError('conversationId is required')
	if (!content) throw invalidParamsError('content is required')
	const conv = repo.get(conversationId)
	if (!conv) throw notFoundError('conversation not found')

	repo.addMessage({ conversationId, role: 'user', content, model })

	const { provider, apiKey } = resolveProviderAndKey(ctx, model || conv.model)
	const cfg = getProviderConfig(provider, apiKey)
	if (!cfg.apiKey) throw invalidParamsError(`${provider} API key is not configured`)
	const useModel = model || conv.model || cfg.model

	const messages = []
	if (conv.systemPrompt) messages.push({ role: 'system', content: conv.systemPrompt })
	const history = repo.getMessages(conversationId)
	for (const msg of history) {
		messages.push({ role: msg.role, content: msg.content })
	}
	messages.push({ role: 'user', content })

	try {
		const res = await client.post(`${cfg.baseUrl}/chat/completions`, {
			model: useModel,
			messages,
			stream: false
		}, {
			headers: { 'Authorization': `Bearer ${cfg.apiKey}` },
			timeout: 120000
		})
		if (!res.ok) {
			const errMsg = typeof res.body === 'object' && res.body?.error?.message
				? res.body.error.message
				: `HTTP ${res.status}`
			throw upstreamError(`chat completion failed: ${errMsg}`)
		}
		const choice = res.body?.choices?.[0]
		const assistantContent = String(choice?.message?.content || '').trim()
		const tokensUsed = Number(res.body?.usage?.total_tokens) || 0
		const addedMsg = repo.addMessage({
			conversationId,
			role: 'assistant',
			content: assistantContent,
			model: useModel,
			tokensUsed
		})
		return {
			ok: true,
			message: addedMsg.message,
			conversationId,
			usage: res.body?.usage || null
		}
	} catch (err) {
		if (err?.statusCode) throw err
		throw upstreamError(String(err?.message || err))
	}
}

export async function* streamMessage(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const client = ctx.httpClient
	const p = payload || {}
	const conversationId = String(p.conversationId || '').trim()
	const content = String(p.content || '').trim()
	const model = String(p.model || '').trim()
	if (!conversationId) {
		yield JSON.stringify({ type: 'error', error: 'conversationId is required' })
		return
	}
	if (!content) {
		yield JSON.stringify({ type: 'error', error: 'content is required' })
		return
	}
	const conv = repo.get(conversationId)
	if (!conv) {
		yield JSON.stringify({ type: 'error', error: 'conversation not found' })
		return
	}

	repo.addMessage({ conversationId, role: 'user', content, model })

	const { provider, apiKey } = resolveProviderAndKey(ctx, model || conv.model)
	const cfg = getProviderConfig(provider, apiKey)
	if (!cfg.apiKey) {
		yield JSON.stringify({ type: 'error', error: `${provider} API key is not configured` })
		return
	}
	const useModel = model || conv.model || cfg.model

	const messages = []
	if (conv.systemPrompt) messages.push({ role: 'system', content: conv.systemPrompt })
	const history = repo.getMessages(conversationId)
	for (const msg of history) {
		messages.push({ role: msg.role, content: msg.content })
	}
	messages.push({ role: 'user', content })

	let assistantContent = ''
	let reasoningContent = ''
	let tokensUsed = 0
	try {
		const stream = client.postStream(`${cfg.baseUrl}/chat/completions`, {
			headers: {
				'Authorization': `Bearer ${cfg.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: useModel,
				messages,
				stream: true
			}),
			timeout: 120000
		})
		for await (const rawLine of stream) {
			const line = String(rawLine || '').trim()
			if (!line || !line.startsWith('data:')) continue
			const data = line.slice(5).trim()
			if (data === '[DONE]') break
			try {
				const parsed = JSON.parse(data)
				const delta = parsed?.choices?.[0]?.delta
				if (delta) {
					// 文本内容
					if (delta.content) {
						assistantContent += delta.content
						yield JSON.stringify({ type: 'delta', content: delta.content })
					}
					// 思考过程 (reasoning_content - DeepSeek R1 等)
					if (delta.reasoning_content) {
						reasoningContent += delta.reasoning_content
						yield JSON.stringify({ type: 'thinking_delta', content: delta.reasoning_content })
					}
				}
				if (parsed?.usage?.total_tokens) tokensUsed = Number(parsed.usage.total_tokens)
			} catch {}
		}
		const addedMsg = repo.addMessage({
			conversationId,
			role: 'assistant',
			content: assistantContent,
			model: useModel,
			tokensUsed
		})
		yield JSON.stringify({ type: 'done', message: addedMsg.message, reasoning: reasoningContent })
	} catch (err) {
		const errMsg = String(err?.message || err)
		repo.addMessage({ conversationId, role: 'assistant', content: `[Error] ${errMsg}`, model: useModel })
		yield JSON.stringify({ type: 'error', error: errMsg })
	}
}

/**
 * 使用工具调用的流式消息
 * @param {object} ctx - 上下文
 * @param {object} payload - 负载
 */
export async function* streamMessageWithTools(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const client = ctx.httpClient
	const p = payload || {}
	const conversationId = String(p.conversationId || '').trim()
	const content = String(p.content || '').trim()
	const model = String(p.model || '').trim()
	const apiSource = String(p.apiSource || 'deepseek').toLowerCase()
	const tools = p.tools || []

	if (!conversationId) {
		yield JSON.stringify({ type: 'error', error: 'conversationId is required' })
		return
	}
	if (!content) {
		yield JSON.stringify({ type: 'error', error: 'content is required' })
		return
	}

	const conv = repo.get(conversationId)
	if (!conv) {
		yield JSON.stringify({ type: 'error', error: 'conversation not found' })
		return
	}

	repo.addMessage({ conversationId, role: 'user', content, model })

	const { provider, apiKey } = resolveProviderAndKey(ctx, model || conv.model)
	const cfg = getProviderConfig(provider, apiKey)
	if (!cfg.apiKey) {
		yield JSON.stringify({ type: 'error', error: `${provider} API key is not configured` })
		return
	}

	const useModel = model || conv.model || cfg.model
	const adapter = getAdapter(apiSource, { baseUrl: cfg.baseUrl, apiKey })

	// 构建消息列表
	const messages = []
	if (conv.systemPrompt) messages.push({ role: 'system', content: conv.systemPrompt })
	const history = repo.getMessages(conversationId)
	for (const msg of history) {
		messages.push({ role: msg.role, content: msg.content })
	}
	messages.push({ role: 'user', content })

	// 调用适配器的流式方法
	const stream = adapter.streamWithTools(useModel, messages, tools, { httpClient: client })

	let assistantContent = ''
	let reasoningContent = ''
	let toolCalls = []

	for await (const event of stream) {
		if (event.type === 'text_delta') {
			assistantContent += event.delta
			yield JSON.stringify({ type: 'delta', content: event.delta })
		} else if (event.type === 'thinking_delta') {
			reasoningContent += event.delta
			yield JSON.stringify({ type: 'thinking_delta', content: event.delta })
		} else if (event.type === 'tool_call') {
			toolCalls.push(event)
			yield JSON.stringify({ type: 'tool_call', id: event.id, name: event.name, arguments: event.arguments })
		} else if (event.type === 'done') {
			assistantContent = event.content
			if (event.thinking) reasoningContent = event.thinking
		}
	}

	// 保存消息
	const addedMsg = repo.addMessage({
		conversationId,
		role: 'assistant',
		content: assistantContent,
		model: useModel,
		tokensUsed: 0,
		toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : undefined
	})

	yield JSON.stringify({ type: 'done', message: addedMsg.message, reasoning: reasoningContent })
}

/**
 * 使用工具调用的非流式消息
 * @param {object} ctx - 上下文
 * @param {object} payload - 负载
 */
export async function sendMessageWithTools(ctx, payload) {
	const repo = getConversationsRepo(ctx)
	const client = ctx.httpClient
	const p = payload || {}
	const conversationId = String(p.conversationId || '').trim()
	const content = String(p.content || '').trim()
	const model = String(p.model || '').trim()
	const apiSource = String(p.apiSource || 'deepseek').toLowerCase()
	const tools = p.tools || []

	if (!conversationId) throw invalidParamsError('conversationId is required')
	if (!content) throw invalidParamsError('content is required')

	const conv = repo.get(conversationId)
	if (!conv) throw notFoundError('conversation not found')

	repo.addMessage({ conversationId, role: 'user', content, model })

	const { provider, apiKey } = resolveProviderAndKey(ctx, model || conv.model)
	const cfg = getProviderConfig(provider, apiKey)
	if (!cfg.apiKey) throw invalidParamsError(`${provider} API key is not configured`)

	const useModel = model || conv.model || cfg.model
	const adapter = getAdapter(apiSource, { baseUrl: cfg.baseUrl, apiKey })

	// 构建消息列表
	const messages = []
	if (conv.systemPrompt) messages.push({ role: 'system', content: conv.systemPrompt })
	const history = repo.getMessages(conversationId)
	for (const msg of history) {
		messages.push({ role: msg.role, content: msg.content })
	}
	messages.push({ role: 'user', content })

	const result = await adapter.sendWithTools(useModel, messages, tools, { httpClient: client })

	const addedMsg = repo.addMessage({
		conversationId,
		role: 'assistant',
		content: result.content,
		model: useModel,
		tokensUsed: result.raw?.usage?.total_tokens || 0,
		toolCalls: result.toolCalls ? JSON.stringify(result.toolCalls) : undefined
	})

	return {
		ok: true,
		message: addedMsg.message,
		conversationId,
		reasoning: result.reasoning,
		usage: result.raw?.usage || null
	}
}

/**
 * 获取支持工具调用的模型列表
 * @param {object} ctx - 上下文
 */
export function getModelsWithTools(ctx) {
	return {
		deepseek: ['deepseek-chat', 'deepseek-v3'],
		bytedance: [
			'doubao-seed-2-0-pro-260215',
			'doubao-seed-2-0-lite-260215',
			'glm-4-7-251222',
			'glm-4-5-air',
			'deepseek-v3-2-251201',
			'kimi-k2-250905',
			'qwen3-32b',
			'qwen3-14b'
		],
		gemini: [] // Gemini 暂不支持
	}
}
