import { Scene } from '../graphbase/scene/Scene';
import { Vector2 } from '../graphbase/core/Vector2';
import { BlueprintNode } from './BlueprintNode';
import { Connection, TempConnection } from './Connection';
import { Port } from './Port';
import { BlueprintGrid } from './BlueprintGrid';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { BlueprintEditorTool } from './BlueprintEditorTool';
import type { BlueprintNodeData, BlueprintData, ConnectionData } from './types';

interface PendingConnection {
  fromNode: BlueprintNode;
  fromPort: Port;
  currentPos: Vector2;
  isValid: boolean;
}

export class BlueprintScene extends Scene {
  private _nodeMap: Map<string, BlueprintNode> = new Map();
  private _connectionMap: Map<string, Connection> = new Map();
  private _grid: BlueprintGrid;
  private _tempConnection: TempConnection;
  private _pendingConnection: PendingConnection | null = null;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { backgroundColor: null, enableDefaultTools: false });

    this._grid = new BlueprintGrid();
    this.addChild(this._grid);

    this._tempConnection = new TempConnection();
    this._tempConnection.visible = false;
    this.addChild(this._tempConnection);

    this.tools.registerTool(new BlueprintEditorTool());
    this.tools.setDefaultTool('blueprint_editor');
  }

  onResize(_width: number, _height: number): void {
    this.requestRedraw();
  }

  onViewportChanged(): void {
    this.requestRedraw();
  }

  getAllBlueprintNodes(): BlueprintNode[] {
    return Array.from(this._nodeMap.values());
  }

  loadBlueprint(data: BlueprintData): void {
    for (const node of this._nodeMap.values()) {
      this.removeChild(node);
      node.dispose();
    }
    this._nodeMap.clear();

    for (const conn of this._connectionMap.values()) {
      this.removeChild(conn);
      conn.dispose();
    }
    this._connectionMap.clear();

    if (data.viewport) {
      this.setViewport(data.viewport);
    }

    for (const nodeData of data.nodes) {
      this.addBlueprintNode(nodeData);
    }

    for (const edgeData of data.edges) {
      this.addConnection(edgeData);
    }

    this.cancelPendingConnection();
    this.updateAllConnectionEndpoints();
    this.requestRedraw();
  }

  addBlueprintNode(data: BlueprintNodeData): BlueprintNode {
    const node = new BlueprintNode(data);
    this._nodeMap.set(data.id, node);
    this.addChild(node);
    this.requestRedraw();
    return node;
  }

  removeBlueprintNode(nodeId: string): void {
    const node = this._nodeMap.get(nodeId);
    if (!node) return;

    const connectionsToRemove: string[] = [];
    for (const [id, conn] of this._connectionMap) {
      if (conn.data.fromNodeId === nodeId || conn.data.toNodeId === nodeId) {
        connectionsToRemove.push(id);
      }
    }
    for (const id of connectionsToRemove) {
      this.removeConnection(id);
    }

    this._nodeMap.delete(nodeId);
    this.removeChild(node);
    node.dispose();
    this.requestRedraw();
  }

  addConnection(data: ConnectionData): Connection | null {
    const fromNode = this._nodeMap.get(data.fromNodeId);
    const toNode = this._nodeMap.get(data.toNodeId);
    if (!fromNode || !toNode) return null;

    const fromPort = fromNode.getOutputPort(data.fromAnchorId);
    const toPort = toNode.getInputPort(data.toAnchorId);
    if (!fromPort || !toPort) return null;

    const connection = new Connection(data);
    connection.setEndpoints({
      fromWorld: fromPort.getWorldPosition(),
      toWorld: toPort.getWorldPosition(),
      mediaType: fromPort.mediaType
    });
    fromPort.connected = true;
    toPort.connected = true;
    this._connectionMap.set(connection.id, connection);
    this.addChild(connection);

    this.requestRedraw();
    return connection;
  }

  removeConnection(connectionId: string): void {
    const conn = this._connectionMap.get(connectionId);
    if (!conn) return;

    const fromNode = this._nodeMap.get(conn.data.fromNodeId);
    const toNode = this._nodeMap.get(conn.data.toNodeId);
    if (fromNode) {
      const port = fromNode.getOutputPort(conn.data.fromAnchorId);
      if (port) {
        const otherConns = Array.from(this._connectionMap.values()).filter(
          c => c !== conn && c.data.fromNodeId === conn.data.fromNodeId && c.data.fromAnchorId === conn.data.fromAnchorId
        );
        if (otherConns.length === 0) port.connected = false;
      }
    }
    if (toNode) {
      const port = toNode.getInputPort(conn.data.toAnchorId);
      if (port) {
        const otherConns = Array.from(this._connectionMap.values()).filter(
          c => c !== conn && c.data.toNodeId === conn.data.toNodeId && c.data.toAnchorId === conn.data.toAnchorId
        );
        if (otherConns.length === 0) port.connected = false;
      }
    }

    this._connectionMap.delete(connectionId);
    this.removeChild(conn);
    conn.dispose();
    this.requestRedraw();
  }

  getBlueprintNode(nodeId: string): BlueprintNode | null {
    return this._nodeMap.get(nodeId) ?? null;
  }

  getConnection(connectionId: string): Connection | null {
    return this._connectionMap.get(connectionId) ?? null;
  }

  startPendingConnection(fromNode: BlueprintNode, fromPort: Port, currentWorldPos: Vector2): void {
    this._pendingConnection = {
      fromNode,
      fromPort,
      currentPos: currentWorldPos.clone(),
      isValid: false
    };
    this._tempConnection.visible = true;
    this._tempConnection.setPoints(
      fromPort.getWorldPosition(),
      currentWorldPos,
      fromPort.mediaType,
      false
    );
    this.requestRedraw();
  }

  updatePendingConnection(worldPos: Vector2, _hoveredPort: Port | null, compatible: boolean | null = null): void {
    if (!this._pendingConnection) return;
    this._pendingConnection.currentPos.copy(worldPos);
    this._pendingConnection.isValid = compatible === true;

    this._tempConnection.setPoints(
      this._pendingConnection.fromPort.getWorldPosition(),
      worldPos,
      this._pendingConnection.fromPort.mediaType,
      compatible !== false
    );
    this.requestRedraw();
  }

  cancelPendingConnection(): void {
    this._pendingConnection = null;
    this._tempConnection.visible = false;
    this._tempConnection.clear();
    this.requestRedraw();
  }

  completePendingConnection(toNode: BlueprintNode, toPort: Port): Connection | null {
    if (!this._pendingConnection) return null;

    const { fromNode, fromPort } = this._pendingConnection;
    if (fromPort.isInput === toPort.isInput || fromNode === toNode) {
      this.cancelPendingConnection();
      return null;
    }

    const data: ConnectionData = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromNodeId: fromNode.id,
      fromAnchorId: fromPort.spec.id,
      toNodeId: toNode.id,
      toAnchorId: toPort.spec.id
    };

    this.cancelPendingConnection();
    return this.addConnection(data);
  }

  getPendingConnection(): PendingConnection | null {
    return this._pendingConnection;
  }

  updateAllConnectionEndpoints(): void {
    for (const conn of this._connectionMap.values()) {
      const fromNode = this._nodeMap.get(conn.data.fromNodeId);
      const toNode = this._nodeMap.get(conn.data.toNodeId);
      if (!fromNode || !toNode) continue;

      const fromPort = fromNode.getOutputPort(conn.data.fromAnchorId);
      const toPort = toNode.getInputPort(conn.data.toAnchorId);
      if (fromPort && toPort) {
        conn.setEndpoints({
          fromWorld: fromPort.getWorldPosition(),
          toWorld: toPort.getWorldPosition(),
          mediaType: fromPort.mediaType
        });
      }
    }
  }

  screenToWorld(screen: Vector2): Vector2 {
    return this.camera.screenToWorld(screen);
  }

  serialize(): BlueprintData {
    const nodes: BlueprintNodeData[] = [];
    for (const node of this._nodeMap.values()) {
      nodes.push({ ...node.data });
    }

    const edges: ConnectionData[] = [];
    for (const conn of this._connectionMap.values()) {
      edges.push({ ...conn.data });
    }

    return {
      viewport: this.getViewport(),
      nodes,
      edges
    };
  }

  render(ctx: RenderContext): void {
    this.updateAllConnectionEndpoints();
    super.render(ctx);
  }

  dispose(): void {
    this._nodeMap.clear();
    this._connectionMap.clear();
    super.dispose();
  }
}
