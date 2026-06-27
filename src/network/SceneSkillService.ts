import { getBackendBaseUrl } from './backendConfig'
import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'
import { logBlueprintRequest } from './blueprintRequestLog'
import { isRecord, isString, getErrorMessage } from '../types/utils'
import { isMigrationMode, hasIpcModule } from './ipcClient'

type ServiceOptions = {
	baseUrl?: string | (() => string)
}

export type SceneUnderstandModelOption = {
	id: string
	label: string
	supportsVision?: boolean
	supportsStructuredOutput?: boolean
	recommended?: boolean
	vendor?: string
}

export type SceneUnderstandModelsResponse =
	| { ok: true; models: SceneUnderstandModelOption[]; defaultModel?: string }
	| { ok: false; error: string; status?: number }

export type SceneUnderstandRunResponse =
	| {
			ok: true
			model: string
			outputJson: string
			summary?: string
			provider?: string
			providerStatusText?: string
			remoteStatusCode?: number
			mock?: boolean
	  }
	| {
			ok: false
			error: string
			status?: number
			provider?: string
			providerStatusText?: string
			remoteStatusCode?: number
	  }

export type SceneUnderstandImageInput = {
	imageUrl?: string
	imageDataUrl?: string
	width?: number
	height?: number
}

export type SceneUnderstandStreamEvent =
	| { type: 'msg'; message: AgentToUiMessage }
	| { type: 'error'; error: { message: string; details?: unknown } }
	| { type: 'done' }

export type SceneLightingModelOption = SceneUnderstandModelOption
export type SceneLightingModelsResponse = SceneUnderstandModelsResponse
export type SceneLightingRunResponse = SceneUnderstandRunResponse
export type SceneLightingStreamEvent = SceneUnderstandStreamEvent

export type SceneLayoutItem = {
	id: string
	name?: string
	category?: string
	color?: string
	sameTypeGroupId?: string
	sameTypeGroupLabel?: string
	parentId?: string
	placement?: string
	supportSurface?: string
	anchor?: string
	wallRole?: string
	proximityGroupId?: string
	relationReason?: string
	inferred?: boolean
	position: { x: number; y: number; z: number }
	size: { width: number; height: number; depth: number }
	rotation?: { yaw?: number; pitch?: number; roll?: number }
	scale?: { x?: number; y?: number; z?: number }
}

export type SceneLayoutRunResponse =
	| {
			ok: true
			layoutItems: SceneLayoutItem[]
			camera?: {
				position?: { x: number; y: number; z: number }
				target?: { x: number; y: number; z: number }
			}
			message?: string
	  }
	| { ok: false; error: string; status?: number }

function isAgentSkillsIpcAvailable(): boolean {
	return isMigrationMode() && hasIpcModule('agentSkills') && typeof window.dweb?.agentSkills === 'object'
}

const jsonHeaders = {
	'Content-Type': 'application/json'
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false as const, text }
	}
}

const extractSseErrorMessage = (data: string): string => {
	try {
		const v = JSON.parse(data) as unknown
		if (isRecord(v) && isString(v.message)) {
			return v.message
		}
	} catch {
		// ignore
	}
	return data || 'SSE error'
}

export class SceneSkillService {
	private readonly getBaseUrl: () => string

