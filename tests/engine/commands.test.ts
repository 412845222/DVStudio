import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MoveNodeCommand, CompositeCommand } from '@/engine/graphbase/commands/CompositeCommand'
import { Command } from '@/engine/graphbase/commands/Command'
import { Vector2 } from '@/engine/graphbase/core/Vector2'

describe('MoveNodeCommand', () => {
	let moveFn: ReturnType<typeof vi.fn>

	beforeEach(() => {
		moveFn = vi.fn()
	})

	describe('single node move', () => {
		it('should move node to end position on execute', () => {
			const start = new Map([['node1', new Vector2(100, 200)]])
			const end = new Map([['node1', new Vector2(150, 250)]])
			const cmd = new MoveNodeCommand(start, end, moveFn)

			cmd.execute()

			expect(moveFn).toHaveBeenCalledTimes(1)
			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 150, y: 250 }))
		})

		it('should move node back to start position on undo', () => {
			const start = new Map([['node1', new Vector2(100, 200)]])
			const end = new Map([['node1', new Vector2(150, 250)]])
			const cmd = new MoveNodeCommand(start, end, moveFn)

			cmd.execute()
			moveFn.mockClear()
			cmd.undo()

			expect(moveFn).toHaveBeenCalledTimes(1)
			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 100, y: 200 }))
		})

		it('should move node to end position again on redo', () => {
			const start = new Map([['node1', new Vector2(100, 200)]])
			const end = new Map([['node1', new Vector2(150, 250)]])
			const cmd = new MoveNodeCommand(start, end, moveFn)

			cmd.execute()
			cmd.undo()
			moveFn.mockClear()
			cmd.redo()

			expect(moveFn).toHaveBeenCalledTimes(1)
			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 150, y: 250 }))
		})
	})

	describe('multiple nodes move', () => {
		it('should move all nodes to end positions on execute', () => {
			const start = new Map([
				['node1', new Vector2(100, 200)],
				['node2', new Vector2(300, 400)]
			])
			const end = new Map([
				['node1', new Vector2(150, 250)],
				['node2', new Vector2(350, 450)]
			])
			const cmd = new MoveNodeCommand(start, end, moveFn)

			cmd.execute()

			expect(moveFn).toHaveBeenCalledTimes(2)
			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 150, y: 250 }))
			expect(moveFn).toHaveBeenCalledWith('node2', expect.objectContaining({ x: 350, y: 450 }))
		})

		it('should move all nodes back to start positions on undo', () => {
			const start = new Map([
				['node1', new Vector2(100, 200)],
				['node2', new Vector2(300, 400)]
			])
			const end = new Map([
				['node1', new Vector2(150, 250)],
				['node2', new Vector2(350, 450)]
			])
			const cmd = new MoveNodeCommand(start, end, moveFn)

			cmd.execute()
			moveFn.mockClear()
			cmd.undo()

			expect(moveFn).toHaveBeenCalledTimes(2)
			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 100, y: 200 }))
			expect(moveFn).toHaveBeenCalledWith('node2', expect.objectContaining({ x: 300, y: 400 }))
		})
	})

	describe('merge', () => {
		it('should return true for canMergeWith another MoveNodeCommand', () => {
			const start1 = new Map([['node1', new Vector2(0, 0)]])
			const end1 = new Map([['node1', new Vector2(10, 10)]])
			const cmd1 = new MoveNodeCommand(start1, end1, moveFn)

			const start2 = new Map([['node1', new Vector2(10, 10)]])
			const end2 = new Map([['node1', new Vector2(20, 20)]])
			const cmd2 = new MoveNodeCommand(start2, end2, moveFn)

			expect(cmd1.canMergeWith(cmd2)).toBe(true)
		})

		it('should return false for canMergeWith non-MoveNodeCommand', () => {
			const start = new Map([['node1', new Vector2(0, 0)]])
			const end = new Map([['node1', new Vector2(10, 10)]])
			const cmd = new MoveNodeCommand(start, end, moveFn)

			class OtherCmd extends Command {
				constructor() {
					super('other')
				}
				execute() {}
				undo() {}
			}

			expect(cmd.canMergeWith(new OtherCmd())).toBe(false)
		})

		it('should merge end positions when mergeWith is called', () => {
			const start1 = new Map([['node1', new Vector2(0, 0)]])
			const end1 = new Map([['node1', new Vector2(10, 10)]])
			const cmd1 = new MoveNodeCommand(start1, end1, moveFn)

			const start2 = new Map([['node1', new Vector2(10, 10)]])
			const end2 = new Map([['node1', new Vector2(25, 35)]])
			const cmd2 = new MoveNodeCommand(start2, end2, moveFn)

			cmd1.mergeWith(cmd2)
			cmd1.execute()

			expect(moveFn).toHaveBeenCalledTimes(1)
			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 25, y: 35 }))
		})

		it('should undo back to original start after merge', () => {
			const start1 = new Map([['node1', new Vector2(0, 0)]])
			const end1 = new Map([['node1', new Vector2(10, 10)]])
			const cmd1 = new MoveNodeCommand(start1, end1, moveFn)

			const start2 = new Map([['node1', new Vector2(10, 10)]])
			const end2 = new Map([['node1', new Vector2(25, 35)]])
			const cmd2 = new MoveNodeCommand(start2, end2, moveFn)

			cmd1.mergeWith(cmd2)
			cmd1.execute()
			moveFn.mockClear()
			cmd1.undo()

			expect(moveFn).toHaveBeenCalledWith('node1', expect.objectContaining({ x: 0, y: 0 }))
		})
	})

	describe('type', () => {
		it('should have type "move-node"', () => {
			const cmd = new MoveNodeCommand(new Map(), new Map(), moveFn)
			expect(cmd.type).toBe('move-node')
		})

		it('should not be mergeable by default (mergeable=false)', () => {
			const cmd = new MoveNodeCommand(new Map(), new Map(), moveFn)
			expect(cmd.mergeable).toBe(false)
		})
	})
})

