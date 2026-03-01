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
      <div class="wf-merge" @pointerdown.stop>
        <div class="wf-merge-label">整合后的文本（只读）</div>
        <textarea
          class="wf-merge-textarea"
          :value="mergedText"
          readonly
          placeholder="连接下方的文本输入后，这里会显示拼接结果…"
        />
      </div>
    </template>

    <template #footer>
      <div class="wf-merge-footer" @pointerdown.stop>
        <div class="wf-merge-toolbar">
          <div class="wf-merge-title">文本拼接</div>
          <button class="wf-merge-add" type="button" @click="emit('add-merge-item')">
            添加
          </button>
        </div>

        <div class="wf-merge-list">
          <div
            v-for="(it, idx) in mergeItems"
            :key="it.id"
            class="wf-merge-row"
            :ref="(el) => setRowEl(it.id, el)"
          >
            <div class="wf-merge-row-left">
              <div class="wf-merge-row-label">拼接 {{ idx + 1 }}</div>
            </div>

            <div class="wf-merge-row-actions">
              <button
                class="wf-merge-action"
                type="button"
                title="上移"
                :disabled="idx === 0"
                @click="emit('move-merge-item', { itemId: it.id, dir: 'up' })"
              >
                ↑
              </button>
              <button
                class="wf-merge-action"
                type="button"
                title="下移"
                :disabled="idx === mergeItems.length - 1"
                @click="emit('move-merge-item', { itemId: it.id, dir: 'down' })"
              >
                ↓
              </button>
              <button
                class="wf-merge-action danger"
                type="button"
                title="删除"
                @click="emit('remove-merge-item', it.id)"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template
      #anchors="{
        inputAnchors,
        outputAnchors,
        endLink,
        startLink,
        isInputHover,
        isOutputHover,
      }"
    >
      <!-- 输入锚点：悬浮在节点左侧边框，对齐到 footer 列表行 -->
      <div class="wf-merge-anchors-in" aria-label="入口锚点">
        <div
          v-for="(it, idx) in mergeItems"
          :key="it.id"
          class="wf-anchor-hit wf-anchor-text"
          :class="{ hovered: isInputHover(anchorId(it.id)) }"
          :title="`拼接 ${idx + 1}`"
          :style="inputAnchorStyle(it.id)"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="anchorId(it.id)"
          data-wf-dir="in"
          :data-wf-anchor-index="idx"
          @pointerup.stop="endLink(anchorId(it.id), idx)"
        />
      </div>

      <!-- 输出锚点：保持在右侧边框 -->
      <div class="wf-merge-anchors-out">
        <div
          v-for="a in outputAnchors"
          :key="a.id"
          class="wf-anchor-hit"
          :class="[anchorClass(a), { hovered: isOutputHover(a.id) }]"
          :title="a.label || '出口'"
          :style="anchorStyle(a)"
          :data-wf-node-id="nodeId"
          :data-wf-anchor-id="a.id"
          data-wf-dir="out"
          :data-wf-anchor-index="a.index"
          @pointerdown.stop.prevent="startLink(a.id, a.index, $event)"
        />
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: "generic" | "image" | "video" | "text" | "flow";
};

type MergeItem = { id: string };

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
  mergeItems: MergeItem[];
  mergedText: string;
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
  (
    e: "set-type",
    v: "base" | "text" | "text-merge" | "image" | "rotate-image" | "video" | "story" | "comfyui"
  ): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (e: "add-merge-item"): void;
  (e: "remove-merge-item", itemId: string): void;
  (e: "move-merge-item", payload: { itemId: string; dir: "up" | "down" }): void;
}>();

const inputs = computed(() => (Array.isArray(props.inputs) ? props.inputs : []));
const outputs = computed(() => (Array.isArray(props.outputs) ? props.outputs : []));

const hoverInputAnchorId = computed(() => props.hoverInputAnchorId ?? null);
const hoverOutputAnchorId = computed(() => props.hoverOutputAnchorId ?? null);

const mergedText = computed(() => String(props.mergedText ?? ""));
const mergeItems = computed(() =>
  Array.isArray(props.mergeItems) ? props.mergeItems : []
);

const anchorId = (itemId: string) => `in-${itemId}`;

// IMPORTANT: do NOT store template refs in reactive state.
// Mutating a ref inside a template ref callback can trigger recursive updates.
const rowElByItemId = new Map<string, HTMLElement | null>();
const inputAnchorTopByItemId = ref<Record<string, number>>({});

const setRowEl = (itemId: string, el: any) => {
  const nextEl = (el as HTMLElement) ?? null;
  const prevEl = rowElByItemId.get(itemId) ?? null;
  if (prevEl === nextEl) return;
  rowElByItemId.set(itemId, nextEl);
};

