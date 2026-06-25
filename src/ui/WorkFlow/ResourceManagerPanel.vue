<template>
  <div class="wf-resource-panel">
    <div class="wf-resource-header">
      <div class="wf-resource-title">资源管理器</div>
      <div class="wf-resource-actions">
        <div class="wf-resource-view-switch">
          <button
            class="wf-resource-icon-btn"
            :class="{ active: viewMode === 'grid' }"
            type="button"
            title="网格视图（大缩略图）"
            @click="viewMode = 'grid'"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
              <path d="M2.5 3.5h5v5h-5zM8.5 3.5h5v5h-5zM2.5 9.5h5v5h-5zM8.5 9.5h5v5h-5z" fill="none" stroke="currentColor" stroke-width="1.1" />
            </svg>
          </button>
          <button
            class="wf-resource-icon-btn"
            :class="{ active: viewMode === 'list' }"
            type="button"
            title="列表视图（详细信息）"
            @click="viewMode = 'list'"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-icon">
              <path d="M2.5 3.5h3v3h-3zM2.5 7h3v3h-3zM2.5 10.5h3v3h-3zM7 4h7M7 8h7M7 12h7" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <button
          v-if="viewMode === 'grid'"
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
              v-if="sortMode === 'date-asc' || sortMode === 'name-asc'"
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
    <div ref="scrollBodyEl" class="wf-resource-body">
      <!-- 筛选 + 搜索栏 -->
      <div v-if="resources.length" class="wf-resource-filter-bar">
        <div class="wf-resource-filter-group">
          <button
            class="wf-resource-filter-btn"
            :class="{ active: filterMode === 'all' }"
            @click="onFilterChange('all')"
            title="显示全部资源"
          >
            全部 <span class="wf-resource-filter-num">({{ counts.total }})</span>
          </button>
          <button
            class="wf-resource-filter-btn"
            :class="{ active: filterMode === 'used' }"
            @click="onFilterChange('used')"
            title="仅显示被节点引用的资源"
          >
            已使用 <span class="wf-resource-filter-num">({{ counts.used }})</span>
          </button>
          <button
            class="wf-resource-filter-btn"
            :class="{ active: filterMode === 'unused' }"
            @click="onFilterChange('unused')"
            title="仅显示未被引用的资源（可安全删除）"
          >
            未使用 <span class="wf-resource-filter-num">({{ counts.unused }})</span>
          </button>
        </div>
        <div class="wf-resource-filter-divider" />
        <div class="wf-resource-type-group">
          <button
            v-for="tk in typeFilters"
            :key="tk.key"
            class="wf-resource-type-btn"
            :class="{ active: typeFilter === tk.key }"
            :title="tk.label"
            @click="typeFilter = typeFilter === tk.key ? null : tk.key"
          >
            {{ tk.shortLabel }}
          </button>
        </div>
        <div class="wf-resource-search-wrap">
          <svg viewBox="0 0 16 16" class="wf-resource-search-icon" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
            <path d="M10.5 10.5L13 13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <input
            v-model="searchKeyword"
            class="wf-resource-search-input"
            type="text"
            placeholder="搜索资源名称..."
          />
        </div>
      </div>

      <div v-if="!resources.length" class="wf-resource-empty">暂无资源</div>
      <div v-else class="wf-resource-stats">
        共 {{ counts.total }} 条 · 已使用 {{ counts.used }} · 未使用 {{ counts.unused }}
        <template v-if="visibleCount < sortedResources.length"> · 显示 {{ visibleCount }} / {{ sortedResources.length }}</template>
      </div>

      <!-- 网格视图 -->
      <div
        v-if="resources.length && viewMode === 'grid'"
        class="wf-resource-grid"
        :class="[thumbSize === 'lg' ? 'thumb-lg' : 'thumb-sm', { reflowing: gridReflowing }]"
      >
        <div
          v-for="r in visibleResources"
          :key="`${String(r.id)}:${layoutEpoch}`"
          class="wf-resource-tile"
          :class="isResourceUsed(r.id) ? 'is-used' : 'is-unused'"
          draggable="true"
          @dragstart="onTileDragStart($event, r)"
        >
          <div class="wf-resource-tile__thumb-area">
            <div v-if="isResourceUsed(r.id)" class="wf-resource-used-badge" :title="getUsageSummary(r.id)">
              ✔ {{ getUsageCount(r.id) }}
            </div>
            <div v-else class="wf-resource-unused-badge" title="当前蓝图中未被引用">
              未使用
            </div>

            <img
              v-if="thumbSrc(r) && !hasThumbFailed(String(r.id))"
              class="wf-resource-thumb"
              :src="thumbSrc(r)"
              :alt="r.name"
              loading="lazy"
              draggable="false"
              @error="onThumbError(String(r.id))"
            />
            <div v-else class="wf-resource-thumb-placeholder">
              <svg viewBox="0 0 24 24" class="wf-resource-thumb-placeholder-icon" aria-hidden="true">
                <path :d="resourceKindIconPath(r.kind)" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <div class="wf-resource-overlay">
              <button
                class="wf-resource-overlay-btn"
                type="button"
                title="预览"
                @click.stop="emit('preview', String(r.id))"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                  <path d="M8 3c-3.2 0-5.8 2.3-7 5 1.2 2.7 3.8 5 7 5s5.8-2.3 7-5c-1.2-2.7-3.8-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.1" />
                  <circle cx="8" cy="8" r="1.9" fill="currentColor" opacity="0.9" />
                </svg>
              </button>
              <button
                class="wf-resource-overlay-btn"
                type="button"
                title="添加至蓝图"
                @click.stop="emit('drop-to-node', String(r.id))"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                  <rect x="2.5" y="2.5" width="4" height="4" fill="none" stroke="currentColor" stroke-width="1.1" />
                  <rect x="9.5" y="2.5" width="4" height="4" fill="none" stroke="currentColor" stroke-width="1.1" />
                  <rect x="2.5" y="9.5" width="4" height="4" fill="none" stroke="currentColor" stroke-width="1.1" />
                  <path d="M11 9.5v4M9 11.5h4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                </svg>
              </button>
              <button
                v-if="isResourceUsed(r.id)"
                class="wf-resource-overlay-btn wf-resource-overlay-btn--focus"
                type="button"
                :title="getFocusTooltip(r.id)"
                @click.stop="onFocusResourceClick(r)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                  <path d="M2 8h3M11 8h3M8 2v3M8 11v3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                  <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.1" />
                </svg>
              </button>
              <button
                class="wf-resource-overlay-btn danger"
                type="button"
                :title="isResourceUsed(r.id) ? '该资源已被使用，删除前会提示二次确认' : '删除'"
                @click.stop="onRemoveClick(String(r.id))"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-overlay-icon">
                  <path d="M6 2.8h4M3.4 4.4h9.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                  <path d="M5.2 4.6v8.6c0 .6.5 1 1 1h3.6c.6 0 1-.4 1-1V4.6" fill="none" stroke="currentColor" stroke-width="1.1" />
                  <path d="M6.7 6.4v6.1M9.3 6.4v6.1" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div class="wf-resource-tile__info">
            <div class="wf-resource-tile__name" :title="r.name || ''">{{ r.name || '未命名资源' }}</div>
            <div class="wf-resource-tile__meta-row">
              <span class="wf-resource-tile__kind" :data-kind="r.kind">{{ resourceKindLabel(r.kind) }}</span>
              <span v-if="isResourceUsed(r.id)" class="wf-resource-tile__usage">
                {{ getUsageCount(r.id) }}节点
              </span>
              <span v-else class="wf-resource-tile__unused">未引用</span>
            </div>
            <div class="wf-resource-tile__date">{{ formatDate(r.createdAt) }}</div>
          </div>
        </div>

        <div ref="gridSentinelEl" class="wf-resource-sentinel" />
      </div>

      <!-- 列表视图 -->
      <div
        v-if="resources.length && viewMode === 'list'"
        class="wf-resource-list"
      >
        <div class="wf-resource-list__header">
          <div class="wf-resource-list__h-name">名称</div>
          <div class="wf-resource-list__h-kind">类型</div>
          <div class="wf-resource-list__h-usage">引用</div>
          <div class="wf-resource-list__h-date">日期</div>
          <div class="wf-resource-list__h-actions">操作</div>
        </div>
        <div
          v-for="r in visibleResources"
          :key="`list-${String(r.id)}`"
          class="wf-resource-list__row"
          :class="isResourceUsed(r.id) ? 'is-used' : 'is-unused'"
          draggable="true"
          @dragstart="onTileDragStart($event, r)"
        >
          <div class="wf-resource-list__thumb-wrap">
            <button
              v-if="isResourceUsed(r.id)"
              class="wf-resource-list__thumb-focus"
              type="button"
              :title="getFocusTooltip(r.id)"
              @click.stop="onFocusResourceClick(r)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" class="wf-resource-list__thumb-focus-icon">
                <path d="M2 8h3M11 8h3M8 2v3M8 11v3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>
            <img
              v-if="thumbSrc(r) && !hasThumbFailed(String(r.id))"
              class="wf-resource-list__thumb"
              :src="thumbSrc(r)"
              :alt="r.name"
              loading="lazy"
              draggable="false"
              @error="onThumbError(String(r.id))"
            />
            <div v-else class="wf-resource-list__thumb-placeholder">
              <svg viewBox="0 0 24 24" class="wf-resource-list__thumb-placeholder-icon" aria-hidden="true">
                <path :d="resourceKindIconPath(r.kind)" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <span v-if="isResourceUsed(r.id)" class="wf-resource-list__badge is-used">✔ {{ getUsageCount(r.id) }}</span>
            <span v-else class="wf-resource-list__badge is-unused">未使用</span>
          </div>
          <div class="wf-resource-list__name" :title="r.name || ''">{{ r.name || '未命名资源' }}</div>
          <div class="wf-resource-list__kind">
            <span class="wf-resource-list__kind-tag" :data-kind="r.kind">{{ resourceKindLabel(r.kind) }}</span>
          </div>
          <div class="wf-resource-list__usage">
            <template v-if="isResourceUsed(r.id) && getUsageInfoForResource(r.id)?.usedBy?.length">
              <button
                class="wf-resource-list__node-link"
                type="button"
                :title="`定位到：${getUsageInfoForResource(r.id)!.usedBy[0].nodeTitle}`"
                @click.stop="onFocusResourceClick(r)"
              >
                {{ getUsageInfoForResource(r.id)!.usedBy[0].nodeTitle }}
              </button>
              <span v-if="getUsageCount(r.id) > 1" class="wf-resource-list__more">+{{ getUsageCount(r.id) - 1 }}</span>
            </template>
            <span v-else class="wf-resource-list__unused-text">未引用</span>
          </div>
          <div class="wf-resource-list__date">{{ formatDate(r.createdAt) }}</div>
          <div class="wf-resource-list__actions">
            <button
              class="wf-resource-list__action-btn"
              type="button"
              title="预览"
              @click.stop="emit('preview', String(r.id))"
            >👁</button>
            <button
              v-if="isResourceUsed(r.id)"
              class="wf-resource-list__action-btn"
              type="button"
              title="定位节点"
              @click.stop="onFocusResourceClick(r)"
            >◎</button>
            <button
              class="wf-resource-list__action-btn danger"
              type="button"
              :title="isResourceUsed(r.id) ? '该资源已被使用，删除前会提示二次确认' : '删除'"
              @click.stop="onRemoveClick(String(r.id))"
            >✕</button>
          </div>
        </div>
        <div ref="listSentinelEl" class="wf-resource-sentinel" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { WorkflowResource } from "../../aiworkflow/resource/types";