describe('CompositeCommand', () => {
	it('should execute all child commands in order', () => {
		const order: string[] = []
		class TestCmd extends Command {
			constructor(private name: string) {
				super('test')
			}
			execute() {
				order.push(`exec-${this.name}`)
			}
			undo() {
				order.push(`undo-${this.name}`)
			}
		}

		const composite = new CompositeCommand([new TestCmd('a'), new TestCmd('b'), new TestCmd('c')])
		composite.execute()

		expect(order).toEqual(['exec-a', 'exec-b', 'exec-c'])
	})

	it('should undo all child commands in reverse order', () => {
		const order: string[] = []
		class TestCmd extends Command {
			constructor(private name: string) {
				super('test')
			}
			execute() {
				order.push(`exec-${this.name}`)
			}
			undo() {
				order.push(`undo-${this.name}`)
			}
		}

		const composite = new CompositeCommand([new TestCmd('a'), new TestCmd('b'), new TestCmd('c')])
		composite.execute()
		order.length = 0
		composite.undo()

		expect(order).toEqual(['undo-c', 'undo-b', 'undo-a'])
	})

	it('should redo all child commands in order', () => {
		const order: string[] = []
		class TestCmd extends Command {
			constructor(private name: string) {
				super('test')
			}
			execute() {
				order.push(`exec-${this.name}`)
			}
			undo() {
				order.push(`undo-${this.name}`)
			}
		}

		const composite = new CompositeCommand([new TestCmd('a'), new TestCmd('b')])
		composite.execute()
		composite.undo()
		order.length = 0
		composite.redo()

		expect(order).toEqual(['exec-a', 'exec-b'])
	})

	it('should support adding commands via add()', () => {
		const execFn = vi.fn()
		class TestCmd extends Command {
			constructor() {
				super('test')
			}
			execute() {
				execFn()
			}
			undo() {}
		}

		const composite = new CompositeCommand()
		composite.add(new TestCmd())
		composite.add(new TestCmd())
		composite.execute()

		expect(execFn).toHaveBeenCalledTimes(2)
	})
})
