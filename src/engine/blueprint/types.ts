export type MediaType = 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta';

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
  inputs: PortSpec[];
  outputs: PortSpec[];
  color?: string;
  icon?: string;
  selected?: boolean;
}

export interface ConnectionData {
  id: string;
  fromNodeId: string;
  fromAnchorId: string;
  toNodeId: string;
  toAnchorId: string;
  selected?: boolean;
}

export interface BlueprintData {
  viewport: { zoom: number; panX: number; panY: number };
  nodes: BlueprintNodeData[];
  edges: ConnectionData[];
}

export const PORT_RADIUS = 7;
export const PORT_HOVER_RADIUS = 10;
export const NODE_HEADER_HEIGHT = 32;
export const NODE_CORNER_RADIUS = 10;
export const PORT_SPACING = 28;
export const PORT_TOP_OFFSET = 48;

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  generic: '#94a3b8',
  image: '#f59e0b',
  video: '#ef4444',
  text: '#22c55e',
  flow: '#1f9d84',
  model3d: '#8b5cf6',
  audio: '#06b6d4',
  meta: '#ec4899'
};

export const NODE_TYPE_COLORS: Record<string, { bg: string; border: string; header: string }> = {
  start: { bg: '#065f46', border: '#10b981', header: '#047857' },
  end: { bg: '#7f1d1d', border: '#ef4444', header: '#991b1b' },
  text: { bg: '#14532d', border: '#22c55e', header: '#166534' },
  image: { bg: '#78350f', border: '#f59e0b', header: '#92400e' },
  video: { bg: '#7f1d1d', border: '#ef4444', header: '#991b1b' },
  model3d: { bg: '#4c1d95', border: '#8b5cf6', header: '#5b21b6' },
  chat: { bg: '#1e3a8a', border: '#3b82f6', header: '#1e40af' },
  comfyui: { bg: '#365314', border: '#84cc16', header: '#3f6212' },
  story: { bg: '#831843', border: '#ec4899', header: '#9d174d' },
  default: { bg: '#1e293b', border: '#475569', header: '#334155' }
};