import type { WorkflowNode } from "../../aiworkflow/types";
import { sanitizeWorkflowMediaUrl } from "../../aiworkflow/domain/resource/safeWorkflowUrl";
import { analyzeResourceUsage, computeUsageCounts, getUsageInfo } from "../../aiworkflow/resource/usage";

const props = defineProps<{
  open?: boolean
  resources: WorkflowResource[];
  nodesById?: Record<string, WorkflowNode>;
  nodeOrder?: string[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "remove", resourceId: string): void;
  (e: "remove-with-warning", payload: { resourceId: string; usedBy: Array<{ nodeId: string; nodeTitle: string; nodeType: string; description?: string }> }): void;
  (e: "preview", resourceId: string): void;
  (e: "refresh-missing", resourceIds: string[]): void;
  (e: "drop-to-node", resourceId: string): void;
  (e: "focus-node", payload: { nodeId: string }): void;
}>();

type FilterMode = "all" | "used" | "unused";
const filterMode = ref<FilterMode>("all");

const searchKeyword = ref("");
const typeFilter = ref<string | null>(null);

const typeFilters = [
  { key: "image", label: "图片", shortLabel: "图" },
  { key: "video", label: "视频", shortLabel: "视" },
  { key: "model3d", label: "3D模型", shortLabel: "3D" },
];

