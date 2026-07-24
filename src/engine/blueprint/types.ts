export type MediaType = 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta' | 'resource';
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PortSpec {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: MediaType;
  acceptedMediaTypes?: MediaType[];
  multiInput?: boolean;
}

export interface BlueprintNodeData {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  alias?: string;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  sizeCustomized?: boolean;
  inputs: PortSpec[];
  outputs: PortSpec[];
  color?: string;
  icon?: string;
  selected?: boolean;
  status?: 'idle' | 'running' | 'success' | 'error';
  previewContent?: {
    kind: 'text' | 'image' | 'video' | 'model3d' | 'icon';
    text?: string;
    imageUrl?: string;
    icon?: string;
  };
  resourceId?: string;
  textValue?: string;
  imageSettings?: Record<string, any> | null;
  videoSettings?: Record<string, any> | null;
  model3dSettings?: Record<string, any> | null;
  meshySettings?: Record<string, any> | null;
  tripo3dSettings?: Record<string, any> | null;
  blenderSettings?: Record<string, any> | null;
  storySettings?: Record<string, any> | null;
  sceneUnderstandingSettings?: Record<string, any> | null;
  sceneLayoutSettings?: Record<string, any> | null;
  sceneDecomposeSettings?: Record<string, any> | null;
  unrealExportSettings?: Record<string, any> | null;
  comfyuiSettings?: Record<string, any> | null;
  nodeChatDraft?: string | null;
  nodeChatParams?: Record<string, any> | null;
  nodeChatSelectedRefs?: any[] | null;
  resourcePath?: string | null;
  rotatePromptText?: string | null;
  textMergeItems?: any[] | null;
  branches?: any[] | null;
  prompt?: string | null;
  createdAt?: number;
  [key: string]: any;
}

export interface ConnectionData {
  id: string;
  fromNodeId: string;
  fromAnchorId: string;
  toNodeId: string;
  toAnchorId: string;
  selected?: boolean;
  createdAt?: number;
}

export interface LegacyResourceData {
  id: string;
  kind: string;
  name: string;
  url: string;
  sourcePath?: string | null;
  projectRelativePath?: string | null;
  size?: number;
  localFileKey?: string | null;
  relativePath?: string | null;
  absolutePath?: string | null;
  posterProjectRelativePath?: string | null;
  posterUrl?: string;
  [key: string]: any;
}

export interface LegacySelectionTag {
  key: string;
  label: string;
  nodeIds: string[];
  color?: string | null;
  note?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface LegacyBlueprintData {
  schemaVersion: number;
  savedAt?: number;
  viewport: { zoom: number; panX: number; panY: number };
  nodesById: Record<string, BlueprintNodeData>;
  nodeOrder: string[];
  edgesById: Record<string, ConnectionData>;
  edgeOrder: string[];
  resourcesById: Record<string, LegacyResourceData>;
  resourceOrder: string[];
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  selectionTagsByKey: Record<string, LegacySelectionTag>;
  savedSelectionFrames?: SavedSelectionFrameData[];
  nodeCheckboxVisible?: boolean;
}

export interface BlueprintData {
  schemaVersion?: number;
  viewport: { zoom: number; panX: number; panY: number };
  nodes: BlueprintNodeData[];
  edges: ConnectionData[];
  savedSelectionFrames?: SavedSelectionFrameData[];
  legacyResources?: Record<string, LegacyResourceData>;
}

export interface SavedSelectionFrameData {
  id: string;
  nodeIds: string[];
  label: string;
  createdAt?: number;
}

export const PORT_SIZE = 24;
export const PORT_INNER_SIZE = 10;
export const PORT_CORNER_RADIUS = 2;
export const PORT_INNER_CORNER = 3;
export const PORT_HOVER_SCALE = 1.08;
export const PORT_HIT_RADIUS = 22;
export const PORT_GLOW_RADIUS = 14;

export const NODE_CORNER_RADIUS = 2;
export const NODE_HEADER_HEIGHT = 32;
export const NODE_BRACKET_SIZE = 10;
export const NODE_BRACKET_WIDTH = 2;
export const NODE_BORDER_WIDTH = 1;
export const NODE_INNER_PADDING = 12;

export const PORT_SPACING = 28;
export const PORT_TOP_OFFSET = NODE_HEADER_HEIGHT + 20;
export const PORT_MIN_MARGIN_TOP = 16;
export const PORT_MIN_MARGIN_BOTTOM = 16;

export const GRID_STEP = 80;
export const GRID_MAJOR_EVERY = 5;
export const GRID_COLOR = 'rgba(237, 242, 244, 0.12)';
export const GRID_MAJOR_COLOR = 'rgba(237, 242, 244, 0.20)';
export const BACKGROUND_COLOR = '#15181c';

export const WF_PRIMARY = '#1f9d84';
export const WF_RUNNING = '#e5b567';
export const WF_ERROR = '#cf5a46';
export const WF_SUCCESS = '#27ae60';
export const WF_TEXT = '#edf2f4';
export const WF_TEXT_MUTED = '#aeb8bd';
export const WF_NODE_BG = 'rgba(21, 24, 28, 0.85)';
export const WF_HEADER_BG = 'rgba(31, 157, 132, 0.15)';

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  generic: '#1f9d84',
  image: '#9b59b6',
  video: '#27ae60',
  text: '#f1c40f',
  flow: '#e67e22',
  model3d: '#3498db',
  audio: '#e91e63',
  meta: '#7f8c8d',
  resource: '#3498db'
};

