import { describe, it, expect } from 'vitest'
import {
	findNextNodePositionFromSource,
	NODE_SPACING_X,
	NODE_SPACING_Y,
	NODE_HEIGHT
} from '@/aiworkflow/nodePositionUtils'
import type { WorkflowNode, WorkflowEdge } from '@/aiworkflow/types'

const createNode = (id: string, worldX: number, worldY: number): WorkflowNode =>
	({
		id,
		nodeType: 'image',
		title: `Node ${id}`,
		worldX: String(worldX),
		worldY: String(worldY),
		inputs: [],
		outputs: [],
		isLocked: false,
		isCollapsed: false
	}) as unknown as WorkflowNode

const createEdge = (id: string, fromNodeId: string, toNodeId: string): WorkflowEdge =>
	({
		id,
		fromNodeId,
		toNodeId,
		fromAnchorId: 'out-0',
		toAnchorId: 'in-0'
	}) as unknown as WorkflowEdge

describe('nodePositionUtils / findNextNodePositionFromSource', () => {
	it('returns default position when source node does not exist', () => {
		const state = {
			nodesById: {},
			edgesById: {}
		}
		const result = findNextNodePositionFromSource('nonexistent', state)
		expect(result).toEqual({ worldX: 100, worldY: 100 })
	})

	it('places new node to the right of source when no downstream nodes exist', () => {
		const sourceNode = createNode('source', 100, 200)
		const state = {
			nodesById: { source: sourceNode },
			edgesById: {}
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(100 + NODE_SPACING_X)
		expect(result.worldY).toBe(200)
	})

	it('places new node to the right of the rightmost downstream node', () => {
		const sourceNode = createNode('source', 100, 200)
		const downstream1 = createNode('downstream1', 400, 200)
		const downstream2 = createNode('downstream2', 700, 200)
		const edge1 = createEdge('edge1', 'source', 'downstream1')
		const edge2 = createEdge('edge2', 'source', 'downstream2')
		const state = {
			nodesById: { source: sourceNode, downstream1: downstream1, downstream2: downstream2 },
			edgesById: { edge1: edge1, edge2: edge2 }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(700 + NODE_SPACING_X)
		expect(result.worldY).toBe(200)
	})

	it('offsets vertically when multiple downstream nodes are on the same horizontal line', () => {
		const sourceNode = createNode('source', 100, 200)
		const downstream1 = createNode('downstream1', 400, 200)
		const downstream2 = createNode('downstream2', 700, 200)
		const downstream3 = createNode('downstream3', 1000, 200)
		const edge1 = createEdge('edge1', 'source', 'downstream1')
		const edge2 = createEdge('edge2', 'source', 'downstream2')
		const edge3 = createEdge('edge3', 'source', 'downstream3')
		const state = {
			nodesById: {
				source: sourceNode,
				downstream1: downstream1,
				downstream2: downstream2,
				downstream3: downstream3
			},
			edgesById: { edge1: edge1, edge2: edge2, edge3: edge3 }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(1000 + NODE_SPACING_X)
		expect(result.worldY).toBe(200 + NODE_SPACING_Y * Math.ceil(3 / 3))
	})

	it('offsets vertically by multiple rows when there are more than 3 downstream nodes', () => {
		const sourceNode = createNode('source', 100, 200)
		const downstream1 = createNode('downstream1', 400, 200)
		const downstream2 = createNode('downstream2', 700, 200)
		const downstream3 = createNode('downstream3', 1000, 200)
		const downstream4 = createNode('downstream4', 1300, 200)
		const edge1 = createEdge('edge1', 'source', 'downstream1')
		const edge2 = createEdge('edge2', 'source', 'downstream2')
		const edge3 = createEdge('edge3', 'source', 'downstream3')
		const edge4 = createEdge('edge4', 'source', 'downstream4')
		const state = {
			nodesById: {
				source: sourceNode,
				downstream1: downstream1,
				downstream2: downstream2,
				downstream3: downstream3,
				downstream4: downstream4
			},
			edgesById: { edge1: edge1, edge2: edge2, edge3: edge3, edge4: edge4 }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(1300 + NODE_SPACING_X)
		expect(result.worldY).toBe(200 + NODE_SPACING_Y * Math.ceil(4 / 3))
	})

	it('does not offset vertically when downstream nodes are already vertically distributed', () => {
		const sourceNode = createNode('source', 100, 200)
		const downstream1 = createNode('downstream1', 400, 200)
		const downstream2 = createNode('downstream2', 400, 500)
		const downstream3 = createNode('downstream3', 400, 800)
		const edge1 = createEdge('edge1', 'source', 'downstream1')
		const edge2 = createEdge('edge2', 'source', 'downstream2')
		const edge3 = createEdge('edge3', 'source', 'downstream3')
		const state = {
			nodesById: {
				source: sourceNode,
				downstream1: downstream1,
				downstream2: downstream2,
				downstream3: downstream3
			},
			edgesById: { edge1: edge1, edge2: edge2, edge3: edge3 }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(400 + NODE_SPACING_X)
		expect(result.worldY).toBe(200)
	})

	it('correctly handles downstream nodes with mixed horizontal and vertical distribution', () => {
		const sourceNode = createNode('source', 100, 200)
		const downstream1 = createNode('downstream1', 400, 200)
		const downstream2 = createNode('downstream2', 700, 200)
		const downstream3 = createNode('downstream3', 400, 450)
		const edge1 = createEdge('edge1', 'source', 'downstream1')
		const edge2 = createEdge('edge2', 'source', 'downstream2')
		const edge3 = createEdge('edge3', 'source', 'downstream3')
		const state = {
			nodesById: {
				source: sourceNode,
				downstream1: downstream1,
				downstream2: downstream2,
				downstream3: downstream3
			},
			edgesById: { edge1: edge1, edge2: edge2, edge3: edge3 }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(700 + NODE_SPACING_X)
		expect(result.worldY).toBe(200)
	})

	it('correctly handles edges with undefined fromNodeId', () => {
		const sourceNode = createNode('source', 100, 200)
		const downstream1 = createNode('downstream1', 400, 200)
		const edge1 = createEdge('edge1', 'source', 'downstream1')
		const invalidEdge = {
			...edge1,
			id: 'invalid',
			fromNodeId: undefined
		} as unknown as WorkflowEdge
		const state = {
			nodesById: { source: sourceNode, downstream1: downstream1 },
			edgesById: { edge1: edge1, invalid: invalidEdge }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(400 + NODE_SPACING_X)
		expect(result.worldY).toBe(200)
	})

	it('correctly handles edges pointing to non-existent nodes', () => {
		const sourceNode = createNode('source', 100, 200)
		const edge1 = createEdge('edge1', 'source', 'nonexistent')
		const state = {
			nodesById: { source: sourceNode },
			edgesById: { edge1: edge1 }
		}
		const result = findNextNodePositionFromSource('source', state)
		expect(result.worldX).toBe(100 + NODE_SPACING_X)
		expect(result.worldY).toBe(200)
	})

	it('simulates sequential bulk export: each new node is placed to the right of the previous one', () => {
		const sourceNode = createNode('source', 100, 200)
		const state: {
			nodesById: Record<string, WorkflowNode>
			edgesById: Record<string, WorkflowEdge>
		} = {
			nodesById: { source: sourceNode },
			edgesById: {}
		}

		const positions: Array<{ x: number; y: number }> = []
		for (let i = 0; i < 5; i++) {
			const pos = findNextNodePositionFromSource('source', state)
			positions.push({ x: pos.worldX, y: pos.worldY })
			const newId = `exported-${i}`
			state.nodesById[newId] = createNode(newId, pos.worldX, pos.worldY)
			state.edgesById[`edge-${i}`] = createEdge(`edge-${i}`, 'source', newId)
		}

		for (let i = 1; i < positions.length; i++) {
			expect(positions[i].x).toBeGreaterThan(positions[i - 1].x)
		}

		for (let i = 0; i < positions.length; i++) {
			expect(positions[i].x).toBeGreaterThan(100)
		}

		const uniqueX = new Set(positions.map((p) => p.x))
		expect(uniqueX.size).toBe(positions.length)
	})

	it('sequential bulk export does not produce overlapping node positions', () => {
		const sourceNode = createNode('source', 100, 200)
		const state: {
			nodesById: Record<string, WorkflowNode>
			edgesById: Record<string, WorkflowEdge>
		} = {
			nodesById: { source: sourceNode },
			edgesById: {}
		}

		const placed: Array<{ x: number; y: number }> = []
		for (let i = 0; i < 4; i++) {
			const pos = findNextNodePositionFromSource('source', state)
			for (const existing of placed) {
				const dx = Math.abs(pos.worldX - existing.x)
				const dy = Math.abs(pos.worldY - existing.y)
				expect(dx >= NODE_SPACING_X || dy >= NODE_SPACING_Y).toBe(true)
			}
			placed.push({ x: pos.worldX, y: pos.worldY })
			const newId = `exp-${i}`
			state.nodesById[newId] = createNode(newId, pos.worldX, pos.worldY)
			state.edgesById[`e-${i}`] = createEdge(`e-${i}`, 'source', newId)
		}
	})
})
