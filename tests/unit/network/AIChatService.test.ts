import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIChatService } from '@/network/AIChatService'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('AIChatService', () => {
  let service: AIChatService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AIChatService({ baseUrl: 'http://localhost:3000' })
  })

  describe('constructor', () => {
    it('uses provided baseUrl string', () => {
      const s = new AIChatService({ baseUrl: 'http://custom:8080' })
      expect(s).toBeDefined()
    })

    it('uses provided baseUrl function', () => {
      const getUrl = vi.fn(() => 'http://dynamic:9000')
      const s = new AIChatService({ baseUrl: getUrl })
      expect(s).toBeDefined()
    })

    it('uses devToken when provided', () => {
      const s = new AIChatService({ devToken: 'test-token' })
      expect(s).toBeDefined()
    })

    it('uses default getBackendBaseUrl when no baseUrl', () => {
      const s = new AIChatService({})
      expect(s).toBeDefined()
    })
  })

  describe('createConversation', () => {
    it('creates a conversation with title', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'conv-123', title: 'Test Chat' }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const result = await service.createConversation('Test Chat')

      expect(result.id).toBe('conv-123')
      expect(result.title).toBe('Test Chat')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/conversations',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('creates a conversation without title', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'conv-456' }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const result = await service.createConversation()

      expect(result.id).toBe('conv-456')
    })

    it('throws on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server Error'),
      }
      mockFetch.mockResolvedValue(mockResponse)

      await expect(service.createConversation()).rejects.toThrow('createConversation failed: 500')
    })
  })

  describe('sendMessage', () => {
    it('sends a message', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          userMessage: { content: 'Hello' },
          assistantMessage: { content: 'Hi there!' },
        }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const result = await service.sendMessage({
        conversationId: 'conv-123',
        content: 'Hello',
      })

      expect(result.userMessage).toBeDefined()
      expect(result.assistantMessage).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/conversations/conv-123/messages'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('sends message with all params', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      }
      mockFetch.mockResolvedValue(mockResponse)

      await service.sendMessage({
        conversationId: 'conv-123',
        content: 'Hello',
        contextPack: { key: 'value' },
        provider: 'openai',
        model: 'gpt-4',
        promptPreset: 'creative',
        promptInput: { style: 'formal' },
      })

      expect(mockFetch).toHaveBeenCalled()
    })

    it('throws on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request'),
      }
      mockFetch.mockResolvedValue(mockResponse)

      await expect(
        service.sendMessage({ conversationId: 'conv-123', content: 'Hello' })
      ).rejects.toThrow('sendMessage failed: 400')
    })
  })

  describe('url helper', () => {
    it('constructs absolute URL', () => {
      const service = new AIChatService({ baseUrl: 'http://test:8080' })
      // Access private method via any
      const url = (service as any).url('/api/test')
      expect(url).toBe('http://test:8080/api/test')
    })

    it('handles empty base URL', () => {
      const service = new AIChatService({ baseUrl: '' })
      const url = (service as any).url('/api/test')
      expect(url).toBe('/api/test')
    })

    it('removes trailing slash from base URL', () => {
      const service = new AIChatService({ baseUrl: 'http://test:8080/' })
      const url = (service as any).url('/api/test')
      expect(url).toBe('http://test:8080/api/test')
    })

    it('appends path without leading slash', () => {
      const service = new AIChatService({ baseUrl: 'http://test:8080' })
      const url = (service as any).url('api/test')
      expect(url).toBe('http://test:8080/api/test')
    })
  })
})

describe('AIChatService utility functions', () => {
  // Private methods (jsonHeaders, safeJson) are tested indirectly through public methods

  describe('url construction', () => {
    it('constructs URLs correctly', async () => {
      const service = new AIChatService({ baseUrl: 'http://localhost:3000' })

      // Test through createConversation which uses url()
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'test-id' }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      await service.createConversation('Test')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/conversations',
        expect.any(Object)
      )
    })
  })
})
