<template>
  <aside class="wf-inspector" :class="{ open: open }" @pointerdown.stop>
    <div class="wf-inspector-header">
      <div class="wf-inspector-title">属性配置</div>
      <button
        v-if="selectedNode"
        class="wf-inspector-focus"
        type="button"
        @click="emit('focus-node', selectedNode.id)"
      >
        定位节点
      </button>
    </div>

    <div v-if="!hasSelection" class="wf-inspector-empty">未选中节点或连线</div>

    <div v-else class="wf-inspector-body">
      <div class="wf-section">
        <div class="wf-section-title">基础信息</div>
        <div v-if="selectedNode" class="wf-kv">
          <div class="wf-k">名称</div>
          <div class="wf-v">{{ selectedNode.title }}</div>
          <div class="wf-k">别名</div>
          <div class="wf-v">
            <input
              class="wf-input"
              type="text"
              :value="selectedNode.alias || ''"
              placeholder="输入别名"
              @input="onAliasInput"
            />
          </div>
          <div class="wf-k">类型</div>
          <div class="wf-v">{{ selectedNode.type }}</div>
          <div class="wf-k">坐标</div>
          <div class="wf-v">{{ selectedNode.worldX }}, {{ selectedNode.worldY }}</div>
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
        <div v-if="selectedNode" class="wf-config">
          <div class="wf-kv">
            <div class="wf-k">宽度</div>
            <div class="wf-v">
              <input
                class="wf-input"
                type="number"
                :value="selectedNode.width"
                @input="onSizeInput('width', $event)"
              />
            </div>
            <div class="wf-k">高度</div>
            <div class="wf-v">
              <input
                class="wf-input"
                type="number"
                :value="selectedNode.height"
                @input="onSizeInput('height', $event)"
              />
            </div>
          </div>
          <div v-if="isMediaNode" class="wf-media-config">
            <div class="wf-media-title">资源</div>
            <div class="wf-media-row">
              <div class="wf-media-name">
                {{ selectedNodeResource?.name || "未绑定资源" }}
              </div>
              <div class="wf-media-actions">
                <button class="wf-media-btn" type="button" @click="onUploadClick">
                  上传
                </button>
                <button
                  class="wf-media-btn ghost"
                  type="button"
                  :disabled="!selectedNodeResource"
                  @click="onClearResource"
                >
                  清空
                </button>
              </div>
            </div>
            <input
              ref="fileInput"
              class="wf-file-input"
              type="file"
              :accept="fileAccept"
              @change="onFileChange"
            />
          </div>
          <div v-if="isStoryNode" class="wf-story-config">
            <div class="wf-story-header">
              <div class="wf-story-title">剧情分支</div>
              <button class="wf-story-add" type="button" @click="onAddBranch">
                新增
              </button>
            </div>
            <div
              v-for="branch in selectedNode?.branches || []"
              :key="branch.id"
              class="wf-story-branch"
            >
              <input
                class="wf-story-input"
                type="text"
                :value="branch.text"
                placeholder="剧情分支描述"
                @input="onBranchInput(branch.id, $event)"
              />
              <button
                class="wf-story-remove"
                type="button"
                @click="onRemoveBranch(branch.id)"
              >
                删除
              </button>
            </div>
          </div>
        </div>
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
import { computed, ref } from "vue";
import type { WorkflowEdge, WorkflowNode } from "../../aiworkflow/types";
import type { WorkflowAction } from "../../aiworkflow/actions";
import type { WorkflowResource } from "../../aiworkflow/resource/types";

const props = defineProps<{
  open: boolean;
  selectedNode?: WorkflowNode | null;
  selectedEdge?: WorkflowEdge | null;
  selectedNodeResource?: WorkflowResource | null;
  actions: WorkflowAction[];
}>();

