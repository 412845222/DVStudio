import type { LegacyBlueprintData, BlueprintNodeData, ConnectionData, LegacyResourceData, SavedSelectionFrameData, PortSpec } from '../../../engine/blueprint/types';
import type { WorkflowState, WorkflowNode, WorkflowEdge, SavedSelectionFrame, WorkflowAnchorSpec } from '../../../aiworkflow/types';
import type { WorkflowResource } from '../../../aiworkflow/resource/types';

const LEGACY_SCHEMA_VERSION = 1;

export function workflowStateToLegacyBlueprint(state: WorkflowState): LegacyBlueprintData {
  const nodesById: Record<string, BlueprintNodeData> = {};
  for (const nodeId of state.nodeOrder) {
    const node = state.nodesById[nodeId];
    if (node) {
      nodesById[nodeId] = convertWorkflowNodeToLegacy(node);
    }
  }

  const edgesById: Record<string, ConnectionData> = {};
  for (const edgeId of state.edgeOrder) {
    const edge = state.edgesById[edgeId];
    if (edge) {
      edgesById[edgeId] = {
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        fromAnchorId: edge.fromAnchorId,
        toNodeId: edge.toNodeId,
        toAnchorId: edge.toAnchorId,
        createdAt: edge.createdAt,
      };
    }
  }

  const resourcesById: Record<string, LegacyResourceData> = {};
  for (const resId of state.resourceOrder) {
    const res = state.resourcesById[resId];
    if (res) {
      resourcesById[resId] = convertWorkflowResourceToLegacy(res);
    }
  }

  const savedSelectionFrames: SavedSelectionFrameData[] = [];
  if (state.savedSelectionFrames) {
    for (const frame of state.savedSelectionFrames) {
      savedSelectionFrames.push({
        id: frame.id,
        nodeIds: [...frame.nodeIds],
        label: frame.label,
        createdAt: frame.createdAt ?? Date.now(),
      });
    }
  }

  return {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    savedAt: Date.now(),
    viewport: { ...state.viewport },
    nodesById,
    nodeOrder: [...state.nodeOrder],
    edgesById,
    edgeOrder: [...state.edgeOrder],
    resourcesById,
    resourceOrder: [...state.resourceOrder],
    selectedNodeId: state.selectedNodeId,
    selectedNodeIds: state.selectedNodeIds ? [...state.selectedNodeIds] : undefined,
    selectionTagsByKey: state.selectionTagsByKey ? { ...state.selectionTagsByKey } : {},
    savedSelectionFrames,
    nodeCheckboxVisible: state.nodeCheckboxVisible,
  };
}

export function legacyBlueprintToWorkflowState(legacy: LegacyBlueprintData): Partial<WorkflowState> {
  const nodesById: Record<string, WorkflowNode> = {};
  for (const nodeId of legacy.nodeOrder || Object.keys(legacy.nodesById || {})) {
    const legacyNode = legacy.nodesById[nodeId];
    if (legacyNode) {
      nodesById[nodeId] = convertLegacyNodeToWorkflow(legacyNode);
    }
  }

  const edgesById: Record<string, WorkflowEdge> = {};
  for (const edgeId of legacy.edgeOrder || Object.keys(legacy.edgesById || {})) {
    const legacyEdge = legacy.edgesById[edgeId];
    if (legacyEdge) {
      edgesById[edgeId] = {
        id: legacyEdge.id,
        fromNodeId: legacyEdge.fromNodeId,
        fromAnchorId: legacyEdge.fromAnchorId,
        toNodeId: legacyEdge.toNodeId,
        toAnchorId: legacyEdge.toAnchorId,
        createdAt: legacyEdge.createdAt ?? Date.now(),
      };
    }
  }

  const resourcesById: Record<string, WorkflowResource> = {};
  for (const resId of legacy.resourceOrder || Object.keys(legacy.resourcesById || {})) {
    const legacyRes = legacy.resourcesById[resId];
    if (legacyRes) {
      resourcesById[resId] = convertLegacyResourceToWorkflow(legacyRes);
    }
  }

  const savedSelectionFrames: SavedSelectionFrame[] = [];
  if (legacy.savedSelectionFrames) {
    for (const frame of legacy.savedSelectionFrames) {
      savedSelectionFrames.push({
        id: frame.id,
        nodeIds: [...frame.nodeIds],
        label: frame.label,
        createdAt: frame.createdAt ?? Date.now(),
      });
    }
  }

  return {
    viewport: { ...legacy.viewport },
    nodesById,
    nodeOrder: [...(legacy.nodeOrder || Object.keys(nodesById))],
    edgesById,
    edgeOrder: [...(legacy.edgeOrder || Object.keys(edgesById))],
    resourcesById,
    resourceOrder: [...(legacy.resourceOrder || Object.keys(resourcesById))],
    selectedNodeId: legacy.selectedNodeId ?? null,
    selectedNodeIds: legacy.selectedNodeIds ? [...legacy.selectedNodeIds] : (legacy.selectedNodeId ? [legacy.selectedNodeId] : []),
    savedSelectionFrames,
    nodeCheckboxVisible: legacy.nodeCheckboxVisible,
  };
}

