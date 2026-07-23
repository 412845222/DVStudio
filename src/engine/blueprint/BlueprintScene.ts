import { Scene } from '../graphbase/scene/Scene';
import { Vector2 } from '../graphbase/core/Vector2';
import { GridBackground } from '../graphbase/scene/shapes';
import { BlueprintNode } from './BlueprintNode';
import { Connection } from './Connection';
import { Port } from './Port';
import { bezierPoint, bezierTangent } from '../graphbase/core/Bezier';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { BlueprintEditorTool } from './BlueprintEditorTool';
import type { BlueprintNodeData, BlueprintData, ConnectionData, MediaType } from './types';

interface PendingConnection {
  fromNode: BlueprintNode;
  fromPort: Port;
  currentPos: Vector2;
  isValid: boolean;
}

export class BlueprintScene extends Scene {
  private _nodeMap: Map<string, BlueprintNode> = new Map();
  private _connectionMap: Map<string, Connection> = new Map();
  private _gridBg: GridBackground;
  private _pendingConnection: PendingConnection | null = null;
  private _hoveredPort: Port | null = null;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { backgroundColor: '#0f172a', enableDefaultTools: false });

    this._gridBg = new GridBackground({
      gridSize: 20,
      majorGridSize: 100,
      minorColor: 'rgba(148,163,184,0.06)',
      majorColor: 'rgba(148,163,184,0.12)'
    });
    this.addChild(this._gridBg);

    this.tools.registerTool(new BlueprintEditorTool());
    this.tools.setDefaultTool('blueprint_editor');
  }

  loadBlueprint(data: BlueprintData): void {
    this.clearAllNodes();

    if (data.viewport) {
      this.setViewport(data.viewport);
    }

    for (const nodeData of data.nodes) {
      this.addBlueprintNode(nodeData);
    }

    for (const edgeData of data.edges) {
      this.addConnection(edgeData);
    }

    this.updateAllConnections();
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
      if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
        connectionsToRemove.push(id);
      }
    }
    for (const id of connectionsToRemove) {
      this.removeConnection(id);
    }

    this._nodeMap.delete(nodeId);
    this.removeChild(node);
    this.selection.clearSelection();
    this.requestRedraw();
  }

  addConnection(data: ConnectionData): Connection | null {
    const fromNode = this._nodeMap.get(data.fromNodeId);
    const toNode = this._nodeMap.get(data.toNodeId);
    if (!fromNode || !toNode) return null;

    const fromPort = fromNode.getOutputPortById(data.fromAnchorId);
    const toPort = toNode.getInputPortById(data.toAnchorId);
    if (!fromPort || !toPort) return null;

    const connection = new Connection(
      data.fromNodeId,
      data.fromAnchorId,
      data.toNodeId,
      data.toAnchorId,
      fromPort.mediaType,
      data.id
    );
    connection.layer = 10;
    this._connectionMap.set(connection.id, connection);
    this.addChild(connection);

    fromPort.connected = true;
    toPort.connected = true;

    this.requestRedraw();
    return connection;
  }

  removeConnection(connectionId: string): void {
    const conn = this._connectionMap.get(connectionId);
    if (!conn) return;

    const fromNode = this._nodeMap.get(conn.fromNodeId);
    const toNode = this._nodeMap.get(conn.toNodeId);
    if (fromNode) {
      const port = fromNode.getOutputPortById(conn.fromPortId);
      if (port) port.connected = false;
    }
    if (toNode) {
      const port = toNode.getInputPortById(conn.toPortId);
      if (port) port.connected = false;
    }

    this._connectionMap.delete(connectionId);
    this.removeChild(conn);
    this.requestRedraw();
  }

  getBlueprintNode(nodeId: string): BlueprintNode | null {
    return this._nodeMap.get(nodeId) ?? null;
  }

  getConnection(connectionId: string): Connection | null {
    return this._connectionMap.get(connectionId) ?? null;
  }

  getPort(nodeId: string, portId: string, isInput: boolean): Port | null {
    const node = this._nodeMap.get(nodeId);
    if (!node) return null;
    return isInput ? node.getInputPortById(portId) : node.getOutputPortById(portId);
  }

  findPortAtWorldPoint(worldPoint: Vector2): { node: BlueprintNode; port: Port; isInput: boolean } | null {
    for (const node of this._nodeMap.values()) {
      const localPoint = node.worldToLocal(worldPoint);
      for (const port of node.inputPorts) {
        const plocal = port.worldToLocal(worldPoint);
        const hit = port.hitTest(plocal);
        if (hit) {
          return { node, port, isInput: true };
        }
      }
      for (const port of node.outputPorts) {
        const plocal = port.worldToLocal(worldPoint);
        const hit = port.hitTest(plocal);
        if (hit) {
          return { node, port, isInput: false };
        }
      }
    }
    return null;
  }

  startPendingConnection(fromNode: BlueprintNode, fromPort: Port, currentWorldPos: Vector2): void {
    this._pendingConnection = {
      fromNode,
      fromPort,
      currentPos: currentWorldPos.clone(),
      isValid: false
    };
    this.requestRedraw();
  }

  updatePendingConnection(worldPos: Vector2, hoveredPort: Port | null): void {
    if (!this._pendingConnection) return;
    this._pendingConnection.currentPos.copy(worldPos);

    let valid = false;
    if (hoveredPort && hoveredPort !== this._pendingConnection.fromPort) {
      valid = hoveredPort.isInput !== this._pendingConnection.fromPort.isInput;
    }
    this._pendingConnection.isValid = valid;
    this._hoveredPort = hoveredPort;
    this.requestRedraw();
  }

  cancelPendingConnection(): void {
    this._pendingConnection = null;
    this._hoveredPort = null;
    this.requestRedraw();
  }

  completePendingConnection(toNode: BlueprintNode, toPort: Port): Connection | null {
    if (!this._pendingConnection) return null;

    const { fromNode, fromPort } = this._pendingConnection;
    if (fromPort.isInput === toPort.isInput) {
      this.cancelPendingConnection();
      return null;
    }

    let data: ConnectionData;
    if (fromPort.isInput) {
      data = {
        id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fromNodeId: toNode.id,
        fromAnchorId: toPort.spec.id,
        toNodeId: fromNode.id,
        toAnchorId: fromPort.spec.id
      };
    } else {
      data = {
        id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fromNodeId: fromNode.id,
        fromAnchorId: fromPort.spec.id,
        toNodeId: toNode.id,
        toAnchorId: toPort.spec.id
      };
    }

    this.cancelPendingConnection();
    return this.addConnection(data);
  }

  getPendingConnection(): PendingConnection | null {
    return this._pendingConnection;
  }

  getHoveredPort(): Port | null {
    return this._hoveredPort;
  }

  updateAllConnections(): void {
    for (const conn of this._connectionMap.values()) {
      const fromNode = this._nodeMap.get(conn.fromNodeId);
      const toNode = this._nodeMap.get(conn.toNodeId);
      if (!fromNode || !toNode) continue;

      const fromPos = fromNode.getOutputPortWorldPosition(conn.fromPortId);
      const toPos = toNode.getInputPortWorldPosition(conn.toPortId);
      if (fromPos && toPos) {
        conn.setEndpoints(fromPos, toPos);
      }
    }
  }

  serialize(): BlueprintData {
    const nodes: BlueprintNodeData[] = [];
    for (const node of this._nodeMap.values()) {
      nodes.push({ ...node.data });
    }

    const edges: ConnectionData[] = [];
    for (const conn of this._connectionMap.values()) {
      edges.push({
        id: conn.id,
        fromNodeId: conn.fromNodeId,
        fromAnchorId: conn.fromPortId,
        toNodeId: conn.toNodeId,
        toAnchorId: conn.toPortId
      });
    }

    return {
      viewport: this.getViewport(),
      nodes,
      edges
    };
  }

  render(ctx: RenderContext): void {
    this.updateAllConnections();
    super.render(ctx);

    if (this._pendingConnection) {
      this.renderPendingConnection(ctx);
    }
  }

  private renderPendingConnection(ctx: RenderContext): void {
    const pending = this._pendingConnection;
    if (!pending) return;

    const fromPos = pending.fromPort.getWorldPosition();
    const toPos = pending.currentPos;
    const color = pending.isValid ? '#22c55e' : '#ef4444';

    const dx = Math.abs(toPos.x - fromPos.x);
    const cpOffset = Math.max(50, dx * 0.4);
    const cp1 = new Vector2(fromPos.x + cpOffset, fromPos.y);
    const cp2 = new Vector2(toPos.x - cpOffset, toPos.y);

    ctx.save();
    ctx.ctx.strokeStyle = color;
    ctx.ctx.lineWidth = 2.5;
    ctx.ctx.lineCap = 'round';
    ctx.setLineDash([6, 4]);
    ctx.drawBezier(fromPos, cp1, cp2, toPos, color, 2.5);
    ctx.setLineDash([]);

    const t = 0.5;
    const point = bezierPoint(t, fromPos, cp1, cp2, toPos);
    const tangent = bezierTangent(t, fromPos, cp1, cp2, toPos).normalize();
    const perp = new Vector2(-tangent.y, tangent.x);
    const arrowSize = 8;

    ctx.ctx.fillStyle = color;
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(point.x + tangent.x * arrowSize, point.y + tangent.y * arrowSize);
    ctx.ctx.lineTo(point.x - tangent.x * arrowSize * 0.5 + perp.x * arrowSize * 0.6, point.y - tangent.y * arrowSize * 0.5 + perp.y * arrowSize * 0.6);
    ctx.ctx.lineTo(point.x - tangent.x * arrowSize * 0.5 - perp.x * arrowSize * 0.6, point.y - tangent.y * arrowSize * 0.5 - perp.y * arrowSize * 0.6);
    ctx.ctx.closePath();
    ctx.ctx.fill();

    ctx.drawCircle(toPos, 8, color + '44', color, 2);
    ctx.restore();
  }
}