const onFilterChange = (m: FilterMode) => {
  if (filterMode.value === m) return;
  filterMode.value = m;
  resetPaging();
  scheduleFillVisibleCapacity();
};

// 计算资源使用地图
const usageMap = computed(() => analyzeResourceUsage(
  props.resources ?? [],
  props.nodesById ?? ({} as Record<string, WorkflowNode>),
  props.nodeOrder ?? [],
));

const counts = computed(() => computeUsageCounts(usageMap.value));

const isResourceUsed = (rid: string): boolean => {
  const info = getUsageInfo(usageMap.value, rid);
  return info?.isUsed ?? false;
};

const getUsageCount = (rid: string): number => {
  const info = getUsageInfo(usageMap.value, rid);
  return info?.usageCount ?? 0;
};

const getUsageInfoForResource = (rid: string) => {
  return getUsageInfo(usageMap.value, rid);
};

const getUsageSummary = (rid: string): string => {
  const info = getUsageInfo(usageMap.value, rid);
  if (!info || !info.isUsed) return "未被使用";
  const refs = info.usedBy.slice(0, 5).map((u) => `· ${u.nodeTitle} (${u.nodeType})`);
  const head = `被 ${info.usageCount} 个节点引用：\n`;
  const tail = info.usedBy.length > 5 ? `\n...以及其他 ${info.usedBy.length - 5} 个节点` : "";
  return head + refs.join("\n") + tail;
};

