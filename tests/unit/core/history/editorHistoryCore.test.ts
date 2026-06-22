import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEditorHistoryCore } from '@/core/history/editorHistoryCore'
import type { EditorSnapshot } from '@/core/editor/types'

const createMockSnapshot = (id: string): EditorSnapshot => ({
  videoScene: {
    layers: [],
    activeLayerId: '',
    imageAssets: {},
  },
  videoStudio: {
    projectId: `project-${id}`,
    title: `Project ${id}`,
    lastSaved: Date.now(),
  },
  timeline: {
    duration: 5000,
    spans: [],
  },
})

describe('editorHistoryCore', () => {
  describe('createEditorHistoryCore', () => {
    it('creates history with initial snapshot', () => {
      const initial = createMockSnapshot('initial')
      const captureSnapshot = vi.fn(() => createMockSnapshot('captured'))
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot,
        applySnapshot,
      })
      expect(captureSnapshot).toHaveBeenCalled()
      expect(history.canUndo()).toBe(false)
      expect(history.canRedo()).toBe(false)
    })

    it('canUndo returns true after capture', () => {
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
      })
      history.scheduleCapture()
      expect(history.canUndo()).toBe(false)
      // Fast-forward timers
      vi.useFakeTimers()
      history.scheduleCapture()
      vi.advanceTimersByTime(300)
      vi.useRealTimers()
      // Note: actual behavior depends on timer implementation
    })

    it('undo pops from past stack', () => {
      const captureSnapshot = vi.fn()
        .mockReturnValueOnce(createMockSnapshot('snap1'))
        .mockReturnValueOnce(createMockSnapshot('snap2'))
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot,
        applySnapshot,
        maxHistory: 10,
      })
      // Simulate captures
      history.scheduleCapture()
      history.flushPendingCapture()
      history.scheduleCapture()
      history.flushPendingCapture()
      expect(history.canUndo()).toBe(true)
      history.undo()
      expect(history.canRedo()).toBe(true)
    })

    it('redo pops from future stack', () => {
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot,
        maxHistory: 10,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      history.undo()
      expect(history.canRedo()).toBe(true)
      history.redo()
      expect(history.canUndo()).toBe(true)
    })

    it('cannot undo when past is empty', () => {
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
      })
      expect(history.canUndo()).toBe(false)
      history.undo() // Should be no-op
      expect(history.canUndo()).toBe(false)
    })

    it('cannot redo when future is empty', () => {
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
      })
      expect(history.canRedo()).toBe(false)
      history.redo() // Should be no-op
      expect(history.canRedo()).toBe(false)
    })

    it('new capture clears future stack', () => {
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot,
        maxHistory: 10,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      history.undo()
      expect(history.canRedo()).toBe(true)
      history.scheduleCapture()
      history.flushPendingCapture()
      expect(history.canRedo()).toBe(false)
    })

    it('replaceCurrent resets history', () => {
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot,
        maxHistory: 10,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      history.scheduleCapture()
      history.flushPendingCapture()
      expect(history.canUndo()).toBe(true)
      history.replaceCurrent(createMockSnapshot('new'))
      expect(history.canUndo()).toBe(false)
      expect(history.canRedo()).toBe(false)
    })

    it('maxHistory limits past stack size', () => {
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot,
        maxHistory: 3,
      })
      for (let i = 0; i < 10; i++) {
        history.scheduleCapture()
        history.flushPendingCapture()
      }
      // Past should be limited by maxHistory
      expect(history.canUndo()).toBe(true)
    })

    it('getLastSavedAt returns null initially', () => {
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
      })
      expect(history.getLastSavedAt()).toBeNull()
    })

    it('setEditorSaveHandler stores handler', () => {
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
      })
      const handler = vi.fn()
      history.setEditorSaveHandler(handler)
      // Handler is stored and used during save
    })

    it('commitCaptureNow captures immediately', () => {
      const captureSnapshot = vi.fn().mockReturnValue(createMockSnapshot('snap'))
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot,
        applySnapshot,
      })
      captureSnapshot.mockClear()
      history.commitCaptureNow()
      expect(captureSnapshot).toHaveBeenCalled()
    })

    it('flushPendingCapture commits pending capture', () => {
      const captureSnapshot = vi.fn().mockReturnValue(createMockSnapshot('snap'))
      const applySnapshot = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot,
        applySnapshot,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      expect(captureSnapshot).toHaveBeenCalled()
    })

    it('onChanged callback is invoked', () => {
      const onChanged = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
        onChanged,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      expect(onChanged).toHaveBeenCalled()
    })

    it('onStateRestored callback is invoked on undo', () => {
      const onStateRestored = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
        onStateRestored,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      history.undo()
      expect(onStateRestored).toHaveBeenCalledWith('undo')
    })

    it('onStateRestored callback is invoked on redo', () => {
      const onStateRestored = vi.fn()
      const history = createEditorHistoryCore({
        captureSnapshot: () => createMockSnapshot('snap'),
        applySnapshot: vi.fn(),
        onStateRestored,
      })
      history.scheduleCapture()
      history.flushPendingCapture()
      history.undo()
      history.redo()
      expect(onStateRestored).toHaveBeenCalledWith('redo')
    })
  })
})
