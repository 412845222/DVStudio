import { describe, it, expect, afterEach } from 'vitest'
import { BlueprintScene } from '@/engine/blueprint/BlueprintScene'
import {
	workflowStateToLegacyBlueprint,
	legacyBlueprintToWorkflowState
} from '@/views/AIWorkflow/blueprint-bridge/workflowStateAdapter'
import { getDefaultNodeData, DEFAULT_NODE_SIZES } from '@/engine/blueprint/types'
import { DeleteSelectionCommand } from '@/engine/blueprint/commands/DeleteSelectionCommand'
import type { LegacyBlueprintData } from '@/engine/blueprint/types'
import type { WorkflowState } from '@/aiworkflow/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')

function createScene(): BlueprintScene {
	const canvas = document.createElement('canvas')
	canvas.width = 1920
	canvas.height = 1080
	return new BlueprintScene(canvas)
}

function generateId(): string {
	return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function legacyToFlatNodes(saved: LegacyBlueprintData) {
	if (Array.isArray((saved as any).nodes)) {
		return { nodes: (saved as any).nodes, edges: (saved as any).edges || [] }
	}
	const { nodesById = {}, nodeOrder = [], edgesById = {}, edgeOrder = [] } = saved as any
	const nodes = nodeOrder.map((id: string) => nodesById[id]).filter(Boolean)
	const edges = edgeOrder.map((id: string) => edgesById[id]).filter(Boolean)
	return { nodes, edges }
}

describe('Blueprint Data Compatibility', () => {
	let scene: BlueprintScene

	afterEach(() => {
		if (scene) {
			scene.dispose()
		}
	})

	describe('loadBlueprint with sample data', () => {
		it('should load blueprint_test_data.json without errors', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData

			expect(() => scene.loadBlueprint(data)).not.toThrow()
		})

		it('should preserve all node and edge counts after load → save round-trip', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			const origFlat = legacyToFlatNodes(data as any)
			const originalNodeCount = origFlat.nodes.length
			const originalEdgeCount = origFlat.edges.length

			scene.loadBlueprint(data)
			const saved = scene.serializeLegacy()
			const flat = legacyToFlatNodes(saved)

			expect(flat.nodes.length).toBe(originalNodeCount)
			expect(flat.edges.length).toBe(originalEdgeCount)
			expect(saved.viewport).toBeDefined()
		})

		it('should preserve node positions, sizes, types, titles after load → save', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			const origFlat = legacyToFlatNodes(data as any)

			scene.loadBlueprint(data)
			const saved = scene.serializeLegacy()
			const flat = legacyToFlatNodes(saved)

			for (const origNode of origFlat.nodes) {
				const origId = origNode.id
				const savedNode = flat.nodes.find((n: any) => n.id === origId)
				expect(savedNode).toBeDefined()
				const sx = savedNode!.worldX ?? savedNode!.x
				const sy = savedNode!.worldY ?? savedNode!.y
				const ox = origNode.worldX ?? origNode.x
				const oy = origNode.worldY ?? origNode.y
				expect(sx).toBeCloseTo(ox, 0)
				expect(sy).toBeCloseTo(oy, 0)
				expect(savedNode!.width).toBe(origNode.width)
				expect(savedNode!.height).toBe(origNode.height)
				expect(savedNode!.type).toBe(origNode.type)
				expect(savedNode!.title).toBe(origNode.title)
			}
		})

		it('should preserve connections after load → save', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			const origFlat = legacyToFlatNodes(data as any)
			const edgeCount = origFlat.edges.length

			scene.loadBlueprint(data)
			const saved = scene.serializeLegacy()
			const flat = legacyToFlatNodes(saved)

			expect(flat.edges.length).toBe(edgeCount)
			for (const origEdge of origFlat.edges) {
				const match = flat.edges.some(
					(e: any) =>
						e.fromNodeId === origEdge.fromNodeId &&
						e.fromAnchorId === origEdge.fromAnchorId &&
						e.toNodeId === origEdge.toNodeId &&
						e.toAnchorId === origEdge.toAnchorId
				)
				expect(match).toBe(true)
			}
		})

		it('should preserve viewport after load → save', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData

			scene.loadBlueprint(data)
			const saved = scene.serializeLegacy()

			expect(saved.viewport!.zoom).toBeCloseTo(data.viewport.zoom, 2)
			expect(saved.viewport!.panX).toBeCloseTo(data.viewport.panX, 0)
			expect(saved.viewport!.panY).toBeCloseTo(data.viewport.panY, 0)
		})

		it('should not duplicate nodes on incremental loadBlueprint (signature deduplication)', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData

			scene.loadBlueprint(data)
			const count1 = scene.getAllBlueprintNodes().length

			scene.loadBlueprint(data)
			const count2 = scene.getAllBlueprintNodes().length

			expect(count2).toBe(count1)
		})
	})

	describe('workflowStateAdapter round-trip', () => {
		it('should convert LegacyBlueprintData → WorkflowState → LegacyBlueprintData preserving node count', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			scene.loadBlueprint(data)
			const legacyData = scene.serializeLegacy()
			const origFlat = legacyToFlatNodes(legacyData as any)

			const partial = legacyBlueprintToWorkflowState(legacyData)
			const workflowState = {
				nodesById: partial.nodesById ?? {},
				edgesById: partial.edgesById ?? {},
				viewport: legacyData.viewport,
				selectedNodeIds: partial.selectedNodeIds ?? [],
				nodeOrder: partial.nodeOrder ?? [],
				edgeOrder: partial.edgeOrder ?? [],
				resourcesById: partial.resourcesById ?? {},
				resourceOrder: partial.resourceOrder ?? [],
				savedSelectionFrames: partial.savedSelectionFrames ?? [],
				...partial
			} as unknown as WorkflowState

			const backToLegacy = workflowStateToLegacyBlueprint(workflowState)
			const rtFlat = legacyToFlatNodes(backToLegacy as any)

			expect(rtFlat.nodes.length).toBe(origFlat.nodes.length)
		})

		it('should preserve node IDs through adapter round-trip', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			scene.loadBlueprint(data)
			const legacyData = scene.serializeLegacy()
			const origFlat = legacyToFlatNodes(legacyData as any)

			const partial = legacyBlueprintToWorkflowState(legacyData)
			const workflowState = {
				nodesById: partial.nodesById ?? {},
				edgesById: partial.edgesById ?? {},
				viewport: legacyData.viewport,
				selectedNodeIds: partial.selectedNodeIds ?? [],
				nodeOrder: partial.nodeOrder ?? [],
				edgeOrder: partial.edgeOrder ?? [],
				resourcesById: partial.resourcesById ?? {},
				resourceOrder: partial.resourceOrder ?? [],
				savedSelectionFrames: partial.savedSelectionFrames ?? [],
				...partial
			} as unknown as WorkflowState

			const backToLegacy = workflowStateToLegacyBlueprint(workflowState)
			const rtFlat = legacyToFlatNodes(backToLegacy as any)
			const origIds = new Set(origFlat.nodes.map((n: any) => n.id))
			const roundTripIds = new Set(rtFlat.nodes.map((n: any) => n.id))

			expect(roundTripIds).toEqual(origIds)
		})
	})

	describe('Command operations on loaded blueprint', () => {
		it('should support addNode via addBlueprintNode', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			scene.loadBlueprint(data)

			const initialCount = scene.getAllBlueprintNodes().length
			const newId = generateId()
			const nodeData = getDefaultNodeData('text', newId, 500, 500, 'Test Node')
			const node = scene.addBlueprintNode(nodeData)

			expect(scene.getAllBlueprintNodes().length).toBe(initialCount + 1)
			expect(node.id).toBe(newId)
		})

		it('should delete node via DeleteSelectionCommand and restore on undo/redo', () => {
			scene = createScene()
			const raw = readFileSync(join(PROJECT_ROOT, 'samples', 'blueprint_test_data.json'), 'utf-8')
			const data = JSON.parse(raw) as LegacyBlueprintData
			scene.loadBlueprint(data)

			const firstNode = scene.getAllBlueprintNodes()[0]
			expect(firstNode).toBeDefined()
			const nodeId = firstNode!.id
			const initialCount = scene.getAllBlueprintNodes().length

			const cmd = new DeleteSelectionCommand(scene, [nodeId], [])
			scene.executeCommand(cmd)
			expect(scene.getBlueprintNode(nodeId)).toBeNull()
			expect(scene.getAllBlueprintNodes().length).toBe(initialCount - 1)

			scene.commands.undo()
			const restored = scene.getBlueprintNode(nodeId)
			expect(restored).not.toBeNull()
			expect(restored!.id).toBe(nodeId)
			expect(scene.getAllBlueprintNodes().length).toBe(initialCount)

			scene.commands.redo()
			expect(scene.getBlueprintNode(nodeId)).toBeNull()
			expect(scene.getAllBlueprintNodes().length).toBe(initialCount - 1)
		})
	})

	describe('DEFAULT_NODE_SIZES consistency', () => {
		it('should have entries for common node types', () => {
			expect(DEFAULT_NODE_SIZES.text).toBeDefined()
			expect(DEFAULT_NODE_SIZES.image).toBeDefined()
			expect(DEFAULT_NODE_SIZES.video).toBeDefined()
			expect(DEFAULT_NODE_SIZES.model3d).toBeDefined()
		})

		it('getDefaultNodeData should produce valid BlueprintNodeData for known types', () => {
			const id = generateId()
			const data = getDefaultNodeData('text', id, 100, 200, 'Hello')
			expect(data.id).toBe(id)
			expect(data.type).toBe('text')
			expect(data.worldX).toBe(100)
			expect(data.worldY).toBe(200)
			expect(data.title).toBe('Hello')
			expect(data.width).toBeGreaterThan(0)
			expect(data.height).toBeGreaterThan(0)
			expect(Array.isArray(data.inputs)).toBe(true)
			expect(Array.isArray(data.outputs)).toBe(true)
		})
	})

	describe('BlueprintLegacySaver - empty selection state serialization', () => {
		const addNode = (sc: BlueprintScene, id: string, x = 0, y = 0) => {
			const data = getDefaultNodeData('image', id, x, y, `Node-${id}`)
			return sc.addBlueprintNode(data)
		}

		it('should serialize selectedNodeIds as empty array [] (not null) when no nodes are selected', () => {
			scene = createScene()
			addNode(scene, 'sel-a', 100, 100)
			addNode(scene, 'sel-b', 500, 100)

			// Explicitly clear selection via selection manager to ensure engine SSOT is empty
			scene.selection.clearSelection()

			const saved = scene.serializeLegacy()

			// Main bug regression guard: empty selection state must be explicit [] not null
			expect(Array.isArray(saved.selectedNodeIds)).toBe(true)
			expect(saved.selectedNodeIds).toEqual([])
			expect(saved.selectedNodeId).toBeNull()
		})

		it('should preserve selected nodes after explicit selection and round-trip load→save', () => {
			scene = createScene()
			addNode(scene, 'rt1', 0, 0)
			addNode(scene, 'rt2', 400, 0)
			addNode(scene, 'rt3', 800, 0)

			const allNodes = scene.getAllBlueprintNodes()
			expect(allNodes).toHaveLength(3)

			// Select rt2 only
			scene.selection.clearSelection()
			scene.selection.select(allNodes[1])
			expect(scene.selection.getSelection().map((n) => n.id)).toEqual(['rt2'])

			const intermediate = scene.serializeLegacy()
			expect(Array.isArray(intermediate.selectedNodeIds)).toBe(true)
			expect(intermediate.selectedNodeIds).toContain('rt2')
			expect(intermediate.selectedNodeId).toBe('rt2')

			// Verify BlueprintScene.restoreSelection works for engine-level state
			const engineCheck = createScene()
			engineCheck.loadBlueprint(intermediate as any)
			const selectedIdsAfterLoad = engineCheck.selection.getSelection().map((n) => n.id)
			expect(selectedIdsAfterLoad).toContain('rt2')
			expect(selectedIdsAfterLoad).toHaveLength(1)
			engineCheck.dispose()

			// Reload into a fresh scene and verify selection is respected by scene data model
			const scene2 = createScene()
			scene2.loadBlueprint(intermediate as any)
			const reSaved = scene2.serializeLegacy()
			expect(Array.isArray(reSaved.selectedNodeIds)).toBe(true)
			expect(reSaved.selectedNodeIds).toContain('rt2')
			expect(reSaved.selectedNodeId).toBe('rt2')
			scene2.dispose()
		})
	})
})
