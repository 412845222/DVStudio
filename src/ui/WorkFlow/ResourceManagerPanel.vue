<template>
  <div class="wf-resource-panel">
    <div class="wf-resource-header">
      <div class="wf-resource-title">资源管理器</div>
      <div class="wf-resource-actions">
        <button
          class="wf-resource-icon-btn"
          type="button"
          :title="thumbSize === 'sm' ? '缩略图：小' : '缩略图：大'"
          @click="toggleThumbSize"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
            <path
              d="M2.5 3.5h5v5h-5zM8.5 3.5h5v5h-5zM2.5 9.5h5v5h-5zM8.5 9.5h5v5h-5z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.1"
            />
            <path
              v-if="thumbSize === 'lg'"
              d="M3.4 4.4h3.2v3.2H3.4z"
              fill="currentColor"
              opacity="0.25"
            />
          </svg>
        </button>
        <button
          class="wf-resource-icon-btn"
          type="button"
          title="刷新并清理无缩略图记录"
          @click="emitRefreshMissing"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.3-3.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
            <path
              d="M10.7 2.7h3v3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <button
          class="wf-resource-icon-btn"
          type="button"
          :title="sortModeTitle"
          @click="cycleSortMode"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
            <path
              d="M4 3h8M4 6h6M4 9h4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
            <path
              v-if="sortMode.endsWith('asc')"
              d="M12 13l-2-2h4z"
              fill="currentColor"
            />
            <path v-else d="M12 11l-2 2h4z" fill="currentColor" />
          </svg>
        </button>
        <button class="wf-resource-btn" type="button" title="关闭" @click="emit('close')">
          x
        </button>
      </div>
    </div>
    <div class="wf-resource-body">
      <div v-if="!resources.length" class="wf-resource-empty">暂无资源</div>
      <div v-else class="wf-resource-stats">共 {{ totalCount }} 条，当前显示 {{ visibleCount }} 条</div>
      <div
        v-if="resources.length"
        ref="bodyEl"
        class="wf-resource-grid"
        :class="[thumbSize === 'lg' ? 'thumb-lg' : 'thumb-sm', { reflowing: gridReflowing }]"
      >
        <div
          v-for="r in visibleResources"
          :key="`${String(r.id)}:${layoutEpoch}`"
          class="wf-resource-tile"
          draggable="true"
          @dragstart="onTileDragStart($event, r)"
        >
          <img
            class="wf-resource-thumb"
            :src="thumbSrc(r)"
            :alt="r.name"
            loading="lazy"
            draggable="false"
            @error="onThumbError(String(r.id))"
          />

          <div class="wf-resource-overlay">
            <button
              class="wf-resource-overlay-btn"
              type="button"
              title="查看"
              @click="emit('preview', String(r.id))"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                <path
                  d="M8 3c-3.2 0-5.8 2.3-7 5 1.2 2.7 3.8 5 7 5s5.8-2.3 7-5c-1.2-2.7-3.8-5-7-5z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.1"
                />
                <path
                  d="M8 6.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"
                  fill="currentColor"
                  opacity="0.9"
                />
              </svg>
            </button>
            <button
              class="wf-resource-overlay-btn"
              type="button"
              title="添加至蓝图"
              @click="emit('drop-to-node', String(r.id))"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                <path
                  d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.1"
                />
                <path
                  d="M11 9v4M9 11h4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <button
              class="wf-resource-overlay-btn danger"
              type="button"
              title="删除"
              @click="emit('remove', String(r.id))"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                <path
                  d="M6 2.8h4M3.4 4.4h9.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
                <path
                  d="M5.2 4.6v8.6c0 .6.5 1 1 1h3.6c.6 0 1-.4 1-1V4.6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.1"
                />
                <path
                  d="M6.7 6.4v6.1M9.3 6.4v6.1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.1"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div ref="sentinelEl" class="wf-resource-sentinel" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { WorkflowResource } from "../../aiworkflow/resource/types";
import { sanitizeWorkflowMediaUrl } from "../../aiworkflow/domain/resource/safeWorkflowUrl";

