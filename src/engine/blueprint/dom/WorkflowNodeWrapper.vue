<template>
  <div
    class="workflow-node-wrapper"
    :style="wrapperStyle"
    @dblclick.stop="onDblClick"
    @contextmenu.prevent.stop="onContextMenu"
  >
    <component
      :is="businessComponent"
      v-bind="resolvedProps"
      @update:world-position="onWorldPositionUpdate"
      @start-link="onStartLink"
      @end-link="onEndLink"
      @resize="onResize"
      @update-text-value="onUpdateTextValue"
      @select="onSelect"
      @copy="onCopy"
      @delete="onDelete"
      @refresh="onRefresh"
      @node-chat-submit="onChatSubmit"
      @node-chat-close="onChatClose"
      @node-chat-update-draft="onChatUpdateDraft"
      @node-chat-update-params="onChatUpdateParams"
      @node-chat-update-selected-refs="onChatUpdateSelectedRefs"
      @node-chat-remove-param-ref="onChatRemoveParamRef"
      @node-chat-stop="onChatStop"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NodeComponentResolver, type NodeChatState } from './NodeComponentResolver';
import type { BlueprintNode } from '../BlueprintNode';
import type { LegacyResourceData } from '../types';
import type { NodeStatus } from './DomNodeWrapper.vue';
import type { WorkflowNodeChatSubmitPayload } from '../../../aiworkflow/types';

const props = defineProps<{
  node: BlueprintNode;
  zoom: number;
  width: number;
  height: number;
  status: NodeStatus;
  selected: boolean;
  accentColor: string;
  legacyResources: Record<string, LegacyResourceData>;
  chatState?: NodeChatState | null;
}>();

const emit = defineEmits<{
  (e: 'edit', nodeId: string): void;
  (e: 'contextmenu', payload: { nodeId: string; x: number; y: number }): void;
  (e: 'update-text', payload: { nodeId: string; textValue: string }): void;
  (e: 'node-resize', payload: { nodeId: string; width: number; height: number; worldX: number; worldY: number }): void;
  (e: 'start-link', payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }): void;
  (e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void;
  (e: 'select', nodeId: string): void;
  (e: 'copy', nodeId: string): void;
  (e: 'delete', nodeId: string): void;
  (e: 'refresh', nodeId: string): void;
  (e: 'node-chat-submit', payload: WorkflowNodeChatSubmitPayload): void;
  (e: 'node-chat-close', nodeId: string): void;
  (e: 'node-chat-update-draft', payload: { nodeId: string; draft: string }): void;
  (e: 'node-chat-update-params', payload: { nodeId: string; params: Record<string, any> }): void;
  (e: 'node-chat-update-selected-refs', payload: { nodeId: string; selectedRefs: any[] }): void;
  (e: 'node-chat-remove-param-ref', payload: { nodeId: string; refItem: any }): void;
  (e: 'node-chat-stop', nodeId: string): void;
}>();

const businessComponent = computed(() => {
  return NodeComponentResolver.getComponent(props.node.nodeType);
});

const resolvedProps = computed(() => {
  return NodeComponentResolver.resolveNodeProps(
    props.node,
    props.zoom,
    props.legacyResources,
    props.selected,
    props.chatState
  );
});

const wrapperStyle = computed(() => ({
  '--wf-primary': props.accentColor,
  '--wf-node-border': `color-mix(in srgb, ${props.accentColor} 40%, transparent)`,
  '--wf-node-border-selected': props.accentColor,
  '--wf-node-shadow': `0 0 8px color-mix(in srgb, ${props.accentColor} 15%, transparent)`,
  '--wf-node-shadow-selected': `0 0 20px color-mix(in srgb, ${props.accentColor} 30%, transparent)`,
  '--wf-text': 'rgba(237, 242, 244, 0.95)',
  '--wf-text-muted': 'rgba(237, 242, 244, 0.6)',
  '--wf-border-subtle': 'rgba(237, 242, 244, 0.15)',
  '--wf-border': 'rgba(237, 242, 244, 0.2)',
  '--wf-surface-base': 'rgba(15, 18, 22, 0.85)',
  '--wf-control-border': 'rgba(237, 242, 244, 0.2)',
  '--wf-control-bg': 'rgba(30, 34, 40, 0.6)',
  '--wf-control-border-hover': 'rgba(237, 242, 244, 0.35)',
  '--wf-control-bg-hover': 'rgba(40, 45, 52, 0.8)',
  '--vscode-foreground': 'rgba(237, 242, 244, 0.9)',
  '--vscode-border': 'rgba(237, 242, 244, 0.15)',
  '--vscode-border-accent': props.accentColor,
  '--dweb-defualt-dark': 'rgba(15, 18, 22, 0.9)',
  '--dweb-blue': '#3498db',
  '--theme-bg-elevated': 'rgba(25, 28, 33, 0.95)',
  '--theme-bg-secondary': 'rgba(20, 23, 28, 0.9)',
  '--theme-border': 'rgba(237, 242, 244, 0.12)',
  '--aiwf-color-accent': '#e5b567',
  '--aiwf-color-danger': '#cf5a46',
  width: '100%',
  height: '100%',
  position: 'relative' as const,
  overflow: 'visible',
  zIndex: 1,
}));

