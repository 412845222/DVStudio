<template>
  <aside class="wf-inspector" :class="{ open: open }" @pointerdown.stop>
    <div class="wf-inspector-header">
      <div class="wf-inspector-title">属性配置</div>
      <button
        v-if="selectedNode"
        class="wf-inspector-focus"
        type="button"
        @click="emit('focus-node', selectedNode!.id)"
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

      <div v-if="isMeshyNode" class="wf-section">
        <div class="wf-section-title">Meshy 帮助</div>
        <div class="wf-meshy-help">
          <div class="wf-meshy-help-card">
            <div class="wf-meshy-help-card-title">当前任务族</div>
            <div class="wf-meshy-help-card-value">{{ meshyHelp.familyLabel }}</div>
            <div class="wf-meshy-help-card-copy">{{ meshyHelp.summary }}</div>
          </div>

          <div class="wf-meshy-help-card">
            <div class="wf-meshy-help-card-title">输入要求</div>
            <ul class="wf-meshy-help-list">
              <li v-for="item in meshyHelp.inputs" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div class="wf-meshy-help-card">
            <div class="wf-meshy-help-card-title">输出与校验</div>
            <ul class="wf-meshy-help-list">
              <li v-for="item in meshyHelp.outputs" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div class="wf-meshy-help-card">
            <div class="wf-meshy-help-card-title">当前接入状态</div>
            <ul class="wf-meshy-help-list">
              <li v-for="item in meshyHelp.statusNotes" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
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
const isMeshyNode = computed(() => props.selectedNode?.type === "meshy");

