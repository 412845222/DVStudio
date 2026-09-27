import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigureFrameAutomationCommand } from '@/engine/blueprint/commands/ConfigureFrameAutomationCommand'
import type { BlueprintScene } from '@/engine/blueprint/BlueprintScene'
import type { FrameAutomationData } from '@/engine/blueprint/frame-automation/FrameAutomationTypes'

/**
 * 多选组合自动化配置命令：execute/undo 必须对称替换整份快照，
 * 且构造时持有的快照与外部传入对象隔离（后续外部 mutate 不得污染命令历史）。
 */
function createMockScene() {
	const configs = new Map<string, FrameAutomationData | undefined>()
	const redraw = vi.fn()
	const setFrameAutomationInternal = vi.fn(
		(frameId: string, config: FrameAutomationData | undefined) => {
			configs.set(frameId, config)
		}
	)
	return {
		configs,
		redraw,
		setFrameAutomationInternal,
		requestRedraw: redraw
	}
}

function sampleConfig(loopCount: number): FrameAutomationData {
	return {
		enabled: true,
		loopCount,
		inputBindings: [{ id: 'fin_1', nodeId: 'n1', anchorId: 'in-0' }],
		outputBindings: [{ id: 'fout_1', nodeId: 'n2', anchorId: 'out-0' }]
	}
}

describe('ConfigureFrameAutomationCommand', () => {
	let scene: ReturnType<typeof createMockScene>

	beforeEach(() => {
		scene = createMockScene()
	})

	it('execute 写入下一份配置并请求重绘', () => {
		const next = sampleConfig(3)
		const cmd = new ConfigureFrameAutomationCommand(
			scene as unknown as BlueprintScene,
			'frame-1',
			next,
			undefined
		)

		cmd.execute()

		expect(scene.setFrameAutomationInternal).toHaveBeenCalledWith('frame-1', expect.any(Object))
		expect(scene.configs.get('frame-1')?.loopCount).toBe(3)
		expect(scene.redraw).toHaveBeenCalled()
	})

	it('undo 恢复上一份配置（含清空为 undefined 的场景）', () => {
		const prev = sampleConfig(1)
		const next = sampleConfig(5)
		const cmd = new ConfigureFrameAutomationCommand(
			scene as unknown as BlueprintScene,
			'frame-1',
			next,
			prev
		)

		cmd.execute()
		expect(scene.configs.get('frame-1')?.loopCount).toBe(5)

		cmd.undo()
		const restored = scene.configs.get('frame-1')
		expect(restored).toBeDefined()
		expect(restored?.loopCount).toBe(1)
		expect(restored?.inputBindings).toHaveLength(1)
		expect(restored?.outputBindings).toHaveLength(1)
	})

	it('prevConfig 缺省时 undo 将配置清空（关闭自动化设计）', () => {
		const cmd = new ConfigureFrameAutomationCommand(
			scene as unknown as BlueprintScene,
			'frame-1',
			sampleConfig(2)
		)

		cmd.execute()
		expect(scene.configs.get('frame-1')).toBeDefined()

		cmd.undo()
		expect(scene.configs.get('frame-1')).toBeUndefined()
	})

	it('构造后外部 mutate 源对象不会污染命令快照', () => {
		const next = sampleConfig(2)
		const prev = sampleConfig(1)
		const cmd = new ConfigureFrameAutomationCommand(
			scene as unknown as BlueprintScene,
			'frame-1',
			next,
			prev
		)

		// 外部继续持有并修改源对象
		next.loopCount = 99
		next.inputBindings.push({ id: 'fin_x', nodeId: 'n9', anchorId: 'in-0' })
		prev.loopCount = 88

		cmd.execute()
		const applied = scene.configs.get('frame-1')!
		expect(applied.loopCount).toBe(2)
		expect(applied.inputBindings).toHaveLength(1)

		cmd.undo()
		const restored = scene.configs.get('frame-1')!
		expect(restored.loopCount).toBe(1)
	})

	it('写入场景的配置为克隆副本，执行后修改场景配置不影响可撤销快照', () => {
		const cmd = new ConfigureFrameAutomationCommand(
			scene as unknown as BlueprintScene,
			'frame-1',
			sampleConfig(4),
			sampleConfig(1)
		)

		cmd.execute()
		const applied = scene.configs.get('frame-1')!
		applied.loopCount = 50
		applied.outputBindings.length = 0

		cmd.undo()
		const restored = scene.configs.get('frame-1')!
		expect(restored.loopCount).toBe(1)
		expect(restored.outputBindings).toHaveLength(1)

		// 再次执行仍恢复 next 快照
		cmd.execute()
		expect(scene.configs.get('frame-1')?.loopCount).toBe(4)
		expect(scene.configs.get('frame-1')?.outputBindings).toHaveLength(1)
	})
})
