import { defineAsyncComponent, type Component } from 'vue';
import type { BlueprintNodeData, LegacyResourceData, PortSpec } from '../types';
import type { BlueprintNode } from '../BlueprintNode';

type WorkflowAnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta';
};

type WorkflowNodeBaseProps = {
  nodeId: string;
  title: string;
  alias?: string;
  nodeType: string;
  subtitle?: string;
  style?: Record<string, string>;
  width: number;
  height: number;
  zoom: number;
  worldX: number;
  worldY: number;
  inputs: WorkflowAnchorSpec[];
  outputs: WorkflowAnchorSpec[];
  selected?: boolean;
  isPrimarySelected?: boolean;
  isSecondarySelected?: boolean;
  visualStatus?: 'idle' | 'running' | 'error';
  sizeCustomized?: boolean;
  autoHeight?: boolean;
};

type ResourceRelatedProps = {
  resourceUrl?: string;
  resourceSourcePath?: string;
  resourcePreviewUrl320?: string;
  resourcePreviewUrl640?: string;
  posterUrl?: string;
};

export type ResolvedWorkflowNodeProps = WorkflowNodeBaseProps & ResourceRelatedProps & Record<string, unknown>;

const NODE_COMPONENT_MAP: Record<string, () => Promise<Component>> = {
  'text': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextNode.vue'),
  'text-merge': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextMergeNode.vue'),
  'image': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'),
  'rotate-image': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowRotateImageNode.vue'),
  'video': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue'),
  'scene-understanding': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneUnderstandingNode.vue'),
  'scene-decompose': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneDecomposeNode.vue'),
  'scene-layout': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneLayoutNode.vue'),
  'story': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowStoryNode.vue'),
  'unreal-export': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowUnrealExportNode.vue'),
  'model3d': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowModel3DNode.vue'),
  'meshy': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowMeshyModelNode.vue'),
  'blender': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowBlenderNode.vue'),
  'comfyui': () => import('../../../ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue'),
};

const ASYNC_COMPONENT_CACHE = new Map<string, Component>();

export class NodeComponentResolver {
  static getComponent(nodeType: string): Component | null {
    const loader = NODE_COMPONENT_MAP[nodeType];
    if (!loader) return null;
    if (ASYNC_COMPONENT_CACHE.has(nodeType)) {
      return ASYNC_COMPONENT_CACHE.get(nodeType)!;
    }
    const asyncComp = defineAsyncComponent(loader);
    ASYNC_COMPONENT_CACHE.set(nodeType, asyncComp);
    return asyncComp;
  }

  static hasComponent(nodeType: string): boolean {
    return nodeType in NODE_COMPONENT_MAP;
  }

  static convertPortsToAnchors(ports: PortSpec[]): WorkflowAnchorSpec[] {
    return ports.map(p => ({
      id: p.id,
      label: p.label,
      offsetY: p.offsetY,
      mediaType: (p.mediaType === 'resource' ? 'generic' : p.mediaType) as WorkflowAnchorSpec['mediaType'],
    }));
  }

  static resolveResourceProps(
    data: BlueprintNodeData,
    legacyResources: Record<string, LegacyResourceData>
  ): ResourceRelatedProps {
    const resourceId = data.resourceId;
    if (!resourceId) return {};
    const res = legacyResources[resourceId];
    if (!res) return {};

    const props: ResourceRelatedProps = {};

    if (res.url) props.resourceUrl = res.url;
    if (res.sourcePath) props.resourceSourcePath = res.sourcePath;
    if (res.posterUrl) props.posterUrl = res.posterUrl;

    return props;
  }

  static resolveNodeProps(
    node: BlueprintNode,
    zoom: number = 1,
    legacyResources: Record<string, LegacyResourceData> = {},
    isSelected: boolean = false
  ): ResolvedWorkflowNodeProps {
    const data = node.data;
    const baseProps: WorkflowNodeBaseProps = {
      nodeId: data.id,
      title: data.title,
      alias: data.alias,
      nodeType: data.type,
      subtitle: data.subtitle,
      width: data.width,
      height: data.height,
      zoom,
      worldX: 0,
      worldY: 0,
      inputs: this.convertPortsToAnchors(data.inputs),
      outputs: this.convertPortsToAnchors(data.outputs),
      selected: isSelected,
      isPrimarySelected: isSelected,
      isSecondarySelected: false,
      visualStatus: data.status === 'error' ? 'error' : data.status === 'running' ? 'running' : 'idle',
      sizeCustomized: data.sizeCustomized,
      autoHeight: false,
    };

    const resourceProps = this.resolveResourceProps(data, legacyResources);

    const typeSpecificProps: Record<string, unknown> = {};
    switch (data.type) {
      case 'text':
        if (data.textValue != null) typeSpecificProps.textContent = data.textValue;
        break;
      case 'image':
      case 'rotate-image':
        if (data.imageSettings) typeSpecificProps.imageSettings = data.imageSettings;
        break;
      case 'video':
        if (data.videoSettings) typeSpecificProps.videoSettings = data.videoSettings;
        break;
      case 'model3d':
        if (data.model3dSettings) typeSpecificProps.model3dSettings = data.model3dSettings;
        break;
      case 'meshy':
        if (data.meshySettings) typeSpecificProps.meshySettings = data.meshySettings;
        break;
      case 'blender':
        if (data.blenderSettings) typeSpecificProps.blenderSettings = data.blenderSettings;
        break;
      case 'story':
        if (data.storySettings) typeSpecificProps.storySettings = data.storySettings;
        break;
      case 'scene-understanding':
        if (data.sceneUnderstandingSettings) typeSpecificProps.sceneUnderstandingSettings = data.sceneUnderstandingSettings;
        break;
      case 'scene-layout':
        if (data.sceneLayoutSettings) typeSpecificProps.sceneLayoutSettings = data.sceneLayoutSettings;
        break;
      case 'scene-decompose':
        if (data.sceneDecomposeSettings) typeSpecificProps.sceneDecomposeSettings = data.sceneDecomposeSettings;
        break;
      case 'unreal-export':
        if (data.unrealExportSettings) typeSpecificProps.unrealExportSettings = data.unrealExportSettings;
        break;
      case 'comfyui':
        if (data.comfyuiSettings) typeSpecificProps.comfyuiSettings = data.comfyuiSettings;
        break;
    }

    if (data.textValue != null) typeSpecificProps.textValue = data.textValue;
    if (data.rotatePromptText != null) typeSpecificProps.promptText = data.rotatePromptText;
    if (data.textMergeItems != null) typeSpecificProps.textMergeItems = data.textMergeItems;
    if (data.prompt != null) typeSpecificProps.prompt = data.prompt;
    if (data.nodeChatDraft != null) typeSpecificProps.nodeChatDraft = data.nodeChatDraft;
    if (data.nodeChatParams != null) typeSpecificProps.nodeChatParams = data.nodeChatParams;
    if (data.nodeChatSelectedRefs != null) typeSpecificProps.nodeChatSelectedRefs = data.nodeChatSelectedRefs;

    return {
      ...baseProps,
      ...resourceProps,
      ...typeSpecificProps,
    };
  }
}
