import { describe, it, expect, afterEach } from 'vitest'
import { BlueprintScene } from '@/engine/blueprint/BlueprintScene'
import { DEFAULT_NODE_PORTS, getDefaultNodeData } from '@/engine/blueprint/types'
import type { BlueprintNodeData, BlueprintData } from '@/engine/blueprint/types'

function createScene(): BlueprintScene {
	const canvas = document.createElement('canvas')
	canvas.width = 1920
	canvas.height = 1080
	return new BlueprintScene(canvas)
}

function makeNode(overrides: Partial<BlueprintNodeData> = {}): BlueprintNodeData {
	const base = getDefaultNodeData('scene-layout', 100, 100)
	return { ...base, ...overrides }
}

describe('Scene Layout Node Anchor Configuration', () => {
	describe('DEFAULT_NODE_PORTS["scene-layout"]', () => {
		it('should have exactly one input anchor: in-json (布局JSON)', () => {
			const ports = DEFAULT_NODE_PORTS['scene-layout']
			expect(ports).toBeDefined()
			expect(ports.inputs).toHaveLength(1)
			expect(ports.inputs[0]!.id).toBe('in-json')
			expect(ports.inputs[0]!.label).toBe('布局JSON')
			expect(ports.inputs[0]!.mediaType).toBe('text')
		})

		it('should NOT have in-text or in-resource input anchors by default', () => {
			const ports = DEFAULT_NODE_PORTS['scene-layout']
			const inputIds = ports.inputs.map((p) => p.id)
			expect(inputIds).not.toContain('in-text')
			expect(inputIds).not.toContain('in-resource')
		})

		it('should have exactly one output anchor: out-0 (布局输出)', () => {
			const ports = DEFAULT_NODE_PORTS['scene-layout']
			expect(ports.outputs).toHaveLength(1)
			expect(ports.outputs[0]!.id).toBe('out-0')
			expect(ports.outputs[0]!.label).toBe('布局输出')
			expect(ports.outputs[0]!.mediaType).toBe('text')
		})
	})

	describe('getDefaultNodeData for scene-layout', () => {
		it('should create scene-layout node with in-json input only', () => {
			const node = getDefaultNodeData('scene-layout', 200, 200)
			expect(node.type).toBe('scene-layout')
			expect(node.inputs).toHaveLength(1)
			expect(node.inputs[0]!.id).toBe('in-json')
			expect(node.outputs).toHaveLength(1)
			expect(node.outputs[0]!.id).toBe('out-0')
		})
	})
})

