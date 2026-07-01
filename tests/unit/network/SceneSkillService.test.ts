import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SceneSkillService } from '@/network/SceneSkillService'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('SceneSkillService', () => {
	let service: SceneSkillService

	beforeEach(() => {
		vi.clearAllMocks()
		service = new SceneSkillService({ baseUrl: 'http://localhost:3000' })
	})

	describe('constructor', () => {
		it('uses provided baseUrl string', () => {
			const s = new SceneSkillService({ baseUrl: 'http://custom:8080' })
			expect(s).toBeDefined()
		})

		it('uses provided baseUrl function', () => {
			const getUrl = vi.fn(() => 'http://dynamic:9000')
			const s = new SceneSkillService({ baseUrl: getUrl })
			expect(s).toBeDefined()
		})

		it('uses default getBackendBaseUrl when no baseUrl', () => {
			const s = new SceneSkillService({})
			expect(s).toBeDefined()
		})
	})

	describe('listSceneUnderstandModels', () => {
		it('returns models from fetch when IPC not available', async () => {
			const mockResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({
					ok: true,
					models: [{ id: 'model-1', label: 'Model 1' }, { id: 'model-2', label: 'Model 2' }],
					defaultModel: 'model-1'
				}),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.listSceneUnderstandModels()

			expect(result.ok).toBe(true)
			expect(result.models).toHaveLength(2)
			expect(result.models[0].id).toBe('model-1')
			expect(result.defaultModel).toBe('model-1')
			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/agent-skills/scene-understand/models',
				expect.objectContaining({ method: 'GET' })
			)
		})

		it('returns error when fetch fails', async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				text: vi.fn().mockResolvedValue('Server Error'),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.listSceneUnderstandModels()

			expect(result.ok).toBe(false)
			expect(result.status).toBe(500)
			expect(result.error).toContain('500')
		})
	})

	describe('runSceneUnderstand', () => {
		it('runs scene understand with fetch', async () => {
			const mockResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({
					ok: true,
					model: 'test-model',
					outputJson: '{"test": "result"}',
					summary: 'Test summary'
				}),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.runSceneUnderstand({
				nodeId: 'node-1',
				model: 'test-model',
				promptText: 'describe this image',
				imageUrl: 'http://example.com/image.jpg'
			})

			expect(result.ok).toBe(true)
			expect(result.model).toBe('test-model')
			expect(result.outputJson).toBe('{"test": "result"}')
			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/agent-skills/scene-understand/run',
				expect.objectContaining({ method: 'POST' })
			)
		})

		it('returns error when fetch fails', async () => {
			const mockResponse = {
				ok: false,
				status: 400,
				text: vi.fn().mockResolvedValue('Bad Request'),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.runSceneUnderstand({
				nodeId: 'node-1',
				model: 'test-model',
				promptText: ''
			})

			expect(result.ok).toBe(false)
			expect(result.status).toBe(400)
		})
	})

	describe('listSceneLightingModels', () => {
		it('returns lighting models from fetch', async () => {
			const mockResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({
					ok: true,
					models: [{ id: 'lighting-1', label: 'Lighting Model 1' }],
					defaultModel: 'lighting-1'
				}),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.listSceneLightingModels()

			expect(result.ok).toBe(true)
			expect(result.models).toHaveLength(1)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/agent-skills/scene-lighting/models',
				expect.objectContaining({ method: 'GET' })
			)
		})
	})

	describe('runSceneLighting', () => {
		it('runs scene lighting with fetch', async () => {
			const mockResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({
					ok: true,
					model: 'lighting-model',
					outputJson: '{"lighting": "result"}',
					summary: 'Lighting summary'
				}),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.runSceneLighting({
				nodeId: 'node-1',
				model: 'lighting-model',
				promptText: 'adjust lighting',
				layoutJson: '{"items": []}',
				imageUrl: 'http://example.com/image.jpg'
			})

			expect(result.ok).toBe(true)
			expect(result.model).toBe('lighting-model')
			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/agent-skills/scene-lighting/run',
				expect.objectContaining({ method: 'POST' })
			)
		})
	})

	describe('runSceneLayout', () => {
		it('runs scene layout with fetch', async () => {
			const mockResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({
					ok: true,
					layoutItems: [{ id: 'item-1', position: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, depth: 1 } }],
					message: 'Layout generated'
				}),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.runSceneLayout({
				nodeId: 'node-1',
				inputJson: '{"test": "input"}'
			})

			expect(result.ok).toBe(true)
			expect(result.layoutItems).toHaveLength(1)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/api/agent-skills/scene-layout/run',
				expect.objectContaining({ method: 'POST' })
			)
		})

		it('returns error when fetch fails', async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				text: vi.fn().mockResolvedValue('Server Error'),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await service.runSceneLayout({
				nodeId: 'node-1',
				inputJson: '{}'
			})

			expect(result.ok).toBe(false)
			expect(result.status).toBe(500)
		})
	})

	describe('streamSceneUnderstand', () => {
		it('streams scene understand events via SSE', async () => {
			const mockReader = {
				read: vi.fn().mockResolvedValue({ done: true, value: null }),
				releaseLock: vi.fn()
			}
			const mockResponse = {
				ok: true,
				body: { getReader: vi.fn().mockReturnValue(mockReader) }
			}
			mockFetch.mockResolvedValue(mockResponse)

			const events: any[] = []
			for await (const event of service.streamSceneUnderstand({
				nodeId: 'node-1',
				model: 'test-model',
				promptText: 'describe'
			})) {
				events.push(event)
			}

			expect(events.length).toBeGreaterThan(0)
			expect(events[events.length - 1].type).toBe('done')
			expect(mockFetch).toHaveBeenCalled()
		})
	})

	describe('streamSceneLighting', () => {
		it('streams scene lighting events via SSE', async () => {
			const mockReader = {
				read: vi.fn().mockResolvedValue({ done: true, value: null }),
				releaseLock: vi.fn()
			}
			const mockResponse = {
				ok: true,
				body: { getReader: vi.fn().mockReturnValue(mockReader) }
			}
			mockFetch.mockResolvedValue(mockResponse)

			const events: any[] = []
			for await (const event of service.streamSceneLighting({
				nodeId: 'node-1',
				model: 'lighting-model',
				promptText: 'adjust',
				layoutJson: '{}'
			})) {
				events.push(event)
			}

			expect(events.length).toBeGreaterThan(0)
			expect(events[events.length - 1].type).toBe('done')
		})
	})

	describe('url helper', () => {
		it('constructs absolute URL', () => {
			const service = new SceneSkillService({ baseUrl: 'http://test:8080' })
			const url = (service as any).url('/api/test')
			expect(url).toBe('http://test:8080/api/test')
		})

		it('handles empty base URL', () => {
			const service = new SceneSkillService({ baseUrl: '' })
			const url = (service as any).url('/api/test')
			expect(url).toBe('/api/test')
		})

		it('removes trailing slash from base URL', () => {
			const service = new SceneSkillService({ baseUrl: 'http://test:8080/' })
			const url = (service as any).url('/api/test')
			expect(url).toBe('http://test:8080/api/test')
		})
	})
})