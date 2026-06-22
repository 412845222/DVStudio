import { describe, it, expect } from 'vitest'
import {
  findLayer,
  getLayerNodeTree,
  walkTree,
  detachNode,
  findNode,
  nodeExistsInAnyLayer,
  collectAllNames,
  makeUniqueName,
  isDescendant,
  findWorldPos,
  buildRenderPipeline,
  findLayerIdByNodeIdInLayers,
  findUserNodeTransformInLayers,
  findUserNodeWithWorldInLayers,
} from '@/core/scene/tree'
import type { VideoSceneTreeNode, VideoSceneState, VideoSceneLayer, VideoSceneNodeTransform } from '@/core/scene/types'

const createMockLayer = (nodes: VideoSceneTreeNode[] = []): VideoSceneLayer => ({
  id: 'layer-1',
  name: 'Test Layer',
  nodeTree: nodes,
})

const createMockState = (layers: VideoSceneLayer[] = []): Pick<VideoSceneState, 'layers'> => ({
  layers,
})

describe('tree', () => {
  describe('findLayer', () => {
    it('finds layer by id', () => {
      const state = createMockState([createMockLayer()])
      const layer = findLayer(state, 'layer-1')
      expect(layer).toBeDefined()
      expect(layer?.id).toBe('layer-1')
    })

    it('returns undefined for non-existent layer', () => {
      const state = createMockState([createMockLayer()])
      const layer = findLayer(state, 'non-existent')
      expect(layer).toBeUndefined()
    })
  })

  describe('getLayerNodeTree', () => {
    it('returns node tree for existing layer', () => {
      const nodes: VideoSceneTreeNode[] = [{ id: 'node-1', name: 'Node 1', category: 'user' as any, children: [] }]
      const state = createMockState([createMockLayer(nodes)])
      const tree = getLayerNodeTree(state, 'layer-1')
      expect(tree).toHaveLength(1)
    })

    it('returns empty array for non-existent layer', () => {
      const state = createMockState([createMockLayer()])
      const tree = getLayerNodeTree(state, 'non-existent')
      expect(tree).toEqual([])
    })
  })

  describe('walkTree', () => {
    it('visits all nodes', () => {
      const nodes: VideoSceneTreeNode[] = [
        { id: '1', name: 'Root', category: 'user' as any, children: [
          { id: '2', name: 'Child', category: 'user' as any, children: [] },
        ]},
      ]
      const visited: string[] = []
      walkTree(nodes, (node) => visited.push(node.id))
      expect(visited).toEqual(['1', '2'])
    })

    it('stops traversal when callback returns true', () => {
      const nodes: VideoSceneTreeNode[] = [
        { id: '1', name: 'Root', category: 'user' as any, children: [
          { id: '2', name: 'Child', category: 'user' as any, children: [] },
        ]},
      ]
      const visited: string[] = []
      walkTree(nodes, (node) => {
        visited.push(node.id)
        return node.id === '1'
      })
      expect(visited).toEqual(['1'])
    })

    it('handles empty node list', () => {
      const visited: string[] = []
      walkTree([], (node) => visited.push(node.id))
      expect(visited).toEqual([])
    })

    it('passes correct parent and list to callback', () => {
      const childNode = { id: '2', name: 'Child', category: 'user' as any, children: [] }
      const nodes: VideoSceneTreeNode[] = [{ id: '1', name: 'Root', category: 'user' as any, children: [childNode] }]
      let capturedParent: VideoSceneTreeNode | null = null
      walkTree(nodes, (node, parent) => {
        if (node.id === '2') capturedParent = parent
      })
      expect(capturedParent?.id).toBe('1')
    })
  })

  describe('detachNode', () => {
    it('removes node from tree', () => {
      const childNode = { id: '2', name: 'Child', category: 'user' as any, children: [] }
      const rootNode = { id: '1', name: 'Root', category: 'user' as any, children: [childNode] }
      const tree = [rootNode]
      const removed = detachNode(tree, '2')
      expect(removed?.id).toBe('2')
      expect(tree[0].children).toHaveLength(0)
    })

    it('returns null for non-existent node', () => {
      const tree: VideoSceneTreeNode[] = [{ id: '1', name: 'Root', category: 'user' as any, children: [] }]
      const removed = detachNode(tree, 'non-existent')
      expect(removed).toBeNull()
    })
  })

  describe('findNode', () => {
    it('finds node by id', () => {
      const nodes: VideoSceneTreeNode[] = [
        { id: '1', name: 'Root', category: 'user' as any, children: [
          { id: '2', name: 'Child', category: 'user' as any, children: [] },
        ]},
      ]
      const found = findNode(nodes, '2')
      expect(found?.id).toBe('2')
    })

    it('returns null for non-existent node', () => {
      const nodes: VideoSceneTreeNode[] = [{ id: '1', name: 'Root', category: 'user' as any, children: [] }]
      const found = findNode(nodes, 'non-existent')
      expect(found).toBeNull()
    })
  })

  describe('nodeExistsInAnyLayer', () => {
    it('returns true if node exists', () => {
      const layer = createMockLayer([{ id: '1', name: 'Node', category: 'user' as any, children: [] }])
      expect(nodeExistsInAnyLayer([layer], '1')).toBe(true)
    })

    it('returns false if node does not exist', () => {
      const layer = createMockLayer([{ id: '1', name: 'Node', category: 'user' as any, children: [] }])
      expect(nodeExistsInAnyLayer([layer], 'non-existent')).toBe(false)
    })
  })

  describe('collectAllNames', () => {
    it('collects names from all nodes', () => {
      const nodes: VideoSceneTreeNode[] = [
        { id: '1', name: 'Root', category: 'user' as any, children: [
          { id: '2', name: 'Child', category: 'user' as any, children: [] },
        ]},
      ]
      const names = collectAllNames(nodes)
      expect(names).toEqual(['Root', 'Child'])
    })

    it('handles empty tree', () => {
      const names = collectAllNames([])
      expect(names).toEqual([])
    })
  })

  describe('makeUniqueName', () => {
    it('returns base name when not used', () => {
      const name = makeUniqueName(['Other'], 'Node')
      expect(name).toBe('Node')
    })

    it('appends number when name is used', () => {
      const name = makeUniqueName(['Node'], 'Node')
      expect(name).toBe('Node 2')
    })

    it('finds next available number', () => {
      const name = makeUniqueName(['Node', 'Node 2', 'Node 3'], 'Node')
      expect(name).toBe('Node 4')
    })

    it('handles names with spaces', () => {
      const name = makeUniqueName(['My Node', 'My Node 2'], 'My Node')
      expect(name).toBe('My Node 3')
    })

    it('escapes regex special characters in base name', () => {
      const name = makeUniqueName(['Test (1)'], 'Test (1)')
      expect(name).toBe('Test (1) 2')
    })
  })

  describe('isDescendant', () => {
    it('returns true for direct child', () => {
      const nodes: VideoSceneTreeNode[] = [{
        id: '1', name: 'Root', category: 'user' as any, children: [
          { id: '2', name: 'Child', category: 'user' as any, children: [] },
        ],
      }]
      expect(isDescendant(nodes, '1', '2')).toBe(true)
    })

    it('returns true for nested descendant', () => {
      const nodes: VideoSceneTreeNode[] = [{
        id: '1', name: 'Root', category: 'user' as any, children: [{
          id: '2', name: 'Child', category: 'user' as any, children: [
            { id: '3', name: 'Grandchild', category: 'user' as any, children: [] },
          ],
        }],
      }]
      expect(isDescendant(nodes, '1', '3')).toBe(true)
    })

    it('returns false for non-descendant', () => {
      const nodes: VideoSceneTreeNode[] = [
        { id: '1', name: 'Root1', category: 'user' as any, children: [] },
        { id: '2', name: 'Root2', category: 'user' as any, children: [] },
      ]
      expect(isDescendant(nodes, '1', '2')).toBe(false)
    })

    it('returns false for non-existent ancestor', () => {
      const nodes: VideoSceneTreeNode[] = [{ id: '1', name: 'Root', category: 'user' as any, children: [] }]
      expect(isDescendant(nodes, 'non-existent', '1')).toBe(false)
    })
  })

  describe('findWorldPos', () => {
    it('finds world position of node', () => {
      const nodes: VideoSceneTreeNode[] = [
        {
          id: '1',
          name: 'Root',
          category: 'user' as any,
          transform: { x: 100, y: 200, width: 50, height: 50, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, opacity: 1 },
          children: [
            {
              id: '2',
              name: 'Child',
              category: 'user' as any,
              transform: { x: 50, y: 30, width: 20, height: 20, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, opacity: 1 },
              children: [],
            },
          ],
        },
      ]
      const result = findWorldPos(nodes, '2')
      expect(result).not.toBeNull()
      expect(result?.node.id).toBe('2')
      expect(result?.world.x).toBe(150)
      expect(result?.world.y).toBe(230)
    })

    it('returns null for non-existent node', () => {
      const nodes: VideoSceneTreeNode[] = [{ id: '1', name: 'Root', category: 'user' as any, children: [] }]
      const result = findWorldPos(nodes, 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for empty tree', () => {
      const result = findWorldPos([], '1')
      expect(result).toBeNull()
    })

    it('handles scale transformations', () => {
      const nodes: VideoSceneTreeNode[] = [
        {
          id: '1',
          name: 'Root',
          category: 'user' as any,
          transform: { x: 0, y: 0, width: 100, height: 100, scaleX: 2, scaleY: 2, scale: 2, rotation: 0, opacity: 1 },
          children: [
            {
              id: '2',
              name: 'Child',
              category: 'user' as any,
              transform: { x: 50, y: 50, width: 10, height: 10, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, opacity: 1 },
              children: [],
            },
          ],
        },
      ]
      const result = findWorldPos(nodes, '2')
      expect(result).not.toBeNull()
      expect(result?.world.scaleX).toBe(2)
      expect(result?.world.scaleY).toBe(2)
    })

    it('handles rotation transformations', () => {
      const nodes: VideoSceneTreeNode[] = [
        {
          id: '1',
          name: 'Root',
          category: 'user' as any,
          transform: { x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, scale: 1, rotation: Math.PI / 2, opacity: 1 },
          children: [],
        },
      ]
      const result = findWorldPos(nodes, '1')
      expect(result).not.toBeNull()
      expect(result?.world.rotation).toBeCloseTo(Math.PI / 2)
    })

    it('handles nodes without transform', () => {
      const nodes: VideoSceneTreeNode[] = [
        {
          id: '1',
          name: 'Root',
          category: 'user' as any,
          children: [],
        },
      ]
      const result = findWorldPos(nodes, '1')
      expect(result).not.toBeNull()
      expect(result?.world.scaleX).toBe(1)
      expect(result?.world.scaleY).toBe(1)
    })
  })

  describe('buildRenderPipeline', () => {
    it('builds pipeline for single node', () => {
      const layer = createMockLayer([
        { id: '1', name: 'Node', category: 'user' as any, userType: 'rect' as any, children: [] },
      ])
      const state = createMockState([layer])
      const steps = buildRenderPipeline(state)
      expect(steps).toHaveLength(1)
      expect(steps[0].nodeId).toBe('1')
      expect(steps[0].layerId).toBe('layer-1')
      expect(steps[0].category).toBe('user')
      expect(steps[0].type).toBe('rect')
    })

    it('builds pipeline for nested nodes', () => {
      const layer = createMockLayer([
        {
          id: '1',
          name: 'Root',
          category: 'user' as any,
          userType: 'rect' as any,
          children: [
            { id: '2', name: 'Child', category: 'user' as any, userType: 'text' as any, children: [] },
          ],
        },
      ])
      const state = createMockState([layer])
      const steps = buildRenderPipeline(state)
      expect(steps).toHaveLength(2)
    })

    it('includes project kind nodes', () => {
      const layer: VideoSceneLayer = {
        id: 'layer-1',
        name: 'Test Layer',
        nodeTree: [
          { id: '1', name: 'Project Node', category: 'project' as any, projectKind: 'image' as any, props: {} },
        ],
      }
      const state = createMockState([layer])
      const steps = buildRenderPipeline(state)
      expect(steps).toHaveLength(1)
      expect(steps[0].category).toBe('project')
      expect(steps[0].type).toBe('image')
    })

    it('builds pipeline for multiple layers', () => {
      const layer1 = createMockLayer([{ id: '1', name: 'Node1', category: 'user' as any, userType: 'rect' as any, children: [] }])
      const layer2: VideoSceneLayer = {
        id: 'layer-2',
        name: 'Layer 2',
        nodeTree: [{ id: '2', name: 'Node2', category: 'user' as any, userType: 'text' as any, children: [] }],
      }
      const state = createMockState([layer1, layer2])
      const steps = buildRenderPipeline(state)
      expect(steps).toHaveLength(2)
      expect(steps[0].layerId).toBe('layer-1')
      expect(steps[1].layerId).toBe('layer-2')
    })

    it('builds empty pipeline for empty layers', () => {
      const state = createMockState([])
      const steps = buildRenderPipeline(state)
      expect(steps).toHaveLength(0)
    })
  })

  describe('findLayerIdByNodeIdInLayers', () => {
    it('finds layer containing node', () => {
      const layer1 = createMockLayer([{ id: '1', name: 'Node1', category: 'user' as any, children: [] }])
      const layer2: VideoSceneLayer = {
        id: 'layer-2',
        name: 'Layer 2',
        nodeTree: [{ id: '2', name: 'Node2', category: 'user' as any, children: [] }],
      }
      const result = findLayerIdByNodeIdInLayers([layer1, layer2], '2')
      expect(result).toBe('layer-2')
    })

    it('returns null for non-existent node', () => {
      const layer = createMockLayer([{ id: '1', name: 'Node', category: 'user' as any, children: [] }])
      const result = findLayerIdByNodeIdInLayers([layer], 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for empty layers', () => {
      const result = findLayerIdByNodeIdInLayers([], '1')
      expect(result).toBeNull()
    })

    it('returns null for empty node id', () => {
      const layer = createMockLayer([{ id: '1', name: 'Node', category: 'user' as any, children: [] }])
      const result = findLayerIdByNodeIdInLayers([layer], '')
      expect(result).toBeNull()
    })
  })

  describe('findUserNodeTransformInLayers', () => {
    it('finds transform for user node', () => {
      const transform: VideoSceneNodeTransform = {
        x: 100,
        y: 200,
        width: 50,
        height: 30,
        scaleX: 1.5,
        scaleY: 1.5,
        scale: 1.5,
        rotation: 45,
        opacity: 0.8,
      }
      const layer = createMockLayer([
        { id: '1', name: 'UserNode', category: 'user' as any, userType: 'rect' as any, transform, children: [] },
      ])
      const result = findUserNodeTransformInLayers([layer], '1')
      expect(result).toEqual(transform)
    })

    it('returns null for project node', () => {
      const layer: VideoSceneLayer = {
        id: 'layer-1',
        name: 'Test Layer',
        nodeTree: [{ id: '1', name: 'Project', category: 'project' as any, projectKind: 'image' as any, props: {} }],
      }
      const result = findUserNodeTransformInLayers([layer], '1')
      expect(result).toBeNull()
    })

    it('returns null for non-existent node', () => {
      const layer = createMockLayer([])
      const result = findUserNodeTransformInLayers([layer], 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for empty layers', () => {
      const result = findUserNodeTransformInLayers([], '1')
      expect(result).toBeNull()
    })
  })

  describe('findUserNodeWithWorldInLayers', () => {
    it('finds user node with world coordinates', () => {
      const layer = createMockLayer([
        {
          id: '1',
          name: 'UserNode',
          category: 'user' as any,
          userType: 'rect' as any,
          transform: { x: 100, y: 200, width: 50, height: 30, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, opacity: 1 },
          children: [],
        },
      ])
      const result = findUserNodeWithWorldInLayers([layer], '1')
      expect(result).not.toBeNull()
      expect(result?.node.id).toBe('1')
      expect(result?.layerId).toBe('layer-1')
      expect(result?.world.x).toBe(100)
      expect(result?.world.y).toBe(200)
    })

    it('returns null for project node', () => {
      const layer: VideoSceneLayer = {
        id: 'layer-1',
        name: 'Test Layer',
        nodeTree: [{ id: '1', name: 'Project', category: 'project' as any, projectKind: 'image' as any, props: {} }],
      }
      const result = findUserNodeWithWorldInLayers([layer], '1')
      expect(result).toBeNull()
    })

    it('returns null for non-existent node', () => {
      const layer = createMockLayer([])
      const result = findUserNodeWithWorldInLayers([layer], 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for node without transform', () => {
      const layer = createMockLayer([
        { id: '1', name: 'UserNode', category: 'user' as any, userType: 'rect' as any, children: [] },
      ])
      const result = findUserNodeWithWorldInLayers([layer], '1')
      expect(result).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('handles deep nesting', () => {
      const createNested = (depth: number): VideoSceneTreeNode => {
        if (depth === 0) {
          return { id: 'leaf', name: 'Leaf', category: 'user' as any, children: [] }
        }
        return {
          id: `node-${depth}`,
          name: `Node ${depth}`,
          category: 'user' as any,
          children: [createNested(depth - 1)],
        }
      }
      const tree = [createNested(10)]
      const found = findNode(tree, 'leaf')
      expect(found?.id).toBe('leaf')
    })

    it('handles multiple root nodes', () => {
      const tree: VideoSceneTreeNode[] = [
        { id: '1', name: 'Root1', category: 'user' as any, children: [] },
        { id: '2', name: 'Root2', category: 'user' as any, children: [] },
      ]
      const names = collectAllNames(tree)
      expect(names).toEqual(['Root1', 'Root2'])
    })

    it('handles special characters in names', () => {
      const names = makeUniqueName(['Name (1)', 'Name (2)'], 'Name (1)')
      expect(names).toBe('Name (1) 2')
    })

    it('handles unicode in names', () => {
      const names = makeUniqueName(['节点1', '节点2'], '节点')
      expect(names).toBe('节点') // Returns base name without suffix
    })
  })
})