describe('BlueprintScene.loadBlueprint incremental port updates', () => {
	let scene: BlueprintScene

	afterEach(() => {
		if (scene) {
			scene.dispose()
		}
	})

	it('should update node inputs/outputs when they change between loads (incremental port sync)', () => {
		scene = createScene()

		// First load: scene-layout node with OLD (wrong) port config (in-text + in-resource)
		const oldPortsNode = makeNode({
			id: 'sl-1',
			worldX: 100,
			worldY: 100,
			inputs: [
				{ id: 'in-text', label: '布局描述', mediaType: 'text' },
				{ id: 'in-resource', label: '资源输入', mediaType: 'resource' }
			],
			outputs: [
				{ id: 'out-text', label: '布局数据', mediaType: 'text' },
				{ id: 'out-generic', label: '通用输出', mediaType: 'generic' }
			]
		})

		const blueprint1: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [oldPortsNode],
			edges: [],
			legacyResources: {}
		}

		scene.loadBlueprint(blueprint1)

		// Verify old ports are present
		let node = scene.getBlueprintNode('sl-1')
		expect(node).toBeTruthy()
		expect(node!.data.inputs).toHaveLength(2)
		expect(node!.data.inputs.map((p) => p.id)).toContain('in-text')
		expect(node!.data.inputs.map((p) => p.id)).toContain('in-resource')

		// Second load: same node with NEW (correct) port config (in-json only), same position/size
		const newPortsNode = makeNode({
			id: 'sl-1',
			worldX: 100,
			worldY: 100,
			width: oldPortsNode.width,
			height: oldPortsNode.height,
			inputs: [{ id: 'in-json', label: '布局JSON', mediaType: 'text' }],
			outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
		})

		const blueprint2: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [newPortsNode],
			edges: [],
			legacyResources: {}
		}

		scene.loadBlueprint(blueprint2)

		// Node should still exist (incremental update, not destroyed/recreated) with updated ports
		node = scene.getBlueprintNode('sl-1')
		expect(node).toBeTruthy()
		expect(node!.data.inputs).toHaveLength(1)
		expect(node!.data.inputs[0]!.id).toBe('in-json')
		expect(node!.data.inputs.map((p) => p.id)).not.toContain('in-text')
		expect(node!.data.inputs.map((p) => p.id)).not.toContain('in-resource')
		expect(node!.data.outputs).toHaveLength(1)
		expect(node!.data.outputs[0]!.id).toBe('out-0')
	})

	it('should keep same node instance when ports are identical (no unnecessary recreate)', () => {
		scene = createScene()

		const nodeData = makeNode({
			id: 'sl-2',
			worldX: 150,
			worldY: 150,
			inputs: [{ id: 'in-json', label: '布局JSON', mediaType: 'text' }],
			outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
		})

		const blueprint: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [nodeData],
			edges: [],
			legacyResources: {}
		}

		scene.loadBlueprint(blueprint)
		const node1 = scene.getBlueprintNode('sl-2')
		expect(node1).toBeTruthy()

		// Load same blueprint again - no data changes, should be same instance
		scene.loadBlueprint(blueprint)
		const node2 = scene.getBlueprintNode('sl-2')
		expect(node2).toBeTruthy()
		expect(node2).toBe(node1) // same instance - incremental path, not recreated
		expect(node2!.data.inputs).toHaveLength(1)
		expect(node2!.data.inputs[0]!.id).toBe('in-json')
	})

	it('should detect port label changes and update incrementally', () => {
		scene = createScene()

		const nodeV1 = makeNode({
			id: 'sl-3',
			worldX: 100,
			worldY: 100,
			inputs: [{ id: 'in-json', label: '旧标签', mediaType: 'text' }],
			outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
		})

		const bp1: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [nodeV1],
			edges: [],
			legacyResources: {}
		}
		scene.loadBlueprint(bp1)
		expect(scene.getBlueprintNode('sl-3')!.data.inputs[0]!.label).toBe('旧标签')

		const nodeV2 = makeNode({
			id: 'sl-3',
			worldX: 100,
			worldY: 100,
			width: nodeV1.width,
			height: nodeV1.height,
			inputs: [{ id: 'in-json', label: '布局JSON', mediaType: 'text' }],
			outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
		})

		const bp2: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [nodeV2],
			edges: [],
			legacyResources: {}
		}
		scene.loadBlueprint(bp2)
		expect(scene.getBlueprintNode('sl-3')!.data.inputs[0]!.label).toBe('布局JSON')
	})

	it('should detect port mediaType changes and update incrementally', () => {
		scene = createScene()

		const nodeV1 = makeNode({
			id: 'sl-4',
			worldX: 100,
			worldY: 100,
			inputs: [{ id: 'in-json', label: '布局JSON', mediaType: 'text' }],
			outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
		})

		const bp1: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [nodeV1],
			edges: [],
			legacyResources: {}
		}
		scene.loadBlueprint(bp1)
		expect(scene.getBlueprintNode('sl-4')!.data.inputs[0]!.mediaType).toBe('text')

		const nodeV2 = makeNode({
			id: 'sl-4',
			worldX: 100,
			worldY: 100,
			width: nodeV1.width,
			height: nodeV1.height,
			inputs: [{ id: 'in-json', label: '布局JSON', mediaType: 'generic' }],
			outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
		})

		const bp2: BlueprintData = {
			version: 2,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodes: [nodeV2],
			edges: [],
			legacyResources: {}
		}
		scene.loadBlueprint(bp2)
		expect(scene.getBlueprintNode('sl-4')!.data.inputs[0]!.mediaType).toBe('generic')
	})
})