const onRemoveClick = (rid: string) => {
  const info = getUsageInfo(usageMap.value, rid);
  if (info?.isUsed) {
    emit("remove-with-warning", {
      resourceId: rid,
      usedBy: info.usedBy.map((u) => ({
        nodeId: u.nodeId,
        nodeTitle: u.nodeTitle,
        nodeType: u.nodeType,
        description: u.description,
      })),
    });
  } else {
    emit("remove", rid);
  }
};

const onFocusResourceClick = (r: WorkflowResource) => {
  const rid = String(r?.id ?? "").trim();
  const info = getUsageInfo(usageMap.value, rid);
  if (!info?.isUsed || !info.usedBy.length) return;
  emit("focus-node", { nodeId: info.usedBy[0].nodeId });
};

const getFocusTooltip = (rid: string): string => {
  const info = getUsageInfo(usageMap.value, rid);
  if (!info?.isUsed || !info.usedBy.length) return "";
  if (info.usedBy.length === 1) {
    return `定位到节点：${info.usedBy[0].nodeTitle || info.usedBy[0].nodeId}`;
  }
  return `定位到首个引用节点：${info.usedBy[0].nodeTitle || info.usedBy[0].nodeId}（共 ${info.usedBy.length} 个引用）`;
};

const resourceKindLabel = (kind: string): string => {
  const k = String(kind || "").toLowerCase();
  if (k === "image") return "图片";
  if (k === "video") return "视频";
  if (k === "model3d") return "3D模型";
  return kind || "资源";
};

const resourceKindIconPath = (kind: string): string => {
  const k = String(kind || "").toLowerCase();
  if (k === "video") return "M3 5.5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 12.5z M9.5 8l3.5-2v6l-3.5-2z";
  if (k === "model3d") return "M12 2l8 4.5v8L12 19l-8-4.5v-8z M12 19v-7.5M4 6.5l8 4.5 8-4.5 M4 13.5l8-4.5 8 4.5";
  return "M3 5.5c0-.8.7-1.5 1.5-1.5h7c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5z M3 14.5l3-3 2 2 3-4 4 4";
};

const formatDate = (ts: number | string | null | undefined): string => {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const scrollBodyEl = ref<HTMLElement | null>(null);
const gridSentinelEl = ref<HTMLElement | null>(null);
const listSentinelEl = ref<HTMLElement | null>(null);

type ViewMode = "grid" | "list";
const viewMode = ref<ViewMode>("grid");

type SortMode = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "usage-desc";
const sortMode = ref<SortMode>("date-desc");
const thumbSize = ref<"sm" | "lg">("sm");
const failedThumbIds = ref<Set<string>>(new Set());
const gridReflowing = ref(false);
const layoutEpoch = ref(0);
let io: IntersectionObserver | null = null;
let ioObservedSentinel: HTMLElement | null = null;

const currentSentinel = computed(() => viewMode.value === 'grid' ? gridSentinelEl.value : listSentinelEl.value);

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
  const order: SortMode[] = ["date-desc", "date-asc", "name-asc", "usage-desc"];
  const idx = order.indexOf(sortMode.value);
  sortMode.value = order[(idx + 1) % order.length];
  resetPaging();
  scheduleFillVisibleCapacity();
};

const sortModeTitle = computed(() => {
  switch (sortMode.value) {
    case "date-desc": return "排序：日期（新→旧）";
    case "date-asc": return "排序：日期（旧→新）";
    case "name-asc": return "排序：名称（A→Z）";
    case "name-desc": return "排序：名称（Z→A）";
    case "usage-desc": return "排序：引用数（多→少）";
    default: return "排序";
  }
});

const hasThumbFailed = (resourceId: string): boolean => {
  return failedThumbIds.value.has(String(resourceId || "").trim());
};

const compareCreatedAt = (a: WorkflowResource, b: WorkflowResource) => {
  const at = Number(a?.createdAt ?? 0);
  const bt = Number(b?.createdAt ?? 0);
  return at - bt;
};