export const NODE_STATUS_COLORS: Record<string, {
  border: string;
  bracket: string;
  glow: string;
  badge: string;
}> = {
  idle: {
    border: 'rgba(31, 157, 132, 0.45)',
    bracket: 'rgba(31, 157, 132, 0.55)',
    glow: 'rgba(31, 157, 132, 0.10)',
    badge: 'rgba(31, 157, 132, 0.25)'
  },
  hovered: {
    border: 'rgba(31, 157, 132, 0.55)',
    bracket: 'rgba(31, 157, 132, 0.85)',
    glow: 'rgba(31, 157, 132, 0.22)',
    badge: 'rgba(31, 157, 132, 0.35)'
  },
  selected: {
    border: 'rgba(31, 157, 132, 0.75)',
    bracket: '#1f9d84',
    glow: 'rgba(31, 157, 132, 0.30)',
    badge: 'rgba(31, 157, 132, 0.45)'
  },
  running: {
    border: 'rgba(229, 181, 103, 0.70)',
    bracket: 'rgba(229, 181, 103, 0.80)',
    glow: 'rgba(229, 181, 103, 0.35)',
    badge: 'rgba(229, 181, 103, 0.45)'
  },
  error: {
    border: 'rgba(207, 90, 70, 0.75)',
    bracket: 'rgba(207, 90, 70, 0.80)',
    glow: 'rgba(207, 90, 70, 0.35)',
    badge: 'rgba(207, 90, 70, 0.45)'
  }
};

export const DEFAULT_NODE_SIZES: Record<string, { width: number; height: number }> = {
  text: { width: 240, height: 200 },
  image: { width: 260, height: 280 },
  'rotate-image': { width: 260, height: 300 },
  video: { width: 280, height: 260 },
  'scene-understanding': { width: 240, height: 180 },
  'scene-layout': { width: 240, height: 180 },
  'scene-decompose': { width: 240, height: 200 },
  comfyui: { width: 280, height: 320 },
  model3d: { width: 260, height: 280 },
  'unreal-export': { width: 240, height: 160 },
  blender: { width: 260, height: 240 }
};

export const RESIZE_HANDLE_SIZE = 12;
export const RESIZE_HANDLE_HIT_SIZE = 16;
export const RESIZE_HANDLE_OFFSET = 4;
export const MIN_NODE_WIDTH = 180;
export const MIN_NODE_HEIGHT = 120;