const meshyHelp = computed(() => {
  const settings = props.selectedNode?.meshySettings ?? {};
  const rawFamily = String(
    settings.meshyTaskFamily ?? settings.meshyHelpTopic ?? "text-to-3d"
  ).trim();
  const rawTarget =
    String(settings.meshyTaskTarget ?? "3d").trim() === "image" ? "image" : "3d";
  const rawModelType =
    String(settings.meshyModelType ?? "standard").trim() === "lowpoly"
      ? "lowpoly"
      : "standard";
  const familyLabelMap: Record<string, string> = {
    "text-to-3d": "Text to 3D",
    "image-to-3d": "Image to 3D",
    "multi-image-to-3d": "Multi-Image to 3D",
    refine: "Refine",
    remesh: "Remesh",
    retexture: "Retexture",
    "text-to-image": "Text to Image",
    "image-to-image": "Image to Image",
  };

  const defaultData = {
    familyLabel: familyLabelMap[rawFamily] ?? rawFamily,
    summary: "Meshy 节点负责任务编排、输入摘要、输出约束与任务中心复用。",
    inputs: ["优先读取连线输入，其次才使用节点内手填字段。"],
    outputs: ["运行前会检查主输出锚点是否已连接到下游节点。"],
    statusNotes: ["当前任务详情、手动同步和后端镜像回退提示已经接入。"],
  };

  if (rawFamily === "text-to-3d") {
    return {
      ...defaultData,
      summary: "直接用提示词生成 3D 模型，适合作为 Meshy 主链路起点。",
      inputs: [
        "至少需要一条提示词，文本输入锚点优先级高于节点内手填提示词。",
        "可在节点底部切换标准 Standard / 低模 Low Poly 生成方式。",
        "可选负向提示词，用于约束低质量、低模或错误风格。",
      ],
      outputs: [
        "必须把 out-model 连接到下游模型/资源输入，未连接时不会允许启动任务。",
        "成功后会把优选模型 URL 和本地镜像路径写回节点状态。",
      ],
      statusNotes: [
        "3D 主链路后端代理已接通。",
        rawModelType === "lowpoly"
          ? "当前已选择 lowpoly；根据 Meshy 官方文档，ai_model、topology、target_polycount、should_remesh 会被忽略。"
          : "标准模式会走常规高细节网格生成流程。",
        "任务完成后会同步到 Meshy 任务中心，并可拖回蓝图复用。",
      ],
    };
  }

  if (rawFamily === "image-to-3d") {
    return {
      ...defaultData,
      summary: "基于单张参考图生成 3D 模型，适合图像驱动的快速建模。",
      inputs: [
        "至少需要一张参考图，可由 in-image-1 连入，也可在节点内填写 URL。",
        "同样支持标准 Standard / 低模 Low Poly 两种网格生成方式。",
        "提示词是可选项，用于补充材质、风格和细节。",
      ],
      outputs: [
        "输出仍然是 out-model，必须连接到下游模型输入。",
        "节点会优先使用上游图片输入，而不是手填 URL。",
      ],
      statusNotes: [
        "3D 主链路已支持该任务族。",
        rawModelType === "lowpoly"
          ? "lowpoly 会优先生成 cleaner polygons，更适合低模资产链路。"
          : "标准模式更适合默认高细节建模链路。",
        "适合把图片节点、旋转图片节点的结果接到 Meshy 后继续建模。",
      ],
    };
  }

  if (rawFamily === "multi-image-to-3d") {
    return {
      ...defaultData,
      summary: "使用多视角参考图生成 3D 模型，适合需要更稳定几何信息的场景。",
      inputs: [
        "支持最多 4 路图片输入，in-image-1 到 in-image-4 会按顺序读取。",
        "节点底部也提供标准 / 低模切换，用于统一 3D 生成链路配置。",
        "如果没有连线，也可以在节点内逐行填写图片 URL。",
      ],
      outputs: [
        "输出依然走 out-model，并要求下游已有模型消费节点。",
        "任务摘要会记录图片输入数量，便于任务中心回看。",
      ],
      statusNotes: ["3D 主链路已支持该任务族。", "比单图更适合正侧背多视图素材。"],
    };
  }

  if (rawFamily === "refine") {
    return {
      ...defaultData,
      summary: "在已有 Preview Task 结果上继续细化，是 text-to-3d 的二阶段工作流。",
      inputs: [
        "必须提供 Preview Task ID。",
        "仍然建议提供提示词或负向提示词，帮助控制细化方向。",
      ],
      outputs: [
        "输出仍走 out-model，并要求下游模型消费节点已连接。",
        "适合在已有粗模结果上做质量提升。",
      ],
      statusNotes: [
        "后端代理已支持该任务族。",
        "如果没有 Preview Task ID，运行前校验会直接阻止提交。",
      ],
    };
  }

  if (rawFamily === "text-to-image" || rawFamily === "image-to-image") {
    return {
      ...defaultData,
      summary:
        rawTarget === "image"
          ? "图像链路任务已建模完成，但后端代理尚未闭合。"
          : defaultData.summary,
      inputs: [
        rawFamily === "text-to-image" ? "需要提示词。" : "需要图片输入或图片 URL。",
        "图像链路节点当前主要用于提前整理任务模型和输入输出约束。",
      ],
      outputs: [
        "主输出是 out-image，设计上要求连接到下游图片输入。",
        "当前版本尚未真正提交图像链路任务到后端。",
      ],
      statusNotes: [
        "图像链路后端代理仍未接通。",
        "任务中心可以展示镜像和本地回退状态，但图像任务执行仍是下一批工作。",
      ],
    };
  }

  if (rawFamily === "remesh" || rawFamily === "retexture") {
    return {
      ...defaultData,
      summary: "这两个任务族已经纳入统一任务模型，但独立代理接口还没接通。",
      inputs: [
        "通常需要已有模型输入，后续会和 model3d / meshy 结果打通。",
        "节点当前保留任务族、输入输出和帮助信息，便于后续直接补后端。",
      ],
      outputs: [
        "设计目标仍然是 out-model 输出。",
        "当前不会真正发起 remesh / retexture 请求。",
      ],
      statusNotes: [
        "独立代理接口尚未接入。",
        "这部分属于当前 Meshy 业务闭环里的明确剩余项。",
      ],
    };
  }

  return defaultData;
});

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
  top: var(--aiwf-safe-top, 0px);
  right: 0;
  width: 320px;
  height: calc(100vh - var(--aiwf-safe-top, 0px));
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
  z-index: var(--aiwf-floating-z-index, 101);
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
  border-radius: 0;
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
  border-radius: 0;
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

.wf-meshy-help {
  display: grid;
  gap: 10px;
}

.wf-meshy-help-card {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.88);
  padding: 10px;
  display: grid;
  gap: 6px;
}

.wf-meshy-help-card-title {
  font-size: 12px;
  color: #9ec2dd;
}

.wf-meshy-help-card-value {
  font-size: 13px;
  color: var(--vscode-fg);
}

.wf-meshy-help-card-copy {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  line-height: 1.5;
}

.wf-meshy-help-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--vscode-fg-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