const sortedResources = computed(() => {
  let list = Array.isArray(props.resources) ? props.resources.slice() : [];

  // 筛选：使用状态
  if (filterMode.value === "used") {
    list = list.filter((r) => isResourceUsed(String(r.id ?? "")));
  } else if (filterMode.value === "unused") {
    list = list.filter((r) => !isResourceUsed(String(r.id ?? "")));
  }

  // 筛选：类型
  if (typeFilter.value) {
    const tk = typeFilter.value;
    list = list.filter((r) => String(r.kind ?? "").toLowerCase() === tk);
  }

  // 搜索：名称
  const kw = searchKeyword.value.trim().toLowerCase();
  if (kw) {
    list = list.filter((r) => String(r.name ?? "").toLowerCase().includes(kw));
  }

  // 排序
  switch (sortMode.value) {
    case "date-desc":
      list.sort((a, b) => compareCreatedAt(b, a));
      break;
    case "date-asc":
      list.sort(compareCreatedAt);
      break;
    case "name-asc":
      list.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "zh"));
      break;
    case "name-desc":
      list.sort((a, b) => String(b.name ?? "").localeCompare(String(a.name ?? ""), "zh"));
      break;
    case "usage-desc":
      list.sort((a, b) => getUsageCount(String(b.id ?? "")) - getUsageCount(String(a.id ?? "")));
      break;
  }

  return list;
});

const visibleResources = computed(() => {
  const list = sortedResources.value;
  const n = Math.max(0, Math.floor(Number(loadedCount.value) || 0));
  return list.slice(0, Math.min(list.length, n));
});

// 注意：totalCount 指的是当前筛选模式下的总数
// 而 counts.total 指的是全部资源的总数（用于头部显示）
const totalCount = computed(() => sortedResources.value.length);
const visibleCount = computed(() => visibleResources.value.length);

const thumbSrc = (r: WorkflowResource) => {
  if (!r) return "";
  if (r.kind === "video") {
    const poster = String(r.posterUrl ?? "").trim();
    return sanitizeWorkflowMediaUrl(poster);
  }
  return sanitizeWorkflowMediaUrl(String(r.url ?? "").trim());
};

const resourceMissingThumb = (r: WorkflowResource) => {
  const rid = String(r?.id ?? "").trim();
  if (!rid) return false;
  if (failedThumbIds.value.has(rid)) return true;
  return !String(thumbSrc(r) || "").trim();
};

const emitRefreshMissing = () => {
  const ids = sortedResources.value
    .filter((r) => resourceMissingThumb(r))
    .map((r) => String(r?.id ?? "").trim())
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
        resourceId: String(r.id ?? ""),
        kind: String(r.kind ?? ""),
        name: String(r.name ?? ""),
        url: String(r.url ?? ""),
        sourcePath: String(r.sourcePath ?? ""),
      })
    );
    dt.setData("text/plain", String(r.url ?? ""));
  } catch {
    // ignore
  }
};

