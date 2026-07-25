import { Scene } from '../graphbase/scene/Scene';
import { Vector2 } from '../graphbase/core/Vector2';
import { BlueprintNode, clearBlueprintNodeImageCache } from './BlueprintNode';
import { Connection, TempConnection } from './Connection';
import { Port } from './Port';
import { BlueprintGrid } from './BlueprintGrid';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { BlueprintEditorTool } from './BlueprintEditorTool';
import type { BlueprintNodeData, BlueprintData, ConnectionData, SavedSelectionFrameData, LegacyBlueprintData, LegacyResourceData } from './types';
import type { SavedSelectionFrame } from './SelectionFrame';
import { BlueprintLegacyLoader } from './BlueprintLegacyLoader';
import { BlueprintLegacySaver } from './BlueprintLegacySaver';
import { CommandStack } from '../graphbase/commands/CommandStack';
import type { Command } from '../graphbase/commands/Command';
import { PasteCommand } from './commands/PasteCommand';

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
  private _savedSelectionFrames: Map<string, SavedSelectionFrame> = new Map();
  private _legacyResources: Record<string, LegacyResourceData> = {};
  private _clipboardNodes: BlueprintNodeData[] = [];
  private _clipboardEdges: ConnectionData[] = [];
  readonly commandStack: CommandStack = new CommandStack();

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

  get legacyResources(): Record<string, LegacyResourceData> {
    return this._legacyResources;
  }

  onViewportChanged(): void {
    this.requestRedraw();
  }

  getAllBlueprintNodes(): BlueprintNode[] {
    return Array.from(this._nodeMap.values());
  }

  getAllConnections(): Connection[] {
    return Array.from(this._connectionMap.values());
  }

  executeCommand(command: Command): void {
    this.commandStack.execute(command);
  }

  undo(): boolean {
    return this.commandStack.undo();
  }

  redo(): boolean {
    return this.commandStack.redo();
  }

  canUndo(): boolean {
    return this.commandStack.canUndo();
  }

  canRedo(): boolean {
    return this.commandStack.canRedo();
  }

  clearCommandStack(): void {
    this.commandStack.clear();
  }

  loadBlueprint(data: BlueprintData | LegacyBlueprintData): void {
    let blueprintData: BlueprintData;

    if (BlueprintLegacyLoader.isLegacyFormat(data)) {
      blueprintData = BlueprintLegacyLoader.load(data);
    } else {
      blueprintData = data;
    }

    clearBlueprintNodeImageCache();

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

    this._savedSelectionFrames.clear();
    this._legacyResources = blueprintData.legacyResources || {};
    this.commandStack.clear();

    if (blueprintData.viewport) {
      this.setViewport(blueprintData.viewport);
    }

    for (const nodeData of blueprintData.nodes) {
      this.addBlueprintNode(nodeData);
    }

    for (const edgeData of blueprintData.edges) {
      this.addConnection(edgeData);
    }

    if (blueprintData.savedSelectionFrames) {
      for (const frameData of blueprintData.savedSelectionFrames) {
        this._savedSelectionFrames.set(frameData.id, {
          id: frameData.id,
          nodeIds: [...frameData.nodeIds],
          label: frameData.label
        });
      }
    }

    this.cancelPendingConnection();
    this.updateAllConnectionEndpoints();
    this.requestRedraw();
  }

  loadLegacyBlueprint(data: LegacyBlueprintData): void {
    this.loadBlueprint(data);
  }

  addBlueprintNode(data: BlueprintNodeData): BlueprintNode {
    const node = new BlueprintNode(data);
    node.on.on('nodemoved', () => this.markConnectionEndpointsDirty());
    this._nodeMap.set(data.id, node);
    this.addChild(node);
    this._connectionEndpointsDirty = true;
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
    this._connectionEndpointsDirty = true;
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

    this._connectionEndpointsDirty = true;
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
    this._connectionEndpointsDirty = true;
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

  completePendingConnection(toNode: BlueprintNode, toPort: Port): ConnectionData | null {
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
    return data;
  }

  getPendingConnection(): PendingConnection | null {
    return this._pendingConnection;
  }

  getSavedSelectionFrames(): SavedSelectionFrame[] {
    return Array.from(this._savedSelectionFrames.values());
  }

  getSavedSelectionFrame(frameId: string): SavedSelectionFrame | null {
    return this._savedSelectionFrames.get(frameId) ?? null;
  }

  saveSelectionFrame(nodeIds: string[], label: string): SavedSelectionFrame {
    const id = `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sortedIds = [...nodeIds].sort();
    const frame: SavedSelectionFrame = { id, nodeIds: sortedIds, label };
    this._savedSelectionFrames.set(id, frame);
    this.requestRedraw();
    return frame;
  }

  deleteSavedSelectionFrame(frameId: string): boolean {
    const deleted = this._savedSelectionFrames.delete(frameId);
    if (deleted) this.requestRedraw();
    return deleted;
  }

  renameSavedSelectionFrame(frameId: string, newLabel: string): boolean {
    const frame = this._savedSelectionFrames.get(frameId);
    if (!frame) return false;
    frame.label = newLabel;
    this.requestRedraw();
    return true;
  }

  getNodesByIds(ids: string[]): BlueprintNode[] {
    const nodes: BlueprintNode[] = [];
    for (const id of ids) {
      const node = this._nodeMap.get(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  copySelection(selectedNodes: BlueprintNode[]): void {
    if (selectedNodes.length === 0) return;

    const selectedIds = new Set(selectedNodes.map(n => n.id));

    this._clipboardNodes = selectedNodes.map(node => ({
      ...node.data
    }));

    this._clipboardEdges = [];
    for (const conn of this._connectionMap.values()) {
      if (selectedIds.has(conn.data.fromNodeId) && selectedIds.has(conn.data.toNodeId)) {
        this._clipboardEdges.push({ ...conn.data });
      }
    }
  }

  pasteFromClipboard(offsetX: number = 50, offsetY: number = 50): BlueprintNode[] {
    if (this._clipboardNodes.length === 0) return [];

    const idMap = new Map<string, string>();
    const newNodes: BlueprintNode[] = [];

    for (const nodeData of this._clipboardNodes) {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      idMap.set(nodeData.id, newId);

      const newData: BlueprintNodeData = {
        ...nodeData,
        id: newId,
        worldX: nodeData.worldX + offsetX,
        worldY: nodeData.worldY + offsetY,
        selected: false
      };

      const node = this.addBlueprintNode(newData);
      newNodes.push(node);
    }

    for (const edgeData of this._clipboardEdges) {
      const newFromId = idMap.get(edgeData.fromNodeId);
      const newToId = idMap.get(edgeData.toNodeId);
      if (!newFromId || !newToId) continue;

      const newConnId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.addConnection({
        ...edgeData,
        id: newConnId,
        fromNodeId: newFromId,
        toNodeId: newToId
      });
    }

    this.updateAllConnectionEndpoints();
    this.requestRedraw();
    return newNodes;
  }

  hasClipboardData(): boolean {
    return this._clipboardNodes.length > 0;
  }

  executePaste(offsetX: number = 50, offsetY: number = 50): string[] {
    if (this._clipboardNodes.length === 0) return [];
    const cmd = new PasteCommand(this, this._clipboardNodes, this._clipboardEdges, offsetX, offsetY);
    this.executeCommand(cmd);
    return cmd.getCreatedNodeIds();
  }

  private _connectionEndpointsDirty: boolean = true;

  markConnectionEndpointsDirty(): void {
    this._connectionEndpointsDirty = true;
    this.requestRedraw();
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
    this._connectionEndpointsDirty = false;
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

    const savedSelectionFrames: SavedSelectionFrameData[] = [];
    for (const frame of this._savedSelectionFrames.values()) {
      savedSelectionFrames.push({
        id: frame.id,
        nodeIds: [...frame.nodeIds],
        label: frame.label
      });
    }

    return {
      schemaVersion: 2,
      viewport: this.getViewport(),
      nodes,
      edges,
      savedSelectionFrames,
      legacyResources: Object.keys(this._legacyResources).length > 0 ? { ...this._legacyResources } : undefined
    };
  }

  serializeLegacy(): LegacyBlueprintData {
    return BlueprintLegacySaver.save(this.serialize());
  }

  render(ctx: RenderContext): void {
    if (this._connectionEndpointsDirty) {
      this.updateAllConnectionEndpoints();
    }
    super.render(ctx);
  }

  dispose(): void {
    this._nodeMap.clear();
    this._connectionMap.clear();
    this._savedSelectionFrames.clear();
    super.dispose();
  }
}
