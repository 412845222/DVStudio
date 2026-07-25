<template>
  <div
    class="dom-node-wrapper"
    :class="[
      { selected: selected, 'dnw-business-mode': hasDefaultSlot },
      `dnw-status-${status}`,
    ]"
    :style="nodeStyle"
    :data-node-id="nodeId"
    @dblclick="onDblClick"
    @contextmenu.prevent.stop="onContextMenu"
  >
    <div class="dnw-border-base"></div>
    <div class="dnw-border-glow"></div>
    <div class="dnw-border-scan"></div>

    <template v-if="!hasDefaultSlot">
      <div class="dnw-header" :style="headerStyle">
        <span class="dnw-title">{{ title }}</span>
        <span class="dnw-status-dot" :style="statusDotStyle"></span>
      </div>

      <div class="dnw-content">
        <template v-if="preview.kind === 'image' && preview.imageUrl && !imgError">
          <div class="dnw-media-wrap">
            <img class="dnw-media-img" :src="preview.imageUrl" :alt="title" @error="onImgError" />
          </div>
        </template>
        <template v-else-if="preview.kind === 'video'">
          <div class="dnw-media-wrap dnw-video-wrap">
            <img v-if="preview.imageUrl && !imgError" class="dnw-media-img" :src="preview.imageUrl" :alt="title" @error="onImgError" />
            <div v-else class="dnw-video-icon">▶</div>
          </div>
        </template>
        <template v-else-if="preview.kind === 'model3d'">
          <div class="dnw-media-wrap dnw-model-wrap">
            <img v-if="preview.imageUrl && !imgError" class="dnw-media-img" :src="preview.imageUrl" :alt="title" @error="onImgError" />
            <div v-else class="dnw-model-icon">3D</div>
          </div>
        </template>
        <template v-else-if="preview.kind === 'text' && preview.text">
          <div class="dnw-text-preview">
            <div class="dnw-text-content">{{ preview.text }}</div>
          </div>
        </template>
        <template v-else-if="preview.kind === 'icon' && preview.iconChar">
          <div class="dnw-icon-preview">
            <span class="dnw-icon-char">{{ preview.iconChar }}</span>
            <span class="dnw-preview-label">{{ nodeTypeLabel }}</span>
          </div>
        </template>
        <template v-else>
          <div class="dnw-preview-placeholder">
            <span class="dnw-preview-label">{{ nodeTypeLabel }}</span>
          </div>
        </template>
      </div>
    </template>

    <div v-if="hasDefaultSlot" class="dnw-business-content">
      <slot></slot>
    </div>

    <div
      v-for="(port, idx) in inputPortRenders"
      :key="'in-' + port.id"
      class="dnw-port dnw-port-input"
      :style="getPortStyle(port, true, idx)"
      :data-port-id="port.id"
      :data-port-media="port.mediaType"
    >
      <div class="dnw-port-inner" :style="{ backgroundColor: getPortColor(port.mediaType) }"></div>
    </div>

    <div
      v-for="(port, idx) in outputPortRenders"
      :key="'out-' + port.id"
      class="dnw-port dnw-port-output"
      :style="getPortStyle(port, false, inputPortRenders.length + idx)"
      :data-port-id="port.id"
      :data-port-media="port.mediaType"
    >
      <div class="dnw-port-inner" :style="{ backgroundColor: getPortColor(port.mediaType) }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots } from 'vue';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

const emit = defineEmits<{
  (e: 'dblclick', event: MouseEvent): void;
  (e: 'contextmenu', event: MouseEvent): void;
}>();

interface PortRenderData {
  id: string;
  label?: string;
  offsetY: number;
  mediaType: string;
}

interface PreviewData {
  kind: 'text' | 'image' | 'video' | 'model3d' | 'icon' | 'empty';
  text?: string;
  imageUrl?: string;
  posterUrl?: string;
  iconChar?: string;
}

const props = defineProps<{
  nodeId: string;
  nodeType: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  accentColor: string;
  inputPortRenders: PortRenderData[];
  outputPortRenders: PortRenderData[];
  preview?: PreviewData;
  status?: NodeStatus;
}>();

