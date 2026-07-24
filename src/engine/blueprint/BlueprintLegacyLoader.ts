import type {
  BlueprintData,
  BlueprintNodeData,
  LegacyBlueprintData,
  LegacyResourceData,
  SavedSelectionFrameData,
  ConnectionData
} from './types';
import { DEFAULT_NODE_SIZES } from './types';

export class BlueprintLegacyLoader {
  static isLegacyFormat(data: any): data is LegacyBlueprintData {
    return data && typeof data === 'object' && (
      data.schemaVersion === 1 ||
      (data.nodesById && typeof data.nodesById === 'object')
    );
  }

  static load(legacyData: LegacyBlueprintData): BlueprintData {
    const nodes: BlueprintNodeData[] = [];
    const edges: ConnectionData[] = [];
    const savedSelectionFrames: SavedSelectionFrameData[] = [];
    const legacyResources: Record<string, LegacyResourceData> = {};

    const nodeOrder = legacyData.nodeOrder || Object.keys(legacyData.nodesById || {});
    for (const nodeId of nodeOrder) {
      const legacyNode = legacyData.nodesById[nodeId];
      if (!legacyNode) continue;
      const node = this.convertNode(legacyNode);
      nodes.push(node);
    }

    const edgeOrder = legacyData.edgeOrder || Object.keys(legacyData.edgesById || {});
    for (const edgeId of edgeOrder) {
      const legacyEdge = legacyData.edgesById[edgeId];
      if (!legacyEdge) continue;
      edges.push({ ...legacyEdge });
    }

    if (legacyData.savedSelectionFrames) {
      for (const frame of legacyData.savedSelectionFrames) {
        savedSelectionFrames.push({ ...frame });
      }
    }

    if (legacyData.selectionTagsByKey) {
      const existingNodeIdSets = new Set(
        savedSelectionFrames.map(f => [...f.nodeIds].sort().join('|'))
      );
      for (const key of Object.keys(legacyData.selectionTagsByKey)) {
        const tag = legacyData.selectionTagsByKey[key];
        const nodeKey = [...tag.nodeIds].sort().join('|');
        if (!existingNodeIdSets.has(nodeKey)) {
          savedSelectionFrames.push({
            id: tag.key,
            nodeIds: [...tag.nodeIds],
            label: tag.label,
            createdAt: tag.createdAt
          });
        }
      }
    }

    if (legacyData.resourcesById) {
      const resourceOrder = legacyData.resourceOrder || Object.keys(legacyData.resourcesById);
      for (const resId of resourceOrder) {
        const res = legacyData.resourcesById[resId];
        if (res) {
          legacyResources[resId] = { ...res };
        }
      }
    }

    return {
      schemaVersion: 1,
      viewport: legacyData.viewport || { zoom: 1, panX: 0, panY: 0 },
      nodes,
      edges,
      savedSelectionFrames,
      legacyResources
    };
  }

  private static convertNode(legacyNode: any): BlueprintNodeData {
    const type = legacyNode.type || 'generic';
    const defaultSize = DEFAULT_NODE_SIZES[type] || { width: 240, height: 200 };

    const node: BlueprintNodeData = {
      id: legacyNode.id,
      type,
      title: legacyNode.title || type,
      subtitle: legacyNode.subtitle,
      alias: legacyNode.alias,
      worldX: legacyNode.x ?? legacyNode.worldX ?? 0,
      worldY: legacyNode.y ?? legacyNode.worldY ?? 0,
      width: legacyNode.width ?? defaultSize.width,
      height: legacyNode.height ?? defaultSize.height,
      sizeCustomized: !!(legacyNode.width && legacyNode.height),
      inputs: legacyNode.inputs || [],
      outputs: legacyNode.outputs || [],
      color: legacyNode.color,
      icon: legacyNode.icon,
      selected: false,
      status: legacyNode.status || 'idle',
      resourceId: legacyNode.resourceId,
      textValue: legacyNode.textValue,
      imageSettings: legacyNode.imageSettings,
      videoSettings: legacyNode.videoSettings,
      model3dSettings: legacyNode.model3dSettings,
      meshySettings: legacyNode.meshySettings,
      tripo3dSettings: legacyNode.tripo3dSettings,
      blenderSettings: legacyNode.blenderSettings,
      storySettings: legacyNode.storySettings,
      sceneUnderstandingSettings: legacyNode.sceneUnderstandingSettings,
      sceneLayoutSettings: legacyNode.sceneLayoutSettings,
      sceneDecomposeSettings: legacyNode.sceneDecomposeSettings,
      unrealExportSettings: legacyNode.unrealExportSettings,
      comfyuiSettings: legacyNode.comfyuiSettings,
      nodeChatDraft: legacyNode.nodeChatDraft,
      nodeChatParams: legacyNode.nodeChatParams,
      nodeChatSelectedRefs: legacyNode.nodeChatSelectedRefs,
      resourcePath: legacyNode.resourcePath,
      rotatePromptText: legacyNode.rotatePromptText,
      textMergeItems: legacyNode.textMergeItems,
      branches: legacyNode.branches,
      prompt: legacyNode.prompt,
      createdAt: legacyNode.createdAt
    };

    if (legacyNode.previewContent) {
      node.previewContent = { ...legacyNode.previewContent };
    } else if (type === 'text' && legacyNode.textValue) {
      node.previewContent = {
        kind: 'text',
        text: legacyNode.textValue
      };
    } else if ((type === 'image' || type === 'rotate-image') && legacyNode.resourceId) {
      node.previewContent = {
        kind: 'image'
      };
    } else if (type === 'video') {
      node.previewContent = {
        kind: 'video'
      };
    } else if (type === 'model3d') {
      node.previewContent = {
        kind: 'model3d'
      };
    }

    for (const key of Object.keys(legacyNode)) {
      if (!(key in node)) {
        (node as any)[key] = legacyNode[key];
      }
    }

    if (legacyNode.x !== undefined) node.worldX = legacyNode.x;
    if (legacyNode.y !== undefined) node.worldY = legacyNode.y;

    return node;
  }
}
