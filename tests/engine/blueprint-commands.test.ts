import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteSelectionCommand } from '@/engine/blueprint/commands/DeleteSelectionCommand'
import { ResizeNodeCommand } from '@/engine/blueprint/commands/ResizeNodeCommand'
import { CreateConnectionCommand } from '@/engine/blueprint/commands/CreateConnectionCommand'
import type { BlueprintScene } from '@/engine/blueprint/BlueprintScene'
import type { BlueprintNode } from '@/engine/blueprint/BlueprintNode'
import type { BlueprintNodeData, ConnectionData } from '@/engine/blueprint/types'

function createMockNode(data: Partial<BlueprintNodeData>): BlueprintNode {
  const nodeData: BlueprintNodeData = {
    id: 'node-1',
    type: 'test',
    title: 'Test Node',
    worldX: 100,
    worldY: 200,
    width: 200,
    height: 100,
    inputs: [],
    outputs: [],
    ...data,
  }
  return {
    id: nodeData.id,
    data: nodeData,
    setPosition: vi.fn(),
    updateSize: vi.fn(),
    setData: vi.fn(),
  } as unknown as BlueprintNode
}

function createMockConnection(data: Partial<ConnectionData>) {
  const connData: ConnectionData = {
    id: 'conn-1',
    fromNodeId: 'node-a',
    fromAnchorId: 'out',
    toNodeId: 'node-b',
    toAnchorId: 'in',
    ...data,
  }
  return {
    id: connData.id,
    data: connData,
  }
}

describe('DeleteSelectionCommand', () => {
  let scene: ReturnType<typeof createMockScene>

  function createMockScene() {
    const nodes = new Map<string, BlueprintNode>()
    const connections = new Map<string, ReturnType<typeof createMockConnection>>()

    return {
      nodes,
      connections,
      getBlueprintNode: vi.fn((id: string) => nodes.get(id) ?? null),
      getConnection: vi.fn((id: string) => connections.get(id) ?? null),
      getAllConnections: vi.fn(() => Array.from(connections.values())),
      removeBlueprintNode: vi.fn((id: string) => {
        nodes.delete(id)
      }),
      addBlueprintNode: vi.fn((data: BlueprintNodeData) => {
        const node = createMockNode(data)
        nodes.set(data.id, node)
        return node
      }),
      removeConnection: vi.fn((id: string) => {
        connections.delete(id)
      }),
      addConnection: vi.fn((data: ConnectionData) => {
        const conn = createMockConnection(data)
        connections.set(data.id, conn as any)
        return conn as any
      }),
      updateAllConnectionEndpoints: vi.fn(),
      requestRedraw: vi.fn(),
    }
  }

  beforeEach(() => {
    scene = createMockScene()
  })

  it('should delete selected nodes on execute', () => {
    const node1 = createMockNode({ id: 'n1', worldX: 100, worldY: 200, width: 200, height: 100 })
    const node2 = createMockNode({ id: 'n2', worldX: 300, worldY: 400, width: 200, height: 100 })
    scene.nodes.set('n1', node1)
    scene.nodes.set('n2', node2)

    const cmd = new DeleteSelectionCommand(
      scene as unknown as BlueprintScene,
      ['n1'],
      []
    )

    cmd.execute()

    expect(scene.removeBlueprintNode).toHaveBeenCalledWith('n1')
    expect(scene.nodes.has('n1')).toBe(false)
    expect(scene.nodes.has('n2')).toBe(true)
  })

  it('should delete selected connections on execute (not connected to deleted nodes)', () => {
    const nodeA = createMockNode({ id: 'a' })
    const nodeB = createMockNode({ id: 'b' })
    const nodeC = createMockNode({ id: 'c' })
    scene.nodes.set('a', nodeA)
    scene.nodes.set('b', nodeB)
    scene.nodes.set('c', nodeC)

    const connAB = createMockConnection({ id: 'ab', fromNodeId: 'a', fromAnchorId: 'out', toNodeId: 'b', toAnchorId: 'in' })
    const connBC = createMockConnection({ id: 'bc', fromNodeId: 'b', fromAnchorId: 'out', toNodeId: 'c', toAnchorId: 'in' })
    scene.connections.set('ab', connAB as any)
    scene.connections.set('bc', connBC as any)

    const cmd = new DeleteSelectionCommand(
      scene as unknown as BlueprintScene,
      [],
      ['bc']
    )

    cmd.execute()

    expect(scene.removeConnection).toHaveBeenCalledWith('bc')
    expect(scene.removeConnection).not.toHaveBeenCalledWith('ab')
  })

  it('should also delete connections attached to deleted nodes', () => {
    const nodeA = createMockNode({ id: 'a' })
    const nodeB = createMockNode({ id: 'b' })
    scene.nodes.set('a', nodeA)
    scene.nodes.set('b', nodeB)

    const connAB = createMockConnection({ id: 'ab', fromNodeId: 'a', toNodeId: 'b' })
    scene.connections.set('ab', connAB as any)

    const cmd = new DeleteSelectionCommand(
      scene as unknown as BlueprintScene,
      ['a'],
      []
    )

    expect(scene.getAllConnections).toHaveBeenCalled()
    const storedConns = (cmd as any).deletedConnections
    expect(storedConns.some((c: ConnectionData) => c.id === 'ab')).toBe(true)
  })

  it('should restore deleted nodes and connections on undo', () => {
    const node1 = createMockNode({ id: 'n1', worldX: 100, worldY: 200, width: 200, height: 100, title: 'Node1' })
    scene.nodes.set('n1', node1)
    const conn1 = createMockConnection({ id: 'c1', fromNodeId: 'n1', toNodeId: 'n2' })
    scene.connections.set('c1', conn1 as any)
    const node2 = createMockNode({ id: 'n2' })
    scene.nodes.set('n2', node2)

    const cmd = new DeleteSelectionCommand(
      scene as unknown as BlueprintScene,
      ['n1'],
      []
    )

    cmd.execute()
    expect(scene.nodes.has('n1')).toBe(false)

    cmd.undo()

    expect(scene.addBlueprintNode).toHaveBeenCalled()
    expect(scene.updateAllConnectionEndpoints).toHaveBeenCalled()
    expect(scene.requestRedraw).toHaveBeenCalled()
  })

  it('should have type "delete-selection"', () => {
    const cmd = new DeleteSelectionCommand(scene as unknown as BlueprintScene, [], [])
    expect(cmd.type).toBe('delete-selection')
  })
})

