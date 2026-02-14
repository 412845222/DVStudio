<template>
  <aside class="wf-inspector" :class="{ open: open }">
    <div class="wf-inspector-header">
      <div class="wf-inspector-title">属性配置</div>
    </div>

    <div v-if="!hasSelection" class="wf-inspector-empty">未选中节点或连线</div>

    <div v-else class="wf-inspector-body">
      <div class="wf-section">
        <div class="wf-section-title">基础信息</div>
        <div v-if="selectedNode" class="wf-kv">
          <div class="wf-k">名称</div>
          <div class="wf-v">{{ selectedNode.title }}</div>
          <div class="wf-k">类型</div>
          <div class="wf-v">{{ selectedNode.type }}</div>
        </div>
        <div v-else-if="selectedEdge" class="wf-kv">
          <div class="wf-k">起点</div>
          <div class="wf-v">{{ selectedEdge.fromNodeId }}</div>
          <div class="wf-k">终点</div>
          <div class="wf-v">{{ selectedEdge.toNodeId }}</div>
          <div class="wf-k">类型</div>
          <div class="wf-v">连线</div>
        </div>
      </div>

      <div class="wf-section">
        <div class="wf-section-title">配置</div>
        <div v-if="selectedNode" class="wf-hint">当前节点暂无可配置属性。</div>
        <div v-else class="wf-hint">可配置连线样式（占位）。</div>
      </div>

      <div v-if="actions.length" class="wf-section">
        <div class="wf-section-title">操作</div>
        <button
          v-for="action in actions"
          :key="action.id"
          class="wf-action"
          type="button"
          @click="emit('action', action)"
        >
          {{ action.label }}
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { WorkflowEdge, WorkflowNode } from "../../aiworkflow/types";
import type { WorkflowAction } from "../../aiworkflow/actions";

const props = defineProps<{
  open: boolean;
  selectedNode?: WorkflowNode | null;
  selectedEdge?: WorkflowEdge | null;
  actions: WorkflowAction[];
}>();

const emit = defineEmits<{
  (e: "action", action: WorkflowAction): void;
}>();

const hasSelection = !!(props.selectedNode || props.selectedEdge);
</script>

<style scoped>
.wf-inspector {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 280px;
  max-height: calc(100% - 32px);
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  box-shadow: var(--vscode-shadow);
  overflow: auto;
  opacity: 0;
  transform: translateX(12px);
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}

.wf-inspector.open {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.wf-inspector-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--vscode-border);
}

.wf-inspector-title {
  font-size: 13px;
  color: var(--vscode-fg);
}

.wf-inspector-empty {
  padding: 16px 12px;
  color: var(--vscode-fg-muted);
}

.wf-inspector-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-section-title {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  margin-bottom: 6px;
}

.wf-kv {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 6px 8px;
  color: var(--vscode-fg);
  font-size: 12px;
}

.wf-k {
  color: var(--vscode-fg-muted);
}

.wf-v {
  color: var(--vscode-fg);
}

.wf-hint {
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.wf-action {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.wf-action:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}
</style>
