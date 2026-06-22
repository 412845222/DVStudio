import { describe, it, expect } from 'vitest'
import { TypedEventBus, type EventHandler } from '@/core/events/typedEventBus'

interface TestEvents {
  click: { x: number; y: number }
  change: { value: string }
  empty: void
  number: number
}

describe('TypedEventBus', () => {
  describe('on/emit/off', () => {
    it('calls handler when event is emitted', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler = vi.fn()
      bus.on('click', handler)
      bus.emit('click', { x: 10, y: 20 })
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ x: 10, y: 20 })
    })

    it('returns unsubscribe function', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler = vi.fn()
      const off = bus.on('click', handler)
      off()
      bus.emit('click', { x: 10, y: 20 })
      expect(handler).not.toHaveBeenCalled()
    })

    it('handles multiple handlers for same event', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      bus.on('click', handler1)
      bus.on('click', handler2)
      bus.emit('click', { x: 10, y: 20 })
      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('handles different event types', () => {
      const bus = new TypedEventBus<TestEvents>()
      const clickHandler = vi.fn()
      const changeHandler = vi.fn()
      bus.on('click', clickHandler)
      bus.on('change', changeHandler)
      bus.emit('click', { x: 10, y: 20 })
      bus.emit('change', { value: 'test' })
      expect(clickHandler).toHaveBeenCalledTimes(1)
      expect(changeHandler).toHaveBeenCalledTimes(1)
    })

    it('off removes specific handler', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      bus.on('click', handler1)
      bus.on('click', handler2)
      bus.off('click', handler1)
      bus.emit('click', { x: 10, y: 20 })
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('emitting non-existent event has no side effects', () => {
      const bus = new TypedEventBus<TestEvents>()
      expect(() => bus.emit('click' as any, {} as any)).not.toThrow()
    })

    it('emitting with no listeners has no side effects', () => {
      const bus = new TypedEventBus<TestEvents>()
      expect(() => bus.emit('click', { x: 10, y: 20 })).not.toThrow()
    })

    it('handler can be called multiple times', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler = vi.fn()
      bus.on('number', handler)
      bus.emit('number', 42)
      bus.emit('number', 43)
      bus.emit('number', 44)
      expect(handler).toHaveBeenCalledTimes(3)
      expect(handler).toHaveBeenNthCalledWith(1, 42)
      expect(handler).toHaveBeenNthCalledWith(2, 43)
      expect(handler).toHaveBeenNthCalledWith(3, 44)
    })

    it('off for non-existent event is safe', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler = vi.fn()
      expect(() => bus.off('click', handler)).not.toThrow()
    })

    it('multiple off calls are safe', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler = vi.fn()
      const off = bus.on('click', handler)
      off()
      expect(() => off()).not.toThrow()
    })

    it('handler throwing exception does not affect other handlers', () => {
      const bus = new TypedEventBus<TestEvents>()
      const errorHandler = () => { throw new Error('test error') }
      const normalHandler = vi.fn()
      bus.on('click', errorHandler)
      bus.on('click', normalHandler)
      expect(() => bus.emit('click', { x: 10, y: 20 })).not.toThrow()
      expect(normalHandler).toHaveBeenCalledTimes(1)
    })

    it('emitting void event works', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler = vi.fn()
      bus.on('empty', handler)
      bus.emit('empty', undefined)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(undefined)
    })

    it('handlers list during iteration is safe when handler removes itself', () => {
      const bus = new TypedEventBus<TestEvents>()
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      
      // handler1 removes itself when called
      const selfRemover = () => { bus.off('click', selfRemover) }
      bus.on('click', selfRemover)
      bus.on('click', handler1)
      bus.on('click', handler2)
      
      bus.emit('click', { x: 10, y: 20 })
      
      // Both handler1 and handler2 should be called
      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })
  })
})