const slots = useSlots();
const hasDefaultSlot = computed(() => !!slots.default);

const imgError = ref(false);

function onImgError() {
  imgError.value = true;
}

function onDblClick(e: MouseEvent) {
  emit('dblclick', e);
}

function onContextMenu(e: MouseEvent) {
  emit('contextmenu', e);
}

const STATUS_COLORS: Record<NodeStatus, string> = {
  idle: '#1f9d84',
  running: '#3498db',
  success: '#27ae60',
  error: '#e74c3c',
};

const MEDIA_COLORS: Record<string, string> = {
  generic: '#1f9d84',
  image: '#9b59b6',
  video: '#27ae60',
  text: '#f1c40f',
  flow: '#e67e22',
  model3d: '#3498db',
  audio: '#e91e63',
  meta: '#7f8c8d',
  resource: '#3498db',
};

const NODE_HEADER_HEIGHT = 32;
const PORT_SIZE = 12;
const PORT_STAGGER = 30;
const CONTENT_DELAY = 150;

const themeColor = computed(() => {
  if (props.status && props.status !== 'idle') {
    return STATUS_COLORS[props.status];
  }
  return props.accentColor || MEDIA_COLORS.generic;
});

const preview = computed(() => props.preview || { kind: 'empty' as const });

const nodeStyle = computed(() => ({
  position: 'absolute' as const,
  left: `${props.x}px`,
  top: `${props.y}px`,
  width: `${props.width}px`,
  height: `${props.height}px`,
  boxSizing: 'border-box' as const,
  userSelect: 'none' as const,
  '--dnw-accent': themeColor.value,
}));

const headerStyle = computed(() => ({
  background: `linear-gradient(180deg, ${themeColor.value}26 0%, ${themeColor.value}0d 100%)`,
  borderBottom: `1px solid ${themeColor.value}33`,
}));

const statusDotStyle = computed(() => {
  const isRunning = props.status === 'running';
  return {
    backgroundColor: themeColor.value,
    animation: isRunning ? 'dnw-pulse 1.2s ease-in-out infinite' : 'none',
  };
});

const nodeTypeLabel = computed(() => {
  const typeMap: Record<string, string> = {
    'text': '文本',
    'image': '图片',
    'rotate-image': '旋转图片',
    'video': '视频',
    'model3d': '3D模型',
    'comfyui': 'ComfyUI',
    'blender': 'Blender',
    'unreal-export': 'UE导出',
    'scene-understanding': '场景理解',
    'scene-layout': '场景布局',
    'scene-decompose': '场景拆解',
    'story': '故事',
    'meshy-model': 'Meshy模型',
    'text-merge': '文本合并',
  };
  return typeMap[props.nodeType] || props.nodeType;
});

function getPortColor(mediaType: string): string {
  return MEDIA_COLORS[mediaType] || MEDIA_COLORS.generic;
}

function getPortStyle(port: PortRenderData, isInput: boolean, portIndex: number) {
  const delay = CONTENT_DELAY + portIndex * PORT_STAGGER;
  return {
    top: `${port.offsetY - PORT_SIZE / 2}px`,
    [isInput ? 'left' : 'right']: `${-PORT_SIZE / 2}px`,
    width: `${PORT_SIZE}px`,
    height: `${PORT_SIZE}px`,
    '--port-delay': `${delay}ms`,
  };
}
</script>