describe('ResizeNodeCommand', () => {
  let scene: ReturnType<typeof createMockScene>
  let node: BlueprintNode

  function createMockScene() {
    const nodes = new Map<string, BlueprintNode>()
    return {
      nodes,
      getBlueprintNode: vi.fn((id: string) => nodes.get(id) ?? null),
      updateAllConnectionEndpoints: vi.fn(),
      requestRedraw: vi.fn(),
    }
  }

  beforeEach(() => {
    scene = createMockScene()
    node = createMockNode({ id: 'n1', worldX: 100, worldY: 200, width: 200, height: 100 })
    scene.nodes.set('n1', node)
  })

  it('should apply end size and position on execute', () => {
    const cmd = new ResizeNodeCommand(
      scene as unknown as BlueprintScene,
      node,
      100, 200, 200, 100,
      150, 250, 300, 150
    )

    cmd.execute()

    expect(node.setPosition).toHaveBeenCalledWith(150, 250)
    expect(node.updateSize).toHaveBeenCalledWith(300, 150)
    expect(node.data.sizeCustomized).toBe(true)
    expect(scene.updateAllConnectionEndpoints).toHaveBeenCalled()
    expect(scene.requestRedraw).toHaveBeenCalled()
  })

  it('should restore start size and position on undo', () => {
    const cmd = new ResizeNodeCommand(
      scene as unknown as BlueprintScene,
      node,
      100, 200, 200, 100,
      150, 250, 300, 150
    )

    cmd.execute()
    vi.mocked(node.setPosition).mockClear()
    vi.mocked(node.updateSize).mockClear()

    cmd.undo()

    expect(node.setPosition).toHaveBeenCalledWith(100, 200)
    expect(node.updateSize).toHaveBeenCalledWith(200, 100)
  })

  it('should have type "resize-node"', () => {
    const cmd = new ResizeNodeCommand(
      scene as unknown as BlueprintScene, node,
      0, 0, 100, 100, 10, 10, 200, 200
    )
    expect(cmd.type).toBe('resize-node')
  })

  it('should not be mergeable by default', () => {
    const cmd = new ResizeNodeCommand(
      scene as unknown as BlueprintScene, node,
      0, 0, 100, 100, 10, 10, 200, 200
    )
    expect(cmd.mergeable).toBe(false)
  })

  it('should merge with another ResizeNodeCommand on same node', () => {
    const cmd1 = new ResizeNodeCommand(
      scene as unknown as BlueprintScene, node,
      100, 200, 200, 100,
      150, 250, 300, 150
    )
    const cmd2 = new ResizeNodeCommand(
      scene as unknown as BlueprintScene, node,
      150, 250, 300, 150,
      160, 260, 320, 170
    )

    expect(cmd1.canMergeWith(cmd2)).toBe(true)
    cmd1.mergeWith(cmd2)
    cmd1.execute()

    expect(node.setPosition).toHaveBeenCalledWith(160, 260)
    expect(node.updateSize).toHaveBeenCalledWith(320, 170)
  })

  it('should not merge with ResizeNodeCommand on different node', () => {
    const node2 = createMockNode({ id: 'n2' })
    scene.nodes.set('n2', node2)
    const cmd1 = new ResizeNodeCommand(
      scene as unknown as BlueprintScene, node,
      0, 0, 100, 100, 10, 10, 200, 200
    )
    const cmd2 = new ResizeNodeCommand(
      scene as unknown as BlueprintScene, node2,
      0, 0, 100, 100, 20, 20, 300, 300
    )

    expect(cmd1.canMergeWith(cmd2)).toBe(false)
  })
})