	constructor(opts: ServiceOptions = {}) {
		if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
		else if (typeof opts.baseUrl === 'string') {
			const fixed = opts.baseUrl
			this.getBaseUrl = () => fixed
		} else {
			this.getBaseUrl = getBackendBaseUrl
		}
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	private async fetchWithLog(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const url = typeof input === 'string' ? input : (input as Request).url || String(input)
		const method = String(init?.method || 'GET').toUpperCase()
		const start =
			typeof performance !== 'undefined' && typeof performance.now === 'function'
				? performance.now()
				: Date.now()
		try {
			const res = await fetch(input, init)
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			logBlueprintRequest({
				url,
				method,
				status: res.status,
				durationMs: Math.max(0, Math.round(end - start)),
				tag: 'scene-skill'
			})
			return res
		} catch (err: unknown) {
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			logBlueprintRequest({
				url,
				method,
				durationMs: Math.max(0, Math.round(end - start)),
				errorMessage: getErrorMessage(err),
				tag: 'scene-skill'
			})
			throw err
		}
	}

	async listSceneUnderstandModels(): Promise<SceneUnderstandModelsResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.sceneUnderstand?.models?.()
				if (result) return result as SceneUnderstandModelsResponse
			} catch (err) {
				console.warn('[SceneSkillService] sceneUnderstand.models IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/scene-understand/models'), {
			method: 'GET'
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `scene-understand/models failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as SceneUnderstandModelsResponse
	}

	async runSceneUnderstand(payload: {
		nodeId: string
		model: string
		promptText: string
		imageUrl?: string
		imageDataUrl?: string
		imageInputs?: SceneUnderstandImageInput[]
	}): Promise<SceneUnderstandRunResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.sceneUnderstand?.run?.(payload)
				if (result) return result as SceneUnderstandRunResponse
			} catch (err) {
				console.warn('[SceneSkillService] sceneUnderstand.run IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/scene-understand/run'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `scene-understand/run failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as SceneUnderstandRunResponse
	}

	async listSceneLightingModels(): Promise<SceneLightingModelsResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.sceneLighting?.models?.()
				if (result) return result as SceneLightingModelsResponse
			} catch (err) {
				console.warn('[SceneSkillService] sceneLighting.models IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/scene-lighting/models'), {
			method: 'GET'
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `scene-lighting/models failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as SceneLightingModelsResponse
	}

	async runSceneLighting(payload: {
		nodeId: string
		model: string
		promptText: string
		layoutJson: string
		imageUrl?: string
		imageDataUrl?: string
		imageInputs?: SceneUnderstandImageInput[]
	}): Promise<SceneLightingRunResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.sceneLighting?.run?.(payload)
				if (result) return result as SceneLightingRunResponse
			} catch (err) {
				console.warn('[SceneSkillService] sceneLighting.run IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/scene-lighting/run'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `scene-lighting/run failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as SceneLightingRunResponse
	}

	private async *streamSse(
		url: string,
		payload: unknown,
		signal?: AbortSignal
	): AsyncGenerator<SceneUnderstandStreamEvent, void, void> {
		const res = await this.fetchWithLog(this.url(url), {
			method: 'POST',
			headers: {
				...jsonHeaders,
				Accept: 'text/event-stream'
			},
			body: JSON.stringify(payload ?? {}),
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`SSE stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')
		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): SceneUnderstandStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				return [
					{ type: 'error', error: { message: extractSseErrorMessage(data), details: undefined } }
				]
			}
			try {
				const v = JSON.parse(data) as unknown
				if (isAgentToUiMessage(v)) return [{ type: 'msg', message: v }]
				return []
			} catch (e: unknown) {
				return [
					{
						type: 'error',
						error: {
							message: 'SSE msg JSON.parse failed',
							details: { raw: data, error: String(e) }
						}
					}
				]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
		yield { type: 'done' }
	}

	async *streamSceneUnderstand(
		payload: {
			nodeId: string
			model: string
			promptText: string
			imageUrl?: string
			imageDataUrl?: string
			imageInputs?: SceneUnderstandImageInput[]
		},
		signal?: AbortSignal
	): AsyncGenerator<SceneUnderstandStreamEvent, void, void> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const generator = window.dweb?.agentSkills?.sceneUnderstand?.runStream?.(payload)
				if (generator) {
					for await (const chunk of generator) {
						let parsed = chunk
						if (typeof chunk === 'string') {
							try { parsed = JSON.parse(chunk) } catch { parsed = chunk }
						}
						if (parsed && typeof parsed === 'object') {
							if ((parsed as any).type === 'done') { yield { type: 'done' }; return }
							if ((parsed as any).type === 'error') { yield parsed as any; return }
							if ((parsed as any).type === 'msg' && isAgentToUiMessage((parsed as any).message)) {
								yield { type: 'msg', message: (parsed as any).message }; continue
							}
						}
					}
					yield { type: 'done' }
					return
				}
			} catch (err) {
				console.warn('[SceneSkillService] sceneUnderstand.runStream IPC failed:', err)
			}
		}
		yield* this.streamSse('/api/agent-skills/scene-understand/run:stream', payload, signal)
	}

	async *streamSceneLighting(
		payload: {
			nodeId: string
			model: string
			promptText: string
			layoutJson: string
			imageUrl?: string
			imageDataUrl?: string
			imageInputs?: SceneUnderstandImageInput[]
		},
		signal?: AbortSignal
	): AsyncGenerator<SceneLightingStreamEvent, void, void> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const generator = window.dweb?.agentSkills?.sceneLighting?.runStream?.(payload)
				if (generator) {
					for await (const chunk of generator) {
						let parsed = chunk
						if (typeof chunk === 'string') {
							try { parsed = JSON.parse(chunk) } catch { parsed = chunk }
						}
						if (parsed && typeof parsed === 'object') {
							if ((parsed as any).type === 'done') { yield { type: 'done' }; return }
							if ((parsed as any).type === 'error') { yield parsed as any; return }
							if ((parsed as any).type === 'msg' && isAgentToUiMessage((parsed as any).message)) {
								yield { type: 'msg', message: (parsed as any).message }; continue
							}
						}
					}
					yield { type: 'done' }
					return
				}
			} catch (err) {
				console.warn('[SceneSkillService] sceneLighting.runStream IPC failed:', err)
			}
		}
		yield* this.streamSse('/api/agent-skills/scene-lighting/run:stream', payload, signal)
	}

	async runSceneLayout(payload: {
		nodeId: string
		inputJson: string
	}): Promise<SceneLayoutRunResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.sceneLayout?.run?.(payload)
				if (result) return result as SceneLayoutRunResponse
			} catch (err) {
				console.warn('[SceneSkillService] sceneLayout.run IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/scene-layout/run'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `scene-layout/run failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as SceneLayoutRunResponse
	}
}
