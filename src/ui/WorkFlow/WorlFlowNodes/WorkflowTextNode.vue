<template>
  <WorkflowNodeBase
    :nodeId="nodeId"
    :title="title"
    :alias="alias"
    :nodeType="nodeType"
    :subtitle="subtitle"
    :style="style"
    :width="width"
    :height="height"
    :zoom="zoom"
    :worldX="worldX"
    :worldY="worldY"
    :inputs="inputs"
    :outputs="outputs"
    :selected="selected"
    :hoverInputAnchorId="hoverInputAnchorId"
    :hoverOutputAnchorId="hoverOutputAnchorId"
    @update:worldX="(v) => emit('update:worldX', v)"
    @update:worldY="(v) => emit('update:worldY', v)"
    @select="(id) => emit('select', id)"
    @start-link="(payload) => emit('start-link', payload)"
    @end-link="(payload) => emit('end-link', payload)"
    @copy="() => emit('copy')"
    @refresh="() => emit('refresh')"
    @delete="() => emit('delete')"
    @set-type="(type) => emit('set-type', type)"
    @resize="(payload) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-text" @pointerdown.stop>
        <div class="wf-text-label">文本内容（多行）</div>
        <textarea
          class="wf-textarea"
          :value="textValue"
          placeholder="在这里输入文本资源…"
          @input="onTextInput"
        />
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: "generic" | "image" | "video" | "text" | "flow";
};

const props = defineProps<{
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
  inputs?: AnchorSpec[];
  outputs?: AnchorSpec[];
  selected?: boolean;
  hoverInputAnchorId?: string | null;
  hoverOutputAnchorId?: string | null;
  textValue?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:worldX", v: number): void;
  (e: "update:worldY", v: number): void;
  (e: "select", nodeId: string): void;
  (
    e: "start-link",
    payload: {
      nodeId: string;
      anchorId: string;
      anchorIndex: number;
      event: PointerEvent;
    }
  ): void;
  (
    e: "end-link",
    payload: { nodeId: string; anchorId: string; anchorIndex: number }
  ): void;
  (e: "copy"): void;
  (e: "refresh"): void;
  (e: "delete"): void;
  (e: "set-type", v: "base" | "text" | "text-merge" | "image" | "rotate-image" | "video" | "story" | "comfyui"): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (e: "update-text-value", payload: { textValue: string }): void;
}>();

const textValue = computed(() => String(props.textValue ?? ""));

const inputs = computed(() => (Array.isArray(props.inputs) ? props.inputs : []));
const outputs = computed(() => (Array.isArray(props.outputs) ? props.outputs : []));

const hoverInputAnchorId = computed(() => props.hoverInputAnchorId ?? null);
const hoverOutputAnchorId = computed(() => props.hoverOutputAnchorId ?? null);

const onTextInput = (e: Event) => {
  const v = String((e.target as HTMLTextAreaElement).value ?? "");
  emit("update-text-value", { textValue: v });
};
</script>

<style scoped>
.wf-text {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  align-self: stretch;
}

.wf-text-label {
  font-size: 12px;
  color: var(--vscode-foreground);
  opacity: 0.9;
}

.wf-textarea {
  width: 100%;
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  padding: 6px 8px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-foreground);
  border-radius: 6px;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 12px;
}

.wf-textarea:focus {
  border-color: var(--vscode-border-accent);
}
</style>
