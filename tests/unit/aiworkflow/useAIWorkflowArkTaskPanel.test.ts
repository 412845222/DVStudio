import { describe, it, expect, vi } from 'vitest'
import { normalizeStatus, normalizeStatusLabel, parseJsonField, parseStringArray, seedanceItemToArkTask, mapRawTaskToPanelItem, mapRawTaskToDetail } from '@/views/AIWorkflow/node-business/ark/useAIWorkflowArkTaskPanel'

describe('useAIWorkflowArkTaskPanel', () => {
  describe('normalizeStatus', () => {
    it('should normalize various status values', () => {
      expect(normalizeStatus('queued')).toBe('queued')
      expect(normalizeStatus('running')).toBe('running')
      expect(normalizeStatus('processing')).toBe('running')
      expect(normalizeStatus('in_progress')).toBe('running')
      expect(normalizeStatus('succeeded')).toBe('succeeded')
      expect(normalizeStatus('success')).toBe('succeeded')
      expect(normalizeStatus('completed')).toBe('succeeded')
      expect(normalizeStatus('ready')).toBe('succeeded')
      expect(normalizeStatus('active')).toBe('succeeded')
      expect(normalizeStatus('processed')).toBe('succeeded')
      expect(normalizeStatus('failed')).toBe('failed')
      expect(normalizeStatus('error')).toBe('failed')
      expect(normalizeStatus('expired')).toBe('failed')
      expect(normalizeStatus('canceled')).toBe('canceled')
      expect(normalizeStatus('cancelled')).toBe('canceled')
      expect(normalizeStatus('not_found')).toBe('canceled')
      expect(normalizeStatus('unknown')).toBe('queued')
      expect(normalizeStatus('')).toBe('queued')
      expect(normalizeStatus(null as any)).toBe('queued')
      expect(normalizeStatus(undefined as any)).toBe('queued')
      expect(normalizeStatus('SUCCESS')).toBe('succeeded')
      expect(normalizeStatus('  Processing  ')).toBe('running')
    })
  })

  describe('normalizeStatusLabel', () => {
    it('should return custom label when provided', () => {
      expect(normalizeStatusLabel('running', '自定义状态')).toBe('自定义状态')
    })

    it('should return default label when no custom label', () => {
      expect(normalizeStatusLabel('queued', '')).toBe('排队中')
      expect(normalizeStatusLabel('running', '')).toBe('运行中')
      expect(normalizeStatusLabel('succeeded', '')).toBe('已完成')
      expect(normalizeStatusLabel('failed', '')).toBe('失败')
      expect(normalizeStatusLabel('canceled', '')).toBe('已取消')
      expect(normalizeStatusLabel('unknown', '')).toBe('排队中')
    })
  })

  describe('parseJsonField', () => {
    it('should parse string JSON to object', () => {
      const result = parseJsonField('{"key": "value", "num": 42}')
      expect(result).toEqual({ key: 'value', num: 42 })
    })

    it('should return null for invalid JSON string', () => {
      expect(parseJsonField('invalid json')).toBe(null)
    })

    it('should return object directly when already an object', () => {
      const obj = { key: 'value' }
      expect(parseJsonField(obj)).toBe(obj)
    })

    it('should return null for non-object values', () => {
      expect(parseJsonField('string')).toBe(null)
      expect(parseJsonField(42)).toBe(null)
      expect(parseJsonField(true)).toBe(null)
      expect(parseJsonField(null)).toBe(null)
      expect(parseJsonField(undefined)).toBe(null)
      expect(parseJsonField([])).toBe(null)
    })
  })

  describe('parseStringArray', () => {
    it('should return array directly when already an array', () => {
      expect(parseStringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    })

    it('should parse JSON string array', () => {
      expect(parseStringArray('["x", "y"]')).toEqual(['x', 'y'])
    })

    it('should convert non-array string to single-element array', () => {
      expect(parseStringArray('single')).toEqual(['single'])
    })

    it('should return empty array for empty string', () => {
      expect(parseStringArray('')).toEqual([])
    })

    it('should return empty array for null/undefined', () => {
      expect(parseStringArray(null as any)).toEqual([])
      expect(parseStringArray(undefined as any)).toEqual([])
    })

    it('should filter out empty strings', () => {
      expect(parseStringArray(['', '  ', 'valid'])).toEqual(['valid'])
    })

    it('should handle invalid JSON gracefully', () => {
      expect(parseStringArray('invalid json')).toEqual(['invalid json'])
    })
  })

  describe('seedanceItemToArkTask', () => {
    it('should convert seedance item to ark task', () => {
      const item = {
        taskId: 'task-123',
        model: 'doubao-seedance-2-0-mini',
        status: 'succeeded',
        prompt: 'test prompt',
        videoUrlRemote: 'http://example.com/video.mp4',
        lastFrameUrlRemote: 'http://example.com/frame.jpg',
        errorMessage: '',
        statusText: 'completed',
        projectId: 123,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z'
      }

      const result = seedanceItemToArkTask(item as any)

      expect(result.id).toBe('task-123')
      expect(result.taskId).toBe('seedance-task-123')
      expect(result.apiType).toBe('seedance')
      expect(result.apiAction).toBe('video_generation')
      expect(result.model).toBe('doubao-seedance-2-0-mini')
      expect(result.status).toBe('succeeded')
      expect(result.prompt).toBe('test prompt')
      expect(result.resultUrls).toEqual(['http://example.com/video.mp4', 'http://example.com/frame.jpg'])
      expect(result.thumbnailUrl).toBe('http://example.com/frame.jpg')
      expect(result.projectId).toBe(123)
      expect(result.remoteTaskId).toBe('task-123')
    })

    it('should handle missing optional fields', () => {
      const item = {
        taskId: 'task-456',
        model: '',
        status: 'queued',
        prompt: '',
        videoUrlRemote: '',
        lastFrameUrlRemote: '',
        errorMessage: '',
        statusText: '',
        projectId: null,
        createdAt: '',
        updatedAt: ''
      }

      const result = seedanceItemToArkTask(item as any)

      expect(result.id).toBe('task-456')
      expect(result.taskId).toBe('seedance-task-456')
      expect(result.model).toBe('')
      expect(result.resultUrls).toEqual([])
      expect(result.thumbnailUrl).toBe('')
      expect(result.projectId).toBe(null)
    })

    it('should prefer remoteCreatedAt/remoteUpdatedAt numeric timestamps over ISO strings', () => {
      const remoteCreated = 1700000000000
      const remoteUpdated = 1700000100000
      const item = {
        taskId: 'task-ts',
        model: 'doubao-seedance-2-0-mini',
        status: 'running',
        prompt: 'test',
        videoUrlRemote: '',
        lastFrameUrlRemote: '',
        errorMessage: '',
        statusText: '',
        projectId: null,
        remoteCreatedAt: remoteCreated,
        remoteUpdatedAt: remoteUpdated,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:30:00Z'
      }

      const result = seedanceItemToArkTask(item as any)

      expect(result.createdAt).toBe(remoteCreated)
      expect(result.updatedAt).toBe(remoteUpdated)
    })

    it('should fall back to ISO string timestamps when remote timestamps are missing', () => {
      const isoCreated = '2024-06-15T12:00:00Z'
      const isoUpdated = '2024-06-15T12:05:00Z'
      const item = {
        taskId: 'task-iso',
        model: 'doubao-seedance-2-0-mini',
        status: 'succeeded',
        prompt: 'test',
        videoUrlRemote: 'http://example.com/v.mp4',
        lastFrameUrlRemote: '',
        errorMessage: '',
        statusText: '',
        projectId: 1,
        createdAt: isoCreated,
        updatedAt: isoUpdated
      }

      const result = seedanceItemToArkTask(item as any)

      expect(result.createdAt).toBe(new Date(isoCreated).getTime())
      expect(result.updatedAt).toBe(new Date(isoUpdated).getTime())
    })

    it('should normalize status aliases like success/completed/processing', () => {
      const cases = [
        { raw: 'success', expected: 'succeeded' },
        { raw: 'completed', expected: 'succeeded' },
        { raw: 'processing', expected: 'running' },
        { raw: 'in_progress', expected: 'running' },
        { raw: 'error', expected: 'failed' },
        { raw: 'expired', expected: 'failed' },
        { raw: 'cancelled', expected: 'canceled' }
      ]
      for (const { raw, expected } of cases) {
        const result = seedanceItemToArkTask({
          taskId: `task-${raw}`,
          model: 'm',
          status: raw,
          prompt: '',
          videoUrlRemote: '',
          lastFrameUrlRemote: '',
          errorMessage: '',
          statusText: '',
          projectId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as any)
        expect(result.status).toBe(expected)
      }
    })

    it('should prefer lastFrameUrlRemote as thumbnail over videoUrlRemote', () => {
      const item = {
        taskId: 'task-thumb',
        model: 'm',
        status: 'succeeded',
        prompt: 'p',
        videoUrlRemote: 'http://example.com/video.mp4',
        lastFrameUrlRemote: 'http://example.com/frame.jpg',
        errorMessage: '',
        statusText: '',
        projectId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const result = seedanceItemToArkTask(item as any)
      expect(result.thumbnailUrl).toBe('http://example.com/frame.jpg')
      expect(result.resultUrls).toEqual(['http://example.com/video.mp4', 'http://example.com/frame.jpg'])
    })

    it('should fallback to videoUrlRemote as thumbnail when lastFrameUrlRemote is empty', () => {
      const item = {
        taskId: 'task-thumb2',
        model: 'm',
        status: 'succeeded',
        prompt: 'p',
        videoUrlRemote: 'http://example.com/video.mp4',
        lastFrameUrlRemote: '',
        errorMessage: '',
        statusText: '',
        projectId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const result = seedanceItemToArkTask(item as any)
      expect(result.thumbnailUrl).toBe('http://example.com/video.mp4')
      expect(result.resultUrls).toEqual(['http://example.com/video.mp4'])
    })
  })

  describe('mapRawTaskToPanelItem', () => {
    it('should map raw task to panel item', () => {
      const raw = {
        id: 'raw-1',
        taskId: 'task-1',
        apiType: 'seedance',
        apiAction: 'video_generation',
        model: 'model-1',
        status: 'succeeded',
        statusLabel: '',
        prompt: 'test',
        resultUrls: '["url1", "url2"]',
        resultText: '',
        thumbnailUrl: '',
        errorMessage: '',
        statusText: 'done',
        projectId: 1,
        nodeId: 'node-1',
        createdAt: '1234567890',
        updatedAt: '1234567891'
      }

      const result = mapRawTaskToPanelItem(raw as any)

      expect(result.id).toBe('raw-1')
      expect(result.taskId).toBe('task-1')
      expect(result.apiType).toBe('seedance')
      expect(result.status).toBe('succeeded')
      expect(result.statusLabel).toBe('已完成')
      expect(result.resultUrls).toEqual(['url1', 'url2'])
      expect(result.thumbnailUrl).toBe('url1')
      expect(result.projectId).toBe(1)
      expect(result.createdAt).toBe(1234567890)
      expect(result.updatedAt).toBe(1234567891)
    })

    it('should fallback to resultUrls[0] when thumbnailUrl is empty', () => {
      const raw = {
        id: 'raw-2',
        taskId: 'task-2',
        apiType: 'seedance',
        status: 'succeeded',
        statusLabel: '',
        resultUrls: ['http://a.com/img.jpg'],
        thumbnailUrl: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      const result = mapRawTaskToPanelItem(raw as any)
      expect(result.thumbnailUrl).toBe('http://a.com/img.jpg')
    })
  })

  describe('mapRawTaskToDetail', () => {
    it('should map raw task to detail', () => {
      const raw = {
        id: 'raw-1',
        taskId: 'task-1',
        apiType: 'seedance',
        apiAction: 'video_generation',
        model: 'model-1',
        status: 'running',
        statusLabel: '',
        prompt: 'test prompt',
        negativePrompt: 'negative',
        resultUrls: '["url1"]',
        resultText: '',
        thumbnailUrl: 'thumb.jpg',
        errorMessage: '',
        statusText: 'processing',
        projectId: 1,
        nodeId: 'node-1',
        remoteTaskId: 'remote-1',
        requestPayload: '{"model":"test"}',
        responsePayload: '{"status":"running"}',
        createdAt: '1234567890',
        updatedAt: '1234567891',
        resourceAvailable: true,
        resourceUnavailableReason: ''
      }

      const result = mapRawTaskToDetail(raw as any)

      expect(result.id).toBe('raw-1')
      expect(result.taskId).toBe('task-1')
      expect(result.status).toBe('running')
      expect(result.statusLabel).toBe('运行中')
      expect(result.prompt).toBe('test prompt')
      expect(result.negativePrompt).toBe('negative')
      expect(result.resultUrls).toEqual(['url1'])
      expect(result.requestPayload).toEqual({ model: 'test' })
      expect(result.responsePayload).toEqual({ status: 'running' })
      expect(result.remoteTaskId).toBe('remote-1')
      expect(result.resourceAvailable).toBe(true)
    })

    it('should handle null payloads', () => {
      const raw = {
        id: 'raw-2',
        taskId: 'task-2',
        apiType: 'seedance',
        status: 'succeeded',
        statusLabel: '',
        requestPayload: null,
        responsePayload: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      const result = mapRawTaskToDetail(raw as any)
      expect(result.requestPayload).toBe(null)
      expect(result.responsePayload).toBe(null)
    })
  })
})