watch(
  [() => props.resources, searchKeyword, typeFilter, filterMode],
  () => {
    const keep = new Set(
      (props.resources ?? [])
        .map((r: WorkflowResource) => String(r?.id ?? "").trim())
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

const setupIo = () => {
  if (io) {
    try { io.disconnect(); } catch { /* ignore */ }
    io = null;
  }
  ioObservedSentinel = null;

  const root = scrollBodyEl.value;
  const sentinel = currentSentinel.value;
  if (!sentinel) return;

  io = new IntersectionObserver(
    (entries) => {
      const hit = entries.some((e) => e.isIntersecting);
      if (!hit) return;
      const total = sortedResources.value.length;
      if (loadedCount.value >= total) return;
      loadedCount.value = Math.min(total, loadedCount.value + PAGE_SIZE);
    },
    { root: root ?? null, rootMargin: "240px" }
  );

  io.observe(sentinel);
  ioObservedSentinel = sentinel;
};

watch(viewMode, () => {
  nextTick(() => {
    resetPaging();
    setupIo();
    scheduleFillVisibleCapacity();
    if (scrollBodyEl.value) scrollBodyEl.value.scrollTop = 0;
  });
});

onMounted(() => {
  nextTick(() => {
    setupIo();
  });

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
  ioObservedSentinel = null;
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
  background: rgba(16, 20, 24, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(80, 130, 120, 0.25);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  color: #e8edf0;
}

.wf-resource-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(80, 130, 120, 0.2);
  background: rgba(22, 28, 32, 0.9);
  flex-shrink: 0;
}

.wf-resource-title {
  font-size: 13px;
  font-weight: 600;
  color: #e8edf0;
  letter-spacing: 0.3px;
}

.wf-resource-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.wf-resource-icon-btn {
  border: 1px solid rgba(80, 130, 120, 0.3);
  background: rgba(30, 36, 40, 0.8);
  color: #b0bcc0;
  width: 26px;
  height: 26px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 120ms ease;
}

.wf-resource-icon-btn:hover {
  border-color: rgba(31, 157, 132, 0.6);
  background: rgba(31, 157, 132, 0.15);
  color: #1f9d84;
}

.wf-resource-icon-btn.active {
  border-color: rgba(31, 157, 132, 0.8);
  background: rgba(31, 157, 132, 0.25);
  color: #27c9a9;
}

.wf-resource-view-switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: rgba(20, 26, 30, 0.6);
  border-radius: 5px;
  border: 1px solid rgba(80, 130, 120, 0.2);
}

.wf-resource-view-switch .wf-resource-icon-btn {
  border: none;
  background: transparent;
  width: 24px;
  height: 22px;
}

.wf-resource-view-switch .wf-resource-icon-btn:hover {
  background: rgba(31, 157, 132, 0.15);
}

.wf-resource-view-switch .wf-resource-icon-btn.active {
  background: rgba(31, 157, 132, 0.3);
  color: #27c9a9;
  border-radius: 3px;
}

.wf-resource-icon {
  width: 14px;
  height: 14px;
}

.wf-resource-btn {
  border: 1px solid rgba(80, 130, 120, 0.3);
  background: rgba(30, 36, 40, 0.8);
  color: #b0bcc0;
  width: 26px;
  height: 26px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 120ms ease;
}

.wf-resource-btn:hover {
  border-color: rgba(31, 157, 132, 0.6);
  background: rgba(31, 157, 132, 0.15);
  color: #1f9d84;
}

.wf-resource-body {
  padding: 12px;
  overflow: auto;
  flex: 1;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(31, 157, 132, 0.35) transparent;
}

.wf-resource-empty {
  color: #7c8a8f;
  font-size: 13px;
  text-align: center;
  padding: 48px 0;
}

.wf-resource-stats {
  color: #8a989d;
  font-size: 11.5px;
  margin: 0 0 10px;
  padding: 0 2px;
}

/* ── Filter bar with search ── */
.wf-resource-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  padding: 6px 8px;
  background: rgba(22, 28, 32, 0.6);
  border: 1px solid rgba(80, 130, 120, 0.18);
  border-radius: 6px;
  flex-wrap: wrap;
}

.wf-resource-filter-group {
  display: flex;
  gap: 4px;
}

.wf-resource-filter-divider {
  width: 1px;
  height: 20px;
  background: rgba(80, 130, 120, 0.2);
  flex-shrink: 0;
}

.wf-resource-type-group {
  display: flex;
  gap: 3px;
}

.wf-resource-filter-btn {
  padding: 3px 10px;
  font-size: 11.5px;
  color: #b0bcc0;
  background: transparent;
  border: 1px solid rgba(80, 130, 120, 0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: all 120ms ease;
}

.wf-resource-filter-btn:hover {
  background: rgba(31, 157, 132, 0.1);
  border-color: rgba(31, 157, 132, 0.4);
  color: #d4ece6;
}

.wf-resource-filter-btn.active {
  background: linear-gradient(135deg, rgba(31, 157, 132, 0.3), rgba(31, 157, 132, 0.18));
  border-color: rgba(31, 157, 132, 0.6);
  color: #e4f6ff;
}

.wf-resource-filter-num {
  opacity: 0.6;
  margin-left: 2px;
  font-size: 10.5px;
}

.wf-resource-type-btn {
  width: 26px;
  height: 24px;
  font-size: 11px;
  font-weight: 600;
  color: #8a989d;
  background: transparent;
  border: 1px solid rgba(80, 130, 120, 0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: all 120ms ease;
  padding: 0;
}

.wf-resource-type-btn:hover {
  border-color: rgba(31, 157, 132, 0.4);
  color: #b0d8ce;
}

.wf-resource-type-btn.active {
  background: rgba(31, 157, 132, 0.22);
  border-color: rgba(31, 157, 132, 0.55);
  color: #e4f6ff;
}

.wf-resource-search-wrap {
  position: relative;
  margin-left: auto;
  display: flex;
  align-items: center;
}

.wf-resource-search-icon {
  position: absolute;
  left: 7px;
  width: 13px;
  height: 13px;
  color: #5c6a70;
  pointer-events: none;
}

.wf-resource-search-input {
  width: 160px;
  height: 26px;
  padding: 0 8px 0 26px;
  font-size: 11.5px;
  color: #e8edf0;
  background: rgba(12, 16, 18, 0.7);
  border: 1px solid rgba(80, 130, 120, 0.25);
  border-radius: 4px;
  outline: none;
  transition: border-color 120ms ease;
}

.wf-resource-search-input::placeholder {
  color: #5c6a70;
}

.wf-resource-search-input:focus {
  border-color: rgba(31, 157, 132, 0.6);
}

/* ── CSS Grid layout (replaces column-width waterfall) ── */
.wf-resource-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(var(--tile-size, 130px), 1fr));
  align-content: start;
}

.wf-resource-grid.thumb-sm {
  --tile-size: 128px;
}

.wf-resource-grid.thumb-lg {
  --tile-size: 176px;
}

.wf-resource-grid.reflowing .wf-resource-tile {
  animation: wf-resource-reflow 220ms ease;
}

/* ── Resource Tile ── */
.wf-resource-tile {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(80, 130, 120, 0.2);
  background: rgba(22, 28, 32, 0.7);
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  animation: wf-resource-tile-in 180ms ease;
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.wf-resource-tile:hover {
  border-color: rgba(31, 157, 132, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(31, 157, 132, 0.15);
  transform: translateY(-1px);
}

.wf-resource-tile.is-used {
  border-color: rgba(80, 160, 200, 0.28);
}

.wf-resource-tile.is-unused {
  opacity: 0.75;
}

.wf-resource-tile.is-unused:hover {
  opacity: 0.9;
}

/* Thumb area: forced square */
.wf-resource-tile__thumb-area {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: rgba(10, 14, 16, 0.9);
  overflow: hidden;
}

.wf-resource-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
}

.wf-resource-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(31, 157, 132, 0.4);
  background: rgba(14, 18, 20, 0.95);
}

.wf-resource-thumb-placeholder-icon {
  width: 42px;
  height: 42px;
}

.wf-resource-thumb-placeholder-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Badges ── */
.wf-resource-used-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
  color: #e4f6ff;
  background: linear-gradient(135deg, rgba(31, 157, 132, 0.92), rgba(25, 120, 100, 0.92));
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  user-select: none;
  pointer-events: none;
  letter-spacing: 0.2px;
}

.wf-resource-unused-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  color: #c8d0d4;
  background: rgba(70, 78, 82, 0.8);
  border-radius: 3px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  user-select: none;
  pointer-events: none;
}

