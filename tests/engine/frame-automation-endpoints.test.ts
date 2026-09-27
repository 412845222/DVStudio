import { describe, it, expect, afterEach } from 'vitest'
import { BlueprintScene } from '@/engine/blueprint/BlueprintScene'
import { getDefaultNodeData } from '@/engine/blueprint/types'

let scene: BlueprintScene
afterEach(() => scene?.dispose())
function setup() {
	scene = new BlueprintScene(document.createElement('canvas'))
	for (const id of ['a', 'b', 'x'])
		scene.addBlueprintNode({ ...getDefaultNodeData('text', id, 0, 0), id })
	scene.addSelectionFrameInternal(['a', 'b'], 'flow', 'f', {
		enabled: true,
		loopCount: 1,
		inputBindings: [{ id: 'in', nodeId: 'a', anchorId: 'in-0' }],
		outputBindings: [{ id: 'out', nodeId: 'b', anchorId: 'out-0' }]
	})
	scene.addConnection({
		id: 'edge',
		fromNodeId: 'x',
		fromAnchorId: 'out-0',
		toNodeId: 'a',
		toAnchorId: 'in-0',
		toFrame: { frameId: 'f', portId: 'in' }
	})
}
describe('stable frame endpoint lifecycle', () => {
	it('rebinds without reconnecting and restores concrete projection through undo/redo', () => {
		setup()
		expect(
			scene.configureFrameAutomation('f', {
				inputBindings: [{ id: 'in', nodeId: 'b', anchorId: 'in-0' }]
			})
		).toBe(true)
		expect(scene.getConnection('edge')?.data.toNodeId).toBe('b')
		scene.undo()
		expect(scene.getConnection('edge')?.data.toNodeId).toBe('a')
		scene.redo()
		expect(scene.getConnection('edge')?.data.toNodeId).toBe('b')
	})
	it('expands endpoints on ungroup and restores the frame reference on undo', () => {
		setup()
		scene.deleteSavedSelectionFrame('f')
		expect(scene.getConnection('edge')?.data.toFrame).toBeUndefined()
		expect(scene.getConnection('edge')?.data.toNodeId).toBe('a')
		scene.undo()
		expect(scene.getConnection('edge')?.data.toFrame).toEqual({ frameId: 'f', portId: 'in' })
	})
	it('preserves references and disabled config through legacy serialization and reload', () => {
		setup()
		scene.configureFrameAutomation('f', { enabled: false })
		const data = scene.serializeLegacy()
		scene.loadBlueprint(data)
		expect(scene.getConnection('edge')?.data.toFrame).toEqual({ frameId: 'f', portId: 'in' })
		expect(scene.getFrameAutomation('f')?.enabled).toBe(false)
		expect(scene.getFrameAutomation('f')?.inputBindings).toHaveLength(1)
		data.savedSelectionFrames![0].automation!.enabled = true
		scene.loadBlueprint(data)
		expect(scene.getFrameAutomation('f')?.enabled).toBe(true)
	})
	it('removes port references without losing edges and restores them on undo', () => {
		setup()
		scene.configureFrameAutomation('f', { inputBindings: [] })
		expect(scene.getConnection('edge')?.data.toFrame).toBeUndefined()
		scene.undo()
		expect(scene.getConnection('edge')?.data.toFrame?.portId).toBe('in')
	})
	it('requires frame identity for new external gestures but allows internal wiring', () => {
		setup()
		const edge = scene.getConnection('edge')!.data
		expect(scene.isFrameBoundaryConnectionAllowed(edge)).toBe(true)
		expect(scene.isFrameBoundaryConnectionAllowed({ ...edge, toFrame: undefined })).toBe(false)
		expect(
			scene.isFrameBoundaryConnectionAllowed({ ...edge, fromNodeId: 'b', toFrame: undefined })
		).toBe(true)
	})
})