const emit = defineEmits<{
  (e: "action", action: WorkflowAction): void;
  (e: "update-alias", nodeId: string, alias: string): void;
  (e: "update-size", nodeId: string, width?: number, height?: number): void;
  (e: "upload-resource", nodeId: string, file: File, kind: "image" | "video"): void;
  (e: "clear-resource", nodeId: string): void;
  (e: "focus-node", nodeId: string): void;
  (e: "add-branch", nodeId: string): void;
  (e: "remove-branch", nodeId: string, branchId: string): void;
  (e: "update-branch", nodeId: string, branchId: string, text: string): void;
}>();

const hasSelection = computed(() => !!(props.selectedNode || props.selectedEdge));
const fileInput = ref<HTMLInputElement | null>(null);

const isMediaNode = computed(() => {
  const t = props.selectedNode?.type;
  return t === "image" || t === "video";
});

const isStoryNode = computed(() => props.selectedNode?.type === "story");

const fileAccept = computed(() =>
  props.selectedNode?.type === "video" ? "video/*" : "image/*"
);

const onAliasInput = (e: Event) => {
  if (!props.selectedNode) return;
  const v = (e.target as HTMLInputElement).value;
  emit("update-alias", props.selectedNode.id, v);
};

const onSizeInput = (key: "width" | "height", e: Event) => {
  if (!props.selectedNode) return;
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  emit(
    "update-size",
    props.selectedNode.id,
    key === "width" ? v : undefined,
    key === "height" ? v : undefined
  );
};

const onUploadClick = () => {
  if (!props.selectedNode || !isMediaNode.value) return;
  fileInput.value?.click();
};

const onFileChange = (e: Event) => {
  if (!props.selectedNode || !isMediaNode.value) return;
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const kind = props.selectedNode.type === "video" ? "video" : "image";
  emit("upload-resource", props.selectedNode.id, file, kind);
  input.value = "";
};

const onClearResource = () => {
  if (!props.selectedNode) return;
  emit("clear-resource", props.selectedNode.id);
};

const onAddBranch = () => {
  if (!props.selectedNode) return;
  emit("add-branch", props.selectedNode.id);
};

const onRemoveBranch = (branchId: string) => {
  if (!props.selectedNode) return;
  emit("remove-branch", props.selectedNode.id, branchId);
};

const onBranchInput = (branchId: string, e: Event) => {
  if (!props.selectedNode) return;
  const v = (e.target as HTMLInputElement).value;
  emit("update-branch", props.selectedNode.id, branchId, v);
};
</script>

<style scoped>
.wf-inspector {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100vh;
  border-left: 1px solid var(--vscode-border);
  background: rgba(20, 20, 20, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--vscode-shadow);
  overflow: auto;
  transform: translateX(100%);
  opacity: 0;
  pointer-events: none;
  transition: transform 180ms ease, opacity 180ms ease;
  z-index: 30;
}

.wf-inspector.open {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.wf-inspector-header {
  padding: 12px;
  border-bottom: 1px solid var(--vscode-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wf-inspector-title {
  font-size: 13px;
  color: var(--vscode-fg);
}

.wf-inspector-focus {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-inspector-focus:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
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

.wf-input {
  width: 100%;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 6px;
  outline: none;
}

.wf-input:focus {
  border-color: var(--vscode-border-accent);
}

.wf-hint {
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.wf-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-media-config {
  border: 1px dashed var(--vscode-border);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wf-media-title {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.wf-media-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wf-media-name {
  font-size: 12px;
  color: var(--vscode-fg);
}

.wf-media-actions {
  display: flex;
  gap: 8px;
}

.wf-story-config {
  border: 1px dashed var(--vscode-border);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wf-story-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wf-story-title {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.wf-story-add {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-story-add:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-story-branch {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.wf-story-input {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 6px;
  font-size: 12px;
}

.wf-story-remove {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.9);
  color: var(--vscode-fg-muted);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-story-remove:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-media-btn {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-media-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-media-btn.ghost {
  color: var(--vscode-fg-muted);
}

.wf-media-btn:disabled {
  cursor: not-allowed;
  color: var(--vscode-fg-muted);
  background: var(--vscode-disabled-bg);
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

.wf-file-input {
  display: none;
}
</style>