/* ── Overlay actions ── */
.wf-resource-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 140ms ease;
  background: rgba(8, 12, 14, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
}

.wf-resource-tile:hover .wf-resource-overlay {
  opacity: 1;
}

.wf-resource-overlay-btn {
  border: 1px solid rgba(120, 180, 170, 0.3);
  background: rgba(20, 28, 32, 0.92);
  color: #d4ece6;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  transition: all 120ms ease;
}

.wf-resource-overlay-btn:hover {
  border-color: rgba(31, 157, 132, 0.7);
  background: rgba(31, 157, 132, 0.25);
  color: #ffffff;
  transform: scale(1.08);
}

.wf-resource-overlay-btn--focus {
  border-color: rgba(80, 180, 220, 0.4);
}

.wf-resource-overlay-btn--focus:hover {
  border-color: rgba(80, 200, 240, 0.8);
  background: rgba(60, 160, 200, 0.3);
}

.wf-resource-overlay-btn.danger:hover {
  border-color: rgba(220, 80, 80, 0.7);
  background: rgba(180, 50, 50, 0.35);
  color: #ffcccc;
}

.wf-resource-overlay-icon {
  width: 16px;
  height: 16px;
}

.wf-resource-overlay-icon path,
.wf-resource-overlay-icon rect,
.wf-resource-overlay-icon circle {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Info section below thumb ── */
.wf-resource-tile__info {
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.wf-resource-tile__name {
  font-size: 11.5px;
  font-weight: 500;
  color: #e0e8ec;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.wf-resource-tile__meta-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  line-height: 1;
}

.wf-resource-tile__kind {
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.wf-resource-tile__kind[data-kind="image"] {
  background: rgba(96, 165, 250, 0.18);
  color: #7cb8fc;
}

.wf-resource-tile__kind[data-kind="video"] {
  background: rgba(244, 114, 182, 0.18);
  color: #f48ec0;
}

.wf-resource-tile__kind[data-kind="model3d"] {
  background: rgba(251, 191, 36, 0.18);
  color: #fcc84d;
}

.wf-resource-tile__usage {
  color: #5cc8b0;
  font-weight: 600;
}

.wf-resource-tile__unused {
  color: #6c787e;
  font-size: 9.5px;
}

.wf-resource-tile__date {
  font-size: 9.5px;
  color: #6c787e;
  line-height: 1;
}

/* ── Sentinel for infinite scroll ── */
.wf-resource-sentinel {
  width: 100%;
  height: 1px;
  grid-column: 1 / -1;
}

/* ── Animations ── */
@keyframes wf-resource-tile-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes wf-resource-reflow {
  from {
    opacity: 0.85;
    transform: scale(0.99);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ── 列表视图 ── */
.wf-resource-list {
  display: flex;
  flex-direction: column;
}

.wf-resource-list__header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  font-size: 11px;
  color: #7a8890;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(80, 130, 120, 0.15);
  background: rgba(20, 26, 30, 0.5);
  flex-shrink: 0;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.wf-resource-list__h-name { flex: 1; min-width: 0; padding-left: 68px; }
.wf-resource-list__h-kind { width: 70px; flex-shrink: 0; }
.wf-resource-list__h-usage { width: 130px; flex-shrink: 0; }
.wf-resource-list__h-date { width: 90px; flex-shrink: 0; }
.wf-resource-list__h-actions { width: 90px; flex-shrink: 0; text-align: right; }

.wf-resource-list__row {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  gap: 12px;
  border-bottom: 1px solid rgba(80, 130, 120, 0.08);
  transition: background 120ms ease;
  cursor: default;
}

.wf-resource-list__row:hover {
  background: rgba(31, 157, 132, 0.08);
}

.wf-resource-list__row.is-unused {
  opacity: 0.7;
}

.wf-resource-list__thumb-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(30, 38, 44, 0.8);
  border: 1px solid rgba(80, 130, 120, 0.2);
}

.wf-resource-list__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wf-resource-list__thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5a6a72;
}

.wf-resource-list__thumb-placeholder-icon {
  width: 24px;
  height: 24px;
}

.wf-resource-list__thumb-focus {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #27c9a9;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: 2;
}

.wf-resource-list__row:hover .wf-resource-list__thumb-focus {
  opacity: 1;
}

.wf-resource-list__thumb-focus-icon {
  width: 22px;
  height: 22px;
}

.wf-resource-list__badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
  line-height: 1.3;
  pointer-events: none;
  z-index: 1;
}

.wf-resource-list__badge.is-used {
  background: rgba(31, 157, 132, 0.9);
  color: #fff;
}

.wf-resource-list__badge.is-unused {
  background: rgba(120, 130, 135, 0.8);
  color: #e0e4e6;
}

.wf-resource-list__name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #e0e6ea;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-resource-list__kind {
  width: 70px;
  flex-shrink: 0;
}

.wf-resource-list__kind-tag {
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
}

.wf-resource-list__kind-tag[data-kind="image"] {
  background: rgba(31, 157, 132, 0.15);
  color: #27c9a9;
}

.wf-resource-list__kind-tag[data-kind="video"] {
  background: rgba(200, 130, 50, 0.15);
  color: #e8a54d;
}

.wf-resource-list__kind-tag[data-kind="model3d"] {
  background: rgba(100, 120, 200, 0.15);
  color: #8ea5e8;
}

.wf-resource-list__usage {
  width: 130px;
  flex-shrink: 0;
  font-size: 11px;
  color: #90a0a8;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
}

.wf-resource-list__node-link {
  border: none;
  background: transparent;
  color: #1f9d84;
  font-size: 11px;
  padding: 0;
  cursor: pointer;
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, #1f9d84 40%, transparent);
}

.wf-resource-list__node-link:hover {
  color: #27c9a9;
}

.wf-resource-list__more {
  color: #7a8890;
  font-size: 10px;
  flex-shrink: 0;
}

.wf-resource-list__unused-text {
  color: #6a757a;
}

.wf-resource-list__date {
  width: 90px;
  flex-shrink: 0;
  font-size: 11px;
  color: #7a8890;
  font-variant-numeric: tabular-nums;
}

.wf-resource-list__actions {
  width: 90px;
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 120ms ease;
}

.wf-resource-list__row:hover .wf-resource-list__actions {
  opacity: 1;
}

.wf-resource-list__action-btn {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(80, 130, 120, 0.25);
  background: rgba(30, 38, 44, 0.8);
  color: #9aa8b0;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 100ms ease;
}

.wf-resource-list__action-btn:hover {
  border-color: rgba(31, 157, 132, 0.5);
  color: #27c9a9;
  background: rgba(31, 157, 132, 0.12);
}

.wf-resource-list__action-btn.danger:hover {
  border-color: rgba(200, 70, 70, 0.5);
  color: #e86060;
  background: rgba(200, 70, 70, 0.1);
}
</style>
