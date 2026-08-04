/**
 * Gemini API 适配器
 *
 * 支持 Gemini 文本/多模态模型和 NanoBanana 图片生成模型。
 */

import { BaseAdapter } from './base.mjs'
import { upstreamError } from '../../../core/errors.mjs'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

function isImageModel(modelId) {
	const id = String(modelId || '').toLowerCase()
	return id.includes('-image')
}

function isGeminiModel(modelId) {
	const id = String(modelId || '').toLowerCase()
	return id.startsWith('gemini-')
}

/**
 * Gemini 适配器
 */
export class GeminiAdapter extends BaseAdapter {
	constructor(config = {}) {
		super(config)
		this.baseUrl = config.baseUrl || GEMINI_BASE_URL
		this.apiKey = config.apiKey || ''
	}

	getBaseUrl() {
		return this.baseUrl
	}

	getApiKey() {
		return this.apiKey
	}

	supportsTools(modelId) {
		return false
	}

	supportsVision(modelId) {
		return isGeminiModel(modelId)
	}

	isImageGenerationModel(modelId) {
		return isImageModel(modelId)
	}

	async *streamText(modelId, messages, options = {}) {
		const client = options.httpClient
		if (!client) {
			throw new Error('HTTP client not provided')
		}

		const { contents, systemInstruction } = this._convertToGeminiFormat(messages)
		const isImage = isImageModel(modelId)

		const url = `${this.baseUrl}/models/${modelId}:streamGenerateContent?key=${this.apiKey}&alt=sse`

		const generationConfig = {
			temperature: options.temperature || 0.9,
			topP: options.topP || 0.95,
			topK: options.topK || 40,
			maxOutputTokens: options.maxOutputTokens || (isImage ? 8192 : 2048)
		}

		if (isImage) {
			generationConfig.responseModalities = ['image', 'text']
		}

		const requestBody = {
			contents,
			generationConfig
		}

		if (systemInstruction) {
			requestBody.systemInstruction = systemInstruction
		}

		try {
			const stream = client.postStream(url, {
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				timeout: options.timeout || 180000
			})

			let accumulatedContent = ''
			let imageParts = []

			for await (const rawLine of stream) {
				const line = String(rawLine || '').trim()
				if (!line || !line.startsWith('data:')) continue

				const data = line.slice(5).trim()
				if (data === '[DONE]') break

				try {
					const parsed = JSON.parse(data)

					if (parsed.candidates) {
						for (const candidate of parsed.candidates) {
							if (candidate.content?.parts) {
								for (const part of candidate.content.parts) {
									if (part.text) {
										accumulatedContent += part.text
										yield { type: 'text_delta', delta: part.text }
									}
									if (part.inlineData) {
										imageParts.push(part.inlineData)
										yield {
											type: 'image',
											mimeType: part.inlineData.mimeType,
											data: part.inlineData.data
										}
									}
								}
							}
						}
					}
				} catch (e) {
					// 忽略解析错误
				}
			}

			yield {
				type: 'done',
				content: accumulatedContent,
				images: imageParts
			}
		} catch (err) {
			throw upstreamError(`Gemini API error: ${err.message}`)
		}
	}

	async *streamWithTools(modelId, messages, tools = [], options = {}) {
		yield* this.streamText(modelId, messages, options)
	}

	async sendWithTools(modelId, messages, tools = [], options = {}) {
		const client = options.httpClient
		if (!client) {
			throw new Error('HTTP client not provided')
		}

		const { contents, systemInstruction } = this._convertToGeminiFormat(messages)
		const isImage = isImageModel(modelId)

		try {
			const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`

			const generationConfig = {
				temperature: options.temperature || 0.9,
				topP: options.topP || 0.95,
				topK: options.topK || 40,
				maxOutputTokens: options.maxOutputTokens || (isImage ? 8192 : 2048)
			}

			if (isImage) {
				generationConfig.responseModalities = ['image', 'text']
			}

			const requestBody = {
				contents,
				generationConfig
			}

			if (systemInstruction) {
				requestBody.systemInstruction = systemInstruction
			}

			const res = await client.post(url, {
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				timeout: options.timeout || 180000
			})

			if (!res.ok) {
				const errMsg = res.body?.error?.message || `HTTP ${res.status}`
				throw upstreamError(`Gemini API error: ${errMsg}`)
			}

			let content = ''
			let images = []
			if (res.body?.candidates) {
				for (const candidate of res.body.candidates) {
					if (candidate.content?.parts) {
						for (const part of candidate.content.parts) {
							if (part.text) {
								content += part.text
							}
							if (part.inlineData) {
								images.push(part.inlineData)
							}
						}
					}
				}
			}

			return { content, images, raw: res.body }
		} catch (err) {
			throw upstreamError(`Gemini API error: ${err.message}`)
		}
	}

	_convertToGeminiFormat(messages) {
		const contents = []
		let systemInstruction = null

		for (const msg of messages) {
			if (msg.role === 'system') {
				systemInstruction = {
					parts: [{ text: String(msg.content || '') }]
				}
				continue
			}

			const role = msg.role === 'assistant' ? 'model' : 'user'
			const parts = []

			if (typeof msg.content === 'string') {
				parts.push({ text: msg.content })
			} else if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === 'text') {
						parts.push({ text: part.text ?? '' })
					} else if (part.type === 'image_url') {
						const url = part.image_url?.url || ''
						if (url) {
							if (url.startsWith('data:')) {
								const matches = url.match(/^data:([^;]+);base64,(.+)$/)
								if (matches) {
									parts.push({
										inlineData: {
											mimeType: matches[1] || 'image/jpeg',
											data: matches[2]
										}
									})
								}
							} else {
								parts.push({
									fileData: {
										mimeType: part.image_url?.mime_type || 'image/jpeg',
										fileUri: url
									}
								})
							}
						}
					} else if (part.inlineData) {
						parts.push({
							inlineData: {
								mimeType: part.inlineData.mimeType || 'image/jpeg',
								data: part.inlineData.data
							}
						})
					}
				}
			}

			if (parts.length > 0) {
				contents.push({ role, parts })
			}
		}

		return { contents, systemInstruction }
	}
}