const props = defineProps<{
  open?: boolean
  resources: WorkflowResource[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "remove", resourceId: string): void;
  (e: "preview", resourceId: string): void;
  (e: "refresh-missing", resourceIds: string[]): void;
  (e: "drop-to-node", resourceId: string): void;
}>();

const bodyEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);

type SortMode = "date-desc" | "date-asc";
const sortMode = ref<SortMode>("date-desc");
const thumbSize = ref<"sm" | "lg">("sm");
const failedThumbIds = ref<Set<string>>(new Set());
const gridReflowing = ref(false);
const layoutEpoch = ref(0);
let io: IntersectionObserver | null = null;

const PAGE_SIZE = 80;
const loadedCount = ref(PAGE_SIZE);

const resetPaging = () => {
  loadedCount.value = PAGE_SIZE;
};

const scheduleFillVisibleCapacity = () => {
  nextTick(() => {
    const total = sortedResources.value.length;
    if (loadedCount.value >= total) return;
    loadedCount.value = Math.min(total, loadedCount.value + PAGE_SIZE * 2);
  });
};

const toggleThumbSize = () => {
  thumbSize.value = thumbSize.value === "sm" ? "lg" : "sm";
  scheduleFillVisibleCapacity();
};

const cycleSortMode = () => {
  const v = sortMode.value;
  sortMode.value = v === "date-desc" ? "date-asc" : "date-desc";
  scheduleFillVisibleCapacity();
};

const sortModeTitle = computed(() => {
  if (sortMode.value === "date-desc") return "排序：日期（新→旧）";
  return "排序：日期（旧→新）";
});

const compareCreatedAt = (a: WorkflowResource, b: WorkflowResource) => {
  const at = Number((a as any)?.createdAt ?? 0);
  const bt = Number((b as any)?.createdAt ?? 0);
  return at - bt;
};

const sortedResources = computed(() => {
  const list = Array.isArray(props.resources) ? props.resources.slice() : [];
  if (sortMode.value === "date-desc") list.sort((a, b) => compareCreatedAt(b, a));
  if (sortMode.value === "date-asc") list.sort(compareCreatedAt);
  return list;
});

const visibleResources = computed(() => {
  const list = sortedResources.value;
  const n = Math.max(0, Math.floor(Number(loadedCount.value) || 0));
  return list.slice(0, Math.min(list.length, n));
});

const totalCount = computed(() => sortedResources.value.length);
const visibleCount = computed(() => visibleResources.value.length);

const thumbSrc = (r: WorkflowResource) => {
  if (!r) return "";
  if (r.kind === "video") {
    const poster = String((r as any).posterUrl ?? "").trim();
    return sanitizeWorkflowMediaUrl(poster);
  }
  return sanitizeWorkflowMediaUrl(String((r as any).url ?? "").trim());
};

const resourceMissingThumb = (r: WorkflowResource) => {
  const rid = String((r as any)?.id ?? "").trim();
  if (!rid) return false;
  if (failedThumbIds.value.has(rid)) return true;
  return !String(thumbSrc(r) || "").trim();
};

const emitRefreshMissing = () => {
  const ids = sortedResources.value
    .filter((r) => resourceMissingThumb(r))
    .map((r) => String((r as any)?.id ?? "").trim())
    .filter((id) => !!id);
  emit("refresh-missing", ids);
};

const onThumbError = (resourceId: string) => {
  const id = String(resourceId || "").trim();
  if (!id) return;
  const next = new Set(failedThumbIds.value);
  next.add(id);
  failedThumbIds.value = next;
};

const onTileDragStart = (event: DragEvent, r: WorkflowResource) => {
  const dt = event.dataTransfer;
  if (!dt) return;
  try {
    dt.effectAllowed = "copy";
    dt.setData(
      "application/x-dweb-resource-item",
      JSON.stringify({
        resourceId: String((r as any).id ?? ""),
        kind: String((r as any).kind ?? ""),
        name: String((r as any).name ?? ""),
        url: String((r as any).url ?? ""),
        sourcePath: String((r as any).sourcePath ?? ""),
      })
    );
    dt.setData("text/plain", String((r as any).url ?? ""));
  } catch {
    // ignore
  }
};