<style scoped>
.dom-node-wrapper {
  position: absolute;
  background: linear-gradient(180deg, rgba(20, 30, 28, 0.92) 0%, rgba(15, 23, 22, 0.96) 100%);
  border-radius: 3px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  overflow: visible;
  pointer-events: none;
  opacity: 0;
  transform: scale(0.97);
  will-change: transform, opacity;
  animation: dnw-enter 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dom-node-wrapper.dnw-business-mode {
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
  pointer-events: auto;
}

.dom-node-wrapper.dnw-business-mode .dnw-border-base,
.dom-node-wrapper.dnw-business-mode .dnw-border-glow,
.dom-node-wrapper.dnw-business-mode .dnw-border-scan,
.dom-node-wrapper.dnw-business-mode .dnw-header,
.dom-node-wrapper.dnw-business-mode .dnw-content {
  display: none;
}

.dom-node-wrapper.selected {
  box-shadow:
    0 0 0 1px rgba(31, 157, 132, 0.15),
    0 0 12px rgba(31, 157, 132, 0.15),
    0 4px 20px rgba(0, 0, 0, 0.5);
}

.dom-node-wrapper.dnw-status-running.selected {
  box-shadow:
    0 0 0 1px rgba(52, 152, 219, 0.2),
    0 0 16px rgba(52, 152, 219, 0.2),
    0 4px 20px rgba(0, 0, 0, 0.5);
}

.dom-node-wrapper.dnw-status-success.selected {
  box-shadow:
    0 0 0 1px rgba(39, 174, 96, 0.2),
    0 0 16px rgba(39, 174, 96, 0.2),
    0 4px 20px rgba(0, 0, 0, 0.5);
}

.dom-node-wrapper.dnw-status-error.selected {
  box-shadow:
    0 0 0 1px rgba(231, 76, 60, 0.25),
    0 0 20px rgba(231, 76, 60, 0.25),
    0 4px 20px rgba(0, 0, 0, 0.5);
}

@keyframes dnw-enter {
  0% {
    opacity: 0;
    transform: scale(0.97);
  }
  25% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes dnw-pulse {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 6px currentColor;
  }
  50% {
    opacity: 0.5;
    box-shadow: 0 0 12px currentColor;
  }
}

.dnw-border-base {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  border: 2px solid var(--dnw-accent);
  opacity: 0;
  z-index: 1;
  pointer-events: none;
  animation: dnw-border-base-in 300ms ease-out forwards;
  animation-delay: 500ms;
}

@keyframes dnw-border-base-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.6;
  }
}

.dnw-border-glow {
  position: absolute;
  inset: -4px;
  border-radius: 6px;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 60deg,
    var(--dnw-accent) 75deg,
    rgba(255,255,255,0.5) 90deg,
    var(--dnw-accent) 105deg,
    transparent 120deg,
    transparent 240deg,
    var(--dnw-accent) 255deg,
    rgba(255,255,255,0.5) 270deg,
    var(--dnw-accent) 285deg,
    transparent 300deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  padding: 3px;
  opacity: 0;
  z-index: 0;
  pointer-events: none;
  filter: blur(4px);
  will-change: transform, opacity;
}

.dom-node-wrapper.selected .dnw-border-glow {
  opacity: 0;
  animation:
    dnw-glow-in 400ms ease-out forwards,
    dnw-idle-glow 3s linear infinite;
  animation-delay: 500ms, 500ms;
}

.dom-node-wrapper.dnw-status-running.selected .dnw-border-glow {
  animation:
    dnw-glow-in 400ms ease-out forwards,
    dnw-idle-glow 1.5s linear infinite;
  filter: blur(5px);
}

@keyframes dnw-glow-in {
  from { opacity: 0; }
  to { opacity: 0.6; }
}

.dnw-border-scan {
  position: absolute;
  inset: -2px;
  border-radius: 4px;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(255,255,255,0) 270deg,
    rgba(255,255,255,0.3) 310deg,
    rgba(255,255,255,0.9) 340deg,
    #ffffff 358deg,
    rgba(255,255,255,0.9) 15deg,
    rgba(255,255,255,0.3) 50deg,
    rgba(255,255,255,0) 90deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  padding: 2px;
  opacity: 0;
  z-index: 2;
  pointer-events: none;
  animation:
    dnw-scan-spin 600ms cubic-bezier(0.4, 0, 0.2, 1) forwards,
    dnw-scan-fade 600ms ease-out forwards;
  will-change: transform, opacity;
}

