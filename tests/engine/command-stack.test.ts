import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandStack } from '@/engine/graphbase/commands/CommandStack'
import { Command } from '@/engine/graphbase/commands/Command'

class TestCommand extends Command {
	executeFn: () => void
	undoFn: () => void

	constructor(
		type: string,
		executeFn: () => void = () => {},
		undoFn: () => void = () => {},
		mergeKey?: string
	) {
		super(type, mergeKey)
		this.executeFn = executeFn
		this.undoFn = undoFn
	}

	execute(): void {
		this.executeFn()
	}

	undo(): void {
		this.undoFn()
	}
}

class MergeableCommand extends Command {
	value: number
	executeFn: () => void
	undoFn: () => void

	constructor(
		mergeKey: string,
		value: number,
		executeFn: () => void = () => {},
		undoFn: () => void = () => {}
	) {
		super('mergeable', mergeKey)
		this.mergeable = true
		this.value = value
		this.executeFn = executeFn
		this.undoFn = undoFn
	}

	execute(): void {
		this.executeFn()
	}

	undo(): void {
		this.undoFn()
	}

	canMergeWith(other: Command): boolean {
		return other instanceof MergeableCommand && other.mergeKey === this.mergeKey
	}

	mergeWith(other: Command): Command {
		if (other instanceof MergeableCommand) {
			this.value += other.value
		}
		return this
	}
}

