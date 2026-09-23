import { describe, it, expect, vi } from 'vitest'
import {
	toggleBinding,
	findBindingByAnchor,
	findBindingById,
	removeBindingById,
	sanitizeFrameAutomation,
	pruneBindingsForNode
} from '@/engine/blueprint/frame-automation/frameAutomationPorts'
import { createDefaultFrameAutomation } from '@/engine/blueprint/frame-automation/FrameAutomationTypes'
import type { BlueprintNode } from '@/engine/blueprint/BlueprintNode'
import type { Port } from '@/engine/blueprint/Port'
import type { MediaType } from '@/engine/blueprint/types'

/**
 * 多选组合自动化：成员锚点绑定的纯函数测试。
 * 覆盖 toggle 绑定/解绑、查找、按 id 移除、加载期清洗（失效锚点剔除/去重/媒体类型重算/次数钳制）、
 * 以及成员节点删除时的绑定修剪。
 */

function makePort(mediaType: MediaType): Port {
	return { mediaType } as unknown as Port
}

function makeNode(
	ports: { input?: Record<string, MediaType>; output?: Record<string, MediaType> } = {}
): BlueprintNode {
	const inputPorts = ports.input ?? {}
	const outputPorts = ports.output ?? {}
	return {
		getInputPort: (id: string) => (id in inputPorts ? makePort(inputPorts[id]) : null),
		getOutputPort: (id: string) => (id in outputPorts ? makePort(outputPorts[id]) : null)
	} as unknown as BlueprintNode
}

describe('toggleBinding', () => {
	it('首次点击未绑定锚点时新增绑定并返回 added:true', () => {
		const data = createDefaultFrameAutomation()
		const { bindings, added } = toggleBinding(data, 'in', 'n1', 'in-0', '节点A · 输入0', 'image')
		expect(added).toBe(true)
		expect(bindings).toHaveLength(1)
		expect(bindings[0].nodeId).toBe('n1')
		expect(bindings[0].anchorId).toBe('in-0')
		expect(bindings[0].mediaType).toBe('image')
		expect(bindings[0].id).toMatch(/^fin_/)
	})

	it('再次点击同一锚点时移除绑定并返回 added:false', () => {
		const data = createDefaultFrameAutomation()
		const first = toggleBinding(data, 'in', 'n1', 'in-0', 'A·in0', 'text')
		const second = toggleBinding(
			{ ...data, inputBindings: first.bindings },
			'in',
			'n1',
			'in-0',
			'A·in0',
			'text'
		)
		expect(second.added).toBe(false)
		expect(second.bindings).toHaveLength(0)
	})

	it('切换一个方向的绑定不影响另一方向', () => {
		const data = createDefaultFrameAutomation()
		const out = toggleBinding(data, 'out', 'n2', 'out-0', 'B·out0', 'video')
		expect(out.bindings).toHaveLength(1)
		// 输入侧仍为空
		const inRes = toggleBinding(
			{ ...data, outputBindings: out.bindings },
			'in',
			'n1',
			'in-0',
			'A·in0',
			'text'
		)
		expect(inRes.bindings).toHaveLength(1)
	})

	it('不可变更新：不修改传入 data 的 bindings 数组', () => {
		const data = createDefaultFrameAutomation()
		const originalRef = data.inputBindings
		const { bindings } = toggleBinding(data, 'in', 'n1', 'in-0', 'A·in0', 'text')
		expect(bindings).not.toBe(originalRef)
		expect(originalRef).toHaveLength(0)
	})
})

describe('findBindingByAnchor / findBindingById / removeBindingById', () => {
	const data = {
		...createDefaultFrameAutomation(),
		inputBindings: [{ id: 'fin_1', nodeId: 'n1', anchorId: 'in-0' }],
		outputBindings: [{ id: 'fout_1', nodeId: 'n2', anchorId: 'out-0' }]
	}

	it('按节点+锚点查找绑定', () => {
		expect(findBindingByAnchor(data, 'in', 'n1', 'in-0')?.id).toBe('fin_1')
		expect(findBindingByAnchor(data, 'in', 'n1', 'in-999')).toBeUndefined()
	})

	it('按绑定 id 查找', () => {
		expect(findBindingById(data, 'out', 'fout_1')?.nodeId).toBe('n2')
		expect(findBindingById(data, 'out', 'nope')).toBeUndefined()
	})

	it('按绑定 id 移除（不可变）', () => {
		const next = removeBindingById(data, 'in', 'fin_1')
		expect(next).toHaveLength(0)
		expect(data.inputBindings).toHaveLength(1) // 原对象不变
	})
})