describe('CreateConnectionCommand', () => {
  let scene: ReturnType<typeof createMockScene>

  function createMockScene() {
    const connections = new Map<string, any>()
    return {
      connections,
      getAllConnections: vi.fn(() => Array.from(connections.values())),
      addConnection: vi.fn((data: ConnectionData) => {
        const conn = { id: data.id, data: { ...data } }
        connections.set(data.id, conn)
        return conn
      }),
      removeConnection: vi.fn((id: string) => {
        connections.delete(id)
      }),
    }
  }

  beforeEach(() => {
    scene = createMockScene()
  })

  it('should create connection on execute', () => {
    const data: ConnectionData = {
      id: 'c1',
      fromNodeId: 'a',
      fromAnchorId: 'out',
      toNodeId: 'b',
      toAnchorId: 'in',
    }
    const cmd = new CreateConnectionCommand(scene as unknown as BlueprintScene, data)

    cmd.execute()

    expect(scene.addConnection).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    expect(scene.connections.has('c1')).toBe(true)
  })

  it('should remove created connection on undo', () => {
    const data: ConnectionData = {
      id: 'c1',
      fromNodeId: 'a',
      fromAnchorId: 'out',
      toNodeId: 'b',
      toAnchorId: 'in',
    }
    const cmd = new CreateConnectionCommand(scene as unknown as BlueprintScene, data)

    cmd.execute()
    expect(scene.connections.has('c1')).toBe(true)

    cmd.undo()

    expect(scene.removeConnection).toHaveBeenCalledWith('c1')
    expect(scene.connections.has('c1')).toBe(false)
  })

  it('should not undo if connection already existed before execute', () => {
    const existingData: ConnectionData = {
      id: 'existing',
      fromNodeId: 'a',
      fromAnchorId: 'out',
      toNodeId: 'b',
      toAnchorId: 'in',
    }
    scene.addConnection(existingData)
    scene.addConnection.mockClear()

    const cmd = new CreateConnectionCommand(scene as unknown as BlueprintScene, existingData)

    cmd.execute()

    expect(scene.addConnection).not.toHaveBeenCalled()

    cmd.undo()

    expect(scene.removeConnection).not.toHaveBeenCalled()
    expect(scene.connections.has('existing')).toBe(true)
  })

  it('should detect duplicate connection (same endpoints)', () => {
    const existingData: ConnectionData = {
      id: 'existing',
      fromNodeId: 'a',
      fromAnchorId: 'out',
      toNodeId: 'b',
      toAnchorId: 'in',
    }
    scene.addConnection(existingData)
    scene.addConnection.mockClear()

    const duplicateData: ConnectionData = {
      id: 'new-id',
      fromNodeId: 'a',
      fromAnchorId: 'out',
      toNodeId: 'b',
      toAnchorId: 'in',
    }
    const cmd = new CreateConnectionCommand(scene as unknown as BlueprintScene, duplicateData)

    cmd.execute()

    expect(scene.addConnection).not.toHaveBeenCalled()
  })

  it('should have type "create-connection"', () => {
    const cmd = new CreateConnectionCommand(scene as unknown as BlueprintScene, {
      id: 'c1', fromNodeId: 'a', fromAnchorId: 'out', toNodeId: 'b', toAnchorId: 'in'
    })
    expect(cmd.type).toBe('create-connection')
  })
})