describe('CommandStack', () => {
	let stack: CommandStack

	beforeEach(() => {
		stack = new CommandStack()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('execute', () => {
		it('should execute command and push to undo stack', () => {
			const execute = vi.fn()
			const cmd = new TestCommand('test', execute)
			stack.execute(cmd)

			expect(execute).toHaveBeenCalledTimes(1)
			expect(stack.getUndoCount()).toBe(1)
			expect(stack.canUndo()).toBe(true)
			expect(stack.canRedo()).toBe(false)
		})

		it('should clear redo stack on new execute', () => {
			const execute = vi.fn()
			const undo = vi.fn()
			stack.execute(new TestCommand('a', execute, undo))
			stack.execute(new TestCommand('b', execute, undo))
			stack.undo()
			expect(stack.canRedo()).toBe(true)

			stack.execute(new TestCommand('c', execute, undo))
			expect(stack.canRedo()).toBe(false)
			expect(stack.getRedoCount()).toBe(0)
		})

		it('should respect maxSize limit', () => {
			const smallStack = new CommandStack(3)
			for (let i = 0; i < 5; i++) {
				smallStack.execute(new TestCommand(`cmd${i}`))
			}
			expect(smallStack.getUndoCount()).toBe(3)
		})

		it('should emit execute and change events', () => {
			const executeListener = vi.fn()
			const changeListener = vi.fn()
			stack.on.on('execute', executeListener)
			stack.on.on('change', changeListener)

			const cmd = new TestCommand('test')
			stack.execute(cmd)

			expect(executeListener).toHaveBeenCalledWith({ command: cmd })
			expect(changeListener).toHaveBeenCalledWith({ type: 'execute', command: cmd })
		})
	})

	describe('undo', () => {
		it('should return false when stack is empty', () => {
			expect(stack.undo()).toBe(false)
			expect(stack.canUndo()).toBe(false)
		})

		it('should undo last command and move to redo stack', () => {
			const execute = vi.fn()
			const undo = vi.fn()
			stack.execute(new TestCommand('test', execute, undo))
			expect(stack.getUndoCount()).toBe(1)

			const result = stack.undo()
			expect(result).toBe(true)
			expect(undo).toHaveBeenCalledTimes(1)
			expect(stack.getUndoCount()).toBe(0)
			expect(stack.getRedoCount()).toBe(1)
			expect(stack.canUndo()).toBe(false)
			expect(stack.canRedo()).toBe(true)
		})

		it('should undo commands in reverse order', () => {
			const order: string[] = []
			stack.execute(
				new TestCommand(
					'a',
					() => order.push('exec-a'),
					() => order.push('undo-a')
				)
			)
			stack.execute(
				new TestCommand(
					'b',
					() => order.push('exec-b'),
					() => order.push('undo-b')
				)
			)

			stack.undo()
			expect(order).toEqual(['exec-a', 'exec-b', 'undo-b'])

			stack.undo()
			expect(order).toEqual(['exec-a', 'exec-b', 'undo-b', 'undo-a'])
		})

		it('should emit undo and change events', () => {
			const undoListener = vi.fn()
			const changeListener = vi.fn()
			const cmd = new TestCommand('test')
			stack.execute(cmd)

			stack.on.on('undo', undoListener)
			stack.on.on('change', changeListener)
			stack.undo()

			expect(undoListener).toHaveBeenCalledWith({ command: cmd })
			expect(changeListener).toHaveBeenCalledWith({ type: 'undo', command: cmd })
		})
	})

	describe('redo', () => {
		it('should return false when redo stack is empty', () => {
			expect(stack.redo()).toBe(false)
			expect(stack.canRedo()).toBe(false)
		})

		it('should redo last undone command and move back to undo stack', () => {
			const execute = vi.fn()
			const cmd = new TestCommand('test', execute, () => {})
			stack.execute(cmd)
			expect(execute).toHaveBeenCalledTimes(1)
			stack.undo()
			expect(stack.getRedoCount()).toBe(1)

			const result = stack.redo()
			expect(result).toBe(true)
			expect(execute).toHaveBeenCalledTimes(2)
			expect(stack.getUndoCount()).toBe(1)
			expect(stack.getRedoCount()).toBe(0)
		})

		it('should emit redo and change events', () => {
			const redoListener = vi.fn()
			const changeListener = vi.fn()
			const cmd = new TestCommand('test')
			stack.execute(cmd)
			stack.undo()

			stack.on.on('redo', redoListener)
			stack.on.on('change', changeListener)
			stack.redo()

			expect(redoListener).toHaveBeenCalledWith({ command: cmd })
			expect(changeListener).toHaveBeenCalledWith({ type: 'redo', command: cmd })
		})
	})

	describe('undo/redo cycle', () => {
		it('should support multiple undo/redo cycles', () => {
			const states: string[] = ['initial']
			stack.execute(
				new TestCommand(
					'a',
					() => states.push('after-a'),
					() => states.push('undo-a')
				)
			)
			stack.execute(
				new TestCommand(
					'b',
					() => states.push('after-b'),
					() => states.push('undo-b')
				)
			)

			stack.undo()
			stack.undo()
			expect(states).toEqual(['initial', 'after-a', 'after-b', 'undo-b', 'undo-a'])

			stack.redo()
			stack.redo()
			expect(states).toEqual([
				'initial',
				'after-a',
				'after-b',
				'undo-b',
				'undo-a',
				'after-a',
				'after-b'
			])
		})
	})

	describe('merge', () => {
		it('should merge consecutive mergeable commands with same key', () => {
			const exec1 = vi.fn()
			const exec2 = vi.fn()
			const undo1 = vi.fn()
			const undo2 = vi.fn()

			const cmd1 = new MergeableCommand('drag', 10, exec1, undo1)
			const cmd2 = new MergeableCommand('drag', 5, exec2, undo2)

			stack.execute(cmd1)
			stack.execute(cmd2)

			expect(exec1).toHaveBeenCalledTimes(1)
			expect(exec2).not.toHaveBeenCalled()
			expect(stack.getUndoCount()).toBe(1)
		})

		it('should not merge after merge timeout expires', () => {
			vi.useFakeTimers()
			const cmd1 = new MergeableCommand('drag', 10)
			const cmd2 = new MergeableCommand('drag', 5)

			stack.execute(cmd1)
			vi.advanceTimersByTime(600)
			stack.execute(cmd2)

			expect(stack.getUndoCount()).toBe(2)
			vi.useRealTimers()
		})
	})

	describe('clear', () => {
		it('should clear both stacks', () => {
			stack.execute(new TestCommand('a'))
			stack.execute(new TestCommand('b'))
			stack.undo()

			stack.clear()
			expect(stack.canUndo()).toBe(false)
			expect(stack.canRedo()).toBe(false)
			expect(stack.getUndoCount()).toBe(0)
			expect(stack.getRedoCount()).toBe(0)
		})

		it('should emit change event with type clear', () => {
			const changeListener = vi.fn()
			stack.on.on('change', changeListener)
			stack.clear()
			expect(changeListener).toHaveBeenCalledWith({ type: 'clear' })
		})
	})

	describe('peekUndo/peekRedo', () => {
		it('should return null when stacks are empty', () => {
			expect(stack.peekUndo()).toBeNull()
			expect(stack.peekRedo()).toBeNull()
		})

		it('should return top of undo/redo stack without removing', () => {
			const cmd = new TestCommand('test')
			stack.execute(cmd)
			expect(stack.peekUndo()).toBe(cmd)
			expect(stack.getUndoCount()).toBe(1)

			stack.undo()
			expect(stack.peekRedo()).toBe(cmd)
			expect(stack.getRedoCount()).toBe(1)
		})
	})
})
