import { describe, it, expect } from 'vitest'
import { useAIWorkflowDirectorConsoleInputs } from '@/views/AIWorkflow/node-business/director/useAIWorkflowDirectorConsoleInputs'
import type { WorkflowNode } from '@/aiworkflow/types'

const makeDeps = (
	overrides: Partial<Parameters<typeof useAIWorkflowDirectorConsoleInputs>[0]> = {}
) => {
	const base = {
		store: { state: { nodesById: {} as Record<string, WorkflowNode>, resourcesById: {} } },
		connectedTextInputValue: () => '',
		getFirstIncomingEdge: () => null
	}
	return { ...base, ...overrides } as Parameters<typeof useAIWorkflowDirectorConsoleInputs>[0]
}

describe('useAIWorkflowDirectorConsoleInputs', () => {
	describe('parseLayoutJson', () => {
		const { parseLayoutJson } = useAIWorkflowDirectorConsoleInputs(makeDeps())

		it('should return empty items for empty string', () => {
			expect(parseLayoutJson('')).toEqual({ layoutItems: [] })
		})

		it('should parse layoutItems field', () => {
			const json = JSON.stringify({ layoutItems: [{ id: 'a', name: 'Cube' }] })
			const result = parseLayoutJson(json)
			expect(result.layoutItems).toHaveLength(1)
			expect(result.layoutItems[0].name).toBe('Cube')
		})

		it('should fall back to items field', () => {
			const json = JSON.stringify({ items: [{ id: 'b' }] })
			const result = parseLayoutJson(json)
			expect(result.layoutItems).toHaveLength(1)
		})

		it('should return empty items when neither field exists', () => {
			const json = JSON.stringify({ foo: 'bar' })
			expect(parseLayoutJson(json).layoutItems).toEqual([])
		})

		it('should extract camera when present', () => {
			const json = JSON.stringify({
				layoutItems: [],
				camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } }
			})
			const result = parseLayoutJson(json)
			expect(result.camera?.position).toEqual({ x: 1, y: 2, z: 3 })
		})

		it('should return empty items for invalid JSON', () => {
			expect(parseLayoutJson('{invalid').layoutItems).toEqual([])
		})
	})

	describe('mapModelBindings', () => {
		const { mapModelBindings } = useAIWorkflowDirectorConsoleInputs(makeDeps())

		it('should return empty array for undefined bindings', () => {
			expect(mapModelBindings(undefined, {})).toEqual([])
		})

		it('should filter out bindings without objectId', () => {
			const bindings = [
				{ objectId: 'obj1', modelUrl: 'a.glb' },
				{ objectId: '', modelUrl: 'b.glb' }
			] as any
			const result = mapModelBindings(bindings, {})
			expect(result).toHaveLength(1)
			expect(result[0].objectId).toBe('obj1')
		})

		it('should map modelUrl and modelProjectRelativePath', () => {
			const bindings = [
				{ objectId: 'obj1', modelUrl: 'a.glb', modelProjectRelativePath: 'Content/a.glb' }
			] as any
			const result = mapModelBindings(bindings, {})
			expect(result[0].modelUrl).toBe('a.glb')
			expect(result[0].modelProjectRelativePath).toBe('Content/a.glb')
		})

		it('should fall back to modelAssetUrl / modelAssetProjectRelativePath', () => {
			const bindings = [
				{ objectId: 'obj1', modelAssetUrl: 'x.glb', modelAssetProjectRelativePath: 'Content/x.glb' }
			] as any
			const result = mapModelBindings(bindings, {})
			expect(result[0].modelUrl).toBe('x.glb')
			expect(result[0].modelProjectRelativePath).toBe('Content/x.glb')
		})

		it('should set modelAbsolutePath from modelAssetPath', () => {
			const bindings = [{ objectId: 'obj1', modelAssetPath: '/abs/path.glb' }] as any
			const result = mapModelBindings(bindings, {})
			expect(result[0].modelAbsolutePath).toBe('/abs/path.glb')
		})
	})

	describe('resolveUpstreamSceneLayoutNode', () => {
		it('should return null when no incoming edge', () => {
			const deps = makeDeps({ getFirstIncomingEdge: () => null })
			const { resolveUpstreamSceneLayoutNode } = useAIWorkflowDirectorConsoleInputs(deps)
			expect(resolveUpstreamSceneLayoutNode('n1')).toBeNull()
		})

		it('should return null when upstream node is not found', () => {
			const deps = makeDeps({
				getFirstIncomingEdge: () => ({ fromNodeId: 'missing' }),
				store: { state: { nodesById: {}, resourcesById: {} } } as any
			})
			const { resolveUpstreamSceneLayoutNode } = useAIWorkflowDirectorConsoleInputs(deps)
			expect(resolveUpstreamSceneLayoutNode('n1')).toBeNull()
		})

		it('should return upstream scene-layout node', () => {
			const upstream = { id: 'up', type: 'scene-layout' } as WorkflowNode
			const deps = makeDeps({
				getFirstIncomingEdge: () => ({ fromNodeId: 'up' }),
				store: { state: { nodesById: { up: upstream }, resourcesById: {} } } as any
			})
			const { resolveUpstreamSceneLayoutNode } = useAIWorkflowDirectorConsoleInputs(deps)
			expect(resolveUpstreamSceneLayoutNode('n1')).toBe(upstream)
		})

		it('should accept scene-understanding as upstream', () => {
			const upstream = { id: 'up', type: 'scene-understanding' } as WorkflowNode
			const deps = makeDeps({
				getFirstIncomingEdge: () => ({ fromNodeId: 'up' }),
				store: { state: { nodesById: { up: upstream }, resourcesById: {} } } as any
			})
			const { resolveUpstreamSceneLayoutNode } = useAIWorkflowDirectorConsoleInputs(deps)
			expect(resolveUpstreamSceneLayoutNode('n1')).toBe(upstream)
		})

		it('should reject other node types', () => {
			const upstream = { id: 'up', type: 'text' } as WorkflowNode
			const deps = makeDeps({
				getFirstIncomingEdge: () => ({ fromNodeId: 'up' }),
				store: { state: { nodesById: { up: upstream }, resourcesById: {} } } as any
			})
			const { resolveUpstreamSceneLayoutNode } = useAIWorkflowDirectorConsoleInputs(deps)
			expect(resolveUpstreamSceneLayoutNode('n1')).toBeNull()
		})
	})

	describe('buildScenePayload', () => {
		it('should build payload from connected JSON and settings', () => {
			const json = JSON.stringify({
				layoutItems: [{ id: 'a' }],
				camera: { position: { x: 1, y: 1, z: 1 } }
			})
			const upstream = {
				id: 'up',
				type: 'scene-layout',
				sceneLayoutSettings: { manualModelBindings: [{ objectId: 'obj1', modelUrl: 'm.glb' }] }
			} as unknown as WorkflowNode
			const settings = {
				cameraTracks: [{ id: 't1' }],
				activeCameraTrackId: 't1',
				lightRig: { preset: 'three-point', exposure: 1, lights: [] },
				directorDataVersion: 3
			} as any
			const deps = makeDeps({
				connectedTextInputValue: () => json,
				getFirstIncomingEdge: () => ({ fromNodeId: 'up' }),
				store: {
					state: {
						nodesById: { up: upstream },
						resourcesById: {},
						projectRootPath: '/proj'
					}
				} as any
			})
			const { buildScenePayload } = useAIWorkflowDirectorConsoleInputs(deps)
			const payload = buildScenePayload('n1', settings)
			expect(payload.nodeId).toBe('n1')
			expect(payload.layoutItems).toHaveLength(1)
			expect(payload.camera?.position).toEqual({ x: 1, y: 1, z: 1 })
			expect(payload.modelBindings).toHaveLength(1)
			expect(payload.projectRoot).toBe('/proj')
			expect(payload.cameraTracks).toEqual([{ id: 't1' }])
			expect(payload.activeCameraTrackId).toBe('t1')
			expect(payload.directorDataVersion).toBe(3)
		})

		it('should handle missing settings gracefully', () => {
			const deps = makeDeps({
				connectedTextInputValue: () => '',
				getFirstIncomingEdge: () => null
			})
			const { buildScenePayload } = useAIWorkflowDirectorConsoleInputs(deps)
			const payload = buildScenePayload('n1')
			expect(payload.layoutItems).toEqual([])
			expect(payload.modelBindings).toEqual([])
			expect(payload.cameraTracks).toBeUndefined()
		})
	})
})