watch(
  () => props.resources,
  () => {
    const keep = new Set(
      (props.resources ?? [])
        .map((r: any) => String(r?.id ?? "").trim())
        .filter((id) => !!id)
    );
    const next = new Set<string>();
    for (const id of failedThumbIds.value.values()) {
      if (keep.has(id)) next.add(id);
    }
    failedThumbIds.value = next;
    resetPaging();
    scheduleFillVisibleCapacity();
  }
);

onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      const hit = entries.some((e) => e.isIntersecting);
      if (!hit) return;
      const total = sortedResources.value.length;
      if (loadedCount.value >= total) return;
      loadedCount.value = Math.min(total, loadedCount.value + PAGE_SIZE);
    },
    { root: bodyEl.value ?? null, rootMargin: "240px" }
  );

  setTimeout(() => {
    if (!io) return;
    if (sentinelEl.value) io.observe(sentinelEl.value);
  }, 0);

  resetPaging();
  scheduleFillVisibleCapacity();
});

onBeforeUnmount(() => {
  if (io) {
    try {
      io.disconnect();
    } catch {
      // ignore
    }
    io = null;
  }
});
</script>

<style scoped>
/*
 * 资源管理器面板样式
 * 在独立 BrowserWindow 中使用时，由父容器 (.rmw-root) 提供定位和尺寸。
 * 面板本身占满 flex 空间，无 fixed 定位。
 */
.wf-resource-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(20, 24, 28, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--vscode-border);
  box-shadow: var(--vscode-shadow);
  overflow: hidden;
}

.wf-resource-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--vscode-border);
  background: rgba(30, 34, 38, 0.85);
  flex-shrink: 0;
}

.wf-resource-title {
  font-size: 13px;
  color: var(--vscode-fg);
}

.wf-resource-actions {
  display: flex;
  gap: 6px;
}

.wf-resource-icon-btn {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.9);
  color: var(--vscode-fg);
  width: 22px;
  height: 22px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-resource-icon-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resource-icon {
  width: 14px;
  height: 14px;
}

.wf-resource-btn {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.9);
  color: var(--vscode-fg);
  width: 22px;
  height: 22px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wf-resource-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resource-btn.danger {
  color: var(--vscode-fg-muted);
}

.wf-resource-body {
  padding: 10px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.wf-resource-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}

.wf-resource-stats {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  margin: 0 0 8px;
}

.wf-resource-grid {
  position: relative;
  width: 100%;
  column-width: var(--wf-col-w, 132px);
  column-gap: 10px;
}

.wf-resource-grid.thumb-sm {
  --wf-col-w: 132px;
}

.wf-resource-grid.thumb-lg {
  --wf-col-w: 192px;
}

.wf-resource-tile {
  position: relative;
  break-inside: avoid;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  border-radius: 8px;
  overflow: hidden;
  margin: 0 0 10px;
  animation: wf-resource-tile-in 180ms ease;
}

.wf-resource-grid.reflowing .wf-resource-tile {
  animation: wf-resource-reflow 220ms ease;
}

.wf-resource-thumb {
  width: 100%;
  height: auto;
  display: block;
  user-select: none;
}

.wf-resource-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  opacity: 0;
  transition: opacity 120ms ease;
  background: rgba(10, 12, 14, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;
}

.wf-resource-tile:hover .wf-resource-overlay {
  opacity: 1;
}

.wf-resource-overlay-btn {
  border: 1px solid var(--vscode-border);
  background: rgba(24, 28, 32, 0.92);
  color: var(--vscode-fg);
  width: 34px;
  height: 34px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.wf-resource-overlay-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-resource-overlay-btn.danger {
  color: var(--vscode-fg-muted);
}

.wf-resource-overlay-icon {
  width: 18px;
  height: 18px;
}

.wf-resource-sentinel {
  width: 100%;
  height: 1px;
}

@keyframes wf-resource-tile-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes wf-resource-reflow {
  from {
    opacity: 0.85;
    transform: scale(0.988);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