describe('sanitizeFrameAutomation', () => {
	const nodes: Record<string, BlueprintNode> = {
		n1: makeNode({ input: { 'in-0': 'image' }, output: { 'out-0': 'image' } }),
		n2: makeNode({ input: { 'in-0': 'text' } })
	}
	const getNode = (id: string) => nodes[id] ?? null

	it('未开启自动化时返回 undefined', () => {
		expect(sanitizeFrameAutomation({ enabled: false }, ['n1'], getNode)).toBeUndefined()
		expect(sanitizeFrameAutomation(null, ['n1'], getNode)).toBeUndefined()
		expect(sanitizeFrameAutomation({}, ['n1'], getNode)).toBeUndefined()
	})

	it('剔除指向非成员节点或不存在锚点的绑定', () => {
		const raw = {
			enabled: true,
			loopCount: 3,
			inputBindings: [
				{ id: 'fin_ok', nodeId: 'n1', anchorId: 'in-0' }, // 有效
				{ id: 'fin_bad_node', nodeId: 'n999', anchorId: 'in-0' }, // 非成员
				{ id: 'fin_bad_anchor', nodeId: 'n1', anchorId: 'no-such-port' } // 锚点不存在
			],
			outputBindings: [{ id: 'fout_ok', nodeId: 'n1', anchorId: 'out-0' }]
		}
		const cleaned = sanitizeFrameAutomation(raw, ['n1', 'n2'], getNode)
		expect(cleaned?.inputBindings).toHaveLength(1)
		expect(cleaned?.inputBindings[0].id).toBe('fin_ok')
		expect(cleaned?.outputBindings).toHaveLength(1)
	})

	it('同一锚点的重复绑定去重，且以真实端口 mediaType 覆盖脏数据', () => {
		const raw = {
			enabled: true,
			loopCount: 1,
			inputBindings: [
				{ id: 'fin_a', nodeId: 'n1', anchorId: 'in-0', mediaType: 'WRONG' },
				{ id: 'fin_b', nodeId: 'n1', anchorId: 'in-0', mediaType: 'STALE' }
			],
			outputBindings: []
		}
		const cleaned = sanitizeFrameAutomation(raw, ['n1'], getNode)
		expect(cleaned?.inputBindings).toHaveLength(1)
		expect(cleaned?.inputBindings[0].mediaType).toBe('image')
	})

	it('循环次数钳制到 [1, 99]，非法值回落到 1', () => {
		const base = { enabled: true, inputBindings: [], outputBindings: [] }
		expect(sanitizeFrameAutomation({ ...base, loopCount: 0 }, [], getNode)?.loopCount).toBe(1)
		expect(sanitizeFrameAutomation({ ...base, loopCount: 500 }, [], getNode)?.loopCount).toBe(99)
		expect(sanitizeFrameAutomation({ ...base, loopCount: 'abc' }, [], getNode)?.loopCount).toBe(1)
		expect(sanitizeFrameAutomation({ ...base, loopCount: 5.7 }, [], getNode)?.loopCount).toBe(5)
	})
})

describe('pruneBindingsForNode', () => {
	it('成员节点被删除时剔除指向它的所有方向绑定', () => {
		const data = {
			...createDefaultFrameAutomation(),
			inputBindings: [
				{ id: 'fin_1', nodeId: 'n1', anchorId: 'in-0' },
				{ id: 'fin_2', nodeId: 'n2', anchorId: 'in-0' }
			],
			outputBindings: [
				{ id: 'fout_1', nodeId: 'n1', anchorId: 'out-0' },
				{ id: 'fout_2', nodeId: 'n3', anchorId: 'out-0' }
			]
		}
		const pruned = pruneBindingsForNode(data, 'n1')
		expect(pruned?.inputBindings.map((b) => b.id)).toEqual(['fin_2'])
		expect(pruned?.outputBindings.map((b) => b.id)).toEqual(['fout_2'])
	})

	it('未开启自动化时原样返回', () => {
		expect(pruneBindingsForNode(undefined, 'n1')).toBeUndefined()
	})
})