function convertAnchorToLegacy(a: WorkflowAnchorSpec): PortSpec {
  return {
    id: a.id,
    label: a.label,
    offsetY: a.offsetY,
    mediaType: a.mediaType as any,
    acceptedMediaTypes: a.acceptedMediaTypes as any,
    multiInput: a.multiInput,
  };
}

function convertAnchorToWorkflow(a: PortSpec): WorkflowAnchorSpec {
  return {
    id: a.id,
    label: a.label,
    offsetY: a.offsetY,
    mediaType: a.mediaType as any,
    acceptedMediaTypes: a.acceptedMediaTypes as any,
    multiInput: a.multiInput,
  };
}

function convertWorkflowNodeToLegacy(node: WorkflowNode): BlueprintNodeData {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    subtitle: node.subtitle,
    alias: node.alias,
    worldX: node.worldX,
    worldY: node.worldY,
    width: node.width,
    height: node.height,
    sizeCustomized: node.sizeCustomized,
    inputs: node.inputs ? node.inputs.map(convertAnchorToLegacy) : [],
    outputs: node.outputs ? node.outputs.map(convertAnchorToLegacy) : [],
    resourceId: node.resourceId ?? undefined,
    textValue: (node as any).textValue,
    imageSettings: (node as any).imageSettings,
    videoSettings: (node as any).videoSettings,
    model3dSettings: (node as any).model3dSettings,
    meshySettings: (node as any).meshySettings,
    tripo3dSettings: (node as any).tripo3dSettings,
    blenderSettings: (node as any).blenderSettings,
    storySettings: (node as any).storySettings,
    sceneUnderstandingSettings: (node as any).sceneUnderstandingSettings,
    sceneLayoutSettings: (node as any).sceneLayoutSettings,
    sceneDecomposeSettings: (node as any).sceneDecomposeSettings,
    unrealExportSettings: (node as any).unrealExportSettings,
    comfyuiSettings: (node as any).comfyuiSettings,
    nodeChatDraft: (node as any).nodeChatDraft,
    nodeChatParams: (node as any).nodeChatParams,
    nodeChatSelectedRefs: (node as any).nodeChatSelectedRefs,
    createdAt: node.createdAt,
    status: (node as any).status,
  };
}

function convertLegacyNodeToWorkflow(legacyNode: BlueprintNodeData): WorkflowNode {
  return {
    id: legacyNode.id,
    type: legacyNode.type,
    title: legacyNode.title,
    subtitle: legacyNode.subtitle,
    alias: legacyNode.alias,
    worldX: legacyNode.worldX,
    worldY: legacyNode.worldY,
    width: legacyNode.width,
    height: legacyNode.height,
    sizeCustomized: legacyNode.sizeCustomized,
    inputs: legacyNode.inputs ? legacyNode.inputs.map(convertAnchorToWorkflow) : [],
    outputs: legacyNode.outputs ? legacyNode.outputs.map(convertAnchorToWorkflow) : [],
    resourceId: legacyNode.resourceId ?? null,
    createdAt: legacyNode.createdAt ?? Date.now(),
  } as WorkflowNode;
}

function convertWorkflowResourceToLegacy(res: WorkflowResource): LegacyResourceData {
  return {
    id: res.id,
    kind: res.kind,
    name: res.name,
    url: res.url,
    sourcePath: (res as any).sourcePath,
    projectRelativePath: (res as any).projectRelativePath,
    size: (res as any).size,
    localFileKey: (res as any).localFileKey,
    relativePath: (res as any).relativePath,
    absolutePath: (res as any).absolutePath,
    posterProjectRelativePath: (res as any).posterProjectRelativePath,
    posterUrl: (res as any).posterUrl,
    contentType: (res as any).contentType,
  };
}

function convertLegacyResourceToWorkflow(legacyRes: LegacyResourceData): WorkflowResource {
  return {
    id: legacyRes.id,
    kind: legacyRes.kind,
    name: legacyRes.name,
    url: legacyRes.url,
  } as WorkflowResource;
}
