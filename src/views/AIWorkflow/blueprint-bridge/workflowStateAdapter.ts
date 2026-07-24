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
    viewport: legacy.viewport ? { ...legacy.viewport } : { zoom: 1, panX: 0, panY: 0 },
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
  const node: WorkflowNode = {
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

  if (legacyNode.textValue !== undefined) (node as any).textValue = legacyNode.textValue;
  if (legacyNode.imageSettings !== undefined) (node as any).imageSettings = legacyNode.imageSettings;
  if (legacyNode.videoSettings !== undefined) (node as any).videoSettings = legacyNode.videoSettings;
  if (legacyNode.model3dSettings !== undefined) (node as any).model3dSettings = legacyNode.model3dSettings;
  if (legacyNode.meshySettings !== undefined) (node as any).meshySettings = legacyNode.meshySettings;
  if (legacyNode.tripo3dSettings !== undefined) (node as any).tripo3dSettings = legacyNode.tripo3dSettings;
  if (legacyNode.blenderSettings !== undefined) (node as any).blenderSettings = legacyNode.blenderSettings;
  if (legacyNode.storySettings !== undefined) (node as any).storySettings = legacyNode.storySettings;
  if (legacyNode.sceneUnderstandingSettings !== undefined) (node as any).sceneUnderstandingSettings = legacyNode.sceneUnderstandingSettings;
  if (legacyNode.sceneLayoutSettings !== undefined) (node as any).sceneLayoutSettings = legacyNode.sceneLayoutSettings;
  if (legacyNode.sceneDecomposeSettings !== undefined) (node as any).sceneDecomposeSettings = legacyNode.sceneDecomposeSettings;
  if (legacyNode.unrealExportSettings !== undefined) (node as any).unrealExportSettings = legacyNode.unrealExportSettings;
  if (legacyNode.comfyuiSettings !== undefined) (node as any).comfyuiSettings = legacyNode.comfyuiSettings;
  if (legacyNode.nodeChatDraft !== undefined) (node as any).nodeChatDraft = legacyNode.nodeChatDraft;
  if (legacyNode.nodeChatParams !== undefined) (node as any).nodeChatParams = legacyNode.nodeChatParams;
  if (legacyNode.nodeChatSelectedRefs !== undefined) (node as any).nodeChatSelectedRefs = legacyNode.nodeChatSelectedRefs;
  if (legacyNode.status !== undefined) (node as any).status = legacyNode.status;

  return node;
}

function convertWorkflowResourceToLegacy(res: WorkflowResource): LegacyResourceData {
  return {
    id: res.id,
    kind: res.kind,
    name: res.name,
    url: res.url,
    projectRelativePath: res.projectRelativePath,
    previewUrl: res.previewUrl,
    previewProjectRelativePath: res.previewProjectRelativePath,
    previewVersion: res.previewVersion,
    posterUrl: res.posterUrl,
    posterProjectRelativePath: res.posterProjectRelativePath,
    posterSourcePath: res.posterSourcePath,
    sourcePath: res.sourcePath,
    sourceFingerprint: res.sourceFingerprint,
    sourceName: res.sourceName,
    sourceSize: res.sourceSize,
    sourceLastModified: res.sourceLastModified,
    localFileKey: res.localFileKey,
    createdAt: res.createdAt,
  };
}

function convertLegacyResourceToWorkflow(legacyRes: LegacyResourceData): WorkflowResource {
  return {
    id: legacyRes.id,
    kind: legacyRes.kind as any,
    name: legacyRes.name,
    url: legacyRes.url,
    projectRelativePath: legacyRes.projectRelativePath ?? legacyRes.relativePath ?? undefined,
    previewUrl: legacyRes.previewUrl ?? undefined,
    previewProjectRelativePath: legacyRes.previewProjectRelativePath ?? undefined,
    previewVersion: legacyRes.previewVersion ?? undefined,
    posterUrl: legacyRes.posterUrl ?? undefined,
    posterProjectRelativePath: legacyRes.posterProjectRelativePath ?? undefined,
    posterSourcePath: legacyRes.posterSourcePath ?? undefined,
    sourcePath: legacyRes.sourcePath ?? legacyRes.absolutePath ?? undefined,
    sourceFingerprint: legacyRes.sourceFingerprint ?? undefined,
    sourceName: legacyRes.sourceName ?? undefined,
    sourceSize: legacyRes.sourceSize ?? legacyRes.size ?? undefined,
    sourceLastModified: legacyRes.sourceLastModified ?? undefined,
    localFileKey: legacyRes.localFileKey ?? undefined,
    createdAt: legacyRes.createdAt ?? Date.now(),
  };
}