@keyframes dnw-scan-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dnw-scan-fade {
  0% {
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes dnw-idle-glow {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.dnw-header {
  position: relative;
  z-index: 3;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  box-sizing: border-box;
  opacity: 0;
  animation: dnw-content-fade 200ms ease-out forwards;
  animation-delay: 150ms;
}

.dnw-content {
  position: absolute;
  top: 32px;
  left: 8px;
  right: 8px;
  bottom: 24px;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  z-index: 3;
  opacity: 0;
  animation: dnw-content-fade 250ms ease-out forwards;
  animation-delay: 200ms;
  pointer-events: none;
}

.dnw-content:has(> :not(template)) {
  pointer-events: auto;
  align-items: stretch;
}

.dnw-business-content {
  position: absolute;
  inset: 0;
  z-index: 3;
  opacity: 0;
  animation: dnw-content-fade 250ms ease-out forwards;
  animation-delay: 150ms;
  overflow: visible;
  pointer-events: auto;
}

@keyframes dnw-content-fade {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dnw-title {
  font-size: 12px;
  font-weight: 500;
  color: #edf2f4;
  font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 20px);
}

.dnw-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
}

.dnw-preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.15);
}

.dnw-preview-label {
  font-size: 11px;
  color: #aeb8bd;
  opacity: 0.6;
}

.dnw-media-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.dnw-media-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.dnw-video-wrap {
  position: relative;
}

.dnw-video-icon {
  font-size: 28px;
  color: rgba(237, 242, 244, 0.5);
  text-shadow: 0 0 12px rgba(0,0,0,0.5);
}

.dnw-model-wrap {
  position: relative;
}

.dnw-model-icon {
  font-size: 13px;
  font-weight: 700;
  color: rgba(52, 152, 219, 0.8);
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(52, 152, 219, 0.4);
}

.dnw-text-preview {
  width: 100%;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dnw-text-content {
  font-size: 10.5px;
  color: #c5d0d5;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 8;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
}

.dnw-icon-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
}

.dnw-icon-char {
  font-size: 32px;
  filter: drop-shadow(0 0 8px rgba(31, 157, 132, 0.4));
}

.dnw-port {
  position: absolute;
  border-radius: 50%;
  background: rgba(10, 15, 14, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-sizing: border-box;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.7);
  pointer-events: none;
  animation: dnw-port-enter 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: var(--port-delay, 200ms);
  will-change: transform, opacity;
  box-shadow: 0 0 6px rgba(0,0,0,0.5);
}

@keyframes dnw-port-enter {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.dnw-port-inner {
  width: 60%;
  height: 60%;
  border-radius: 50%;
  box-shadow: 0 0 4px currentColor;
}

.dnw-port-input {
  left: -6px;
}

.dnw-port-output {
  right: -6px;
}

.dnw-enter-active,
.dnw-leave-active {
  transition: none;
}

.dom-node-wrapper.dnw-leave-active {
  animation: dnw-exit 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
}

.dom-node-wrapper.dnw-leave-active .dnw-border-base {
  animation: dnw-border-base-exit 150ms ease-in forwards;
}

.dom-node-wrapper.dnw-leave-active .dnw-border-glow {
  animation: dnw-exit-glow 300ms ease-in forwards;
}

.dom-node-wrapper.dnw-leave-active .dnw-border-scan {
  animation: dnw-exit-scan 300ms ease-in forwards;
}

.dom-node-wrapper.dnw-leave-active .dnw-header,
.dom-node-wrapper.dnw-leave-active .dnw-content,
.dom-node-wrapper.dnw-leave-active .dnw-business-content {
  animation: dnw-content-exit 150ms ease-in forwards;
}

.dom-node-wrapper.dnw-leave-active .dnw-port {
  animation: dnw-port-exit 150ms ease-in forwards;
}

@keyframes dnw-exit {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.97);
  }
}

@keyframes dnw-border-base-exit {
  from {
    opacity: 0.7;
  }
  to {
    opacity: 0;
  }
}

@keyframes dnw-exit-glow {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
    filter: blur(6px);
  }
  100% {
    opacity: 0;
    transform: rotate(-180deg);
  }
}

@keyframes dnw-exit-scan {
  0% {
    opacity: 0;
    transform: rotate(0deg);
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(-360deg);
  }
}

@keyframes dnw-content-exit {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-2px);
  }
}

@keyframes dnw-port-exit {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.5);
  }
}
</style>