const onDblClick = (e: MouseEvent) => {
  emit('edit', props.node.id);
};

const onContextMenu = (e: MouseEvent) => {
  emit('contextmenu', {
    nodeId: props.node.id,
    x: e.clientX,
    y: e.clientY,
  });
};

const onWorldPositionUpdate = (_payload: { worldX: number; worldY: number }) => {
};

const onStartLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) => {
  emit('start-link', payload);
};

const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
  emit('end-link', payload);
};

const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
  emit('node-resize', {
    nodeId: props.node.id,
    ...payload,
  });
};

const onUpdateTextValue = (payload: { textValue: string }) => {
  emit('update-text', {
    nodeId: props.node.id,
    textValue: payload.textValue,
  });
};

const onSelect = (nodeId: string) => {
  emit('select', nodeId);
};

const onCopy = () => {
  emit('copy', props.node.id);
};

const onDelete = () => {
  emit('delete', props.node.id);
};

const onRefresh = () => {
  emit('refresh', props.node.id);
};

const onChatSubmit = (payload: WorkflowNodeChatSubmitPayload) => {
  emit('node-chat-submit', payload);
};

const onChatClose = () => {
  emit('node-chat-close', props.node.id);
};

const onChatUpdateDraft = (draft: string) => {
  emit('node-chat-update-draft', { nodeId: props.node.id, draft });
};

const onChatUpdateParams = (params: Record<string, any>) => {
  emit('node-chat-update-params', { nodeId: props.node.id, params });
};

const onChatUpdateSelectedRefs = (selectedRefs: any[]) => {
  emit('node-chat-update-selected-refs', { nodeId: props.node.id, selectedRefs });
};

const onChatRemoveParamRef = (refItem: any) => {
  emit('node-chat-remove-param-ref', { nodeId: props.node.id, refItem });
};

const onChatStop = () => {
  emit('node-chat-stop', props.node.id);
};
</script>

<style scoped>
.workflow-node-wrapper {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.workflow-node-wrapper :deep(.wf-node) {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  width: 100% !important;
  height: 100% !important;
  transform: none !important;
  margin: 0 !important;
  pointer-events: none !important;
  cursor: default !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}

.workflow-node-wrapper :deep(.wf-node-toolbar) {
  display: none !important;
}

.workflow-node-wrapper :deep(.wf-anchors),
.workflow-node-wrapper :deep(.wf-anchor-hit) {
  display: none !important;
}

.workflow-node-wrapper :deep(.wf-resize) {
  display: none !important;
}

.workflow-node-wrapper :deep(.wf-node-particles) {
  display: none !important;
}

.workflow-node-wrapper :deep(.wf-node-id-badge) {
  display: none !important;
}

.workflow-node-wrapper :deep(.wf-node::before),
.workflow-node-wrapper :deep(.wf-node::after) {
  display: none !important;
}

.workflow-node-wrapper :deep(.wf-node-header) {
  pointer-events: none !important;
}

.workflow-node-wrapper :deep(.wf-node-body) {
  pointer-events: auto !important;
}

.workflow-node-wrapper :deep(.wf-node-footer) {
  pointer-events: auto !important;
}

.workflow-node-wrapper :deep(.wf-textarea) {
  pointer-events: auto !important;
}

.workflow-node-wrapper :deep(.wf-media-btn),
.workflow-node-wrapper :deep(.wf-file-input),
.workflow-node-wrapper :deep(textarea),
.workflow-node-wrapper :deep(input),
.workflow-node-wrapper :deep(button),
.workflow-node-wrapper :deep(.wf-inline-btn),
.workflow-node-wrapper :deep(.wf-quick-action),
.workflow-node-wrapper :deep(.wf-file-drop) {
  pointer-events: auto !important;
}

.workflow-node-wrapper :deep(.bp-node-chat-dialog) {
  pointer-events: auto !important;
}
</style>