let rafId: number | null = null;
const scheduleMeasure = () => {
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(async () => {
    rafId = null;
    // Ensure DOM + layout are fully settled (zoom/pan can cause a 1-frame stale rect)
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const next: Record<string, number> = {};
    for (const it of mergeItems.value) {
      const rowEl = rowElByItemId.get(it.id);
      if (!rowEl) continue;
      const nodeEl = rowEl.closest(".wf-node") as HTMLElement | null;
      if (!nodeEl) continue;
      const rowRect = rowEl.getBoundingClientRect();
      const nodeRect = nodeEl.getBoundingClientRect();
      const z = Math.max(1e-6, Math.max(0.2, Math.min(6, Number(props.zoom) || 1)));
      // node is scaled by z; rects are in screen-space, but absolute positioning is in node-local space.
      next[it.id] = (rowRect.top + rowRect.height / 2 - nodeRect.top) / z;
    }
    inputAnchorTopByItemId.value = next;
  });
};

onMounted(() => {
  scheduleMeasure();
  window.addEventListener("resize", scheduleMeasure);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleMeasure);
  if (rafId != null) cancelAnimationFrame(rafId);
  rowElByItemId.clear();
});

watch(
  () => [
    props.width,
    props.height,
    props.worldX,
    props.worldY,
    props.zoom,
    mergeItems.value.map((x) => x.id).join("|"),
  ],
  () => scheduleMeasure(),
  { flush: "post" }
);

const inputAnchorStyle = (itemId: string) => {
  const top = inputAnchorTopByItemId.value[itemId];
  // Fallback makes anchor usable before first measure.
  const idx = mergeItems.value.findIndex((x) => x.id === itemId);
  const fallbackTop = 140 + Math.max(0, idx) * 38;
  return {
    top: `${Number.isFinite(top) ? top : fallbackTop}px`,
  };
};

const anchorStyle = (a: AnchorSpec & { offsetY?: number }) => ({
  top: `calc(50% + ${a.offsetY ?? 0}px)`,
});

const anchorClass = (a: AnchorSpec) => {
  if (a.mediaType === "image") return "wf-anchor-image";
  if (a.mediaType === "video") return "wf-anchor-video";
  if (a.mediaType === "text") return "wf-anchor-text";
  if (a.mediaType === "flow") return "wf-anchor-flow";
  return "wf-anchor-resource";
};
</script>

<style scoped>
.wf-merge {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  align-self: stretch;
}

.wf-merge-label {
  font-size: 12px;
  color: var(--vscode-foreground);
  opacity: 0.9;
}

.wf-merge-textarea {
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

.wf-merge-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.wf-merge-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wf-merge-title {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.wf-merge-add {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-merge-add:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-merge-list {
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.wf-merge-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 32px;
  padding: 6px 0;
}

.wf-merge-row + .wf-merge-row {
  border-top: 1px solid var(--vscode-border);
}

.wf-merge-row-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.wf-merge-row-label {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.wf-merge-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wf-merge-action {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 4px 6px;
  cursor: pointer;
  font-size: 12px;
  height: 26px;
  min-width: 26px;
}

.wf-merge-action:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-merge-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wf-merge-action.danger {
  width: auto;
  color: var(--vscode-fg-muted);
}

.wf-merge-anchors-in {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -10px;
}

.wf-merge-anchors-out {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -10px;
}

/* Anchor visuals: WorkflowNodeBase styles are scoped to that component,
   so slotted/custom anchors must define their own hit/inner-dot styles here. */
.wf-anchor-hit {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  cursor: crosshair;
  position: relative;
}

.wf-anchor-hit::before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--dweb-blue);
}

.wf-anchor-hit.wf-anchor-resource::before {
  background: var(--dweb-blue);
}

.wf-anchor-hit.wf-anchor-image::before {
  background: var(--dweb-purple);
}

.wf-anchor-hit.wf-anchor-video::before {
  background: var(--dweb-green-main);
}

.wf-anchor-hit.wf-anchor-text::before {
  background: var(--dweb-yellow);
}

.wf-anchor-hit.wf-anchor-flow::before {
  background: var(--dweb-orange);
}

.wf-anchor-hit:hover::before,
.wf-anchor-hit.hovered::before {
  border-color: #ffffff;
}

/* Output anchors still need absolute positioning to follow offsetY */
.wf-merge-anchors-in .wf-anchor-hit,
.wf-merge-anchors-out .wf-anchor-hit {
  position: absolute;
  transform: translateY(-50%);
}
</style>
